# coding: utf-8
import hashlib
import json
import logging
import random
import string
from typing import Any
from urllib.parse import urlencode

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from requests import RequestException

from app.models.music import LyricData, MusicItem, PlayInfo
from app.services.errors import ProviderNetworkError

from .base import MusicProvider
from .http_client import ProviderHttpClient
from .utils import clean_text, extract_ext, is_http_url, parse_lrc_lines

LOGGER = logging.getLogger(__name__)
REQUEST_TIMEOUT = 15
API_DOMAIN = "https://interface.music.163.com"
LYRIC_API_URL = "https://interface3.music.163.com/eapi/song/lyric/v1"
METING_API_URL = "https://api.qijieya.cn/meting/"
EAPI_KEY = b"e82ckenh8dichen8"
DEFAULT_LEVEL = "lossless"
VALID_LEVELS = {
    "standard",
    "exhigh",
    "lossless",
}
METING_BR_BY_LEVEL = {
    "standard": "128",
    "exhigh": "320",
    "lossless": "2000",
}
DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 "
    "NeteasyMusicDesktop/3.1.19.204510"
)
DEFAULT_HEADER = {
    "os": "pc",
    "appver": "3.1.19.204510",
    "requestId": "0",
    "osver": "Microsoft-Windows-11-Home-China-build-22631-64bit",
}


def _normalize_limit(limit: int) -> int:
    return min(max(int(limit), 1), 50)


def _normalize_offset(offset: int) -> int:
    return max(int(offset), 0)


def _format_duration(milliseconds: Any) -> str | None:
    if not isinstance(milliseconds, int | float):
        return None
    seconds = int(milliseconds / 1000)
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def _join_artists(items: Any) -> str:
    if not isinstance(items, list):
        return ""

    names = []
    for item in items:
        if isinstance(item, dict) and item.get("name"):
            names.append(str(item["name"]))
    return ", ".join(names)


def _normalize_level(value: Any) -> str:
    level = str(value or DEFAULT_LEVEL).strip().lower()
    return level if level in VALID_LEVELS else DEFAULT_LEVEL


def _eapi_encrypt(uri: str, payload: dict[str, Any]) -> str:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    digest_text = f"nobody{uri}use{text}md5forencrypt"
    digest = hashlib.md5(digest_text.encode("utf-8")).hexdigest()
    message = f"{uri}-36cd479b6b5-{text}-36cd479b6b5-{digest}"
    cipher = AES.new(EAPI_KEY, AES.MODE_ECB)
    encrypted = cipher.encrypt(pad(message.encode("utf-8"), AES.block_size))
    return encrypted.hex().upper()


def _eapi_decrypt(content: bytes) -> Any:
    cipher = AES.new(EAPI_KEY, AES.MODE_ECB)
    decrypted = unpad(cipher.decrypt(content), AES.block_size)
    return json.loads(decrypted.decode("utf-8"))


class NeteaseOfficialProvider(MusicProvider):
    name = "netease"

    def __init__(self) -> None:
        self._http = ProviderHttpClient()
        self._device_id = self._generate_device_id()

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        try:
            payload = self._make_request(
                "/api/cloudsearch/pc",
                {
                    "s": query,
                    "type": 1,
                    "limit": _normalize_limit(limit),
                    "offset": _normalize_offset(offset),
                    "total": True,
                },
            )
        except (RequestException, ValueError, json.JSONDecodeError):
            LOGGER.exception("Netease official search error")
            raise

        result = payload.get("result", {}) if isinstance(payload, dict) else {}
        songs = result.get("songs", []) if isinstance(result, dict) else []
        if not isinstance(songs, list):
            return []
        return [item for item in (self._map_item(song) for song in songs) if item]

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        level = _normalize_level((extra.get("level") or extra.get("selectedLevel")) if extra else None)
        fallback_cover = extra.get("cover") if extra and isinstance(extra.get("cover"), str) else None

        info = self._get_by_meting(song_id, level)

        return PlayInfo(
            url=info["url"],
            type=extract_ext(info["url"]),
            bitrate=info.get("bitrate"),
            cover=info.get("cover") or fallback_cover,
        )

    def get_lyric(self, song_id: str, extra: dict[str, Any] | None = None) -> LyricData:
        try:
            numeric_id = int(song_id)
        except ValueError as error:
            raise ValueError("Invalid netease song id") from error

        payload = self._make_lyric_request(
            {
                "id": numeric_id,
                "cp": False,
                "tv": 0,
                "lv": 0,
                "rv": 0,
                "kv": 0,
                "yv": 0,
                "ytv": 0,
                "yrv": 0,
            }
        )
        lyric = self._extract_lyric_text(payload, "lrc")
        return LyricData(
            songid=song_id,
            provider=self.name,
            lines=parse_lrc_lines(lyric),
            lrc=lyric,
            tlyric=self._extract_lyric_text(payload, "tlyric") or None,
            yrc=self._extract_lyric_text(payload, "yrc") or None,
            romalrc=self._extract_lyric_text(payload, "romalrc") or None,
        )

    def _make_request(self, uri: str, data: dict[str, Any]) -> Any:
        url = f"{API_DOMAIN}/eapi{uri[4:]}"
        encrypted = _eapi_encrypt(uri, {"header": self._build_request_header(), "e_r": True, **data})
        response = self._http.post_response(
            url,
            headers={
                "User-Agent": DEFAULT_UA,
                "Cookie": self._build_cookie_header(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"params": encrypted},
            timeout=REQUEST_TIMEOUT,
        )
        return self._parse_eapi_response(response)

    def _make_lyric_request(self, data: dict[str, Any]) -> Any:
        uri = "/api/song/lyric/v1"
        encrypted = _eapi_encrypt(uri, {"header": self._build_request_header(), "e_r": True, **data})
        response = self._http.post_response(
            LYRIC_API_URL,
            headers={
                "User-Agent": DEFAULT_UA,
                "Cookie": self._build_cookie_header(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"params": encrypted},
            timeout=REQUEST_TIMEOUT,
        )
        return self._parse_eapi_response(response)

    def _parse_eapi_response(self, response: Any) -> Any:
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                return response.json()
            except json.JSONDecodeError:
                LOGGER.debug("Netease eapi response is encrypted despite json content type")
        return _eapi_decrypt(response.content)

    def _extract_lyric_text(self, payload: Any, key: str) -> str:
        if not isinstance(payload, dict):
            return ""
        lyric_node = payload.get(key)
        if not isinstance(lyric_node, dict):
            return ""
        lyric = lyric_node.get("lyric")
        return lyric if isinstance(lyric, str) else ""

    def _build_request_header(self) -> dict[str, str]:
        return {**DEFAULT_HEADER, "deviceId": self._device_id, "MUSIC_U": ""}

    def _build_cookie_header(self) -> str:
        cookies = self._build_request_header()
        return urlencode(cookies).replace("&", "; ")

    def _generate_device_id(self) -> str:
        alphabet = string.ascii_lowercase + string.digits
        return "".join(random.choice(alphabet) for _ in range(32))

    def _get_by_meting(self, song_id: str, level: str) -> dict[str, str]:
        br = METING_BR_BY_LEVEL.get(level, "320")
        response = self._http.get_response(
            METING_API_URL,
            params={"server": "netease", "type": "url", "id": song_id, "br": br},
            timeout=REQUEST_TIMEOUT,
            allow_redirects=False,
        )
        try:
            url = (response.headers.get("Location", "") if response.status_code == 302
                   else self._extract_meting_url(response.text))
        finally:
            response.close()
        if not is_http_url(url):
            raise ValueError("Invalid meting url")
        return {"url": url, "bitrate": br}

    def _extract_meting_url(self, response_text: str) -> str:
        raw_text = response_text.strip()
        if is_http_url(raw_text):
            return raw_text

        payload = json.loads(raw_text)
        if isinstance(payload, list) and payload:
            first_item = payload[0]
            if isinstance(first_item, dict):
                return clean_text(str(first_item.get("url", "")))
        if isinstance(payload, dict):
            value = payload.get("url") or payload.get("data")
            return clean_text(str(value or ""))
        return ""

    def _map_item(self, song: Any) -> MusicItem | None:
        if not isinstance(song, dict):
            return None
        song_id = song.get("id")
        if not isinstance(song_id, int | str):
            return None

        artists = song.get("ar") if isinstance(song.get("ar"), list) else song.get("artists")
        album = song.get("al") if isinstance(song.get("al"), dict) else song.get("album")
        album_name = album.get("name") if isinstance(album, dict) else None
        cover = album.get("picUrl") if isinstance(album, dict) else None
        duration = song.get("dt") if isinstance(song.get("dt"), int | float) else song.get("duration")

        return MusicItem(
            id=str(song_id),
            title=song.get("name") or "未知歌曲",
            artist=_join_artists(artists) or "未知歌手",
            album=str(album_name) if album_name else None,
            cover=str(cover) if cover else None,
            duration=_format_duration(duration),
            provider=self.name,
            extra={"cover": str(cover) if cover else None},
        )
