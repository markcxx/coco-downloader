# coding: utf-8
import socket
from typing import Any
from urllib.parse import urlparse

import requests
from requests import exceptions as request_errors
from urllib3.exceptions import NameResolutionError

from app.services.errors import (
    NETWORK_ERROR_CONNECTION,
    NETWORK_ERROR_HTTP_STATUS,
    NETWORK_ERROR_PROXY,
    NETWORK_ERROR_REDIRECT,
    NETWORK_ERROR_SSL,
    NETWORK_ERROR_TIMEOUT,
    NETWORK_ERROR_UNKNOWN,
    ProviderNetworkError,
)

DEFAULT_TIMEOUT = 15


def _is_dns_error(error: BaseException) -> bool:
    pending = [error]
    seen = set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, (socket.gaierror, NameResolutionError)):
            return True
        nested = [current.__cause__, current.__context__, getattr(current, "reason", None), *current.args]
        pending.extend(value for value in nested if isinstance(value, BaseException))
    return False


class ProviderHttpClient:
    def __init__(self) -> None:
        self._session = requests.Session()
        # Match Web's Axios transport: honor user-configured HTTP(S)_PROXY and
        # NO_PROXY rather than silently bypassing their network configuration.
        self._session.trust_env = True

    def get_json(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT,
        verify: bool = True,
    ) -> Any:
        response = self._request(
            "get",
            url,
            headers=headers,
            params=params,
            timeout=timeout,
            verify=verify,
        )
        return response.json()

    def get_text(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT,
        verify: bool = True,
    ) -> str:
        response = self._request(
            "get",
            url,
            headers=headers,
            params=params,
            timeout=timeout,
            verify=verify,
        )
        return response.text

    def post_json(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        data: dict[str, Any] | None = None,
        json_data: dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> Any:
        response = self._request(
            "post",
            url,
            headers=headers,
            data=data,
            json=json_data,
            timeout=timeout,
        )
        return response.json()

    def post_text(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        data: dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> str:
        response = self._request("post", url, headers=headers, data=data, timeout=timeout)
        return response.text

    def get_response(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT,
        verify: bool = True,
        stream: bool = False,
        allow_redirects: bool = True,
    ) -> requests.Response:
        return self._request(
            "get",
            url,
            headers=headers,
            params=params,
            timeout=timeout,
            verify=verify,
            stream=stream,
            allow_redirects=allow_redirects,
        )

    def post_response(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        data: dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> requests.Response:
        return self._request("post", url, headers=headers, data=data, timeout=timeout)

    def head_final_url(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> str:
        response = self._request(
            "head",
            url,
            headers=headers,
            params=params,
            timeout=timeout,
            allow_redirects=True,
        )
        return response.url

    def _request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        try:
            response = self._session.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except request_errors.Timeout as error:
            raise ProviderNetworkError(NETWORK_ERROR_TIMEOUT, "网络请求超时，请稍后重试") from error
        except request_errors.ProxyError as error:
            raise ProviderNetworkError(NETWORK_ERROR_PROXY, "代理连接失败，请检查代理设置") from error
        except request_errors.SSLError as error:
            raise ProviderNetworkError(NETWORK_ERROR_SSL, "安全连接失败，请稍后重试") from error
        except request_errors.ConnectionError as error:
            if _is_dns_error(error):
                host = urlparse(url).hostname or "音乐服务"
                raise ProviderNetworkError(
                    NETWORK_ERROR_CONNECTION, f"无法解析音乐服务域名 {host}（DNS 解析失败）"
                ) from error
            raise ProviderNetworkError(NETWORK_ERROR_CONNECTION, "网络连接失败，请检查网络后重试") from error
        except request_errors.TooManyRedirects as error:
            raise ProviderNetworkError(NETWORK_ERROR_REDIRECT, "请求重定向次数过多，请稍后重试") from error
        except request_errors.HTTPError as error:
            raise self._http_status_error(error) from error
        except request_errors.RequestException as error:
            raise ProviderNetworkError(NETWORK_ERROR_UNKNOWN, "网络请求失败，请稍后重试") from error

    def _http_status_error(self, error: request_errors.HTTPError) -> ProviderNetworkError:
        response = error.response
        status_code = response.status_code if response is not None else 0
        if status_code == 403:
            message = "服务拒绝访问，请稍后重试"
        elif status_code == 404:
            message = "请求的资源不存在"
        elif status_code == 429:
            message = "请求过于频繁，请稍后重试"
        elif status_code >= 500:
            message = "音乐服务暂时不可用，请稍后重试"
        else:
            message = f"音乐服务返回异常状态：{status_code}"
        return ProviderNetworkError(NETWORK_ERROR_HTTP_STATUS, message)
