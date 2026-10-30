# coding: utf-8
import base64
import logging
from typing import Any

from requests import RequestException

from app.models.music import LyricData, MusicItem, PlayInfo

from .base import MusicProvider
from .http_client import ProviderHttpClient
from .utils import clean_lyric, clean_text, extract_ext, is_http_url, parse_lrc_lines

LOGGER = logging.getLogger(__name__)
SEARCH_API_URL = "https://bd-api.kuwo.cn/api/search/music/list"
TIANBAO_API_URL = "https://mobi.kuwo.cn/mobi.s"
KUWO_LYRIC_URL = "http://mlyric.kuwo.cn/mobi.s"
REQUEST_TIMEOUT = 20
DEFAULT_PLAY_LEVEL = "standard"
DEFAULT_PLAY_BR = "320kmp3"

SEARCH_HEADERS = {
    "user-agent": "Dart/3.3 (dart:io)",
    "plat": "win",
    "accept-encoding": "gzip",
    "api-ver": "application/json",
    "channel": "W1",
    "brand": "Windows 11 Pro for Workstations",
    "net": "wifi",
    "content-type": "application/json",
    "ver": "1.1.5",
    "svrver": "13",
    "devid": "coco-bodian",
    "qimei36": "coco-bodian",
}


class BodianProvider(MusicProvider):
    name = "bodian"

    def __init__(self) -> None:
        self._http = ProviderHttpClient()

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        try:
            data = self._http.get_json(
                SEARCH_API_URL,
                headers=SEARCH_HEADERS,
                params={
                    "pn": "0",
                    "rn": "10",
                    "keyword": query.strip(),
                    "correct": "1",
                    "uid": "-1",
                    "token": "",
                },
                timeout=REQUEST_TIMEOUT,
            )
        except RequestException:
            LOGGER.exception("Bodian search error")
            return []

        payload = data.get("data", {}) if isinstance(data, dict) else {}
        items = payload.get("resultList", []) if isinstance(payload, dict) else []
        if not isinstance(items, list):
            return []
        return [item for item in (self._map_item(raw_item) for raw_item in items) if item]

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        fallback_cover = extra.get("albumPic") if extra and isinstance(extra.get("albumPic"), str) else None
        info = self._get_by_tianbao(song_id)
        return PlayInfo(url=info["url"], type=extract_ext(info["url"], "mp3"),
                        bitrate=info.get("bitrate"), cover=fallback_cover)

    def get_lyric(self, song_id: str, extra: dict[str, Any] | None = None) -> LyricData:
        lyric = clean_lyric(self._get_lyric_by_official_api(song_id))
        if "歌词获取失败" in lyric:
            lyric = ""
        return LyricData(songid=song_id, provider=self.name, lines=parse_lrc_lines(lyric), lrc=lyric)

    def _map_item(self, item: Any) -> MusicItem | None:
        if not isinstance(item, dict):
            return None
        song_id = str(item.get("id") or "")
        title = clean_text(str(item.get("name") or ""))
        if not song_id or not title:
            return None
        album_pic = item.get("albumPic") if isinstance(item.get("albumPic"), str) else None
        free_sign = item.get("freeSign") or item.get("fsig")
        return MusicItem(
            id=song_id,
            title=title,
            artist=item.get("artist") or "未知歌手",
            album=item.get("album") or None,
            cover=album_pic,
            provider=self.name,
            extra={"albumPic": album_pic, "freeSign": free_sign or None},
        )

    def _get_lyric_by_official_api(self, song_id: str) -> str:
        query = f"type=lyric&req=2&lrcx=1&rid={song_id}&songname=&artist=&corp=kuwo&fromchannel=bodian"
        encoded_query = base64.b64encode(query.encode("utf-8")).decode("utf-8")
        data = self._http.get_json(
            KUWO_LYRIC_URL,
            params={"f": "bodian", "q": encoded_query, "uid": "-1", "token": ""},
            timeout=REQUEST_TIMEOUT,
        )
        payload = data.get("data", {}) if isinstance(data, dict) else {}
        content = payload.get("content") if isinstance(payload, dict) else None
        if not isinstance(content, str) or not content:
            raise ValueError("Invalid bodian lyric")
        return base64.b64decode(content).decode("utf-8")

    def _get_by_tianbao(self, song_id: str) -> dict[str, str]:
        data = self._http.get_json(
            TIANBAO_API_URL,
            headers={"User-Agent": "Dart/2.19 (dart:io)", "plat": "ar", "channel": "aliopen"},
            params={
                "f": "web",
                "user": "2333333",
                "source": "kwplayerhd_ar_4.3.0.8_tianbao_T1A_qirui.apk",
                "type": "convert_url_with_sign",
                "br": DEFAULT_PLAY_BR,
                "rid": song_id,
            },
            timeout=REQUEST_TIMEOUT,
        )
        payload = data.get("data", {}) if isinstance(data, dict) else {}
        url = clean_text(str(payload.get("url", ""))) if isinstance(payload, dict) else ""
        if not is_http_url(url):
            raise ValueError("Invalid tianbao url")
        return {"url": url, "bitrate": DEFAULT_PLAY_BR}
