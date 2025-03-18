import argparse
import sys
import os
import torch
import json
import requests
from langchain_chroma import Chroma
from langchain.prompts import ChatPromptTemplate
from langchain_community.llms.ollama import Ollama
from langchain_ollama import OllamaLLM
from llama_cpp import Llama
from dotenv import load_dotenv
from get_embedding_function import get_embedding_function

# Enable Metal GPU acceleration for Ollama on Mac 
os.environ["OLLAMA_ACCELERATOR"] = "metal"

# Load environment variables from .env file
load_dotenv()

# Retrieve the API key from environment variables
PERSPECTIVE_API_KEY = os.getenv('PERSPECTIVE_API_KEY')

CHROMA_PATH = "chroma"

PROMPT_TEMPLATE = """
Answer the question based only on the following parts:

{context}

---

Answer the question based on the above context: {question}
"""

# Define the Perspective API endpoint
PERSPECTIVE_API_URL = "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze"


def is_query_valid(query: str) -> bool:
    # If API key is missing, skip the check entirely
    if not PERSPECTIVE_API_KEY:
        return True

    headers = {
        "Content-Type": "application/json"
    }

    data = {
        "comment": {"text": query, "type": "PLAIN_TEXT"},
        "languages": ["en"],
        "requestedAttributes": {"TOXICITY": {}},
        "doNotStore": True
    }

    try:
        response = requests.post(
            url=f"{PERSPECTIVE_API_URL}?key={PERSPECTIVE_API_KEY}",
            json=data,
            headers=headers
        )
        response.raise_for_status()
        result = response.json()
    except requests.RequestException as e:
        # If there's a request error, allow the query by default
        sys.stderr.write(f"❌ Error communicating with Perspective API: {e}\n")
        return True

    # Extract toxicity score
    try:
        toxicity_score = result.get('attributeScores', {}) \
                              .get('TOXICITY', {}) \
                              .get('summaryScore', {}) \
                              .get('value', 0)
        sys.stderr.write(f"🔹 Query Toxicity Score: {toxicity_score}\n")
    except Exception as e:
        sys.stderr.write(f"❌ Unexpected error parsing response: {e}\n")
        return True

    TOXICITY_THRESHOLD = 0.7
    is_safe = toxicity_score < TOXICITY_THRESHOLD
    sys.stderr.write(f"🔹 Query Classification: {'SAFE' if is_safe else 'OFFENSIVE'}\n")
    return is_safe


def main():
    # Create CLI arguments
    parser = argparse.ArgumentParser()
    parser.add_argument("query_text", type=str, help="The query text.")
    parser.add_argument(
        "--course",
        type=str,
        default=None,
        help="Specify a course name to filter the search results."
    )
    args = parser.parse_args()

    query_text = args.query_text
    course_name = args.course
        
    sys.stderr.write(f"🔹 Query received: '{query_text}' (Course: {course_name if course_name else 'No filter'})")


    # Perform the RAG-based query
    query_rag(query_text, course_name)

def get_youtube_title(video_url):
    """
    Fetches the title of a YouTube video given its URL.
    Uses YouTube's oEmbed API (no API key required).
    """
    try:
        response = requests.get(f"https://www.youtube.com/oembed?url={video_url}&format=json")
        if response.status_code == 200:
            return response.json().get("title", "Unknown Video")
    except requests.RequestException:
        pass
    return "Unknown Video"


def query_rag(query_text: str, course_name: str = None):
    # 1. Check for unethical or abusive language
    if not is_query_valid(query_text):
        response = "The question you asked is not ethically appropriate. Please rewrite it respectfully."
        sys.stderr.write(response)
        return response
    
    # Debug: Check if CHROMA_PATH exists
    sys.stderr.write(f"Checking Chroma path: {os.path.abspath(CHROMA_PATH)}")
    sys.stderr.write(f"Chroma directory exists: {os.path.exists(CHROMA_PATH)}")
    
    sys.stderr.write(f"🟢 Searching for '{query_text}' in course: '{course_name if course_name else 'ALL COURSES'}'")

    try:
        # 2. Prepare the DB
        embedding_function = get_embedding_function()
        db = Chroma(persist_directory=CHROMA_PATH, embedding_function=embedding_function)
        
        # Debug: Print collection info
        sys.stderr.write(f"Collection name: {db._collection.name}")
        sys.stderr.write(f"Collection count: {db._collection.count()}")
        
        # 3. Search the DB with optional course filter
        if course_name:
            sys.stderr.write(f"Searching for '{query_text}' in course: {course_name}")
            results = db.similarity_search_with_score(
                query_text,
                k=10,
                filter={"course": course_name}
            )
        else:
            sys.stderr.write(f"Searching for: {query_text} (no course filter)")
            results = db.similarity_search_with_score(query_text, k=10)

        sys.stderr.write(f"Found {len(results)} results")
        
        # 4. Debug: Print raw results
        for idx, (doc, score) in enumerate(results):
            sys.stderr.write(f"\nResult {idx + 1}:")
            sys.stderr.write(f"Score: {score}")
            sys.stderr.write(f"Content: {doc.page_content[:200]}...")
            sys.stderr.write(f"Metadata: {doc.metadata}")
        
        # 5. Filter results by a minimal similarity threshold
        filtered_results = [doc for doc, score in results if score > 0.4]
        sys.stderr.write(f"After filtering, have {len(filtered_results)} relevant results")
        
        if not filtered_results:
            response = (
                f"No relevant information found in the database"
                f"{f' for the {course_name} course' if course_name else ''}."
            )
            sys.stderr.write(f"Response: {response}\nSources: []")
            return response
            
        # 6. Prepare context for the model
        context_text = "\n\n---\n\n".join([doc.page_content for doc in filtered_results])
        prompt_template = ChatPromptTemplate.from_template(PROMPT_TEMPLATE)
        prompt = prompt_template.format(context=context_text, question=query_text)
        
        # 7. Get response from model
        # model = OllamaLLM(model="mistral")
        model = OllamaLLM(model="llama3.1:8b")
        response_text = model.invoke(prompt)
        
        # 8. Format sources
        sources = [doc.metadata.get("source", "Unknown") for doc in filtered_results]
        print(f"-> {response_text}\n")

        # Print unique sources
        unique_sources = list(set([
            f"{os.path.basename(doc.metadata.get('source', 'Unknown'))}"
            + (f" (p.{doc.metadata['page']})" if doc.metadata.get('page') else "")  # ✅ Only add page if it's a PDF
            if not doc.metadata.get("video_url")  # ✅ If not a video, process normally
            else f"{get_youtube_title(doc.metadata.get('video_url'))} (Video)"  # ✅ Get video title instead of raw link
            for doc in filtered_results
        ]))
        
        #unique_sources = list(set([doc.metadata.get("source", "Unknown") for doc in filtered_results]))
        print(f"Sources: {unique_sources}")
        

        return response_text.strip() 
        
    except Exception as e:
        print(f"Error in query_rag: {str(e)}")
        raise


if __name__ == "__main__":
    main()
