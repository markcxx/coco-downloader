# coding: utf-8
import re
import time
import uuid
from threading import Lock
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

import requests
from PyQt5.QtCore import QObject, QThread, pyqtSignal

from app.common.config import DownloadFilenameRule, cfg
from app.common.signal_bus import signalBus
from app.models.music import MusicItem, PlayInfo
from app.services.music_service import resolve_item
from app.services.audio import audio_extension, checked_audio_extension
from app.services.thread_lifecycle import retain_thread

DOWNLOAD_TIMEOUT = 30
DOWNLOAD_CHUNK_SIZE = 1024 * 256
MAX_CONCURRENT_DOWNLOADS = 3
PROGRESS_INTERVAL = 0.2
_FILE_LOCK = Lock()
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}


class DownloadTaskStatus(Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    FINISHED = "finished"
    FAILED = "failed"


@dataclass
class DownloadProgressInfo:
    current_size: int = 0
    total_size: int = 0
    speed: int = 0
    percent: int = 0
    remain_seconds: int = 0

    @property
    def current_size_text(self) -> str:
        return _format_size(self.current_size)

    @property
    def total_size_text(self) -> str:
        return _format_size(self.total_size) if self.total_size > 0 else "--"

    @property
    def speed_text(self) -> str:
        return f"{_format_size(self.speed)}/s"

    @property
    def remain_time_text(self) -> str:
        if self.total_size <= 0 or self.speed <= 0:
            return "--:--:--"
        return _format_duration(self.remain_seconds)


@dataclass
class DownloadTaskInfo:
    id: str
    title: str
    artist: str
    provider: str
    cover: str
    file_name: str
    folder: str
    status: DownloadTaskStatus
    created_at: float
    item: MusicItem
    extra_overrides: dict[str, Any]
    progress: DownloadProgressInfo
    is_batch: bool = False
    size_text: str = "--"
    error_message: str = ""
    file_path: str = ""


def _safe_filename(value: str) -> str:
    filename = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "_", value).strip().rstrip(". ")
    filename = filename.encode("utf-8")[:180].decode("utf-8", errors="ignore")
    if re.fullmatch(r"(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", filename, re.I):
        filename = "_" + filename
    return filename or "music"


def _format_size(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size / 1024 / 1024:.2f} MB"
    if size >= 1024:
        return f"{size / 1024:.2f} KB"
    return f"{size} B"


def _format_duration(seconds: int) -> str:
    seconds = max(0, int(seconds))
    hours = seconds // 3600
    minutes = seconds % 3600 // 60
    remain_seconds = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{remain_seconds:02d}"


class DownloadThread(QThread):
    """Resolve and download a music file without blocking the UI."""

    progressChanged = pyqtSignal(object)
    downloadFinished = pyqtSignal(str)
    downloadFailed = pyqtSignal(str)

    def __init__(
        self,
        item: MusicItem,
        task_info: DownloadTaskInfo,
        extra_overrides: dict[str, Any] | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self.item = item
        self.task_info = task_info
        self.extra_overrides = extra_overrides or {}
        self.is_canceled = False

    def cancel(self) -> None:
        self.is_canceled = True

    def run(self) -> None:
        try:
            play_info = resolve_item(self.item, self.extra_overrides)
            if self.is_canceled:
                return
            file_path = self._download(play_info)
            if self.is_canceled:
                return
            self.task_info.status = DownloadTaskStatus.FINISHED
            self.task_info.file_path = str(file_path)
            self.task_info.file_name = file_path.name
            self.task_info.folder = str(file_path.parent)
            self.task_info.size_text = _format_size(file_path.stat().st_size)
            self.downloadFinished.emit(str(file_path))
        except Exception as error:
            if self.is_canceled:
                return
            self.task_info.status = DownloadTaskStatus.FAILED
            self.task_info.error_message = str(error) or "下载失败"
            self.downloadFailed.emit(str(error) or "下载失败")

    def _download(self, play_info: PlayInfo) -> Path:
        download_dir = Path(cfg.get(cfg.downloadFolder))
        download_dir.mkdir(parents=True, exist_ok=True)
        temp_path = download_dir / f".coco-{uuid.uuid4().hex}.part"
        try:
            with requests.get(
                play_info.url, headers={**REQUEST_HEADERS, **play_info.headers},
                timeout=DOWNLOAD_TIMEOUT, stream=True,
            ) as response:
                response.raise_for_status()
                total_size = int(response.headers.get("content-length") or 0)
                written_size = last_emit_size = 0
                last_emit_time = time.monotonic()
                chunks = response.iter_content(chunk_size=DOWNLOAD_CHUNK_SIZE)
                first_chunk = next(chunks, b"")
                suffix = checked_audio_extension(first_chunk, response.headers.get("content-type", ""),
                                                 play_info.type, play_info.url)
                with temp_path.open("wb") as file:
                    if self.is_canceled:
                        raise InterruptedError("Download canceled")
                    file.write(first_chunk)
                    written_size += len(first_chunk)
                    for chunk in chunks:
                        if self.is_canceled:
                            raise InterruptedError("Download canceled")
                        if chunk:
                            file.write(chunk)
                            written_size += len(chunk)
                            now = time.monotonic()
                            if now - last_emit_time >= PROGRESS_INTERVAL:
                                self._emit_progress(written_size, total_size, last_emit_size, last_emit_time)
                                last_emit_time, last_emit_size = now, written_size
                if self.is_canceled:
                    raise InterruptedError("Download canceled")
                if (total_size and not response.headers.get("content-encoding")
                        and written_size != total_size):
                    raise ValueError("音频下载不完整，请重试")
                self._emit_progress(written_size, total_size, last_emit_size, last_emit_time)
            # Serialize naming + promotion so simultaneous downloads of the same
            # song never overwrite one another. No final file exists until done.
            with _FILE_LOCK:
                file_path = self._unique_file_path(download_dir, suffix)
                temp_path.replace(file_path)
            return file_path
        finally:
            temp_path.unlink(missing_ok=True)

    def _emit_progress(
        self,
        current_size: int,
        total_size: int,
        last_emit_size: int,
        last_emit_time: float,
    ) -> None:
        elapsed = max(0.001, time.monotonic() - last_emit_time)
        speed = max(0, int((current_size - last_emit_size) / elapsed))
        percent = int(current_size * 100 / total_size) if total_size > 0 else 0
        remain_seconds = int((total_size - current_size) / speed) if total_size > 0 and speed > 0 else 0
        self.task_info.progress = DownloadProgressInfo(
            current_size=current_size,
            total_size=total_size,
            speed=speed,
            percent=percent,
            remain_seconds=remain_seconds,
        )
        self.task_info.size_text = self.task_info.progress.current_size_text
        self.progressChanged.emit(self.task_info.progress)

    def _unique_file_path(self, download_dir: Path, suffix: str) -> Path:
        base_name = _safe_filename(self._filename_stem())
        file_path = download_dir / f"{base_name}.{suffix}"
        if not file_path.exists():
            return file_path

        for index in range(1, 1000):
            candidate = download_dir / f"{base_name} ({index}).{suffix}"
            if not candidate.exists():
                return candidate
        raise ValueError("同名文件过多，请更改文件名或下载目录")

    def _filename_stem(self) -> str:
        rule = cfg.get(cfg.downloadFilenameRule)
        if rule == DownloadFilenameRule.TITLE:
            return self.item.title
        if rule == DownloadFilenameRule.TITLE_ID:
            return f"{self.item.title} - {self.item.id}"
        if rule == DownloadFilenameRule.ARTIST_TITLE:
            return f"{self.item.artist} - {self.item.title}"
        return f"{self.item.title} - {self.item.artist}"

    def _suffix(self, play_info: PlayInfo, first_chunk: bytes) -> str:
        return checked_audio_extension(first_chunk, declared=play_info.type, url=play_info.url)

    def _suffix_from_header(self, first_chunk: bytes) -> str:
        return audio_extension(first_chunk)


class DownloadService(QObject):
    """Global download coordinator."""

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.pending_tasks: list[DownloadTaskInfo] = []
        self.threads: dict[DownloadThread, DownloadTaskInfo] = {}
        signalBus.downloadRequested.connect(self.start_download)
        signalBus.downloadRetryRequested.connect(self.retry_download)
        signalBus.downloadCancelRequested.connect(self.cancel_download)

    def start_download(self, item: MusicItem, extra_overrides: object = None) -> None:
        overrides = dict(extra_overrides) if isinstance(extra_overrides, dict) else {}
        is_batch = bool(overrides.pop("_batch", False))
        task_info = self._create_task_info(item, overrides, is_batch)
        self.pending_tasks.append(task_info)
        signalBus.downloadStarted.emit(f"{item.title} - {item.artist}", task_info)
        self._start_next_tasks()

    def retry_download(self, task_info: object) -> None:
        if not isinstance(task_info, DownloadTaskInfo):
            return
        self.start_download(task_info.item, task_info.extra_overrides)

    def cancel_download(self, task_info: object) -> None:
        if not isinstance(task_info, DownloadTaskInfo):
            return
        if self._remove_pending_task(task_info):
            self._start_next_tasks()
            return
        for thread, running_task in list(self.threads.items()):
            if running_task.id == task_info.id:
                thread.cancel()
                return

    def _start_next_tasks(self) -> None:
        while self.pending_tasks and len(self.threads) < MAX_CONCURRENT_DOWNLOADS:
            task_info = self.pending_tasks.pop(0)
            self._start_thread(task_info)

    def _start_thread(self, task_info: DownloadTaskInfo) -> None:
        task_info.status = DownloadTaskStatus.DOWNLOADING
        signalBus.downloadTaskUpdated.emit(task_info)
        thread = DownloadThread(task_info.item, task_info, task_info.extra_overrides, self)
        retain_thread(thread)
        self.threads[thread] = task_info
        thread.progressChanged.connect(
            lambda progress, download_thread=thread: self._on_progress(download_thread, progress)
        )
        thread.downloadFinished.connect(
            lambda file_path, download_thread=thread: self._on_finished(download_thread, file_path)
        )
        thread.downloadFailed.connect(
            lambda message, download_thread=thread: self._on_failed(download_thread, message)
        )
        thread.finished.connect(lambda *_: self._remove_thread(thread))
        thread.start()

    def _on_progress(self, thread: DownloadThread, progress: DownloadProgressInfo) -> None:
        task_info = self.threads.get(thread)
        if task_info is None or thread.is_canceled:
            return
        signalBus.downloadProgressChanged.emit(task_info, progress)

    def _on_finished(self, thread: DownloadThread, file_path: str) -> None:
        task_info = self.threads.get(thread)
        signalBus.downloadFinished.emit(file_path, task_info)

    def _on_failed(self, thread: DownloadThread, message: str) -> None:
        task_info = self.threads.get(thread)
        signalBus.downloadFailed.emit(message, task_info)

    def _remove_thread(self, thread: DownloadThread) -> None:
        self.threads.pop(thread, None)
        self._start_next_tasks()

    def _remove_pending_task(self, task_info: DownloadTaskInfo) -> bool:
        for pending_task in self.pending_tasks:
            if pending_task.id == task_info.id:
                self.pending_tasks.remove(pending_task)
                return True
        return False

    def _create_task_info(self, item: MusicItem, overrides: dict[str, Any], is_batch: bool) -> DownloadTaskInfo:
        folder = str(Path(cfg.get(cfg.downloadFolder)))
        return DownloadTaskInfo(
            id=uuid.uuid4().hex,
            title=item.title,
            artist=item.artist,
            provider=item.provider,
            cover=item.cover,
            file_name=_safe_filename(self._filename_stem(item)),
            folder=folder,
            status=DownloadTaskStatus.PENDING,
            created_at=time.time(),
            item=item,
            extra_overrides=overrides,
            progress=DownloadProgressInfo(),
            is_batch=is_batch,
        )

    def _filename_stem(self, item: MusicItem) -> str:
        rule = cfg.get(cfg.downloadFilenameRule)
        if rule == DownloadFilenameRule.TITLE:
            return item.title
        if rule == DownloadFilenameRule.TITLE_ID:
            return f"{item.title} - {item.id}"
        if rule == DownloadFilenameRule.ARTIST_TITLE:
            return f"{item.artist} - {item.title}"
        return f"{item.title} - {item.artist}"
