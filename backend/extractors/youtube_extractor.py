"""
youtube_extractor.py — Fetch YouTube video transcripts for Smrtayah.

Uses youtube-transcript-api (no audio download, no ffmpeg required)
to retrieve auto-generated or manual captions from a YouTube video.

Falls back to returning video metadata (title only) if transcripts
are disabled or unavailable.
"""

import re
import os
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import yt_dlp
import google.generativeai as genai


def _parse_video_id(url: str) -> str:
    """
    Extract the YouTube video ID from a URL.

    Supports formats:
      - https://www.youtube.com/watch?v=VIDEO_ID
      - https://youtu.be/VIDEO_ID
      - https://www.youtube.com/embed/VIDEO_ID
      - https://www.youtube.com/shorts/VIDEO_ID

    Args:
        url: A YouTube URL string.

    Returns:
        The 11-character video ID string.

    Raises:
        ValueError: If no video ID can be parsed from the URL.
    """
    patterns = [
        r"(?:v=|youtu\.be/|embed/|shorts/)([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(
        "Could not parse a YouTube video ID from the URL. "
        "Please use a standard youtube.com/watch?v= or youtu.be/ link."
    )


def _fetch_title(video_id: str) -> str:
    """
    Fetch video title via oEmbed API (no API key required).

    Args:
        video_id: YouTube 11-char video ID.

    Returns:
        Video title string, or a fallback if unavailable.
    """
    try:
        import requests
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        r = requests.get(oembed_url, timeout=10)
        if r.ok:
            return r.json().get("title", f"YouTube Video ({video_id})")
    except Exception:
        pass
    return f"YouTube Video ({video_id})"


def _generate_transcript_with_gemini(url: str, video_id: str) -> str:
    """Fallback method using yt-dlp to download audio and Gemini to transcribe."""
    # Ensure /tmp directory exists
    os.makedirs("/tmp", exist_ok=True)
    audio_path = f"/tmp/{video_id}.m4a"
    
    # 1. Download Audio
    ydl_opts = {
        'format': 'm4a/bestaudio/best',
        'outtmpl': audio_path,
        'quiet': True,
        'no_warnings': True,
        'extractor_args': {'youtube': {'player_client': ['android', 'ios']}},
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        raise ValueError(f"Failed to download audio: {str(e)}")
        
    if not os.path.exists(audio_path):
        raise ValueError("Audio download failed silently.")

    # 2. Upload to Gemini
    uploaded_file = None
    try:
        # Configure is called globally in main.py, but just in case
        if "GEMINI_API_KEY" in os.environ:
            genai.configure(api_key=os.environ["GEMINI_API_KEY"])
            
        uploaded_file = genai.upload_file(path=audio_path, mime_type="audio/mp4")
        
        # 3. Transcribe
        gemini_model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        model = genai.GenerativeModel(gemini_model_name)
        prompt = "Provide a clean, accurate transcript of this audio. Do not add any conversational filler, markdown formatting, or descriptive brackets. Just return the spoken text."
        response = model.generate_content([uploaded_file, prompt])
        content = response.text.strip()
        
    except Exception as e:
        raise ValueError(f"Gemini transcription failed: {str(e)}")
        
    finally:
        # 4. Cleanup
        if uploaded_file:
            try:
                genai.delete_file(uploaded_file.name)
            except Exception:
                pass
        if os.path.exists(audio_path):
            os.remove(audio_path)
            
    if not content or len(content) < 50:
        raise ValueError("Fallback transcription succeeded, but returned no meaningful text.")
        
    return content


def extract_youtube(url: str) -> dict:
    """
    Fetch the transcript of a YouTube video.

    Args:
        url: YouTube video URL (any standard format).

    Returns:
        dict with keys:
            - title (str): Video title from YouTube oEmbed.
            - content (str): Full transcript text.
            - source_url (str): The original URL.
            - video_id (str): Parsed video ID.
            - language (str): Transcript language code used.

    Raises:
        ValueError: If no transcript is available for this video.
    """
    video_id = _parse_video_id(url)

    # Fetch title (best-effort, doesn't block on failure)
    title = _fetch_title(video_id)

    # ── Retrieve transcript ──────────────────────────────────────
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # Prefer manual transcripts over auto-generated
        transcript = None
        language_used = "en"
        try:
            transcript = transcript_list.find_manually_created_transcript(["en", "en-US", "en-GB"])
            language_used = transcript.language_code
        except NoTranscriptFound:
            pass

        # Fall back to any auto-generated transcript
        if transcript is None:
            try:
                transcript = transcript_list.find_generated_transcript(["en", "en-US", "en-GB"])
                language_used = transcript.language_code
            except NoTranscriptFound:
                pass

        # Fall back to the first available transcript in any language
        if transcript is None:
            for t in transcript_list:
                transcript = t
                language_used = t.language_code
                break

        if transcript is None:
            raise ValueError(
                "No transcript available for this video. "
                "The creator may have disabled captions."
            )

        entries = transcript.fetch()

    except (TranscriptsDisabled, NoTranscriptFound):
        # Trigger Fallback
        try:
            content = _generate_transcript_with_gemini(url, video_id)
            return {
                "title": title,
                "content": content,
                "source_url": url,
                "video_id": video_id,
                "language": "en-gemini-fallback",
                "segment_count": 1,
            }
        except Exception as e:
            raise ValueError(
                f"Transcripts are disabled, and the AI fallback transcriber also failed: {str(e)}"
            )
    except ValueError:
        raise  # Re-raise our own ValueErrors
    except Exception as e:
        raise ValueError(f"Failed to fetch transcript: {str(e)}")

    # ── Build content text from timed segments ───────────────────
    # Each entry is {"text": "...", "start": float, "duration": float}
    segments = [entry.get("text", "").strip() for entry in entries]
    segments = [s for s in segments if s]  # Remove empties

    if not segments:
        raise ValueError("Transcript fetched but contained no text.")

    # Join with spaces, then clean up common transcript artifacts
    content = " ".join(segments)
    content = re.sub(r"\[.*?\]", "", content)         # Remove [Music], [Applause] etc.
    content = re.sub(r"&amp;", "&", content)           # Decode HTML entities
    content = re.sub(r"&lt;", "<", content)
    content = re.sub(r"&gt;", ">", content)
    content = re.sub(r" {2,}", " ", content)           # Collapse spaces
    content = content.strip()

    if len(content) < 50:
        raise ValueError("Transcript text is too short to be useful.")

    return {
        "title": title,
        "content": content,
        "source_url": url,
        "video_id": video_id,
        "language": language_used,
        "segment_count": len(segments),
    }
