import argparse
import os
import shutil
import subprocess
#import whisper
from faster_whisper import WhisperModel  # Import faster-whisper
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.schema.document import Document
from docx import Document as DocxDocument
from pptx import Presentation 
from get_embedding_function import get_embedding_function
from langchain_chroma import Chroma
from moviepy.editor import VideoFileClip



CHROMA_PATH = "chroma"
DATA_PATH = "data"


def main():

    # Check if the database should be cleared (using the --clear flag).
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Reset the database.")
    args = parser.parse_args()
    if args.reset:
        print("✨ Clearing Database")
        clear_database()

    # Create (or update) the data store.
    documents = load_documents(DATA_PATH)
    chunks = split_documents(documents)
    add_to_chroma(chunks)


def load_documents(directory):
    
    supported_files=[]
    for filename in os.listdir(directory):
        file_path = os.path.join(directory, filename)
        if filename.endswith('.docx'):
            supported_files.extend(load_docx(file_path))
        elif filename.endswith('.pdf'):
            supported_files.extend(load_pdf(file_path))
        elif filename.endswith('.pptx'):
            supported_files.extend(load_pptx(file_path))
        elif filename.endswith('.txt'):  # Check for .txt files
            supported_files.extend(load_txt(file_path))
        elif filename.endswith('.links'):  # Handle video links
            supported_files.extend(load_links(file_path))
        else:
            print(f"Unsupported file type: {filename}")

    return supported_files
   

def load_pdf(file_path):

    print(f"Attempting to load PDF: {file_path}")  # Debug line

    document_loader = PyPDFLoader(file_path)
    loaded_docs = document_loader.load()

    print(f"Loaded {len(loaded_docs)} documents from {file_path}")  # Debug line

    # Debug: Print all paragraphs extracted
    """for i, doc in enumerate(loaded_docs):
        print(f"--- Document {i + 1} from {file_path} ---")
        print(doc.page_content)  # Print the content of the document
        print("--- End of Document ---\n")"""

    return loaded_docs


def load_docx(file_path):

    print(f"Attempting to load docs: {file_path}")  # Debug line

    doc = DocxDocument(file_path)
    text = [paragraph.text for paragraph in doc.paragraphs if paragraph.text.strip()]

    print(f"Extracted {len(text)} paragraphs from {file_path}")  # Debugging line

    # Create a single Document object with combined paragraphs
    return [Document(page_content="\n".join(text), metadata={"source": file_path})]


def load_pptx(file_path):

    print(f"Attempting to load PPTX: {file_path}")  # Debug line

    presentation = Presentation(file_path)
    slides_text = []

    for slide_num, slide in enumerate(presentation.slides, start=1):
        slide_content = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                slide_content.append(shape.text)
        if slide_content:
            slide_text = "\n".join(slide_content)
            slides_text.append(
                Document(
                    page_content=slide_text,
                    metadata={"source": file_path, "slide": slide_num},
                )
            )
            # Debug: Print extracted content for the slide
            """print(f"--- Slide {slide_num} from {file_path} ---")
            print(slide_text)  # Print the content of the slide
            print("--- End of Slide ---\n")"""

    print(f"Extracted {len(slides_text)} slides from {file_path}")  # Debugging line

    return slides_text

def load_txt(file_path):
    print(f"Attempting to load TXT: {file_path}")  # Debug line

    with open(file_path, 'r', encoding='utf-8') as file:
        lines = file.readlines()  # Read all lines as a list

    # Debug: Print each line extracted from the TXT file
    """for i, line in enumerate(lines, start=1):
        print(f"Line {i}: {line.strip()}")  # Print each line with line numbers and remove extra spaces
    """

    # Combine all lines into a single string for storage in the database
    combined_text = "".join(lines)

    print(f"Extracted {len(lines)} lines from {file_path}")  # Debugging line

    # Create a Document object with the combined text
    return [Document(page_content=combined_text, metadata={"source": file_path})]



"""def load_local_video(file_path):
    print(f"Attempting to process local video: {file_path}")

    # Play the video (optional)
    try:
        clip = VideoFileClip(file_path)
        clip.preview()  # Plays the video using default player
    except Exception as e:
        print(f"Error playing video: {e}")

    # Extract audio and transcribe using Whisper
    print("Extracting audio and transcribing...")
    audio_path = file_path.replace(".mp4", ".mp3")
    clip.audio.write_audiofile(audio_path)

    # Transcribe using Whisper
    return transcribe_audio(audio_path, source=file_path)"""


def load_links(file_path):
    print(f"Attempting to load video links from: {file_path}")

    with open(file_path, 'r', encoding='utf-8') as file:
        links = [line.strip() for line in file if line.strip()]

    all_documents = []
    for link in links:
        all_documents.extend(load_video(link))  # Process each video link

    return all_documents


def load_video(video_url):
    print(f"Attempting to get transcript from video: {video_url}")

    # Use yt-dlp to extract audio URL without downloading
    command = [
        "./.venv/bin/yt-dlp", 
        "--get-url", 
        "--extract-audio", 
        "--audio-format", 
        "mp3", 
        video_url
    ]

    try:
        # Run yt-dlp to get the direct audio URL
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        audio_url = result.stdout.strip()

        print(f"Audio URL fetched: {audio_url}")
        return transcribe_audio_from_url(audio_url, source=video_url)
    except subprocess.CalledProcessError as e:
        print(f"Error fetching audio URL: {e}")
        return []
"""
def transcribe_audio_from_url(audio_url, source):
    print(f"Transcribing audio directly from URL: {audio_url}")

    # Use Whisper to transcribe the audio stream
    model = whisper.load_model("base")
    result = model.transcribe(audio_url)

    # Extract transcript text
    transcript = result.get("text", "")
    print(f"Transcription completed: {transcript[:100]}...")  # Debug first 100 characters

    # Create and return a Document
    return [Document(page_content=transcript, metadata={"source": source})]
"""

"""
def transcribe_audio_from_url(audio_url, source, temp_audio_file="temp_audio.webm", converted_audio_file="temp_audio.wav"):
    print(f"Downloading and transcribing audio from URL: {audio_url}")

    try:
        # Download the audio file in its native format
        subprocess.run(
            ["curl", "-o", temp_audio_file, audio_url], 
            check=True
        )
        print(f"Audio downloaded to {temp_audio_file}")

        # Convert the audio file to WAV using ffmpeg
        subprocess.run(
            ["ffmpeg", "-i", temp_audio_file, "-ar", "16000", "-ac", "1", converted_audio_file], 
            check=True
        )
        print(f"Audio converted to WAV format: {converted_audio_file}")

        # Load Whisper model
        model = whisper.load_model("base")

        # Transcribe the converted audio file
        result = model.transcribe(converted_audio_file)

        # Extract transcript text
        transcript = result.get("text", "")
        print(f"Transcription completed: {transcript[:100]}...")  # Debug first 100 characters

        # Clean up: remove the temporary audio files
        os.remove(temp_audio_file)
        os.remove(converted_audio_file)

        # Create and return a Document
        return [Document(page_content=transcript, metadata={"source": source})]

    except subprocess.CalledProcessError as e:
        print(f"Error processing audio: {e}")
        return []
    except Exception as e:
        print(f"Error during transcription: {e}")
        return []
"""

def transcribe_audio_from_url(audio_url, source, temp_audio_file="temp_audio.webm", converted_audio_file="temp_audio.wav"):
    print(f"Downloading and transcribing audio from URL: {audio_url}")

    try:
        # Download the audio file in its native format
        subprocess.run(
            ["curl", "-o", temp_audio_file, audio_url], 
            check=True
        )
        print(f"Audio downloaded to {temp_audio_file}")

        # Convert the audio file to WAV using ffmpeg
        subprocess.run(
            ["ffmpeg", "-i", temp_audio_file, "-ar", "16000", "-ac", "1", converted_audio_file], 
            check=True
        )
        print(f"Audio converted to WAV format: {converted_audio_file}")

        # Load faster-whisper model and force it to use CPU or MPS
        model = WhisperModel("base", device="cpu", compute_type="float32")  # For CPU
        # model = WhisperModel("base", device="mps", compute_type="float32")  # For Apple Silicon GPU (if preferred)

        # Transcribe the converted audio file
        segments, info = model.transcribe(converted_audio_file)

        # Extract transcript text from segments
        transcript = "".join(segment.text for segment in segments)
        print(f"Transcription completed: {transcript[:100]}...")  # Debug first 100 characters

        # Clean up: remove the temporary audio files
        os.remove(temp_audio_file)
        os.remove(converted_audio_file)

        # Create and return a Document
        return [Document(page_content=transcript, metadata={"source": source})]

    except subprocess.CalledProcessError as e:
        print(f"Error processing audio: {e}")
        return []
    except Exception as e:
        print(f"Error during transcription: {e}")
        return []

    
def split_documents(documents: list[Document]):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=80,
        length_function=len,
        is_separator_regex=False,
    )
    return text_splitter.split_documents(documents)


def add_to_chroma(chunks: list[Document]):
    # Load the existing database.
    db = Chroma(
        persist_directory=CHROMA_PATH, embedding_function=get_embedding_function()
    )

    # Calculate Page IDs.
    chunks_with_ids = calculate_chunk_ids(chunks)

    # Add or Update the documents.
    existing_items = db.get(include=[])  # IDs are always included by default
    existing_ids = set(existing_items["ids"])
    print(f"Number of existing documents in DB: {len(existing_ids)}")

    # Only add documents that don't exist in the DB.
    new_chunks = []
    for chunk in chunks_with_ids:
        if chunk.metadata["id"] not in existing_ids:
            new_chunks.append(chunk)

    if len(new_chunks):
        print(f"👉 Adding new documents: {len(new_chunks)}")
        new_chunk_ids = [chunk.metadata["id"] for chunk in new_chunks]
        db.add_documents(new_chunks, ids=new_chunk_ids)
    else:
        print("✅ No new documents to add")


def calculate_chunk_ids(chunks):

    # This will create IDs like "data/monopoly.pdf:6:2"
    # Page Source : Page Number : Chunk Index

    last_page_id = None
    current_chunk_index = 0

    for chunk in chunks:
        source = chunk.metadata.get("source")
        page = chunk.metadata.get("page")
        current_page_id = f"{source}:{page}"

        # If the page ID is the same as the last one, increment the index.
        if current_page_id == last_page_id:
            current_chunk_index += 1
        else:
            current_chunk_index = 0

        # Calculate the chunk ID.
        chunk_id = f"{current_page_id}:{current_chunk_index}"
        last_page_id = current_page_id

        # Add it to the page meta-data.
        chunk.metadata["id"] = chunk_id

    return chunks


def clear_database():
    if os.path.exists(CHROMA_PATH):
        shutil.rmtree(CHROMA_PATH)


if __name__ == "__main__":
    main()

