import unittest
from unittest.mock import patch

from app.models.music import LyricData
from app.services.providers import PROVIDER_GROUPS, get_provider
from app.services.providers.gdstudio import GDStudioProvider
from app.services.providers.gdstudio_signature import signature


class GDStudioTests(unittest.TestCase):
    def test_signature_vectors(self):
        for payload, expected in [
            ("66842", "8E8BC865"), ("十年 陈奕迅", "8386FF06"),
            ("a!*'()~", "74912DA4"), ("周杰伦" * 30, "FBD5A982"),
        ]:
            self.assertEqual(signature(payload, "1792674005"), expected)

    def test_channel_registration(self):
        self.assertIsInstance(get_provider("gdstudio-netease"), GDStudioProvider)
        self.assertIn(("GD音乐台", "gdstudio-netease"), PROVIDER_GROUPS["网易云音乐"])

    def test_search_crosses_page_and_preserves_url_id(self):
        provider = GDStudioProvider()
        def reply(params):
            base = (int(params["pages"]) - 1) * 50
            return [{"id": str(base + n + 1), "url_id": str(base + n + 1001), "source": "netease",
                     "name": "歌曲", "artist": ["歌手"], "extra_data": {"duration": 205}} for n in range(50)]
        with patch.object(provider, "_request", side_effect=reply) as request:
            songs = provider.search("歌曲", 20, 40)
        self.assertEqual(len(songs), 20)
        self.assertEqual([call.args[0]["pages"] for call in request.call_args_list], ["1", "2"])
        self.assertEqual((songs[0].id, songs[-1].id), ("41", "60"))
        self.assertEqual(songs[0].extra["urlId"], "1041")
        self.assertEqual(songs[0].duration, "3:25")
        self.assertNotIn("hires", [option["value"] for option in songs[0].extra["qualityOptions"]])

    def test_selected_quality_and_official_lyrics(self):
        provider = GDStudioProvider()
        with patch.object(provider, "_request", return_value={"url": "https://m801.music.126.net/test.flac", "br": 1000, "size": 123}) as request:
            info = provider.get_play_info("66842", {"urlId": "12345", "selectedLevel": "lossless", "level": "hires"})
            self.assertEqual(info.type, "flac")
            self.assertEqual(request.call_args.args[0], {"types": "url", "id": "12345", "br": "999"})
        lyric = LyricData("66842", "netease", [], "[00:00]歌词")
        with patch("app.services.providers.gdstudio.NeteaseLyrics.get_lyric", return_value=lyric) as official:
            result = provider.get_lyric("66842")
            official.assert_called_once_with("66842", None)
            self.assertEqual(result.provider, provider.name)
            self.assertEqual(result.lrc, lyric.lrc)
        with self.assertRaisesRegex(ValueError, "ID 无效"):
            provider.get_play_info("invalid")
        with patch.object(provider, "_request", return_value={"url": "", "size": 0}):
            with self.assertRaisesRegex(ValueError, "暂未提供"):
                provider.get_play_info("66842")


if __name__ == "__main__":
    unittest.main()
