"""
url_extractor.py — Scrape and clean web article text for Smrtayah.

Uses requests + BeautifulSoup to fetch a URL, strip boilerplate
(nav, footer, ads, scripts) and return clean body text along with
the page title.
"""

import re
import requests
from bs4 import BeautifulSoup

# Reasonable timeout to avoid hanging on slow servers
REQUEST_TIMEOUT = 15

# Tags whose entire subtree should be removed (boilerplate)
STRIP_TAGS = {
    "script", "style", "noscript", "nav", "footer", "header",
    "aside", "form", "figure", "figcaption", "iframe", "button",
    "svg", "img", "picture", "video", "audio", "canvas",
    "advertisement", "ads",
}

# Common browser-like headers to avoid getting blocked
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def extract_url(url: str) -> dict:
    """
    Fetch a web page and extract clean article text + title.

    Args:
        url: The fully-qualified URL to scrape.

    Returns:
        dict with keys:
            - title (str): Page <title> or Open Graph title.
            - content (str): Cleaned body text.
            - source_url (str): The original URL.

    Raises:
        ValueError: If the URL can't be fetched or yields no text.
    """
    try:
        response = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
    except requests.exceptions.Timeout:
        raise ValueError(f"Request timed out after {REQUEST_TIMEOUT}s — site may be slow or blocking bots.")
    except requests.exceptions.HTTPError as e:
        raise ValueError(f"HTTP error {e.response.status_code} fetching URL.")
    except requests.exceptions.RequestException as e:
        raise ValueError(f"Failed to fetch URL: {str(e)}")

    # Check content type — only parse HTML
    ct = response.headers.get("Content-Type", "")
    if "html" not in ct:
        raise ValueError(f"URL does not return HTML content (Content-Type: {ct}).")

    soup = BeautifulSoup(response.text, "html.parser")

    # ── Extract title ────────────────────────────────────────────
    title = ""
    # 1. Open Graph title
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        title = og["content"].strip()
    # 2. Twitter title
    if not title:
        tw = soup.find("meta", attrs={"name": "twitter:title"})
        if tw and tw.get("content"):
            title = tw["content"].strip()
    # 3. <title> tag
    if not title and soup.title and soup.title.string:
        title = soup.title.string.strip()
    # 4. First <h1>
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)
    if not title:
        title = url

    # ── Strip boilerplate tags ───────────────────────────────────
    for tag in soup.find_all(STRIP_TAGS):
        tag.decompose()

    # ── Try to find main article content ────────────────────────
    # Prefer semantic containers
    article = (
        soup.find("article")
        or soup.find("main")
        or soup.find(attrs={"role": "main"})
        or soup.find(id=re.compile(r"(content|article|post|entry|story|text)", re.I))
        or soup.find(class_=re.compile(r"(content|article|post|entry|story|body|text)", re.I))
        or soup.body
    )

    if not article:
        raise ValueError("Could not find any readable content on the page.")

    # ── Collect text from paragraphs & headings ──────────────────
    text_parts = []
    for elem in article.find_all(["h1", "h2", "h3", "h4", "p", "li", "blockquote", "td", "th"]):
        text = elem.get_text(separator=" ", strip=True)
        if len(text) > 30:  # Skip tiny fragments
            text_parts.append(text)

    # Fallback to full article text if paragraph approach yields nothing
    if not text_parts:
        raw = article.get_text(separator="\n", strip=True)
        text_parts = [line for line in raw.splitlines() if len(line.strip()) > 30]

    if not text_parts:
        raise ValueError("No readable text found on the page — it may require JavaScript or a login.")

    # Clean up whitespace
    content = "\n\n".join(text_parts)
    content = re.sub(r"\n{3,}", "\n\n", content).strip()

    if len(content) < 100:
        raise ValueError("Extracted text is too short to be useful — page may be behind a paywall or require JavaScript.")

    return {
        "title": title,
        "content": content,
        "source_url": url,
    }
