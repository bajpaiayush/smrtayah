"""
main.py — FastAPI entry point for Smrtayah backend.

Endpoints:
  POST /save   — ingest text/note content, chunk, embed, store
  POST /query  — ask a question, retrieve relevant chunks, get Gemini answer
  GET  /memories — list all saved memories
  GET  /memories/{id} — get a single memory with full text
  DELETE /memories/{id} — delete a memory
"""

import os
import google.generativeai as genai
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends

from auth import create_access_token, get_current_user, get_password_hash, verify_password

from chunker import chunk_text
from embedder import embed_text, embed_query, embed_batch
from vector_store import store_chunks, search_memories as vector_search, delete_memory_chunks
from metadata_store import init_db, create_memory, get_all_memories, get_memory_by_id, delete_memory
from extractors import extract_url, extract_pdf, extract_youtube

load_dotenv()

# Configure Gemini
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

app = FastAPI(
    title="Smrtayah API",
    description="AI Second Brain — Save anything, remember everything.",
    version="1.0.0",
)

# Allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """Initialize the PostgreSQL table on startup."""
    init_db()


# ──────────────────────────────────────────────
# Request / Response Models
# ──────────────────────────────────────────────

class SaveRequest(BaseModel):
    title: str
    content: str
    content_type: str = "note"          # note | article | pdf | youtube | podcast
    source_url: Optional[str] = None
    tags: Optional[list[str]] = None
    thumbnail_url: Optional[str] = None


class SaveResponse(BaseModel):
    memory_id: str
    title: str
    chunk_count: int
    message: str


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    content_type_filter: Optional[str] = None


class SourceCitation(BaseModel):
    memory_id: str
    title: str
    chunk_text: str
    content_type: str


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceCitation]


# ──────────────────────────────────────────────
# Auth Endpoints
# ──────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str

@app.post("/auth/signup")
async def signup(user: UserCreate):
    existing = get_user_by_username(user.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_pw = get_password_hash(user.password)
    user_id = create_user(user.username, hashed_pw)
    return {"message": "User created successfully", "user_id": user_id}


@app.post("/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_username(form_data.username)
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user["id"]})
    return {"access_token": access_token, "token_type": "bearer"}


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@app.post("/save", response_model=SaveResponse)
async def save_memory(req: SaveRequest, current_user: dict = Depends(get_current_user)):
    """
    Ingest content: chunk → embed → store in ChromaDB + Neon.
    """
    if req.content_type not in ("note", "article", "pdf", "youtube", "podcast"):
        raise HTTPException(status_code=400, detail="Invalid content_type")

    # 1. Chunk the text
    chunks = chunk_text(req.content)
    if not chunks:
        raise HTTPException(status_code=400, detail="Content is empty after processing")

    # 2. Embed all chunks
    embeddings = embed_batch(chunks)

    # 3. Save metadata to Neon first (to get UUID)
    memory_id = create_memory(
        user_id=current_user["id"],
        title=req.title,
        raw_text=req.content,
        content_type=req.content_type,
        chunk_count=len(chunks),
        source_url=req.source_url,
        tags=req.tags,
        thumbnail_url=req.thumbnail_url,
    )

    # 4. Store chunks + embeddings in ChromaDB
    store_chunks(
        memory_id=memory_id,
        chunks=chunks,
        embeddings=embeddings,
        content_type=req.content_type,
    )

    return SaveResponse(
        memory_id=memory_id,
        title=req.title,
        chunk_count=len(chunks),
        message=f"Memory saved successfully with {len(chunks)} chunks.",
    )


@app.post("/query", response_model=QueryResponse)
async def query_memories(req: QueryRequest, current_user: dict = Depends(get_current_user)):
    """
    Ask a question: embed → semantic search → Gemini synthesis → cited answer.
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # 1. Embed the question
    query_vec = embed_query(req.question)

    # 2. Semantic search in ChromaDB
    results = vector_search(
        query_embedding=query_vec,
        top_k=req.top_k,
        content_type_filter=req.content_type_filter,
    )

    if not results:
        return QueryResponse(
            answer="I don't have any saved memories yet that relate to your question. Try saving some content first!",
            sources=[],
        )

    # 3. Fetch titles from Neon for citation
    sources = []
    context_parts = []
    seen_memory_ids = set()

    for r in results:
        mid = r["memory_id"]
        if mid not in seen_memory_ids:
            mem = get_memory_by_id(current_user["id"], mid)
            if mem:
                sources.append(
                    SourceCitation(
                        memory_id=mid,
                        title=mem["title"],
                        chunk_text=r["chunk_text"],
                        content_type=r["content_type"],
                    )
                )
                seen_memory_ids.add(mid)

        mem = get_memory_by_id(current_user["id"], mid)
        title = mem["title"] if mem else mid
        context_parts.append(
            f'[Memory: "{title}"]\n{r["chunk_text"]}'
        )

    context = "\n\n---\n\n".join(context_parts)

    # 4. Build prompt and call Gemini
    prompt = f"""You are Smrtayah, an intelligent AI second brain assistant. 
You have access to the user's personal knowledge base below.

RELEVANT MEMORIES:
{context}

USER QUESTION: {req.question}

Instructions:
- Answer the question using ONLY the information from the memories above.
- If the memories don't contain enough information, say so clearly.
- Be concise, insightful, and cite which memory each piece of information came from.
- Format citations as [Memory: "Title"].
"""

    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content(prompt)
    answer = response.text

    return QueryResponse(answer=answer, sources=sources)


@app.get("/memories")
async def list_memories(limit: int = 50, offset: int = 0, current_user: dict = Depends(get_current_user)):
    """List all saved memories (without raw text)."""
    memories = get_all_memories(current_user["id"], limit=limit, offset=offset)
    return {"memories": memories, "count": len(memories)}


@app.get("/memories/{memory_id}")
async def get_memory(memory_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single memory by ID with full text."""
    memory = get_memory_by_id(current_user["id"], memory_id)
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    return memory


@app.delete("/memories/{memory_id}")
async def remove_memory(memory_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a memory from both Neon and ChromaDB."""
    # We must ensure the memory belongs to the user before deleting from ChromaDB
    mem = get_memory_by_id(current_user["id"], memory_id)
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")
        
    # Delete from ChromaDB first
    delete_memory_chunks(memory_id)
    # Delete from Neon
    delete_memory(current_user["id"], memory_id)
    return {"message": "Memory deleted successfully", "memory_id": memory_id}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "Smrtayah API"}


# ──────────────────────────────────────────────
# Extractor Endpoints (preview — no saving)
# ──────────────────────────────────────────────

class ExtractURLRequest(BaseModel):
    url: str


class ExtractYouTubeRequest(BaseModel):
    url: str


class ExtractResponse(BaseModel):
    title: str
    content: str
    source_url: Optional[str] = None
    meta: Optional[dict] = None


@app.post("/extract/url", response_model=ExtractResponse)
async def extract_from_url(req: ExtractURLRequest):
    """
    Scrape a web URL and return extracted title + content.
    Does NOT save — frontend lets user review before indexing.
    """
    if not req.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty.")
    try:
        result = extract_url(req.url.strip())
        return ExtractResponse(
            title=result["title"],
            content=result["content"],
            source_url=result["source_url"],
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@app.post("/extract/pdf", response_model=ExtractResponse)
async def extract_from_pdf(file: UploadFile = File(...)):
    """
    Accept a PDF file upload and return extracted title + content.
    Does NOT save — frontend lets user review before indexing.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Limit to 20 MB
    MAX_SIZE = 20 * 1024 * 1024
    file_bytes = await file.read()
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="PDF file exceeds the 20 MB limit.")

    try:
        result = extract_pdf(file_bytes, filename=file.filename)
        return ExtractResponse(
            title=result["title"],
            content=result["content"],
            meta={
                "page_count": result.get("page_count"),
                "extracted_pages": result.get("extracted_pages"),
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {str(e)}")


@app.post("/extract/youtube", response_model=ExtractResponse)
async def extract_from_youtube(req: ExtractYouTubeRequest):
    """
    Fetch a YouTube transcript and return title + content.
    Does NOT save — frontend lets user review before indexing.
    """
    if not req.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty.")
    try:
        result = extract_youtube(req.url.strip())
        return ExtractResponse(
            title=result["title"],
            content=result["content"],
            source_url=result["source_url"],
            meta={
                "video_id": result.get("video_id"),
                "language": result.get("language"),
                "segment_count": result.get("segment_count"),
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YouTube extraction failed: {str(e)}")
