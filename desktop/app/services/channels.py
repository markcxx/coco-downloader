"""Channel capabilities shared by desktop services and controls.

IDs and platform grouping mirror src/lib/music-channels.ts. Browser-only CORS
limitations do not apply to native downloads; source-page delivery still does.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Channel:
    id: str
    name: str
    delivery: str = "audio"
    paged: bool = False

    @property
    def batch_download(self) -> bool:
        return self.delivery == "audio"


@dataclass(frozen=True)
class Platform:
    id: str
    name: str
    channels: tuple[Channel, ...]


MUSIC_PLATFORMS = (
    Platform(
        "netease",
        "网易云音乐",
        (
            Channel("netease", "Meting", paged=True),
            Channel("gdstudio-netease", "GD音乐台", paged=True),
            Channel("at38-netease", "51ape", paged=True),
            Channel("jianbin-netease", "煎饼"),
        ),
    ),
    Platform(
        "qq",
        "QQ音乐",
        (
            Channel("qq", "VKeys", paged=True),
            Channel("at38-qq", "51ape", paged=True),
            Channel("jianbin-qq", "煎饼"),
        ),
    ),
    Platform(
        "kugou",
        "酷狗音乐",
        (
            Channel("jianbin-kugou", "煎饼"),
            Channel("kugou", "90svip", paged=True),
        ),
    ),
    Platform(
        "kuwo",
        "酷我音乐",
        (
            Channel("bodian", "波点 · 天宝", paged=True),
            Channel("qqmp3", "米兔（QQMP3）"),
            Channel("jianbin-kuwo", "煎饼"),
            Channel("gequhai", "歌曲海"),
            Channel("gequke", "歌曲客", paged=True),
            Channel("livepoo", "力音 · 网盘下载", delivery="source-page", paged=True),
        ),
    ),
    Platform("migu", "咪咕音乐", ()),
)


def get_channel(channel_id: str) -> Channel:
    for platform in MUSIC_PLATFORMS:
        for channel in platform.channels:
            if channel.id == channel_id:
                return channel
    raise ValueError("该渠道已下架或不存在，请重新选择音乐平台与渠道")


def get_platform(channel_id: str) -> Platform:
    get_channel(channel_id)  # Reject unavailable IDs rather than silently defaulting.
    return next(
        p for p in MUSIC_PLATFORMS if any(c.id == channel_id for c in p.channels)
    )


def supports_paging(channel_id: str) -> bool:
    return get_channel(channel_id).paged
