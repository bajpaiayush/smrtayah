"""
vector_store.py — pgvector read/write for Smrtayah.

Manages the 'memory_chunks' table that stores
text chunk embeddings linked back to their parent memory via memory_id.
"""

import os
from typing import Optional
import psycopg
from psycopg.rows import dict_row
from pgvector.psycopg import register_vector
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

def _get_connection():
    """Create and return a new psycopg3 connection with vector support."""
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    # Register pgvector so we can insert/query lists of floats directly
    register_vector(conn)
    return conn


def store_chunks(
    memory_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
    content_type: str,
) -> None:
    """
    Store embedded chunks in PostgreSQL.

    Args:
        memory_id: UUID of the parent memory in Neon PostgreSQL.
        chunks: List of raw text chunk strings.
        embeddings: List of embedding vectors (one per chunk).
        content_type: Type of content (note/article/pdf/youtube/podcast).
    """
    insert_sql = """
        INSERT INTO memory_chunks (memory_id, chunk_index, content_type, chunk_text, embedding)
        VALUES (%s, %s, %s, %s, %s)
    """
    with _get_connection() as conn:
        with conn.pipeline():
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                conn.execute(
                    insert_sql,
                    (memory_id, i, content_type, chunk, emb)
                )
        conn.commit()


def search_memories(
    query_embedding: list[float],
    top_k: int = 5,
    content_type_filter: str | None = None,
) -> list[dict]:
    """
    Semantic search over all stored chunks using cosine distance (<=>).

    Args:
        query_embedding: The embedded query vector.
        top_k: Number of top results to return.
        content_type_filter: Optional content type to filter by.

    Returns:
        List of dicts with keys: chunk_text, memory_id, chunk_index,
        content_type, distance.
    """
    if content_type_filter:
        sql = """
            SELECT memory_id::text, chunk_index, content_type, chunk_text, 
                   (embedding <=> %s::vector) AS distance
            FROM memory_chunks
            WHERE content_type = %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """
        params = (query_embedding, content_type_filter, query_embedding, top_k)
    else:
        sql = """
            SELECT memory_id::text, chunk_index, content_type, chunk_text, 
                   (embedding <=> %s::vector) AS distance
            FROM memory_chunks
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """
        params = (query_embedding, query_embedding, top_k)

    with _get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()

    return [dict(r) for r in rows]


def delete_memory_chunks(memory_id: str) -> None:
    """
    Delete all chunks belonging to a specific memory.
    (This is optional now since ON DELETE CASCADE is on the foreign key,
    but we keep it for API compatibility).

    Args:
        memory_id: The UUID of the memory to delete.
    """
    sql = "DELETE FROM memory_chunks WHERE memory_id = %s::uuid"
    with _get_connection() as conn:
        conn.execute(sql, (memory_id,))
        conn.commit()
