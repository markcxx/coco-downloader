# coding: utf-8
import json
import logging
import re
from typing import Any

from bs4 import BeautifulSoup
from requests import RequestException

from app.services.errors import ProviderNetworkError

from app.models.music import LyricData, MusicItem, PlayInfo

from .base import MusicProvider
from .http_client import ProviderHttpClient
from .utils import absolute_url, clean_lyric, clean_text, decode_base64_url, extract_ext, is_http_url, parse_lrc_lines, validate_audio_url

LOGGER = logging.getLogger(__name__)
REQUEST_TIMEOUT = 15

SEARCH_HEADERS = {
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

API_HEADERS = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": "https://www.gequhai.com",
    "priority": "u=1, i",
    "sec-ch-ua": SEARCH_HEADERS["sec-ch-ua"],
    "x-custom-header": "SecretKey",
    "x-requested-with": "XMLHttpRequest",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": SEARCH_HEADERS["user-agent"],
}


def _extract_app_data(html: str) -> dict[str, Any]:
    values: dict[str, Any] = {}
    app_data_match = re.search(r"window\.appData\s*=\s*(\{.*?\})\s*;", html)
    if app_data_match:
        try:
            values.update(json.loads(app_data_match.group(1)))
        except json.JSONDecodeError:
            values.update({})

    patterns = [
        r"window\.(\w+)\s*=\s*'([^']*)'\s*;",
        r"window\.(\w+)\s*=\s*\"([^\"]*)\"\s*;",
        r"window\.(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*;",
        r"window\.(\w+)\s*=\s*(true|false|null)\s*;",
    ]
    for pattern in patterns:
        for key, value in re.findall(pattern, html, flags=re.IGNORECASE):
            values.setdefault(key, value.lower() if value in {"true", "false", "null"} else value)

    if values.get("mp3_title") and values.get("mp3_author") and not values.get("mp3_name"):
        values["mp3_name"] = f"{values['mp3_title']}-{values['mp3_author']}"

    extra_url = values.get("mp3_extra_url")
    if isinstance(extra_url, str):
        values["mp3_extra_url_decoded"] = decode_base64_url(extra_url, ("#", "H"))

    return values


def _parse_search_html(html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table#myTables")
    if not table:
        return []

    items: list[dict[str, str]] = []
    for row in table.select("tbody tr"):
        cells = row.select("td")
        if len(cells) < 3:
            continue
        link = cells[1].select_one("a")
        href = link.get("href", "") if link else ""
        match = re.search(r"/play/(\d+)", href)
        if not match:
            continue
        items.append(
            {
                "id": match.group(1),
                "title": clean_text(link.get_text() if link else cells[1].get_text()),
                "artist": clean_text(cells[2].get_text()),
                "play_url": absolute_url(href, "https://www.gequhai.com") or "",
            }
        )
    return items


class GequhaiProvider(MusicProvider):
    name = "gequhai"

    def __init__(self) -> None:
        self._http = ProviderHttpClient()
        self._session_ready = False

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        try:
            if not self._session_ready:
                # A first visit may return a 403 while setting the session cookie.
                for attempt in range(2):
                    try:
                        self._http.get_text("https://www.gequhai.com/", headers=SEARCH_HEADERS, timeout=REQUEST_TIMEOUT)
                        self._session_ready = True
                        break
                    except ProviderNetworkError as error:
                        cause = error.__cause__
                        response = getattr(cause, "response", None)
                        if attempt == 1 or response is None or response.status_code != 403:
                            raise
            html = self._http.get_text(
                "https://www.gequhai.com/search",
                params={"s": query, "page": 1},
                headers=SEARCH_HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
        except RequestException:
            LOGGER.exception("Gequhai search error")
            raise

        return [
            MusicItem(
                id=item["id"],
                title=item["title"] or "未知歌曲",
                artist=item["artist"] or "未知歌手",
                provider=self.name,
                extra={"playUrl": item["play_url"]},
            )
            for item in _parse_search_html(html)[offset:offset + limit]
        ]

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        play_url = self._get_play_url(song_id, extra)
        html = self._http.get_text(play_url, headers=SEARCH_HEADERS, timeout=REQUEST_TIMEOUT)
        app_data = _extract_app_data(html)
        play_id = str(app_data.get("play_id") or app_data.get("mp3_id") or song_id)
        download_url = self._resolve_api_url(play_id)
        if not download_url:
            extra_url = app_data.get("mp3_extra_url_decoded")
            download_url = extra_url if is_http_url(extra_url) else ""
        if not download_url:
            raise ValueError("Failed to resolve download url")
        download_url = validate_audio_url(self._http, download_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=REQUEST_TIMEOUT)

        cover = app_data.get("mp3_cover") if isinstance(app_data.get("mp3_cover"), str) else None
        return PlayInfo(url=download_url, type=extract_ext(download_url), cover=cover)

    def get_lyric(self, song_id: str, extra: dict[str, Any] | None = None) -> LyricData:
        play_url = self._get_play_url(song_id, extra)
        html = self._http.get_text(play_url, headers=SEARCH_HEADERS, timeout=REQUEST_TIMEOUT)
        soup = BeautifulSoup(html, "html.parser")
        lyric_node = soup.select_one("#content-lrc2")
        lyric = clean_lyric(lyric_node.get_text().strip() if lyric_node else "")
        if "歌词获取失败" in lyric:
            lyric = ""
        return LyricData(songid=song_id, provider=self.name, lines=parse_lrc_lines(lyric), lrc=lyric)

    def _get_play_url(self, song_id: str, extra: dict[str, Any] | None) -> str:
        if extra and isinstance(extra.get("playUrl"), str) and extra["playUrl"].strip():
            return extra["playUrl"]
        return f"https://www.gequhai.com/play/{song_id}"

    def _resolve_api_url(self, play_id: str) -> str:
        if not play_id:
            return ""
        api_data = self._http.post_json(
            "https://www.gequhai.com/api/music",
            headers=API_HEADERS,
            data={"id": play_id, "type": "0"},
            timeout=REQUEST_TIMEOUT,
        )
        if not isinstance(api_data, dict):
            return ""
        payload = api_data.get("data", {})
        url = payload.get("url") if isinstance(payload, dict) else None
        return url if is_http_url(url) else ""
