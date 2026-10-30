"""Channel-only search, download resolution and optional lyric fetching."""

from dataclasses import replace
from urllib.parse import parse_qs, unquote, urlparse

from app.models.music import MusicItem, LyricData, PlayInfo
from app.services.channels import get_channel, get_platform
from app.services.providers import canonical_provider_id, get_provider
from app.services.lyrics import NeteaseLyrics, QQLyrics, KugouLyrics, KuwoLyrics


class MusicAccessError(ValueError):
    code = "authorization_required"


def check_access(extra: dict, usage: str) -> None:
    access = extra.get("access")
    if isinstance(access, dict) and access.get(usage) is False:
        raise MusicAccessError(access.get("message") or "此歌曲需要平台授权")


def search_music(
    channel: str, query: str, limit: int = 20, offset: int = 0
) -> list[MusicItem]:
    channel = canonical_provider_id(channel)
    get_channel(channel)
    query = query.strip()
    if not query:
        return []
    limit, offset = min(50, max(1, int(limit))), max(0, int(offset))
    defaults = {}
    if channel == "netease":
        defaults = {
            "selectedLevel": "lossless",
            "qualityOptions": [
                {"value": "standard", "label": "标准音质", "format": "mp3"},
                {"value": "exhigh", "label": "极高音质", "format": "mp3"},
                {"value": "lossless", "label": "无损音质", "format": "flac/mp3"},
            ],
        }
    return [
        replace(i, extra={**defaults, **i.extra, "title": i.title, "artist": i.artist})
        for i in get_provider(channel).search(query, limit, offset)
    ][:limit]


def resolve_channel_download_info(
    channel: str, song_id: str, extra: dict | None = None
) -> PlayInfo:
    channel = canonical_provider_id(channel)
    get_channel(channel)
    if not isinstance(song_id, str) or not song_id.strip():
        raise ValueError("缺少歌曲 ID")
    context = dict(extra or {})
    if context.get("officialTrack"):
        raise ValueError("旧搜索结果已失效，请重新进行渠道搜索")
    check_access(context, "download")
    return get_provider(channel).get_play_info(song_id, context)


def resolve_item(item: MusicItem, overrides: dict | None = None) -> PlayInfo:
    item = replace(item, provider=canonical_provider_id(item.provider))
    check_access(item.extra, "download")
    allowed = {
        "level",
        "selectedLevel",
        "selectedParser",
        "selectedFormat",
        "selectedQuality",
        "selectedOption",
    }
    extra = {
        **item.extra,
        **{k: v for k, v in (overrides or {}).items() if k in allowed},
        "usage": "download",
    }
    if item.cover:
        extra["cover"] = item.cover
    info = resolve_channel_download_info(item.provider, item.id, extra)
    if info.delivery != "audio":
        raise ValueError("该结果需要前往源站保存，不支持自动下载")
    url = urlparse(info.url)
    if (
        url.scheme not in {"http", "https"}
        or not url.hostname
        or url.username
        or url.password
    ):
        raise ValueError("渠道返回了无效的音频地址")
    return info


def resolve_source_page(item: MusicItem) -> str:
    if get_channel(item.provider).delivery != "source-page":
        raise ValueError("该渠道不是源站入口")
    info = resolve_channel_download_info(
        item.provider, item.id, {**item.extra, "usage": "download"}
    )
    if info.delivery != "source-page" or urlparse(info.url).scheme not in {
        "http",
        "https",
    }:
        raise ValueError("源站未返回可用的下载入口")
    return info.url


def get_item_lyric(item: MusicItem) -> LyricData:
    channel = canonical_provider_id(item.provider)
    provider = get_provider(channel)
    platform = get_platform(channel).id
    song_id = (
        item.id if channel.startswith("at38-") or channel == "gdstudio-netease" else ""
    )
    if channel.startswith("jianbin-"):
        url = urlparse(unquote(unquote(item.id)))
        params = parse_qs(url.query)
        expected = {"netease": "wy", "qq": "qq", "kugou": "kg", "kuwo": "kw"}.get(
            platform
        )
        if url.hostname == "www.jbsou.cn" and params.get("type") == [expected]:
            song_id = params.get("id", [""])[0]
    if song_id:
        try:
            lyric = {
                "netease": NeteaseLyrics,
                "qq": QQLyrics,
                "kugou": KugouLyrics,
                "kuwo": KuwoLyrics,
            }[platform]().get_lyric(song_id, item.extra)
            if lyric.lines or lyric.lrc:
                return replace(lyric, songid=item.id, provider=channel, source="lyric")
        except Exception:
            pass
    try:
        return provider.get_lyric(item.id, item.extra)
    except NotImplementedError:
        return LyricData(item.id, channel, [], "")
