# coding: utf-8
import json
import re
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from app.models.music import MusicItem, PlayInfo
from .base import MusicProvider
from .http_client import ProviderHttpClient
from .utils import clean_text, validate_audio_url

BASE_URL = "https://www.at38.cn/"
REQUEST_TIMEOUT = 15


class At38Provider(MusicProvider):
    def __init__(self, name: str, source: str) -> None:
        if source not in {"wy", "qq"}:
            raise ValueError("Unsupported 51ape music source")
        self.name = name
        self._source = source
        self._http = ProviderHttpClient()
        self._visit_cookie = ""

    def _valid_id(self, song_id: str) -> bool:
        pattern = r"\d+" if self._source == "wy" else r"[a-zA-Z0-9]+"
        return bool(re.fullmatch(pattern, song_id))

    def _request_text(self, params: dict[str, str]) -> str:
        for _ in range(3):
            html = self._http.get_text(
                BASE_URL,
                params=params,
                headers={"User-Agent": "Mozilla/5.0", "Referer": BASE_URL,
                         **({"Cookie": self._visit_cookie} if self._visit_cookie else {})},
                timeout=REQUEST_TIMEOUT,
            )
            # Parse the literal visit cookie without running remote JavaScript.
            visit = re.search(r"document\.cookie\s*=\s*[\"'](mk_visit=[^;\"']+)", html)
            if visit:
                self._visit_cookie = visit.group(1)
                continue
            return html
        raise ValueError("51ape 访问会话建立失败，请稍后重试")

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        keyword = query.strip()
        if not keyword:
            return []
        soup = BeautifulSoup(self._request_text({"keyword": keyword}), "html.parser")
        items: list[MusicItem] = []
        seen: set[str] = set()
        for card in soup.select(".music-card"):
            if card.get("data-type") != self._source:
                continue
            song_id = str(card.get("data-id") or "")
            title_node = card.select_one(".music-info h3")
            title = clean_text(title_node.get_text() if title_node else "")
            if not self._valid_id(song_id) or not title or song_id in seen:
                continue
            info_node = card.select_one(".music-info p")
            info = clean_text(info_node.get_text() if info_node else "")
            artist_match = re.search(r"歌手[：:]\s*(.*?)\s*\|\s*专辑[：:]", info)
            album_match = re.search(r"专辑[：:]\s*(.*?)\s*\|\s*来源[：:]", info)
            artist = artist_match.group(1).strip() if artist_match else "未知歌手"
            album = album_match.group(1).strip() if album_match else None
            seen.add(song_id)
            items.append(MusicItem(
                id=song_id, title=title, artist=artist, album=album or None, provider=self.name,
                extra={"filename": card.get("data-filename") or f"{artist}-{title}"},
            ))
        start = max(0, int(offset))
        return items[start:start + min(50, max(1, int(limit)))]

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        if not self._valid_id(song_id):
            raise ValueError("51ape 歌曲 ID 无效，请重新搜索")
        filename = (extra or {}).get("filename")
        text = self._request_text({
            "action": "geturl", "id": song_id, "type": self._source,
            "filename": filename if isinstance(filename, str) else song_id,
        })
        try:
            data = json.loads(text)
        except (TypeError, ValueError) as error:
            raise ValueError("51ape 未返回有效的歌曲链接，请稍后重试或更换渠道") from error
        if not isinstance(data, dict):
            raise ValueError("51ape 未返回有效的歌曲链接，请稍后重试或更换渠道")
        url = data.get("url")
        if data.get("code") != 1 or not isinstance(url, str) or not url.startswith(("http://", "https://")):
            message = data.get("msg")
            raise ValueError(message if isinstance(message, str) else "51ape 暂未提供此歌曲的播放链接")
        final_url = validate_audio_url(self._http, url, timeout=REQUEST_TIMEOUT)
        suffix = re.search(r"\.(mp3|flac|m4a|aac|wav|ogg|opus)$", urlparse(final_url).path, re.I)
        return PlayInfo(url=final_url, type=suffix.group(1).lower() if suffix else "mp3")
