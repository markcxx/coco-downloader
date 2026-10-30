# coding: utf-8
import re
import sys
import time
from dataclasses import replace
from typing import Any
from urllib.parse import urljoin, urlparse

from app.models.music import LyricData, MusicItem, PlayInfo
from .base import MusicProvider
from .gdstudio_signature import HOST, signature
from app.services.lyrics import NeteaseLyrics

BASE_URL = f"https://{HOST}"
QUALITY_OPTIONS = [
    {"value": "standard", "level": "standard", "label": "标准音质", "quality": "128", "format": "mp3"},
    {"value": "exhigh", "level": "exhigh", "label": "极高音质", "quality": "320", "format": "mp3"},
    {"value": "lossless", "level": "lossless", "label": "无损音质", "quality": "740", "format": "flac/mp3"},
    {"value": "hires", "level": "hires", "label": "Hi-Res 音质", "quality": "999", "format": "flac/mp3"},
]
BITRATES = {option["value"]: option["quality"] for option in QUALITY_OPTIONS}


def _new_session():
    # Delay native loading until the channel is used so that a missing optional
    # dependency cannot prevent other channels or the app itself from opening.
    if sys.platform == "darwin":
        import ctypes
        for framework in ("CoreFoundation", "Security"):
            ctypes.CDLL(
                f"/System/Library/Frameworks/{framework}.framework/{framework}",
                mode=ctypes.RTLD_GLOBAL,
            )
    try:
        from curl_cffi import requests
    except ImportError as error:
        raise ValueError("GD音乐台缺少请求依赖，请安装桌面端 requirements.txt 中的 curl_cffi") from error
    return requests.Session(impersonate="chrome", headers={
        "Referer": BASE_URL + "/", "Origin": BASE_URL, "X-Requested-With": "XMLHttpRequest",
    })


class GDStudioProvider(MusicProvider):
    name = "gdstudio-netease"

    def _request(self, params: dict[str, str]) -> Any:
        with _new_session() as session:
            timestamp = str(int(time.time()))
            try:
                clock = session.get(BASE_URL + "/time", timeout=8)
                if clock.status_code == 200 and clock.text.strip().isdigit():
                    timestamp = clock.text.strip()
            except Exception:
                pass
            payload = params.get("name", "") if params["types"] == "search" else params.get("id", "")
            try:
                response = session.get(BASE_URL + "/api.php", params={
                    **params, "source": "netease", "s": signature(payload, timestamp),
                }, timeout=20)
            except Exception as error:
                raise ValueError("GD音乐台请求失败或超时，请稍后重试或切换渠道") from error
            if response.status_code == 403:
                raise ValueError("GD音乐台暂时拦截了当前网络，请稍后重试或切换渠道")
            if response.status_code == 429:
                raise ValueError("GD音乐台请求过于频繁，请稍后重试")
            if response.status_code != 200:
                raise ValueError(f"GD音乐台返回异常状态（{response.status_code}），请稍后重试")
            try:
                return response.json()
            except ValueError as error:
                raise ValueError("GD音乐台未返回有效数据，请稍后重试") from error

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        keyword = query.strip()
        if not keyword:
            return []
        start = max(0, int(offset))
        count = min(50, max(1, int(limit)))
        page, within_page = start // 50 + 1, start % 50
        def load(page_number):
            return self._request({"types": "search", "name": keyword, "count": "50", "pages": str(page_number)})
        songs = load(page)
        if not isinstance(songs, list):
            raise ValueError("GD音乐台未返回有效的搜索结果，请稍后重试")
        if within_page + count > 50 and len(songs) == 50:
            following = load(page + 1)
            if isinstance(following, list):
                songs += following
        items = []
        for song in songs[within_page:within_page + count]:
            if not isinstance(song, dict):
                continue
            song_id = str(song.get("id") or "")
            url_id = str(song.get("url_id") or song_id)
            if song.get("source") != "netease" or not song_id.isascii() or not song_id.isdigit() or not url_id.isascii() or not url_id.isdigit() or not song.get("name"):
                continue
            metadata = song.get("extra_data") if isinstance(song.get("extra_data"), dict) else {}
            try:
                duration = max(0, int(metadata.get("duration") or 0))
            except (ValueError, TypeError):
                duration = 0
            artists = song.get("artist")
            options = [dict(option) for option in QUALITY_OPTIONS if option["value"] != "hires" or metadata.get("has_hires")]
            items.append(MusicItem(
                id=song_id, title=song["name"], artist=" / ".join(artists) if isinstance(artists, list) else "未知歌手",
                album=song.get("album"), provider=self.name,
                duration=f"{duration // 60}:{duration % 60:02d}" if duration else None,
                extra={"urlId": url_id, "selectedLevel": "lossless", "qualityOptions": options},
            ))
        return items

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        context = extra or {}
        url_id = context.get("urlId") if isinstance(context.get("urlId"), str) else song_id
        if not re.fullmatch(r"[0-9]+", song_id) or not re.fullmatch(r"[0-9]+", url_id):
            raise ValueError("GD音乐台歌曲 ID 无效，请重新搜索")
        level = context.get("level") or context.get("selectedLevel") or "lossless"
        data = self._request({"types": "url", "id": url_id, "br": BITRATES.get(level, "740")})
        if not isinstance(data, dict) or not data.get("url") or data.get("size") in (0, "0") or data.get("br") in (-1, "-1"):
            raise ValueError("GD音乐台暂未提供此歌曲的音频，请更换音质或渠道")
        url = urljoin(BASE_URL + "/", data["url"])
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("GD音乐台返回了无效音频地址")
        extension = re.search(r"\.(mp3|flac|m4a|aac|ogg|wav)$", parsed.path, re.I)
        return PlayInfo(
            url=url, type=extension.group(1).lower() if extension else "mp3",
            bitrate=f"{data['br']} kbps" if data.get("br") else None,
            cover=context.get("cover"),
        )

    def get_lyric(self, song_id: str, extra: dict[str, Any] | None = None) -> LyricData:
        return replace(NeteaseLyrics().get_lyric(song_id, extra), provider=self.name)
