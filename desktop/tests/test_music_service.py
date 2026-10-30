import re
import unittest
from pathlib import Path
from unittest.mock import patch
from app.models.music import MusicItem, PlayInfo, LyricData
from app.services import music_service as api
from app.services.channels import MUSIC_PLATFORMS, supports_paging
from app.services.providers import PROVIDERS, get_provider


def song(**extra):
    return MusicItem("123", "歌曲", "歌手", "gdstudio-netease", extra=extra)


class MusicServiceTests(unittest.TestCase):
    def test_catalog_matches_web_and_original_channels_are_retained(self):
        web = (
            Path(__file__).resolve().parents[2] / "src/lib/music-channels.ts"
        ).read_text()
        web_ids = set(re.findall(r"\bid: '([^']+)'", web))
        self.assertEqual(web_ids, {p.id for p in MUSIC_PLATFORMS} | set(PROVIDERS))
        self.assertEqual(len(PROVIDERS), 15)
        for key in ("migu", "missing"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                get_provider(key)
        for key in ("netease", "qq", "kugou", "bodian"):
            self.assertEqual(get_provider(key).name, key)
        self.assertTrue(supports_paging("at38-qq"))

    def test_no_added_search_source_mode_or_desktop_playback_api(self):
        self.assertFalse(hasattr(api, "search_by_source"))
        with self.assertRaises(TypeError):
            api.search_music("gdstudio-netease", "test", source="official")
        with self.assertRaises(TypeError):
            api.resolve_item(song(), usage="playback")

    @patch.object(api, "get_provider")
    def test_search_pagination_and_context(self, get):
        get.return_value.search.return_value = [song() for _ in range(10)]
        result = api.search_music("gdstudio-netease", " test ", 5, -1)
        get.return_value.search.assert_called_once_with("test", 5, 0)
        self.assertEqual(len(result), 5)
        self.assertEqual(result[0].extra["title"], "歌曲")

    @patch.object(api, "get_provider")
    def test_original_meting_retains_quality_selection(self, get):
        get.return_value.search.return_value = [
            MusicItem("123", "歌", "歌手", "netease")
        ]
        item = api.search_music("netease", "test")[0]
        self.assertEqual(item.extra["selectedLevel"], "lossless")
        self.assertEqual(
            [option["value"] for option in item.extra["qualityOptions"]],
            ["standard", "exhigh", "lossless"],
        )

    @patch.object(api, "get_provider")
    def test_download_only_with_unmodified_channel_id(self, get):
        get.return_value.get_play_info.return_value = PlayInfo(
            "https://audio.example/a.flac", "flac"
        )
        api.resolve_item(song(), {"selectedLevel": "standard"})
        args = get.return_value.get_play_info.call_args.args
        self.assertEqual(args[0], "123")
        self.assertEqual(args[1]["usage"], "download")
        self.assertEqual(args[1]["selectedLevel"], "standard")
        get.return_value.search.assert_not_called()

    @patch.object(api, "get_provider")
    def test_restriction_is_terminal_and_cannot_be_erased(self, get):
        with self.assertRaises(api.MusicAccessError):
            api.resolve_item(song(access={"download": False}), {"access": {}})
        get.assert_not_called()

    @patch.object(api, "get_provider")
    def test_stale_official_search_results_cannot_resolve(self, get):
        with self.assertRaises(ValueError):
            api.resolve_item(song(officialTrack={"id": "123"}))
        get.assert_not_called()

    @patch.object(api, "get_provider")
    def test_reject_invalid_audio_urls_and_source_pages(self, get):
        for info in (
            PlayInfo("file:///tmp/a", "mp3"),
            PlayInfo("https://a:b@audio.example/a", "mp3"),
            PlayInfo("https://example.com", "", delivery="source-page"),
        ):
            with self.subTest(info=info), self.assertRaises(ValueError):
                get.return_value.get_play_info.return_value = info
                api.resolve_item(song())

    @patch.object(api, "get_provider")
    def test_source_page_uses_channel_native_id(self, get):
        get.return_value.get_play_info.return_value = PlayInfo(
            "https://www.livepoo.cn/music/info.html?id=MUSIC_123",
            "",
            delivery="source-page",
        )
        item = MusicItem("123", "歌", "歌手", "livepoo")
        self.assertIn("MUSIC_123", api.resolve_source_page(item))
        get.return_value.search.assert_not_called()

    @patch.object(api, "NeteaseLyrics")
    @patch.object(api, "get_provider")
    def test_lyrics_can_use_known_id_without_searching(self, get, lyrics):
        lyrics.return_value.get_lyric.return_value = LyricData(
            "123", "netease", [], "[00:01]test"
        )
        self.assertEqual(api.get_item_lyric(song()).lrc, "[00:01]test")
        get.return_value.search.assert_not_called()

    @patch.object(api, "get_provider")
    def test_channel_lyric_does_not_search_official_metadata(self, get):
        get.return_value.get_lyric.return_value = LyricData(
            "123", "gequke", [], "embedded"
        )
        item = MusicItem("123", "歌", "歌手", "gequke")
        self.assertEqual(api.get_item_lyric(item).lrc, "embedded")
        get.return_value.search.assert_not_called()
