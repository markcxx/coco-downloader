# coding: utf-8
import base64
import logging
from typing import Any

from requests import RequestException

from app.services.errors import ProviderNetworkError
from app.models.music import LyricData, MusicItem, PlayInfo

from .base import MusicProvider
from .http_client import ProviderHttpClient
from .utils import extract_ext, is_http_url, parse_lrc_lines, validate_audio_url

LOGGER = logging.getLogger(__name__)
REQUEST_TIMEOUT = 15
SEARCH_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg"
SEARCH_REQUEST_KEY = "music.search.SearchCgiService.DoSearchForQQMusicMobile"
LYRIC_URL = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg"
VKEYS_URL = "https://api.vkeys.cn/music/tencent/song/link"
SEARCH_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 "
        "Mobile/15E148 Safari/604.1 Edg/131.0.0.0"
    ),
}
VKEYS_QUALITY_PRIORITY = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
def _normalize_limit(limit: int) -> int:
    return min(max(int(limit), 1), 30)


def _normalize_offset(offset: int) -> int:
    return max(int(offset), 0)


def _format_duration(seconds: Any) -> str | None:
    if not isinstance(seconds, int | float):
        return None
    value = int(seconds)
    return f"{value // 60:02d}:{value % 60:02d}"


def _join_singers(items: Any) -> str:
    if not isinstance(items, list):
        return ""

    names = []
    for item in items:
        if isinstance(item, dict) and item.get("name"):
            names.append(str(item["name"]))
    return ", ".join(names)


class QQOfficialProvider(MusicProvider):
    name = "qq-official"

    def __init__(self) -> None:
        self._http = ProviderHttpClient()

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        page_size = _normalize_limit(limit)
        page_num = (_normalize_offset(offset) // page_size) + 1
        payload = self._build_payload(query, page_size, page_num)

        try:
            data = self._http.post_json(
                SEARCH_URL,
                headers=SEARCH_HEADERS,
                json_data=payload,
                timeout=REQUEST_TIMEOUT,
            )
        except (ProviderNetworkError, RequestException):
            LOGGER.exception("QQ official search error")
            raise

        if not isinstance(data, dict) or data.get("code") != 0:
            LOGGER.warning("QQ official search failed: %s", data)
            return []

        request_data = data.get(SEARCH_REQUEST_KEY, {})
        if not isinstance(request_data, dict) or request_data.get("code") != 0:
            LOGGER.warning("QQ mobile search request failed: %s", request_data)
            return []
        songs = self._extract_songs(request_data)
        if not isinstance(songs, list):
            return []
        return [item for item in (self._map_item(song) for song in songs) if item]

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        context = extra or {}
        play_info = self._resolve_play_info(song_id, context)
        return self._complete_play_info(play_info, context)

    def get_lyric(self, song_id: str, extra: dict[str, Any] | None = None) -> LyricData:
        data = self._http.get_json(
            LYRIC_URL,
            headers={
                "Referer": "https://y.qq.com/portal/player.html",
                "User-Agent": SEARCH_HEADERS["User-Agent"],
            },
            params={
                "songmid": song_id,
                "g_tk": "5381",
                "loginUin": "0",
                "hostUin": "0",
                "format": "json",
                "inCharset": "utf8",
                "outCharset": "utf-8",
                "platform": "yqq",
            },
            timeout=REQUEST_TIMEOUT,
        )
        encoded = data.get("lyric", "") if isinstance(data, dict) else ""
        lyric = _decode_base64(encoded) if isinstance(encoded, str) and encoded else ""
        return LyricData(songid=song_id, provider=self.name, lines=parse_lrc_lines(lyric), lrc=lyric)

    def _build_payload(self, query: str, limit: int, page_num: int) -> dict[str, Any]:
        return {
            "comm": {
                "ct": "19",
                "cv": "1859",
                "uin": "0",
            },
            SEARCH_REQUEST_KEY: {
                "method": "DoSearchForQQMusicMobile",
                "module": "music.search.SearchCgiService",
                "param": {
                    "grp": 1,
                    "num_per_page": limit,
                    "page_num": page_num,
                    "query": query,
                    "search_type": 0,
                },
            },
        }

    def _extract_songs(self, request_data: dict[str, Any]) -> list[Any]:
        body_data = request_data.get("data", {})
        if not isinstance(body_data, dict):
            return []
        body = body_data.get("body", {})
        if not isinstance(body, dict):
            return []
        item_songs = body.get("item_song", [])
        if isinstance(item_songs, list) and item_songs:
            return item_songs
        song_node = body.get("song", {})
        songs = song_node.get("list", []) if isinstance(song_node, dict) else []
        return songs if isinstance(songs, list) else []

    def _map_item(self, song: Any) -> MusicItem | None:
        if not isinstance(song, dict):
            return None

        song_id = song.get("id")
        song_mid = song.get("mid")
        item_id = song_mid if isinstance(song_mid, str) and song_mid else song_id
        if not isinstance(item_id, int | str):
            return None

        album = song.get("album", {})
        album_name = (album.get("name") or album.get("title")) if isinstance(album, dict) else None
        album_mid = album.get("mid") if isinstance(album, dict) else None
        cover = None
        if isinstance(album_mid, str) and album_mid:
            cover = f"https://y.gtimg.cn/music/photo_new/T002R300x300M000{album_mid}.jpg"

        return MusicItem(
            id=str(item_id),
            title=song.get("name") or "未知歌曲",
            artist=_join_singers(song.get("singer")) or "未知歌手",
            album=str(album_name) if album_name else None,
            cover=cover,
            duration=_format_duration(song.get("interval")),
            provider=self.name,
            extra=self._build_item_extra(song, song_mid, cover),
        )

    def _build_item_extra(self, song: dict[str, Any], song_mid: Any, cover: str | None) -> dict[str, Any]:
        extra = {
            "title": song.get("name") or "",
            "artist": _join_singers(song.get("singer")),
            "selectedParser": "vkeys",
            "selectedFormat": "flac",
        }
        if isinstance(song_mid, str) and song_mid:
            extra["mid"] = song_mid
        if cover:
            extra["cover"] = cover
        return extra

    def _resolve_play_info(self, song_id: str, extra: dict[str, Any]) -> PlayInfo:
        mid = str(extra.get("mid") or song_id).strip()
        if not mid:
            raise ValueError("缺少 QQ 音乐 mid")
        if extra.get("selectedParser") not in {None, "", "vkeys"}:
            raise ValueError("该 QQ 解析线路已下架，请重新搜索并选择可用渠道")
        qualities = (8, 6) if extra.get("usage") == "playback" else None
        return self._get_by_vkeys(mid, qualities)

    def _complete_play_info(self, play_info: PlayInfo, extra: dict[str, Any]) -> PlayInfo:
        if play_info.cover:
            return play_info
        return PlayInfo(
            url=play_info.url,
            type=play_info.type,
            bitrate=play_info.bitrate,
            cover=str(extra.get("cover") or "") or None,
            headers=play_info.headers,
        )

    def _get_by_vkeys(self, song_id: str, qualities: tuple[int, ...] | None = None) -> PlayInfo:
        # VKeys 8/6 are 320/128 kbps MP3; prefer these for the Qt5 player.
        # Downloads retain the existing high-quality-first ordering.
        for quality in qualities or VKEYS_QUALITY_PRIORITY:
            data = self._http.get_json(
                VKEYS_URL,
                headers=SEARCH_HEADERS,
                params={"mid": song_id, "quality": quality},
                timeout=REQUEST_TIMEOUT,
            )
            if not isinstance(data, dict) or data.get("code") not in {0, 200}:
                continue
            payload = data.get("data", {})
            if not isinstance(payload, dict):
                continue
            url = payload.get("url")
            if is_http_url(url):
                try:
                    final_url = validate_audio_url(
                        self._http,
                        url,
                        headers=SEARCH_HEADERS,
                        timeout=REQUEST_TIMEOUT,
                    )
                except (ProviderNetworkError, ValueError):
                    continue
                return PlayInfo(
                    url=final_url,
                    type=extract_ext(final_url),
                    bitrate=payload.get("kbps") or payload.get("quality"),
                    cover=payload.get("cover") if isinstance(payload.get("cover"), str) else None,
                )
        raise ValueError("Failed to get vkeys url")


def _decode_base64(value: str) -> str:
    try:
        return base64.b64decode(value).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return ""
