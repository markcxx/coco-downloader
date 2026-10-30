# coding: utf-8
import base64
import logging
from typing import Any
from urllib.parse import urljoin

from app.models.music import LyricData, MusicItem, PlayInfo
from app.services.errors import ProviderNetworkError

from .base import MusicProvider
from .http_client import ProviderHttpClient
from .utils import clean_lyric, extract_ext, parse_lrc_lines, validate_audio_url

LOGGER = logging.getLogger(__name__)
REQUEST_TIMEOUT = 15
SEARCH_API_URL = "https://songsearch.kugou.com/song_search_v2"
SVIP90_BASE_URL = "https://music.90svip.cn/"
LYRIC_SEARCH_URL = "http://lyrics.kugou.com/search"
LYRIC_DOWNLOAD_URL = "http://lyrics.kugou.com/download"
SEARCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
    )
}
def _normalize_limit(limit: int) -> int:
    return min(max(int(limit), 1), 30)


def _normalize_offset(offset: int) -> int:
    return max(int(offset), 0)


def _format_duration(seconds: Any) -> str | None:
    if not isinstance(seconds, int | float):
        return None
    normalized = int(seconds / 1000) if seconds > 10000 else int(seconds)
    return f"{normalized // 60:02d}:{normalized % 60:02d}"


def _normalize_cover(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return value.replace("{size}", "400")


def _string_value(value: Any) -> str:
    return str(value).strip() if isinstance(value, str | int | float) else ""


class KugouProvider(MusicProvider):
    name = "kugou"

    def __init__(self) -> None:
        self._http = ProviderHttpClient()

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        page_size = _normalize_limit(limit)
        page = (_normalize_offset(offset) // page_size) + 1
        try:
            data = self._http.get_json(
                SEARCH_API_URL,
                headers=SEARCH_HEADERS,
                params={
                    "format": "json",
                    "keyword": query.strip(),
                    "platform": "WebFilter",
                    "page": page,
                    "pagesize": page_size,
                },
                timeout=REQUEST_TIMEOUT,
            )
        except ProviderNetworkError:
            LOGGER.exception("Kugou search error")
            raise

        payload = data.get("data", {}) if isinstance(data, dict) else {}
        items = payload.get("lists", []) if isinstance(payload, dict) else []
        if not isinstance(items, list):
            return []
        return [item for item in (self._map_item(raw_item) for raw_item in items) if item]

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        context = extra or {}
        fallback_cover = _string_value(context.get("cover")) or None
        if context.get("selectedParser") not in {None, "", "90svip"}:
            raise ValueError("该酷狗解析线路已下架，请重新搜索并选择可用渠道")
        return self._to_play_info(self._get_by_90svip(song_id), fallback_cover)

    def get_lyric(self, song_id: str, extra: dict[str, Any] | None = None) -> LyricData:
        context = extra or {}
        keyword = _string_value(context.get("filename"))
        duration = _string_value(context.get("duration")) or "-1"
        search_data = self._http.get_json(
            LYRIC_SEARCH_URL,
            params={"keyword": keyword, "duration": duration, "hash": song_id},
            timeout=REQUEST_TIMEOUT,
        )
        candidate = self._first_lyric_candidate(search_data)
        if not candidate:
            return LyricData(songid=song_id, provider=self.name, lines=[], lrc="")

        lyric_data = self._http.get_json(
            LYRIC_DOWNLOAD_URL,
            params={
                "ver": 1,
                "client": "pc",
                "id": candidate["id"],
                "accesskey": candidate["accesskey"],
                "fmt": "lrc",
                "charset": "utf8",
            },
            timeout=REQUEST_TIMEOUT,
        )
        encoded = lyric_data.get("content", "") if isinstance(lyric_data, dict) else ""
        lyric = self._decode_lyric(encoded)
        return LyricData(songid=song_id, provider=self.name, lines=parse_lrc_lines(lyric), lrc=lyric)

    def _map_item(self, item: Any) -> MusicItem | None:
        if not isinstance(item, dict):
            return None

        song_id = _string_value(item.get("FileHash") or item.get("hash"))
        if not song_id:
            return None

        title = _string_value(item.get("SongName") or item.get("songname"))
        filename = _string_value(item.get("FileName") or item.get("filename"))
        artist = _string_value(item.get("SingerName") or item.get("singername"))
        duration = item.get("Duration") or item.get("duration") or item.get("timelen")
        cover = self._extract_cover(item)
        return MusicItem(
            id=song_id,
            title=title or filename or "未知歌曲",
            artist=artist or "未知歌手",
            album=_string_value(item.get("AlbumName") or item.get("album_name")) or None,
            cover=cover,
            duration=_format_duration(duration),
            provider=self.name,
            extra={
                "cover": cover,
                "selectedOption": "90svip",
                "selectedParser": "90svip",
                "selectedLevel": "",
                "selectedFormat": "mp3",
                "filename": filename or f"{title} - {artist}",
                "duration": duration or -1,
            },
        )

    def _extract_cover(self, item: dict[str, Any]) -> str | None:
        trans_param = item.get("trans_param")
        union_cover = trans_param.get("union_cover") if isinstance(trans_param, dict) else None
        return _normalize_cover(union_cover or item.get("cover_url") or item.get("Image"))

    def _get_by_90svip(self, song_id: str) -> dict[str, str | None]:
        headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": SVIP90_BASE_URL,
            "User-Agent": SEARCH_HEADERS["User-Agent"],
            "X-Requested-With": "XMLHttpRequest",
        }
        response = self._http.post_response(
            SVIP90_BASE_URL,
            headers=headers,
            data={"input": song_id, "filter": "id", "type": "kugou", "page": "1"},
            timeout=REQUEST_TIMEOUT,
        )
        data = response.json()
        items = data.get("data", []) if isinstance(data, dict) else []
        item = items[0] if isinstance(items, list) and items and isinstance(items[0], dict) else {}
        raw_url = item.get("url") if isinstance(item.get("url"), str) else ""
        if not raw_url:
            raise ValueError("90svip returned no play url")
        url = urljoin(SVIP90_BASE_URL, raw_url)
        final_url = validate_audio_url(
            self._http,
            url,
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        return {"url": final_url, "bitrate": "320k", "cover": None}

    def _to_play_info(self, info: dict[str, str | None], fallback_cover: str | None) -> PlayInfo:
        url = str(info["url"])
        file_type = extract_ext(url)
        LOGGER.info("Kugou resolved play url: bitrate=%s, type=%s", info.get("bitrate"), file_type)
        return PlayInfo(
            url=url,
            type=file_type,
            bitrate=info.get("bitrate"),
            cover=info.get("cover") or fallback_cover,
            headers=SEARCH_HEADERS,
        )

    def _first_lyric_candidate(self, data: Any) -> dict[str, Any] | None:
        candidates = data.get("candidates", []) if isinstance(data, dict) else []
        if not isinstance(candidates, list) or not candidates:
            return None
        candidate = candidates[0]
        if not isinstance(candidate, dict):
            return None
        if not candidate.get("id") or not candidate.get("accesskey"):
            return None
        return candidate

    def _decode_lyric(self, encoded: Any) -> str:
        if not isinstance(encoded, str) or not encoded:
            return ""
        try:
            return clean_lyric(base64.b64decode(encoded).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return ""
