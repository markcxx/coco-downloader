import os
import re
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
from PyQt5.QtCore import QCoreApplication, QEvent
from PyQt5.QtWidgets import QApplication

APP = QApplication.instance() or QApplication([])
TEST_DIR = tempfile.TemporaryDirectory()
with patch("PyQt5.QtCore.QStandardPaths.writableLocation", return_value=TEST_DIR.name):
    from app.services.download_service import DownloadService, DownloadThread, DownloadTaskStatus
    from app.common.config import cfg
from app.components.download_task_card import DownloadTaskCard
from app.components.search_card import SearchCard
from app.models.music import MusicItem, PlayInfo
from app.services.providers import PROVIDERS, get_provider
from app.services.thread_lifecycle import shutdown_threads
from app.view.download_interface import DownloadInterface


def pump_until(predicate, timeout=3):
    deadline = time.monotonic() + timeout
    while not predicate() and time.monotonic() < deadline:
        APP.processEvents()
        QCoreApplication.sendPostedEvents(None, QEvent.DeferredDelete)
        time.sleep(0.005)
    assert predicate(), "Qt worker did not finish in time"


class DesktopTests(unittest.TestCase):
    def tearDown(self):
        shutdown_threads()
        APP.processEvents()
        QCoreApplication.sendPostedEvents(None, QEvent.DeferredDelete)

    def test_provider_menu_matches_web(self):
        web = (Path(__file__).resolve().parents[2] / "src/lib/music-channels.ts").read_text(encoding="utf-8")
        expected = [(key, name) for key, name in re.findall(r"\{ id: '([^']+)', name: '([^']+)'", web) if key in PROVIDERS]
        card = SearchCard()
        combo = card.platformComboBox
        actual = [(key, action.text()) for key, action in combo._actions.items()]
        self.assertEqual(actual, expected)
        self.assertEqual(set(PROVIDERS), {key for key, _ in expected})
        emitted = []
        card.searchRequested.connect(lambda query, provider: emitted.append(provider))
        for key, _ in expected:
            combo.setCurrentData(key)
            card._on_search("test")
            self.assertEqual(emitted[-1], key)
            self.assertEqual(get_provider(key).name, key)
        with self.assertRaises(ValueError):
            get_provider("音源2")
        card.deleteLater()


    def test_card_deleted_while_cover_is_loading(self):
        service = DownloadService()
        task = service._create_task_info(MusicItem("1", "test", "artist", "gdstudio-netease", cover="https://example.com/cover"), {}, False)
        def slow_cover(*args, **kwargs):
            time.sleep(0.15)
            return Mock(content=b"")
        with patch("app.components.download_task_card.get_remote_asset", side_effect=slow_cover):
            card = DownloadTaskCard(task)
            thread = card.coverThread
            self.assertIsNot(thread.parent(), card)
            card.deleteLater()
            QCoreApplication.sendPostedEvents(None, QEvent.DeferredDelete)
            thread.wait()
        service.deleteLater()

    def test_download_success_and_failure_with_slow_cover(self):
        service = DownloadService()
        view = DownloadInterface()
        view.show()
        item = MusicItem("1", "test", "artist", "gdstudio-netease", cover="https://example.com/cover")
        def slow_cover(*args, **kwargs):
            time.sleep(0.15)
            return Mock(content=b"")
        provider = Mock()
        provider.get_play_info.return_value = PlayInfo("https://example.com/audio", "mp3")
        response = Mock(headers={"content-length": "6"})
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.iter_content.return_value = iter([b"ID3abc"])
        old_folder = cfg.downloadFolder.value
        cfg.downloadFolder.value = TEST_DIR.name
        try:
            with patch("app.services.music_service.get_provider", return_value=provider), patch("app.services.download_service.requests.get", return_value=response), patch("app.components.download_task_card.get_remote_asset", side_effect=slow_cover):
                service.start_download(item)
                pump_until(lambda: not service.threads)
                self.assertEqual(view.finishedTaskView.count(), 1)
                task = view.finishedTaskView.cards[0].task
                self.assertEqual(Path(task.file_path).read_bytes(), b"ID3abc")
                provider.get_play_info.side_effect = ValueError("channel unavailable")
                service.start_download(item)
                pump_until(lambda: not service.threads)
                self.assertEqual(view.failedTaskView.count(), 1)
                self.assertEqual(view.failedTaskView.cards[0].task.status, DownloadTaskStatus.FAILED)
                shutdown_threads()
        finally:
            cfg.downloadFolder.value = old_folder
            view.deleteLater()
            service.deleteLater()

    def test_cancel_preserves_concurrency_slot_until_thread_finishes(self):
        service = DownloadService()
        def slow_run(thread):
            time.sleep(0.15)
        with patch.object(DownloadThread, "run", slow_run):
            for index in range(4):
                service.start_download(MusicItem(str(index), "test", "artist", "gdstudio-netease"))
            task = next(iter(service.threads.values()))
            service.cancel_download(task)
            self.assertEqual(len(service.threads), 3)
            self.assertEqual(len(service.pending_tasks), 1)
            pump_until(lambda: not service.threads and not service.pending_tasks)
        service.deleteLater()


if __name__ == "__main__":
    unittest.main()
