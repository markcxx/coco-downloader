# coding: utf-8
import logging
import re
from typing import Any

from bs4 import BeautifulSoup
from requests import RequestException

from app.models.music import MusicItem, PlayInfo

from .base import MusicProvider
from .http_client import ProviderHttpClient
from .utils import absolute_url, clean_text, quote_id

LOGGER = logging.getLogger(__name__)
REQUEST_TIMEOUT = 15

HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "cache-control": "max-age=0",
    "priority": "u=0, i",
    "sec-ch-ua": "\"Google Chrome\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
}


def _normalize_title_text(text: str) -> str:
    value = clean_text(text)
    for token in ("播放", "试听", "下载", "分享"):
        value = value.replace(token, "")
    return clean_text(value)


def _parse_title(text: str) -> tuple[str, str]:
    normalized = _normalize_title_text(text)
    match = re.match(r"^(.*?)《(.*?)》$", normalized)
    if match:
        return clean_text(match.group(2)) or normalized, clean_text(match.group(1))
    for separator in (" - ", "-"):
        if separator in normalized:
            parts = [part.strip() for part in normalized.split(separator) if part.strip()]
            if len(parts) >= 2:
                return parts[0], parts[1]
    return normalized, ""


class LivepooProvider(MusicProvider):
    name = "livepoo"

    def __init__(self) -> None:
        self._http = ProviderHttpClient()

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        try:
            html = self._http.get_text(
                f"https://www.livepoo.cn/search?keyword={quote_id(query)}&page=0",
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
        except RequestException:
            LOGGER.exception("Livepoo search error")
            raise
        return self._parse_search_html(html)[offset:offset + limit]

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        url = self.get_download_page(song_id)
        html = self._http.get_text(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.livepoo.cn/"},
                                   timeout=REQUEST_TIMEOUT)
        if not re.search(r"https?://pan\.quark\.cn/s/", html.replace("\\/", "/")):
            raise ValueError("力音暂未提供网盘下载入口")
        return PlayInfo(url=url, type="", delivery="source-page")

    def get_download_page(self, song_id: str) -> str:
        if not song_id.isdigit():
            raise ValueError("力音歌曲 ID 无效，请重新搜索")
        return f"https://www.livepoo.cn/music/info.html?id=MUSIC_{song_id}"

    def _parse_search_html(self, html: str) -> list[MusicItem]:
        soup = BeautifulSoup(html, "html.parser")
        items: list[MusicItem] = []
        for anchor in soup.select("ul.tuij_song li.song_item2 a[href]"):
            item = self._parse_anchor(anchor)
            if item:
                items.append(item)
        return items

    def _parse_anchor(self, anchor) -> MusicItem | None:
        href = anchor.get("href", "")
        parent = anchor.find_parent("li", class_="song_item2")
        title_source = self._find_title_source(parent, anchor)
        title_text = _normalize_title_text(title_source)
        url = absolute_url(href, "https://www.livepoo.cn/") or ""
        match = re.search(r"[?&]id=MUSIC_([^&#]+)", url)
        if not match or not title_text:
            return None

        artist_from_link = ""
        if parent:
            artist_anchor = parent.select_one("a[href*='singer'], a[href*='artist']")
            artist_from_link = clean_text(artist_anchor.get_text() if artist_anchor else "")
        title, artist = _parse_title(title_text)
        return MusicItem(
            id=match.group(1),
            title=title or title_text,
            artist=artist or artist_from_link or "未知歌手",
            provider=self.name,
            extra={"detailUrl": url},
        )

    def _find_title_source(self, parent, anchor) -> str:
        if not parent:
            return anchor.get_text()
        candidates = [
            parent.select_one(".song_info2 > div"),
            parent.select_one(".song_info2 .song_name"),
            parent.select_one(".song_info2"),
        ]
        for candidate in candidates:
            if candidate and clean_text(candidate.get_text()):
                return candidate.get_text()
        return anchor.get_text()
