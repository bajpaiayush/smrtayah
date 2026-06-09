"""
metadata_store.py — Neon PostgreSQL queries for Smrtayah.

Uses psycopg v3 (psycopg[binary]) which ships with pre-built wheels
and doesn't require pg_config or a local PostgreSQL installation.
"""

import os
from typing import Optional
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]


def _get_connection():
    """Create and return a new psycopg3 connection with dict rows."""
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init_db() -> None:
    """
    Create the memories table and vector chunks table if they don't exist.
    Called once on application startup.
    """
    create_memories_sql = """
    CREATE TABLE IF NOT EXISTS memories (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title         TEXT NOT NULL,
        source_url    TEXT,
        content_type  VARCHAR(20) NOT NULL CHECK (
            content_type IN ('note', 'article', 'pdf', 'youtube', 'podcast')
        ),
        raw_text      TEXT NOT NULL,
        tags          TEXT[],
        thumbnail_url TEXT,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        chunk_count   INTEGER NOT NULL DEFAULT 0
    );
    """
    create_chunks_sql = """
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS memory_chunks (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        memory_id    UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        chunk_index  INTEGER NOT NULL,
        content_type VARCHAR(20) NOT NULL,
        chunk_text   TEXT NOT NULL,
        embedding    vector(768)
    );
    """
    with _get_connection() as conn:
        conn.execute(create_memories_sql)
        conn.execute(create_chunks_sql)
        conn.commit()


def create_memory(
    title: str,
    raw_text: str,
    content_type: str,
    chunk_count: int,
    source_url: Optional[str] = None,
    tags: Optional[list[str]] = None,
    thumbnail_url: Optional[str] = None,
) -> str:
    """
    Insert a new memory record and return its UUID string.
    """
    insert_sql = """
    INSERT INTO memories (title, source_url, content_type, raw_text, tags, thumbnail_url, chunk_count)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    RETURNING id::text;
    """
    with _get_connection() as conn:
        row = conn.execute(
            insert_sql,
            (title, source_url, content_type, raw_text, tags or [], thumbnail_url, chunk_count),
        ).fetchone()
        conn.commit()
    return row["id"]


def get_all_memories(limit: int = 50, offset: int = 0) -> list[dict]:
    """
    Fetch all memories ordered by most recent first (no raw_text for efficiency).
    """
    sql = """
    SELECT id::text, title, source_url, content_type, tags,
           thumbnail_url, created_at, chunk_count
    FROM memories
    ORDER BY created_at DESC
    LIMIT %s OFFSET %s;
    """
    with _get_connection() as conn:
        rows = conn.execute(sql, (limit, offset)).fetchall()
    return [dict(r) for r in rows]


def get_memory_by_id(memory_id: str) -> Optional[dict]:
    """
    Fetch a single memory by UUID, including raw_text.
    """
    sql = """
    SELECT id::text, title, source_url, content_type, raw_text,
           tags, thumbnail_url, created_at, chunk_count
    FROM memories WHERE id = %s::uuid;
    """
    with _get_connection() as conn:
        row = conn.execute(sql, (memory_id,)).fetchone()
    return dict(row) if row else None





def delete_memory(memory_id: str) -> bool:
    """
    Delete a memory record by UUID.
    Returns True if deleted, False if not found.
    """
    sql = "DELETE FROM memories WHERE id = %s::uuid RETURNING id;"
    with _get_connection() as conn:
        row = conn.execute(sql, (memory_id,)).fetchone()
        conn.commit()
    return row is not None
