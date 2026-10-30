# coding: utf-8
from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtGui import QFont
from PyQt5.QtWidgets import QVBoxLayout, QHBoxLayout, QLabel, QActionGroup

from qfluentwidgets import (Action, CaptionLabel, DropDownPushButton,
                           IndeterminateProgressBar, RoundMenu, SearchLineEdit,
                           SimpleCardWidget, setFont)
from app.services.channels import MUSIC_PLATFORMS, get_channel, get_platform
from app.common.config import cfg


class ChannelMenuButton(DropDownPushButton):
    """Music platform menu with a submenu for each search channel."""

    currentTextChanged = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._provider_id = "gdstudio-netease"
        self._actions = {}
        menu = RoundMenu(parent=self)
        self._action_group = QActionGroup(self)
        self._action_group.setExclusive(True)
        for platform in MUSIC_PLATFORMS:
            submenu = RoundMenu(platform.name, self)
            if not platform.channels:
                action = Action("暂无可用渠道", submenu)
                action.setEnabled(False)
                submenu.addAction(action)
            for channel in platform.channels:
                provider_id = channel.id
                action = Action(channel.name, submenu)
                action.setCheckable(True)
                action.setChecked(provider_id == self._provider_id)
                self._action_group.addAction(action)
                if channel.delivery == "source-page":
                    action.setToolTip("前往源站使用网盘保存，不支持自动批量下载")
                else:
                    action.setToolTip("下载以歌曲实际可用音质为准")
                action.triggered.connect(lambda checked=False, key=provider_id: self._select_channel(key))
                submenu.addAction(action)
                self._actions[provider_id] = action
            menu.addMenu(submenu)
        self.setMenu(menu)
        self.setCurrentData(cfg.get(cfg.searchChannel))

    def currentData(self):
        return self._provider_id

    def setCurrentData(self, provider_id):
        get_channel(provider_id)
        self._provider_id = provider_id
        self._actions[provider_id].setChecked(True)
        channel, platform = get_channel(provider_id), get_platform(provider_id)
        self.setText(f"{platform.name} / {channel.name}")
        self.setToolTip(self.text())

    def _select_channel(self, provider_id):
        if provider_id == self._provider_id:
            return
        self.setCurrentData(provider_id)
        cfg.set(cfg.searchChannel, provider_id)
        self.currentTextChanged.emit(self.text())


class SearchCard(SimpleCardWidget):
    """Search card with search input and platform selector"""

    searchRequested = pyqtSignal(str, str)
    platformChanged = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(250)

        self.vBoxLayout = QVBoxLayout(self)
        self.titleLabel = QLabel(self.tr("发现你的音乐世界"), self)
        self.descLabel = QLabel(
            self.tr("无论是熟悉的旋律，还是未知的惊喜，都在这里等你探索 ✨"),
            self
        )

        self.searchLayout = QHBoxLayout()
        self.searchInput = SearchLineEdit(self)
        self.platformComboBox = ChannelMenuButton(self)
        self.progressBar = IndeterminateProgressBar(self)
        self.stabilityLabel = CaptionLabel(self.tr("搜索与下载依赖第三方渠道的稳定性，不保证持续有效；失败时请重试或切换渠道。"), self)
        self.stabilityLabel.setWordWrap(True)
        self.stabilityLabel.setAlignment(Qt.AlignCenter)

        self._init_ui()
        self._connect_signals()
        self._on_platform_changed(self.platformComboBox.text())

    def _init_ui(self):
        setFont(self.titleLabel, 24, QFont.Weight.Bold)
        setFont(self.descLabel, 14, QFont.Weight.Normal)

        self.titleLabel.setObjectName('titleLabel')
        self.descLabel.setObjectName('descLabel')
        self.titleLabel.setAlignment(Qt.AlignCenter)
        self.descLabel.setAlignment(Qt.AlignCenter)

        self.searchInput.setPlaceholderText(self.tr("搜索歌曲、歌手或专辑..."))
        self.searchInput.setFixedHeight(40)
        self.searchInput.searchSignal.connect(self._on_search)

        self.platformComboBox.setFixedWidth(245)
        self.platformComboBox.setFixedHeight(40)

        self.searchLayout.setSpacing(12)
        self.searchLayout.addWidget(self.searchInput, 1)
        self.searchLayout.addWidget(self.platformComboBox)

        self.progressBar.hide()
        self.progressBar.pause()

        self.vBoxLayout.setContentsMargins(24, 24, 24, 24)
        self.vBoxLayout.setSpacing(12)
        self.vBoxLayout.addWidget(self.titleLabel)
        self.vBoxLayout.addWidget(self.descLabel)
        self.vBoxLayout.addSpacing(8)
        self.vBoxLayout.addLayout(self.searchLayout)
        self.vBoxLayout.addWidget(self.stabilityLabel)
        self.vBoxLayout.addWidget(self.progressBar)

    def _connect_signals(self):
        self.searchInput.returnPressed.connect(self._on_return_pressed)
        self.platformComboBox.currentTextChanged.connect(self._on_platform_changed)


    def _on_search(self, keyword: str):
        """Handle search action"""
        if keyword.strip():
            platform = self.platformComboBox.currentData()
            self.searchRequested.emit(keyword, platform)

    def _on_return_pressed(self) -> None:
        """Search with the same behavior as the search button."""
        self._on_search(self.searchInput.text())

    def clear_search(self):
        """Clear search input"""
        self.searchInput.clear()

    def set_searching(self, searching: bool) -> None:
        """Show or hide the indeterminate search progress bar"""
        self.progressBar.setVisible(searching)
        if searching:
            self.progressBar.resume()
        else:
            self.progressBar.pause()

    def set_controls_enabled(self, enabled: bool) -> None:
        """Enable or disable search controls while keeping status widgets active"""
        self.searchInput.setEnabled(enabled)
        self.platformComboBox.setEnabled(enabled)


    def _on_platform_changed(self, platform: str) -> None:
        provider_id = self.platformComboBox.currentData()
        hints = {
            "livepoo": "力音当前提供网盘入口，需前往源站保存；不支持试听或批量下载。",
            "gequhai": "搜索歌曲海曲库，客户端支持直接下载和批量下载。",
        }
        label = self.platformComboBox.text()
        self.stabilityLabel.setText(f"{label} · {hints.get(provider_id, '仅使用所选渠道搜索和下载，不会自动切换渠道。')}")
        self.platformChanged.emit(provider_id)
