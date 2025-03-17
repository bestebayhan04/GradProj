
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

#print(f"🔑 API Key Loaded: {PERSPECTIVE_API_KEY}")


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
    if not PERSPECTIVE_API_KEY:
        #print("❌ API key is not set. Please check your .env file.")
        return True  # Allow queries if API key is missing to prevent blocking

    headers = {
        "Content-Type": "application/json"
    }

    # Prepare the request payload
    data = {
        "comment": {"text": query, "type": "PLAIN_TEXT"},
        "languages": ["en"],
        "requestedAttributes": {"TOXICITY": {}},
        "doNotStore": True  # Ensures that the API does not store the comment
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
        #print(f"❌ Error communicating with Perspective API: {e}")
        return True  # Allow queries if there's an error with the API request

    # ✅ Extract the toxicity score safely
    try:
        toxicity_score = result.get('attributeScores', {}).get('TOXICITY', {}).get('summaryScore', {}).get('value', 0)
        sys.stderr.write(f"🔹 Query Toxicity Score: {toxicity_score}\n")
    except Exception as e:
        #print(f"❌ Unexpected error parsing response: {e}")
        return True  # Allow queries if response format is unexpected

    # Define a threshold for toxicity
    TOXICITY_THRESHOLD = 0.7

    # Determine if the query is safe
    is_safe = toxicity_score < TOXICITY_THRESHOLD
    sys.stderr.write(f"🔹 Query Classification: {'SAFE' if is_safe else 'OFFENSIVE'}")

    return is_safe

def main():
    # Create CLI.
    parser = argparse.ArgumentParser()
    parser.add_argument("query_text", type=str, help="The query text.")
    args = parser.parse_args()
    query_text = args.query_text
    #print(f"Received query: {query_text}")  # Log the received query
    query_rag(query_text)


def query_rag(query_text: str):

    # Check for unethical or abusive language using the model
    if not is_query_valid(query_text):
        response = "The question you asked is not ethically appropriate. Please rewrite it respectfully."
        print(response)
        return response
    
    # Debug: Check if CHROMA_PATH exists
    print(f"Checking Chroma path: {os.path.abspath(CHROMA_PATH)}")
    print(f"Chroma directory exists: {os.path.exists(CHROMA_PATH)}")
    
    try:
        # Prepare the DB.
        embedding_function = get_embedding_function()
        db = Chroma(persist_directory=CHROMA_PATH, embedding_function=embedding_function)
        
        # Debug: Print collection info
        print(f"Collection name: {db._collection.name}")
        print(f"Collection count: {db._collection.count()}")
        
        # Search the DB.
        print(f"Searching for: {query_text}")
        results = db.similarity_search_with_score(query_text, k=10)
        print(f"Found {len(results)} results")
        
        # Debug: Print raw results
        for idx, (doc, score) in enumerate(results):
            print(f"\nResult {idx + 1}:")
            print(f"Score: {score}")
            print(f"Content: {doc.page_content[:200]}...")
            print(f"Metadata: {doc.metadata}")
        
        # Filter results
        filtered_results = [doc for doc, score in results if score > 0.4]
        print(f"After filtering, have {len(filtered_results)} relevant results")
        
        if not filtered_results:
            response = "No relevant information found in the database."
            print(f"Response: {response}\n Sources: []")
            return response
            
        # Prepare context for the model
        context_text = "\n\n---\n\n".join([doc.page_content for doc in filtered_results])
        prompt_template = ChatPromptTemplate.from_template(PROMPT_TEMPLATE)
        prompt = prompt_template.format(context=context_text, question=query_text)
        
        # Get response from model
        #model = OllamaLLM(model="mistral")
        model = OllamaLLM(model="llama3.1:8b")

        response_text = model.invoke(prompt)
        
        # Format sources
        sources = [doc.metadata.get("source", "Unknown") for doc in filtered_results]
        print(f"Response: {response_text}\n Sources: {sources}")
        return response_text
        
    except Exception as e:
        print(f"Error in query_rag: {str(e)}")
        raise


if __name__ == "__main__":
    #print(f"Current working directory: {os.getcwd()}")
    main()