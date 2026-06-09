"""
chunker.py — Text splitting logic for Smrtayah.

Splits raw text into overlapping chunks for embedding.
Default: 500-character chunks with 50-character overlap.
"""


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """
    Split text into overlapping chunks.

    Args:
        text: The raw text to split.
        chunk_size: Maximum characters per chunk.
        overlap: Number of characters to overlap between consecutive chunks.

    Returns:
        List of text chunk strings.
    """
    text = text.strip()
    if not text:
        return []

    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        # Move forward by (chunk_size - overlap) to create overlap
        start += chunk_size - overlap

        # Safety: avoid infinite loop if overlap >= chunk_size
        if chunk_size <= overlap:
            break

    return chunks
