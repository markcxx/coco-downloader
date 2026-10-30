# coding: utf-8
from pathlib import Path

import requests
from PyQt5.QtCore import QObject, Qt, QThread, QUrl, pyqtSignal
from PyQt5.QtGui import QColor, QDesktopServices, QPainter, QPainterPath, QPen, QPixmap
from PyQt5.QtWidgets import QHBoxLayout, QLabel, QVBoxLayout

from qfluentwidgets import (
    BodyLabel,
    CaptionLabel,
    CardWidget,
    CheckBox,
    FluentIcon,
    IconWidget,
    ProgressBar,
    ToolButton,
    isDarkTheme,
    setFont,
    themeColor,
)

from app.services.download_service import DownloadTaskInfo, DownloadTaskStatus
from app.services.remote_asset import get_remote_asset
from app.services.thread_lifecycle import retain_thread

DEFAULT_COVER = ":/app/images/logo/CocoDownloader.png"
COVER_TIMEOUT = 10
COVER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}


class CoverLoadThread(QThread):
    """Load cover image bytes without blocking task list painting."""

    loaded = pyqtSignal(bytes)

    def __init__(self, cover_url: str, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.cover_url = cover_url

    def run(self) -> None:
        if not self.cover_url.startswith("http"):
            return
        try:
            response = get_remote_asset(self.cover_url, headers=COVER_HEADERS, timeout=COVER_TIMEOUT)
            response.raise_for_status()
            if not self.isInterruptionRequested():
                self.loaded.emit(response.content)
        except requests.RequestException:
            return


class CoverLabel(QLabel):
    """Rounded album cover used by download task cards."""

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setFixedSize(42, 42)
        self.setPixmap(self._rounded_pixmap(QPixmap(DEFAULT_COVER)))

    def setCover(self, pixmap: QPixmap) -> None:
        if pixmap.isNull():
            pixmap = QPixmap(DEFAULT_COVER)
        self.setPixmap(self._rounded_pixmap(pixmap))

    def _rounded_pixmap(self, pixmap: QPixmap) -> QPixmap:
        scaled_pixmap = pixmap.scaled(self.size(), Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation)
        target = QPixmap(self.size())
        target.fill(Qt.transparent)

        painter = QPainter(target)
        painter.setRenderHint(QPainter.Antialiasing)
        path = QPainterPath()
        path.addRoundedRect(0, 0, self.width(), self.height(), 4, 4)
        painter.setClipPath(path)
        painter.drawPixmap(0, 0, scaled_pixmap)
        painter.end()
        return target


class DownloadTaskCard(CardWidget):
    """Download task card inspired by Fluent-M3U8 task cards."""

    checkedChanged = pyqtSignal(bool)
    deleted = pyqtSignal(object)
    retryRequested = pyqtSignal(object)

    def __init__(self, task: DownloadTaskInfo, parent=None) -> None:
        super().__init__(parent)
        self.task = task
        self.is_selection_mode = False
        self.coverThread: CoverLoadThread | None = None

        self.checkBox = CheckBox(self)
        self.coverLabel = CoverLabel(self)
        self.fileNameLabel = BodyLabel(task.file_name, self)
        self.statusIcon = IconWidget(FluentIcon.SYNC, self)
        self.statusLabel = CaptionLabel(self._status_text(), self)
        self.speedIcon = IconWidget(FluentIcon.SPEED_HIGH, self)
        self.speedLabel = CaptionLabel(task.progress.speed_text, self)
        self.remainTimeIcon = IconWidget(FluentIcon.STOP_WATCH, self)
        self.remainTimeLabel = CaptionLabel(task.progress.remain_time_text, self)
        self.sizeIcon = IconWidget(FluentIcon.BOOK_SHELF, self)
        self.sizeLabel = CaptionLabel(task.size_text, self)
        self.progressBar = ProgressBar(self)
        self.retryButton = ToolButton(FluentIcon.UPDATE, self)
        self.openFolderButton = ToolButton(FluentIcon.FOLDER, self)
        self.deleteButton = ToolButton(FluentIcon.DELETE, self)

        self.hBoxLayout = QHBoxLayout(self)
        self.vBoxLayout = QVBoxLayout()
        self.infoLayout = QHBoxLayout()

        self._init_widget()
        self.update_task(task)
        self._load_cover(task.cover)

    def setSelectionMode(self, enter: bool) -> None:
        self.is_selection_mode = enter
        self.checkBox.setVisible(enter)
        if not enter:
            self.checkBox.setChecked(False)
        self.update()

    def setChecked(self, checked: bool) -> None:
        self.checkBox.setChecked(checked)
        self.update()

    def isChecked(self) -> bool:
        return self.checkBox.isChecked()

    def update_task(self, task: DownloadTaskInfo) -> None:
        self.task = task
        self.fileNameLabel.setText(task.file_name)
        self.statusLabel.setText(self._status_text())
        self.speedLabel.setText(task.progress.speed_text)
        self.remainTimeLabel.setText(task.progress.remain_time_text)
        self.sizeLabel.setText(self._size_text())
        self.progressBar.setVisible(task.status in {DownloadTaskStatus.PENDING, DownloadTaskStatus.DOWNLOADING})
        self._update_progress_bar()
        self.retryButton.setVisible(task.status == DownloadTaskStatus.FAILED)
        self.openFolderButton.setEnabled(bool(task.file_path or task.folder))

        if task.status == DownloadTaskStatus.FINISHED:
            self.statusIcon.setIcon(FluentIcon.COMPLETED)
        elif task.status == DownloadTaskStatus.FAILED:
            self.statusIcon.setIcon(FluentIcon.INFO)
        elif task.status == DownloadTaskStatus.PENDING:
            self.statusIcon.setIcon(FluentIcon.DATE_TIME)
        else:
            self.statusIcon.setIcon(FluentIcon.SYNC)

    def mouseReleaseEvent(self, event) -> None:
        super().mouseReleaseEvent(event)
        if self.is_selection_mode:
            self.setChecked(not self.isChecked())
            return
        self.setSelectionMode(True)
        self.setChecked(True)

    def paintEvent(self, event) -> None:
        if not (self.is_selection_mode and self.isChecked()):
            return super().paintEvent(event)

        painter = QPainter(self)
        painter.setRenderHints(QPainter.Antialiasing)
        painter.setPen(QPen(themeColor(), 2))
        painter.setBrush(QColor(255, 255, 255, 15) if isDarkTheme() else QColor(0, 0, 0, 8))
        painter.drawRoundedRect(self.rect().adjusted(2, 2, -2, -2), self.borderRadius, self.borderRadius)

    def _init_widget(self) -> None:
        self.checkBox.setFixedSize(23, 23)
        self.checkBox.hide()
        self.statusIcon.setFixedSize(16, 16)
        self.speedIcon.setFixedSize(16, 16)
        self.remainTimeIcon.setFixedSize(16, 16)
        self.sizeIcon.setFixedSize(16, 16)
        self.retryButton.setFixedSize(36, 36)
        self.openFolderButton.setFixedSize(36, 36)
        self.deleteButton.setFixedSize(36, 36)
        self.progressBar.setFixedHeight(4)
        setFont(self.fileNameLabel, 18)
        self.fileNameLabel.setWordWrap(True)

        self.hBoxLayout.setContentsMargins(20, 11, 20, 11)
        self.hBoxLayout.addWidget(self.checkBox)
        self.hBoxLayout.addSpacing(5)
        self.hBoxLayout.addWidget(self.coverLabel)
        self.hBoxLayout.addSpacing(8)
        self.hBoxLayout.addLayout(self.vBoxLayout, 1)
        self.hBoxLayout.addSpacing(20)
        self.hBoxLayout.addWidget(self.retryButton)
        self.hBoxLayout.addWidget(self.openFolderButton)
        self.hBoxLayout.addWidget(self.deleteButton)

        self.vBoxLayout.setSpacing(5)
        self.vBoxLayout.setContentsMargins(0, 0, 0, 0)
        self.vBoxLayout.addWidget(self.fileNameLabel)
        self.vBoxLayout.addLayout(self.infoLayout)
        self.vBoxLayout.addWidget(self.progressBar)

        self.infoLayout.setContentsMargins(0, 0, 0, 0)
        self.infoLayout.setSpacing(3)
        self.infoLayout.addWidget(self.statusIcon)
        self.infoLayout.addWidget(self.statusLabel, 0, Qt.AlignLeft)
        self.infoLayout.addSpacing(8)
        self.infoLayout.addWidget(self.speedIcon)
        self.infoLayout.addWidget(self.speedLabel, 0, Qt.AlignLeft)
        self.infoLayout.addSpacing(8)
        self.infoLayout.addWidget(self.remainTimeIcon)
        self.infoLayout.addWidget(self.remainTimeLabel, 0, Qt.AlignLeft)
        self.infoLayout.addSpacing(8)
        self.infoLayout.addWidget(self.sizeIcon)
        self.infoLayout.addWidget(self.sizeLabel, 0, Qt.AlignLeft)
        self.infoLayout.addStretch(1)

        self.checkBox.stateChanged.connect(lambda *_: self.checkedChanged.emit(self.checkBox.isChecked()))
        self.deleteButton.clicked.connect(lambda: self.deleted.emit(self.task))
        self.retryButton.clicked.connect(lambda: self.retryRequested.emit(self.task))
        self.openFolderButton.clicked.connect(self._open_folder)

    def _open_folder(self) -> None:
        folder = Path(self.task.file_path).parent if self.task.file_path else Path(self.task.folder)
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(folder.absolute())))

    def _load_cover(self, cover: str) -> None:
        if not cover:
            self.coverLabel.setCover(QPixmap(DEFAULT_COVER))
            return
        if not cover.startswith("http"):
            self.coverLabel.setCover(QPixmap(cover))
            return

        thread = CoverLoadThread(cover)
        retain_thread(thread)
        thread.loaded.connect(self._on_cover_loaded)
        thread.start()
        self.coverThread = thread

    def _on_cover_loaded(self, image_bytes: bytes) -> None:
        pixmap = QPixmap()
        pixmap.loadFromData(image_bytes)
        self.coverLabel.setCover(pixmap)

    def _status_text(self) -> str:
        if self.task.status == DownloadTaskStatus.PENDING:
            return "等待中"
        if self.task.status == DownloadTaskStatus.FINISHED:
            return "已完成"
        if self.task.status == DownloadTaskStatus.FAILED:
            return self.task.error_message or "下载失败"
        return "下载中"

    def _size_text(self) -> str:
        if self.task.status == DownloadTaskStatus.DOWNLOADING:
            return f"{self.task.progress.current_size_text}/{self.task.progress.total_size_text}"
        if self.task.status == DownloadTaskStatus.PENDING:
            return "0 B/--"
        return self.task.size_text

    def _update_progress_bar(self) -> None:
        if self.task.status == DownloadTaskStatus.PENDING:
            self.progressBar.setRange(0, 100)
            self.progressBar.setValue(0)
            return
        if self.task.progress.total_size <= 0:
            self.progressBar.setRange(0, 0)
            return
        self.progressBar.setRange(0, 100)
        self.progressBar.setValue(self.task.progress.percent)
