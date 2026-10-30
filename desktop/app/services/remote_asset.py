# coding: utf-8
from urllib.parse import urlparse

import requests
from app.services.providers.jianbin_session import initialize_session

JBSOU_BASE_URL = "https://www.jbsou.cn/"


def get_remote_asset(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: int = 15,
) -> requests.Response:
    if not _is_jbsou_asset(url):
        return requests.get(url, headers=headers, timeout=timeout)

    last_error: requests.RequestException | None = None
    for _attempt in range(2):
        session = requests.Session()
        session.trust_env = False
        try:
            initialize_session(session, headers, timeout)
            response = session.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()
            return response
        except requests.RequestException as error:
            last_error = error
        finally:
            session.close()
    if last_error:
        raise last_error
    raise requests.RequestException("Failed to load JBSou asset")


def _is_jbsou_asset(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except (TypeError, ValueError):
        return False
    if parsed.scheme != "https" or parsed.hostname != "www.jbsou.cn" or parsed.path != "/api.php":
        return False
    return any(key == "get" and value == "pic" for key, value in _query_items(parsed.query))


def _query_items(query: str) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    for part in query.split("&"):
        key, separator, value = part.partition("=")
        if separator:
            items.append((key, value))
    return items
