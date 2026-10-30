# coding: utf-8
import logging
from typing import Any

from requests import RequestException

from app.services.errors import ProviderNetworkError
from app.models.music import MusicItem, PlayInfo

from .base import MusicProvider
from .http_client import ProviderHttpClient
from .jianbin_session import initialize_session
from .utils import absolute_url, extract_ext, is_http_url, quote_id, safe_json_loads, unquote_repeated

LOGGER = logging.getLogger(__name__)
BASE_URL = "https://www.jbsou.cn/"
REQUEST_TIMEOUT = 30

SEARCH_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": "https://www.jbsou.cn",
    "x-requested-with": "XMLHttpRequest",
    "referer": "https://www.jbsou.cn/",
}
PAGE_HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": SEARCH_HEADERS["accept-language"],
    "user-agent": SEARCH_HEADERS["user-agent"],
}


class JianbinProvider(MusicProvider):
    def __init__(self, name: str, source: str) -> None:
        self.name = name
        self._source = source
        self._http = ProviderHttpClient()

    def search(self, query: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
        try:
            payload: Any = {}
            for attempt in range(2):
                self._bootstrap_session(force=attempt > 0)
                response_text = self._http.post_text(
                    BASE_URL,
                    headers=SEARCH_HEADERS,
                    data={"input": query, "filter": "name", "type": self._source, "page": "1"},
                    timeout=REQUEST_TIMEOUT,
                )
                payload = safe_json_loads(response_text)
                if isinstance(payload, dict) and (
                    payload.get("code") == 200 or isinstance(payload.get("data"), list)
                ):
                    break
        except (ProviderNetworkError, RequestException):
            LOGGER.exception("Jianbin search error")
            raise

        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            message = payload.get("error", "响应格式异常") if isinstance(payload, dict) else "响应格式异常"
            raise ValueError(f"煎饼搜索失败：{message}")

        items = payload.get("data", []) if isinstance(payload, dict) else []
        if not isinstance(items, list):
            return []
        return [item for item in (self._map_item(raw_item) for raw_item in items) if item]

    def get_play_info(self, song_id: str, extra: dict[str, Any] | None = None) -> PlayInfo:
        url = self._normalize_id_to_url(song_id)
        if not url:
            raise ValueError("Invalid id")
        final_url = self._resolve_final_url(url)
        if not is_http_url(final_url):
            raise ValueError("Invalid play url")
        return PlayInfo(url=final_url, type=extract_ext(final_url))


    def _map_item(self, item: Any) -> MusicItem | None:
        if not isinstance(item, dict):
            return None
        download_url = absolute_url(item.get("url"), BASE_URL)
        if not download_url:
            return None
        cover_url = absolute_url(item.get("cover"), BASE_URL)
        return MusicItem(
            id=quote_id(download_url),
            title=item.get("name") or "未知歌曲",
            artist=item.get("artist") or "未知歌手",
            album=item.get("album") or None,
            cover=cover_url,
            provider=self.name,
        )

    def _normalize_id_to_url(self, song_id: str) -> str:
        decoded = unquote_repeated(song_id)
        if is_http_url(decoded):
            return decoded
        return absolute_url(decoded, BASE_URL) or ""

    def _resolve_final_url(self, url: str) -> str:
        if not url.startswith(BASE_URL):
            return self._http.head_final_url(
                url,
                headers={"user-agent": SEARCH_HEADERS["user-agent"]},
                timeout=REQUEST_TIMEOUT,
            )

        last_error: Exception | None = None
        for attempt in range(2):
            try:
                self._bootstrap_session(force=attempt > 0)
                final_url = self._http.head_final_url(
                    url,
                    headers={"user-agent": SEARCH_HEADERS["user-agent"]},
                    timeout=REQUEST_TIMEOUT,
                )
                if final_url.startswith(BASE_URL):
                    raise ValueError("JBSou play session was not accepted")
                return final_url
            except (ProviderNetworkError, RequestException, ValueError) as error:
                last_error = error
                LOGGER.warning("Jianbin play url resolve attempt failed", exc_info=True)
        if last_error:
            raise last_error
        raise ValueError("Failed to resolve JBSou play url")

    def _bootstrap_session(self, *, force: bool = False) -> None:
        if force:
            self._http = ProviderHttpClient()
        initialize_session(self._http._session, PAGE_HEADERS, REQUEST_TIMEOUT)
