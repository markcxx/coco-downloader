"""Byte-signature checks matching src/lib/audio-signature.ts."""
from urllib.parse import urlparse

AUDIO_EXTENSIONS = frozenset({"mp3", "flac", "ogg", "opus", "wav", "m4a", "aac", "wma"})


def audio_extension(data: bytes) -> str:
    if (len(data) >= 10 and data[:3] == b"ID3" and 2 <= data[3] <= 4
            and all(b < 128 for b in data[6:10])):
        return "mp3"
    if data.startswith(b"fLaC"):
        return "flac"
    if data.startswith(b"OggS"):
        return "ogg"
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "wav"
    if data[4:8] == b"ftyp":
        return "m4a"
    if (len(data) >= 4 and data[0] == 255 and data[1] & 224 == 224
            and data[1] & 24 != 8 and data[1] & 6 != 0
            and data[2] & 240 not in {0, 240} and data[2] & 12 != 12):
        return "mp3"
    if len(data) >= 2 and data[:2] in {b"\xff\xf1", b"\xff\xf9"}:
        return "aac"
    return ""


def checked_audio_extension(data: bytes, content_type: str = "", declared: str = "", url: str = "") -> str:
    """Trust valid bytes before MIME; never save an HTML/JSON error as audio."""
    detected = audio_extension(data)
    if detected:
        return detected
    prefix = data[:512].lstrip(b"\xef\xbb\xbf \t\r\n").lower()
    mime = content_type.lower().split(";", 1)[0].strip()
    if (not data or prefix.startswith((b"<", b"{", b"["))
            or mime.startswith("text/") or mime in {"application/json", "application/xhtml+xml"}):
        raise ValueError("渠道未返回有效音频，可能已失效或没有播放权限")
    suffix = declared.lower().strip().lstrip(".")
    if suffix in AUDIO_EXTENSIONS:
        return suffix
    suffix = urlparse(url).path.rsplit(".", 1)[-1].lower()
    return suffix if suffix in AUDIO_EXTENSIONS else "mp3"
