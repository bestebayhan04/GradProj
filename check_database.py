from langchain_chroma import Chroma
from get_embedding_function import get_embedding_function
import os

CHROMA_PATH = "chroma"

def check_database():
    print(f"Checking database at: {os.path.abspath(CHROMA_PATH)}")
    
    if not os.path.exists(CHROMA_PATH):
        print("Error: Database directory does not exist!")
        return
        
    try:
        db = Chroma(persist_directory=CHROMA_PATH, embedding_function=get_embedding_function())
        
        # Get all documents
        results = db.get()
        
        print(f"\nTotal documents in database: {len(results['documents'])}")
        print("\nSample of documents:")
        
        # Print first 3 documents as sample
        for i in range(min(3, len(results['documents']))):
            print(f"\nDocument {i + 1}:")
            print(f"Content: {results['documents'][i][:200]}...")
            print(f"Metadata: {results['metadatas'][i]}")
            
    except Exception as e:
        print(f"Error accessing database: {str(e)}")

if __name__ == "__main__":
    check_database() 