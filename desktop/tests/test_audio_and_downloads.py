import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PyQt5.QtWidgets import QApplication

from app.models.music import MusicItem, PlayInfo
from app.services.audio import audio_extension, checked_audio_extension
from app.services.download_service import DownloadThread, _safe_filename, cfg
from app.services.providers.utils import extract_ext, is_http_url, validate_audio_url

APP = QApplication.instance() or QApplication([])
FLAC = b"fLaC" + b"\0" * 20


def response(chunks, mime="audio/flac", size=None):
    value = Mock()
    value.__enter__ = Mock(return_value=value)
    value.__exit__ = Mock(return_value=False)
    value.headers = {"content-type": mime}
    if size is not None:
        value.headers["content-length"] = str(size)
    value.iter_content.side_effect = lambda **kwargs: iter(chunks)
    value.url = "https://audio.example/music"
    return value


class AudioTests(unittest.TestCase):
    def test_signatures_cover_web_formats(self):
        samples = [(b"ID3\x04\0\0\0\0\0\0", "mp3"), (FLAC, "flac"), (b"OggSxxxx", "ogg"),
                   (b"RIFF1234WAVE", "wav"), (b"1234ftypM4A ", "m4a"),
                   (b"\xff\xfb\x90\0", "mp3"), (b"\xff\xf1\0\0", "aac")]
        for data, extension in samples:
            with self.subTest(extension=extension):
                self.assertEqual(audio_extension(data), extension)

    def test_valid_signature_wins_over_json_mime_or_wrong_suffix(self):
        self.assertEqual(checked_audio_extension(FLAC, "application/json", "mp3"), "flac")

    def test_reject_error_payload_even_if_mime_claims_audio(self):
        for data in (b"", b"<html>denied</html>", b'{"code":403}', b"  [\"error\"]"):
            with self.subTest(data=data), self.assertRaises(ValueError):
                checked_audio_extension(data, "audio/mpeg", "mp3")

    def test_extension_does_not_use_hostname_or_allow_arbitrary_suffixes(self):
        self.assertEqual(extract_ext("https://music.example.com/path?file=music.flac"), "mp3")
        self.assertEqual(extract_ext("https://music.example.com/song.FLAC?key=1"), "flac")
        self.assertEqual(checked_audio_extension(b"binary", declared="../../exe"), "mp3")

    def test_url_validation(self):
        for value in ("httpx://audio.example", "https://", "https://user:pass@audio.example", None):
            self.assertFalse(is_http_url(value))
        self.assertTrue(is_http_url("https://audio.example/a"))

    def test_probe_reads_only_one_prefix_and_closes(self):
        client = Mock()
        upstream = response([FLAC, b"never read"], "application/json")
        client.get_response.return_value = upstream
        self.assertEqual(validate_audio_url(client, "https://audio.example/a"), upstream.url)
        self.assertEqual(client.get_response.call_args.kwargs["headers"]["Range"], "bytes=0-4095")
        upstream.close.assert_called_once()

    def test_probe_closes_on_html_failure(self):
        client = Mock()
        upstream = response([b"<html>denied"], "audio/mpeg")
        client.get_response.return_value = upstream
        with self.assertRaises(ValueError):
            validate_audio_url(client, upstream.url)
        upstream.close.assert_called_once()


class DownloadTests(unittest.TestCase):
    def test_filename_is_safe_for_windows_and_long_url_ids(self):
        self.assertEqual(_safe_filename("CON"), "_CON")
        self.assertNotIn("/", _safe_filename("title - https://example.com/a"))
        self.assertLessEqual(len(_safe_filename("歌" * 300).encode("utf-8")), 180)
        self.assertEqual(_safe_filename(".."), "music")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.thread = DownloadThread(MusicItem("123", "歌曲", "歌手", "gdstudio-netease"), SimpleNamespace())
        self.info = PlayInfo("https://audio.example/a.mp3", "mp3")
        original_get = cfg.get
        config = patch.object(cfg, "get", side_effect=lambda key: str(self.folder) if key is cfg.downloadFolder else original_get(key))
        config.start()
        self.addCleanup(config.stop)

    @patch("app.services.download_service.requests.get")
    def test_success_detects_real_extension_and_keeps_unique_names(self, get):
        get.side_effect = [response([FLAC], "application/json", len(FLAC)) for _ in range(2)]
        one = self.thread._download(self.info)
        two = self.thread._download(self.info)
        self.assertEqual(one.suffix, ".flac")
        self.assertNotEqual(one, two)
        self.assertEqual(one.read_bytes(), FLAC)
        self.assertEqual(two.read_bytes(), FLAC)
        self.assertFalse(list(self.folder.glob("*.part")))

    @patch("app.services.download_service.requests.get")
    def test_stream_failure_removes_partial_file_and_never_creates_final(self, get):
        def chunks():
            yield FLAC
            raise OSError("connection lost")
        upstream = response([])
        upstream.iter_content.side_effect = lambda **kwargs: chunks()
        get.return_value = upstream
        with self.assertRaises(OSError):
            self.thread._download(self.info)
        self.assertEqual(list(self.folder.iterdir()), [])

    @patch("app.services.download_service.requests.get")
    def test_cancel_removes_partial_file(self, get):
        def chunks():
            yield FLAC
            self.thread.cancel()
            yield b"rest"
        upstream = response([])
        upstream.iter_content.side_effect = lambda **kwargs: chunks()
        get.return_value = upstream
        with self.assertRaises(InterruptedError):
            self.thread._download(self.info)
        self.assertEqual(list(self.folder.iterdir()), [])

    @patch("app.services.download_service.requests.get")
    def test_truncated_response_is_not_promoted(self, get):
        get.return_value = response([FLAC], size=len(FLAC) + 10)
        with self.assertRaisesRegex(ValueError, "不完整"):
            self.thread._download(self.info)
        self.assertEqual(list(self.folder.iterdir()), [])

    @patch("app.services.download_service.requests.get")
    def test_error_page_does_not_create_files(self, get):
        get.return_value = response([b'<html>403</html>'], "audio/mpeg")
        with self.assertRaises(ValueError):
            self.thread._download(self.info)
        self.assertEqual(list(self.folder.iterdir()), [])

    @patch("app.services.download_service.resolve_item")
    def test_download_uses_shared_resolver_with_download_usage(self, resolve):
        resolve.side_effect = ValueError("restricted")
        errors = []
        self.thread.downloadFailed.connect(errors.append)
        self.thread.run()
        self.assertEqual(resolve.call_args.args[0], self.thread.item)
        self.assertEqual(errors, ["restricted"])


if __name__ == "__main__":
    unittest.main()
