from langchain_community.embeddings.ollama import OllamaEmbeddings
from langchain_ollama import OllamaEmbeddings


def get_embedding_function():

    #embeddings = OllamaEmbeddings(model="mistral")
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    return embeddings
