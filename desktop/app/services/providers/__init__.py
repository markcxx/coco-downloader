from .netease_official import NeteaseOfficialProvider
from .qq import QQProvider
from .kugou import KugouProvider
from .bodian import BodianProvider
# coding: utf-8
from .base import MusicProvider
from .at38 import At38Provider
from .gequhai import GequhaiProvider
from .gequke import GequkeProvider
from .gdstudio import GDStudioProvider
from .jianbin import JianbinProvider
from .livepoo import LivepooProvider
from .qqmp3 import QQMp3Provider
from app.services.channels import MUSIC_PLATFORMS

PROVIDERS: dict[str, MusicProvider] = {
    "netease": NeteaseOfficialProvider(),
    "qq": QQProvider(),
    "kugou": KugouProvider(),
    "bodian": BodianProvider(),
    "gdstudio-netease": GDStudioProvider(),
    "at38-netease": At38Provider("at38-netease", "wy"),
    "at38-qq": At38Provider("at38-qq", "qq"),
    "gequhai": GequhaiProvider(),
    "gequke": GequkeProvider(),
    "qqmp3": QQMp3Provider(),
    "livepoo": LivepooProvider(),
    "jianbin-netease": JianbinProvider("jianbin-netease", "netease"),
    "jianbin-qq": JianbinProvider("jianbin-qq", "qq"),
    "jianbin-kugou": JianbinProvider("jianbin-kugou", "kugou"),
    "jianbin-kuwo": JianbinProvider("jianbin-kuwo", "kuwo"),
}

# Keep provider IDs stable for saved settings; group labels by music service.
PROVIDER_GROUPS = {p.name: [(c.name, c.id) for c in p.channels] for p in MUSIC_PLATFORMS}
PROVIDER_DISPLAY_NAMES = {
    f"{platform} / {label}": provider_id
    for platform, channels in PROVIDER_GROUPS.items() for label, provider_id in channels
}
# Older labels are still accepted when loading saved settings.
LEGACY_PROVIDER_NAMES = {
    "云音乐": "netease", "QQ音乐（VKeys）": "qq", "酷狗音乐（90svip）": "kugou",
    "酷狗音乐 / 90svip（本地网络）": "kugou", "波点": "bodian",
    "歌曲海": "gequhai", "QQMP3": "qqmp3", "力音": "livepoo",
    "煎饼-1": "jianbin-netease", "煎饼-2": "jianbin-qq",
    "煎饼-3": "jianbin-kugou", "煎饼-4": "jianbin-kuwo",
}


def canonical_provider_id(name: str = "gdstudio-netease") -> str:
    provider_key = PROVIDER_DISPLAY_NAMES.get(name, LEGACY_PROVIDER_NAMES.get(name, name))
    if provider_key not in PROVIDERS:
        raise ValueError(f"不支持的音源：{name}")
    return provider_key


def get_provider(name: str = "gdstudio-netease") -> MusicProvider:
    return PROVIDERS[canonical_provider_id(name)]


def get_all_providers() -> list[MusicProvider]:
    return list(PROVIDERS.values())


__all__ = [
    "MusicProvider",
    "PROVIDER_DISPLAY_NAMES",
    "PROVIDER_GROUPS",
    "get_all_providers",
    "get_provider",
]
