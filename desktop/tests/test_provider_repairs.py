from app.services.errors import ProviderNetworkError
from app.services.providers.qq import QQProvider
from app.services.providers.bodian import BodianProvider
from app.models.music import PlayInfo
import unittest
from unittest.mock import Mock, patch

from app.services.providers.jianbin_session import initialize_session
from app.services.providers.qqmp3 import QQMp3Provider


class ProviderRepairTests(unittest.TestCase):
    def test_qqmp3_expired_audio_uses_backup(self):
        provider = QQMp3Provider()
        provider._http = Mock()
        provider._http.get_json.return_value = {
            "code": 200,
            "data": {"url": "https://example.com/a.mp3"},
        }
        with patch(
            "app.services.providers.qqmp3.validate_audio_url",
            side_effect=[ValueError("HTTP 410"), "https://example.com/valid.mp3"],
        ):
            self.assertEqual(
                provider.get_play_info("50").url, "https://example.com/valid.mp3"
            )
        self.assertEqual(provider._http.get_json.call_count, 2)
        self.assertIn("bb.qqmp3.vip", provider._http.get_json.call_args.args[0])

    def test_jianbin_initializes_only_the_published_visitor_cookie(self):
        import requests

        session = requests.Session()
        response = Mock()
        response.text = '<script>document.cookie="mk_visit=123-abc;path=/;max-age=43200";location.replace("/");</script>'
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        session.get = Mock(return_value=response)
        initialize_session(session, {}, 10)
        self.assertEqual(session.cookies.get("mk_visit"), "123-abc")
        self.assertEqual(session.get.call_count, 2)

    def test_qq_preview_uses_mp3_without_lowering_download_quality(self):
        provider = QQProvider()
        with patch.object(
            provider,
            "_get_by_vkeys",
            return_value=PlayInfo("https://example.com/a.mp3", "mp3"),
        ) as resolve:
            provider.get_play_info("mid", {"usage": "playback"})
            resolve.assert_called_once_with("mid", (8, 6))
            resolve.reset_mock()
            provider.get_play_info("mid", {})
            resolve.assert_called_once_with("mid", None)

    def test_bodian_preserves_original_channel_error(self):
        provider = BodianProvider()
        with patch.object(
            provider,
            "_get_by_tianbao",
            side_effect=ProviderNetworkError("ssl", "SSL failed"),
        ):
            with self.assertRaises(ProviderNetworkError):
                provider.get_play_info("1")


if __name__ == "__main__":
    unittest.main()
