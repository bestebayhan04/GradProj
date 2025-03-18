import argparse
import os
import shutil
import subprocess
from faster_whisper import WhisperModel  # Import faster-whisper
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.schema.document import Document
from docx import Document as DocxDocument
import pypandoc
from pptx import Presentation 
from get_embedding_function import get_embedding_function
from langchain_chroma import Chroma
from moviepy.editor import VideoFileClip


CHROMA_PATH = "chroma"
DATA_PATH = "data"


def main():
    # Check if the database should be cleared (using the --reset flag).
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Reset the database.")
    args = parser.parse_args()
    if args.reset:
        print("✨ Clearing Database")
        clear_database()

    # 1) Load (or init) the DB to gather 'already processed' sources
    db = Chroma(persist_directory=CHROMA_PATH, embedding_function=get_embedding_function())

    try:
        existing_items = db.get(include=[])  # IDs are included by default
        existing_ids = set(existing_items["ids"])
    except:
        existing_ids = set()

    # Convert chunk IDs -> the full "source" (e.g. data/cs200/monopoly.pdf OR data/cs200/videos.links/https://youtube.com/watch?v=xyz)
    # chunk_id = f"{source}:{page}:{chunk_index}"
    existing_sources = set()
    for cid in existing_ids:
        parts = cid.rsplit(":", 2)  # split from the right, max 2
        source_part = parts[0]      # everything before :page:chunk_idx
        existing_sources.add(source_part)

    # 2) Load new documents, skipping already processed sources
    documents = load_documents(DATA_PATH, existing_sources)

    # 3) Split the loaded documents
    chunks = split_documents(documents)

    # 4) Add new chunks to the DB
    add_to_chroma(chunks, db)


def load_documents(directory, skip_sources):
    """
    Recursively walk 'directory' to find files in subfolders.
    Subfolder names (e.g. 'cs200') become the course name,
    stored in metadata['course'] for each loaded file.
    Skips any source that already exists in 'skip_sources'.
    """
    all_documents = []

    for root, dirs, files in os.walk(directory):
        # Determine course name from subfolder relative path
        # If root == directory, that means top-level 'data' folder (no course).
        rel_path = os.path.relpath(root, directory)
        course_name = None if rel_path == "." else rel_path

        for filename in files:
            file_path = os.path.join(root, filename)

            # Skip if file path is already in DB
            # e.g. data/cs200/monopoly.pdf
            if file_path in skip_sources:
                print(f"Skipping already processed file: {file_path}")
                continue

            if filename.endswith('.docx'):
                docs = load_docx(file_path)
            elif filename.endswith('.doc'):
                docs = load_doc(file_path)
            elif filename.endswith('.pdf'):
                docs = load_pdf(file_path)
            elif filename.endswith('.pptx'):
                docs = load_pptx(file_path)
            elif filename.endswith('.txt'):
                docs = load_txt(file_path)
            elif filename.endswith('.links'):
                # Process multiple links in a single file
                docs = load_links(file_path, skip_sources)
            else:
                print(f"Unsupported file type: {filename}")
                docs = []

            # If we loaded any documents, tag them with 'course' in metadata
            if course_name and docs:
                for d in docs:
                    d.metadata["course"] = course_name

            # Add them to the global list
            all_documents.extend(docs)

    return all_documents


def load_pdf(file_path):
    print(f"Attempting to load PDF: {file_path}")
    document_loader = PyPDFLoader(file_path)
    loaded_docs = document_loader.load()
    print(f"Loaded {len(loaded_docs)} documents from {file_path}")
    return loaded_docs


def load_docx(file_path):
    print(f"Attempting to load docs: {file_path}")
    doc = DocxDocument(file_path)
    text = [paragraph.text for paragraph in doc.paragraphs if paragraph.text.strip()]
    print(f"Extracted {len(text)} paragraphs from {file_path}")
    return [Document(page_content="\n".join(text), metadata={"source": file_path})]

def load_doc(file_path):
    print(f"Attempting to load DOC: {file_path}")
    try:
        text = pypandoc.convert_file(file_path, 'plain')
        print(f"Extracted {len(text.splitlines())} lines from {file_path}")
        return [Document(page_content=text, metadata={"source": file_path})]
    except Exception as e:
        print(f"Error reading DOC file {file_path}: {e}")
        return []

def load_pptx(file_path):
    print(f"Attempting to load PPTX: {file_path}")
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
    print(f"Extracted {len(slides_text)} slides from {file_path}")
    return slides_text


def load_txt(file_path):
    print(f"Attempting to load TXT: {file_path}")
    with open(file_path, 'r', encoding='utf-8') as file:
        lines = file.readlines()
    combined_text = "".join(lines)
    print(f"Extracted {len(lines)} lines from {file_path}")
    return [Document(page_content=combined_text, metadata={"source": file_path})]


def load_links(file_path, skip_sources):
    """
    Load all video links from a .links file (e.g. 'data/cs200/videos.links').
    We skip a link if that link itself is in skip_sources.
    The chunk's source is the .links file path
    (so chunk IDs eventually become e.g. 'data/cs200/videos.links/https://youtube.com/watch?v=xyz:0:0').
    """
    print(f"Attempting to load video links from: {file_path}")
    with open(file_path, 'r', encoding='utf-8') as file:
        links = [line.strip() for line in file if line.strip()]

    all_documents = []
    for link in links:
        # If the link is already processed, skip it
        if link in skip_sources:
            print(f"Skipping already processed link: {link}")
            continue

        # Each link is transcribed, returned as a Document with metadata["source"] = file_path
        # We'll store the link in metadata["video_url"] for special chunk ID creation
        all_documents.extend(load_video(video_url=link, local_file_path=file_path))

    return all_documents


def load_video(video_url, local_file_path=None):
    """
    Fetch an audio URL for 'video_url' (e.g. YouTube) via yt-dlp, then transcribe it.
    The returned Document has:
      metadata["source"] = local_file_path (e.g. data/cs200/videos.links)
      metadata["video_url"] = video_url (the actual link)
    chunk_id becomes 'data/cs200/videos.links/https://youtube.com/watch?v=xyz:0:0'
    """
    print(f"Attempting to get transcript from video: {video_url}")

    # Use yt-dlp to extract audio URL without downloading
    command = [
        "./new_one/bin/yt-dlp", 
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
        return transcribe_audio_from_url(audio_url, source=local_file_path, video_url=video_url)
    except subprocess.CalledProcessError as e:
        print(f"Error fetching audio URL: {e}")
        return []


def transcribe_audio_from_url(audio_url, source, video_url,
                              temp_audio_file="temp_audio.webm",
                              converted_audio_file="temp_audio.wav"):
    """
    Downloads the audio from 'audio_url' -> convert to WAV -> transcribe with faster-whisper.
    The Document's metadata:
      - "source": e.g. data/cs200/videos.links
      - "video_url": the actual link
    Final chunk ID: data/cs200/videos.links/https://youtube.com/watch?v=xyz:page:chunk_index
    """
    print(f"Downloading and transcribing audio from URL: {audio_url}")

    try:
        # Download the audio file in its native format
        subprocess.run(["curl", "-o", temp_audio_file, audio_url], check=True)
        print(f"Audio downloaded to {temp_audio_file}")

        # Convert the audio file to WAV using ffmpeg
        subprocess.run(
            ["ffmpeg", "-i", temp_audio_file, "-ar", "16000", "-ac", "1", converted_audio_file], 
            check=True
        )
        print(f"Audio converted to WAV format: {converted_audio_file}")

        # Load faster-whisper model (CPU)
        model = WhisperModel("base", device="cpu", compute_type="float32")

        # Transcribe the converted audio file
        segments, info = model.transcribe(converted_audio_file)
        transcript = "".join(segment.text for segment in segments)
        print(f"Transcription completed: {transcript[:100]}...")

        # Clean up temporary audio files
        os.remove(temp_audio_file)
        os.remove(converted_audio_file)

        # Create and return a Document
        return [Document(
            page_content=transcript,
            metadata={
                "source": source,      # e.g. data/cs200/videos.links
                "video_url": video_url # actual link
            }
        )]
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


def add_to_chroma(chunks: list[Document], db):
    # Calculate chunk IDs
    chunks_with_ids = calculate_chunk_ids(chunks)

    # Get existing IDs from DB (in case new items were added just now)
    existing_items = db.get(include=[])
    existing_ids = set(existing_items["ids"])
    print(f"Number of existing documents in DB: {len(existing_ids)}")

    # Only add documents not present in the DB
    new_chunks = []
    for chunk in chunks_with_ids:
        if chunk.metadata["id"] not in existing_ids:
            new_chunks.append(chunk)

    if new_chunks:
        print(f"👉 Adding new documents: {len(new_chunks)}")
        new_chunk_ids = [chunk.metadata["id"] for chunk in new_chunks]
        db.add_documents(new_chunks, ids=new_chunk_ids)
    else:
        print("✅ No new documents to add")


def calculate_chunk_ids(chunks):
    """
    Creates IDs like: 
      - data/cs200/monopoly.pdf:6:2
      - data/cs200/videos.links/https://youtube.com/watch?v=xyz:0:0
      - https://youtube.com/watch?v=xyz:0:0
    We append :page:chunk_index at the end.
    """
    last_page_id = None
    current_chunk_index = 0

    for chunk in chunks:
        # The base source (file path or unknown_source)
        base_source = chunk.metadata.get("source", "unknown_source")
        page = chunk.metadata.get("page", "0")
        video_link = chunk.metadata.get("video_url")

        # If there's a video link, we want the chunk ID to look like:
        #    data/cs200/videos.links/https://youtube.com/watch?v=xyz:page:chunk_index
        if video_link:
            # Combine the base_source with the video link
            current_page_id = f"{base_source}/{video_link}:{page}"
        else:
            # Normal case
            current_page_id = f"{base_source}:{page}"

        if current_page_id == last_page_id:
            current_chunk_index += 1
        else:
            current_chunk_index = 0

        chunk_id = f"{current_page_id}:{current_chunk_index}"
        last_page_id = current_page_id

        chunk.metadata["id"] = chunk_id

    return chunks


def clear_database():
    if os.path.exists(CHROMA_PATH):
        shutil.rmtree(CHROMA_PATH)


if __name__ == "__main__":
    main()
