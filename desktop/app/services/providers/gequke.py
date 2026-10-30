from urllib.parse import urlencode, urljoin, urlparse, parse_qsl, urlunparse
# coding: utf-8
import json
import re
import time
import unicodedata
from typing import Any

import requests
from bs4 import BeautifulSoup

from app.models.music import LyricData, MusicItem, PlayInfo
from .base import MusicProvider
from .http_client import ProviderHttpClient
from .utils import parse_lrc_lines, validate_audio_url

SITE = "https://www.gequke.com"


class _Session:
    def __init__(self):
        self.http = requests.Session()
        self.http.trust_env = False
        self.http.headers.update({"User-Agent": "Mozilla/5.0", "Accept-Language": "zh-CN,zh;q=0.9", "Referer": SITE + "/"})
        self.deadline = time.monotonic() + 28

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.http.close()

    def request(self, path, data=None, music=False):
        for attempt in range(2):
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise ValueError("歌曲客请求超时，请稍后重试")
            headers = {"Origin": SITE, "X-Requested-With": "Http" if music else "XMLHttpRequest"} if data else {}
            if music:
                headers["X-Custom-Header"] = "Key"
            try:
                with self.http.request("POST" if data else "GET", SITE + path, data=data, headers=headers, timeout=min(10, remaining)) as response:
                    if response.status_code == 403 and response.headers.get("Set-Cookie") and attempt == 0:
                        continue
                    if response.status_code == 403:
                        raise ValueError("歌曲客拒绝了当前访问，请稍后重试或切换渠道")
                    if response.status_code == 429:
                        raise ValueError("歌曲客请求过于频繁，请稍后重试")
                    response.raise_for_status()
                    if not data:
                        self.http.headers["Referer"] = SITE + path
                    return response.text
            except requests.RequestException as error:
                raise ValueError("歌曲客请求失败或超时，请稍后重试") from error
        raise ValueError("歌曲客会话建立失败，请稍后重试")

    def json(self, path, data, music=False):
        try:
            result = json.loads(self.request(path, data, music))
        except json.JSONDecodeError as error:
            raise ValueError("歌曲客未返回有效数据，请稍后重试") from error
        if not isinstance(result, dict):
            raise ValueError("歌曲客未返回有效数据，请稍后重试")
        return result


def _value(html, name):
    match = re.search(r"window\." + re.escape(name) + r"\s*=\s*['\"]([^'\"]*)['\"]", html)
    return match.group(1) if match else ""


def _song_path(song_id):
    if not re.fullmatch(r"[0-9]+", song_id):
        raise ValueError("歌曲客歌曲 ID 无效，请重新搜索")
    return f"/song/{song_id}"


def _audio_url(value):
    url = urljoin(SITE, value)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not (parsed.hostname or "").endswith(".kuwo.cn"):
        raise ValueError("歌曲客暂未提供此歌曲的酷我音频直链，请更换渠道")
    return url


def _normalized(value):
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", value).lower())


class GequkeProvider(MusicProvider):
    name = "gequke"

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        keyword = query.strip()
        if not keyword:
            return []
        if len(keyword) > 50:
            raise ValueError("歌曲客搜索关键词不能超过 50 个字")
        with _Session() as session:
            session.request("/")
            state = session.json("/api/s", {"keyword": keyword})
            if state.get("code") == 2:
                for _ in range(4):
                    time.sleep(1.5)
                    state = session.json("/api/query-map", {"keyword": keyword})
                    if state.get("code") == 1:
                        break
                if state.get("code") != 1:
                    raise ValueError("歌曲客正在整理搜索结果，请稍后重新搜索")
            if state.get("code") != 1:
                raise ValueError(state.get("msg") or "歌曲客搜索失败，请稍后重试")
            html = session.request("/search?" + urlencode({"s": keyword}))
        soup, items, seen = BeautifulSoup(html, "html.parser"), [], set()
        for row in soup.select("#myTables tbody tr"):
            cells = row.select("td")
            if len(cells) < 3:
                continue
            link = cells[1].select_one("a")
            match = re.fullmatch(r"/song/([0-9]+)/?", link.get("href", "")) if link else None
            title = link.get_text(strip=True) if link else ""
            if not match or not title or match.group(1) in seen:
                continue
            song_id = match.group(1)
            seen.add(song_id)
            items.append(MusicItem(song_id, title, cells[2].get_text(strip=True) or "未知歌手", self.name))
        start, count = max(0, int(offset)), min(50, max(1, int(limit)))
        return items[start:start + count]

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        path = _song_path(song_id)
        with _Session() as session:
            html = session.request(path)
            play_id = _value(html, "play_id")
            if not play_id:
                raise ValueError("歌曲客未提供播放标识，请重新搜索")
            result = session.json("/api/music", {"id": play_id, "type": "0"}, music=True)
            url = (result.get("data") or {}).get("url") if isinstance(result.get("data"), dict) else None
            if result.get("code") != 200 or not isinstance(url, str) or not url:
                raise ValueError("歌曲客暂未提供此歌曲的在线音源，请更换渠道")
            url = _audio_url(url)
            if urlparse(url).hostname == "antiserver.kuwo.cn":
                parsed = urlparse(url)
                query = dict(parse_qsl(parsed.query))
                query.update({"type": "convert_url3", "callback": "gequkeCallback"})
                converted = session.http.get(urlunparse(parsed._replace(query=urlencode(query))), timeout=10)
                try:
                    converted.raise_for_status()
                    data = json.loads(re.sub(r"\);?$", "", re.sub(r"^gequkeCallback\(", "", converted.text.strip())))
                    if data.get("code") != 200 or not data.get("url"):
                        raise ValueError()
                    url = _audio_url(data["url"])
                except (ValueError, requests.RequestException) as error:
                    raise ValueError("歌曲客的酷我音频转换失败，请稍后重试") from error
                finally:
                    converted.close()
        url = validate_audio_url(ProviderHttpClient(), url, timeout=10)
        _audio_url(url)
        extension = re.search(r"\.(mp3|flac|m4a|aac|ogg|wav)$", urlparse(url).path, re.I)
        return PlayInfo(url, extension.group(1).lower() if extension else "mp3", cover=_value(html, "mp3_cover") or None)

    def get_lyric(self, song_id: str, extra: dict[str, Any] | None = None) -> LyricData:
        with _Session() as session:
            html = session.request(_song_path(song_id))
        node = BeautifulSoup(html, "html.parser").select_one("#content-lrc2")
        lrc = node.get_text().strip() if node else ""
        return LyricData(song_id, self.name, parse_lrc_lines(lrc), lrc)
