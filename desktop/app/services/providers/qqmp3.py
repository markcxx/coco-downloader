# coding: utf-8
import logging
from typing import Any

from requests import RequestException

from app.models.music import MusicItem, PlayInfo
from app.services.errors import ProviderNetworkError

from .base import MusicProvider
from .http_client import ProviderHttpClient
from .utils import extract_ext, validate_audio_url

LOGGER = logging.getLogger(__name__)

HEADERS = {
    "accept": "*/*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "origin": "https://www.qqmp3.vip",
    "priority": "u=1, i",
    "referer": "https://www.qqmp3.vip/",
    "sec-ch-ua": "\"Google Chrome\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
}

API_BASE_URLS = (
    "https://www.qqmp3.vip",
    "https://bb.qqmp3.vip",
    "https://api.qqmp3.vip",
)


class QQMp3Provider(MusicProvider):
    def __init__(self, name: str = "qqmp3") -> None:
        self.name = name
        self._http = ProviderHttpClient()

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        last_error: Exception | None = None
        for base_url in API_BASE_URLS:
            try:
                data = self._http.get_json(
                    f"{base_url}/api/songs.php",
                    headers=HEADERS,
                    params={"type": "search", "keyword": query},
                    timeout=15,
                )
                if not isinstance(data, dict):
                    raise ValueError("Invalid search response")
                items = data.get("data", [])
                if data.get("code") != 200 or not isinstance(items, list):
                    raise ValueError(str(data.get("message") or data.get("msg") or "Invalid search response"))
                mapped_items = [item for item in (self._map_item(raw_item) for raw_item in items) if item]
                return mapped_items[offset:offset + limit]
            except (ProviderNetworkError, RequestException, ValueError) as error:
                last_error = error
        if last_error:
            LOGGER.warning("QQMp3 search failed: %s", last_error)
            raise last_error
        return []

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        last_error: Exception | None = None
        for base_url in API_BASE_URLS:
            try:
                data = self._http.get_json(
                    f"{base_url}/api/kw.php",
                    headers=HEADERS,
                    params={"rid": song_id, "type": "json", "level": "exhigh", "lrc": "true"},
                    timeout=15,
                )
                if not isinstance(data, dict):
                    raise ValueError("Invalid play response")
                payload = data.get("data", {})
                url = payload.get("url") if isinstance(payload, dict) else None
                if data.get("code") != 200 or not isinstance(url, str) or not url:
                    raise ValueError(str(data.get("msg") or "Failed to get play info"))
                cover = payload.get("pic") if isinstance(payload.get("pic"), str) else None
                url = validate_audio_url(self._http, url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
                return PlayInfo(url=url, type=extract_ext(url), cover=cover)
            except (ProviderNetworkError, RequestException, ValueError) as error:
                last_error = error
        raise last_error or ValueError("Failed to get play info")

    def _map_item(self, item: Any) -> MusicItem | None:
        if not isinstance(item, dict) or not item.get("rid"):
            return None
        return MusicItem(
            id=str(item.get("rid")),
            title=item.get("name") or "未知歌曲",
            artist=item.get("artist") or "未知歌手",
            cover=item.get("pic") or None,
            provider=self.name,
            extra={"lrc": None},
        )
