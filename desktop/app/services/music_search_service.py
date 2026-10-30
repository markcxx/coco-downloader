from app.models.music import MusicItem
from .music_service import search_music as _search


def search_music(keyword: str, platform: str, limit: int = 20, offset: int = 0) -> list[MusicItem]:
    return _search(platform, keyword, limit, offset)
