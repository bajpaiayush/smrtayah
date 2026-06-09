"""
embedder.py — Google text-embedding-004 wrapper for Smrtayah.

Converts text chunks into 768-dimensional semantic vectors
using Google's free text-embedding-004 model via the Gemini API.
"""

import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure the Gemini client once at module level
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-004")


def embed_text(text: str) -> list[float]:
    """
    Embed a single piece of text into a vector.

    Args:
        text: The text string to embed.

    Returns:
        A list of floats representing the semantic vector.
    """
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=text,
        task_type="retrieval_document",
    )
    return result["embedding"]


def embed_query(query: str) -> list[float]:
    """
    Embed a user query for retrieval.

    Args:
        query: The user's search query or question.

    Returns:
        A list of floats representing the query vector.
    """
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=query,
        task_type="retrieval_query",
    )
    return result["embedding"]


def embed_batch(texts: list[str]) -> list[list[float]]:
    """
    Embed multiple texts. Calls embed_text for each (Gemini free tier
    does not have a batch endpoint with different task_types, so we loop).

    Args:
        texts: List of text strings to embed.

    Returns:
        List of 768-dim float vectors, one per input text.
    """
    return [embed_text(t) for t in texts]
