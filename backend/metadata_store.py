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
    Create the users table, memories table, and vector chunks table.
    NOTE: This resets the existing schema.
    """
    drop_sql = "DROP TABLE IF EXISTS memory_chunks, memories, users CASCADE;"
    
    create_users_sql = """
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """
    
    create_memories_sql = """
    CREATE TABLE IF NOT EXISTS memories (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        conn.execute(drop_sql)
        conn.execute(create_users_sql)
        conn.execute(create_memories_sql)
        conn.execute(create_chunks_sql)
        conn.commit()


def create_user(username: str, password_hash: str) -> str:
    sql = "INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id::text;"
    with _get_connection() as conn:
        row = conn.execute(sql, (username, password_hash)).fetchone()
        conn.commit()
    return row["id"]


def get_user_by_username(username: str) -> Optional[dict]:
    sql = "SELECT id::text, username, password_hash FROM users WHERE username = %s;"
    with _get_connection() as conn:
        row = conn.execute(sql, (username,)).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[dict]:
    sql = "SELECT id::text, username FROM users WHERE id = %s::uuid;"
    with _get_connection() as conn:
        row = conn.execute(sql, (user_id,)).fetchone()
    return dict(row) if row else None


def create_memory(
    user_id: str,
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
    INSERT INTO memories (user_id, title, source_url, content_type, raw_text, tags, thumbnail_url, chunk_count)
    VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s)
    RETURNING id::text;
    """
    with _get_connection() as conn:
        row = conn.execute(
            insert_sql,
            (user_id, title, source_url, content_type, raw_text, tags or [], thumbnail_url, chunk_count),
        ).fetchone()
        conn.commit()
    return row["id"]


def get_all_memories(user_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    """
    Fetch all memories for a user ordered by most recent first.
    """
    sql = """
    SELECT id::text, title, source_url, content_type, tags,
           thumbnail_url, created_at, chunk_count
    FROM memories
    WHERE user_id = %s::uuid
    ORDER BY created_at DESC
    LIMIT %s OFFSET %s;
    """
    with _get_connection() as conn:
        rows = conn.execute(sql, (user_id, limit, offset)).fetchall()
    return [dict(r) for r in rows]


def get_memory_by_id(user_id: str, memory_id: str) -> Optional[dict]:
    """
    Fetch a single memory by UUID, including raw_text, ensuring it belongs to user_id.
    """
    sql = """
    SELECT id::text, title, source_url, content_type, raw_text,
           tags, thumbnail_url, created_at, chunk_count
    FROM memories WHERE id = %s::uuid AND user_id = %s::uuid;
    """
    with _get_connection() as conn:
        row = conn.execute(sql, (memory_id, user_id)).fetchone()
    return dict(row) if row else None





def delete_memory(user_id: str, memory_id: str) -> bool:
    """
    Delete a memory record by UUID, ensuring it belongs to user_id.
    """
    sql = "DELETE FROM memories WHERE id = %s::uuid AND user_id = %s::uuid RETURNING id;"
    with _get_connection() as conn:
        row = conn.execute(sql, (memory_id, user_id)).fetchone()
        conn.commit()
    return row is not None
