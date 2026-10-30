"""Platform lyric fetching only; no search or download URL APIs."""

import base64
from typing import Any
from app.models.music import LyricData
from app.services.lyric_utils import parse_lrc_lines, clean_lyric
import hashlib
import json
import logging
import random
import string
from urllib.parse import urlencode

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad


REQUEST_TIMEOUT = 15
LOGGER = logging.getLogger(__name__)
LYRIC_API_URL = "https://interface3.music.163.com/eapi/song/lyric/v1"
EAPI_KEY = b"e82ckenh8dichen8"
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


class NeteaseLyrics:
    name = "netease"

    def __init__(self) -> None:
        from app.services.providers.http_client import ProviderHttpClient

        self._http = ProviderHttpClient()
        self._device_id = self._generate_device_id()

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

    def _make_lyric_request(self, data: dict[str, Any]) -> Any:
        uri = "/api/song/lyric/v1"
        encrypted = _eapi_encrypt(
            uri, {"header": self._build_request_header(), "e_r": True, **data}
        )
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
                LOGGER.debug(
                    "Netease eapi response is encrypted despite json content type"
                )
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


LYRIC_URL = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg"
QQ_LYRIC_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 "
        "Mobile/15E148 Safari/604.1 Edg/131.0.0.0"
    ),
}


def _decode_base64(value):
    return base64.b64decode(value).decode("utf-8")


def _string_value(value):
    return str(value).strip() if isinstance(value, (str, int, float)) else ""


class QQLyrics:
    name = "qq"

    def __init__(self):
        from app.services.providers.http_client import ProviderHttpClient

        self._http = ProviderHttpClient()

    def get_lyric(self, song_id: str, extra: dict[str, Any] | None = None) -> LyricData:
        data = self._http.get_json(
            LYRIC_URL,
            headers={
                "Referer": "https://y.qq.com/portal/player.html",
                "User-Agent": QQ_LYRIC_HEADERS["User-Agent"],
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
        return LyricData(
            songid=song_id, provider=self.name, lines=parse_lrc_lines(lyric), lrc=lyric
        )


LYRIC_SEARCH_URL = "http://lyrics.kugou.com/search"
LYRIC_DOWNLOAD_URL = "http://lyrics.kugou.com/download"


class KugouLyrics:
    name = "kugou"

    def __init__(self):
        from app.services.providers.http_client import ProviderHttpClient

        self._http = ProviderHttpClient()

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
        return LyricData(
            songid=song_id, provider=self.name, lines=parse_lrc_lines(lyric), lrc=lyric
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


KUWO_LYRIC_URL = "http://mlyric.kuwo.cn/mobi.s"


class KuwoLyrics:
    name = "bodian"

    def __init__(self):
        from app.services.providers.http_client import ProviderHttpClient

        self._http = ProviderHttpClient()

    def get_lyric(self, song_id: str, extra: dict[str, Any] | None = None) -> LyricData:
        lyric = clean_lyric(self._get_lyric_by_official_api(song_id))
        if "歌词获取失败" in lyric:
            lyric = ""
        return LyricData(
            songid=song_id, provider=self.name, lines=parse_lrc_lines(lyric), lrc=lyric
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
