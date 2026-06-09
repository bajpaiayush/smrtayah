"""
pdf_extractor.py — Extract text from a PDF file for Smrtayah.

Uses PyPDF2 to read page text from an uploaded PDF binary blob.
Returns the concatenated text of all pages and the filename as
the default title.
"""

import io
import re

try:
    from pypdf import PdfReader  # pypdf (maintained fork of PyPDF2)
except ImportError:
    from PyPDF2 import PdfReader  # fallback to PyPDF2 if pypdf not installed


def extract_pdf(file_bytes: bytes, filename: str = "document.pdf") -> dict:
    """
    Extract text from PDF bytes.

    Args:
        file_bytes: Raw PDF file content as bytes.
        filename: Original filename, used as the default title.

    Returns:
        dict with keys:
            - title (str): Derived from PDF metadata or filename.
            - content (str): Full extracted text, all pages joined.

    Raises:
        ValueError: If the PDF cannot be read or yields no text.
    """
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as e:
        raise ValueError(f"Could not read PDF file: {str(e)}")

    # ── Attempt to get title from PDF metadata ───────────────────
    title = ""
    try:
        meta = reader.metadata
        if meta and meta.title:
            title = meta.title.strip()
    except Exception:
        pass

    if not title:
        # Strip .pdf extension and clean up filename
        title = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE)
        title = re.sub(r"[_\-]+", " ", title).strip()

    # ── Extract text page by page ────────────────────────────────
    page_texts = []
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
            text = text.strip()
            if text:
                page_texts.append(text)
        except Exception:
            # Some pages may fail to extract — skip silently
            continue

    if not page_texts:
        raise ValueError(
            "No extractable text found in this PDF. "
            "It may be a scanned image PDF — OCR support is not available yet."
        )

    # Join pages with a separator
    content = "\n\n".join(page_texts)

    # Clean up excessive whitespace
    content = re.sub(r"[ \t]{3,}", "  ", content)
    content = re.sub(r"\n{4,}", "\n\n\n", content)
    content = content.strip()

    if len(content) < 50:
        raise ValueError("Extracted PDF text is too short to be useful.")

    return {
        "title": title,
        "content": content,
        "page_count": len(reader.pages),
        "extracted_pages": len(page_texts),
    }
