# coding: utf-8
from typing import Any

from PyQt5.QtCore import QThread, Qt, QSize, QUrl, pyqtSignal
from PyQt5.QtGui import QColor, QFont, QDesktopServices
from PyQt5.QtWidgets import QLabel, QWidget, QVBoxLayout

from PyQt5.QtWidgets import QGraphicsDropShadowEffect

from qfluentwidgets import Action, CommandBarView, FluentIcon, InfoBar, InfoBarPosition, ScrollArea, isDarkTheme, setFont

from ..common.style_sheet import StyleSheet
from ..common.signal_bus import signalBus
from ..components import DownloadOptionDialog, PlaceholderWidget, SearchCard, SongInfo, SongListWidget
from ..models.music import MusicItem
from ..services.errors import (
    NETWORK_ERROR_HTTP_STATUS,
    NETWORK_ERROR_REDIRECT,
    NETWORK_ERROR_TIMEOUT,
    ProviderNetworkError,
)
from ..services.music_search_service import search_music
from ..services.thread_lifecycle import retain_thread
from ..services.providers import PROVIDER_DISPLAY_NAMES
from ..services.channels import get_channel, supports_paging
from ..services.music_service import resolve_source_page

PAGE_SIZE = 20


class MusicSearchThread(QThread):
    """Search music without blocking the UI thread."""

    searchFinished = pyqtSignal(str, str, int, int, list)
    searchFailed = pyqtSignal(str, str, int, int, str, str)

    def __init__(
            self,
            keyword: str,
            platform: str,
            request_id: int,
            limit: int = PAGE_SIZE,
            offset: int = 0,
            parent=None,
    ):
        super().__init__(parent)
        self.keyword = keyword
        self.platform = platform
        self.request_id = request_id
        self.limit = limit
        self.offset = offset

    def run(self):
        try:
            items = search_music(self.keyword, self.platform, limit=self.limit, offset=self.offset)
            self.searchFinished.emit(self.keyword, self.platform, self.request_id, self.offset, items)
        except ProviderNetworkError as error:
            self.searchFailed.emit(
                self.keyword,
                self.platform,
                self.request_id,
                self.offset,
                str(error),
                error.kind,
            )
        except Exception as error:
            self.searchFailed.emit(
                self.keyword,
                self.platform,
                self.request_id,
                self.offset,
                str(error),
                "",
            )


class SourcePageResolveThread(QThread):
    resolved = pyqtSignal(str)
    failed = pyqtSignal(str)

    def __init__(self, item: MusicItem, parent=None):
        super().__init__(parent)
        self.item = item

    def run(self):
        try:
            self.resolved.emit(resolve_source_page(self.item))
        except Exception as error:
            self.failed.emit(str(error))


class SongSelectionCommandBarView(CommandBarView):
    """Bottom command bar for selected search results."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.downloadAction = Action(FluentIcon.DOWNLOAD, self.tr("批量下载"), self)
        self.selectAllAction = Action(FluentIcon.CHECKBOX, self.tr("全选"), self)
        self.cancelAction = Action(FluentIcon.CLEAR_SELECTION, self.tr("取消"), self)

        self.setToolButtonStyle(Qt.ToolButtonTextUnderIcon)
        self.setIconSize(QSize(18, 18))
        self.addActions([self.downloadAction])
        self.addSeparator()
        self.addActions([self.selectAllAction, self.cancelAction])
        self.resizeToSuitableWidth()
        self._set_shadow_effect()

    def _set_shadow_effect(self):
        color = QColor(0, 0, 0, 80 if isDarkTheme() else 30)
        effect = QGraphicsDropShadowEffect(self)
        effect.setBlurRadius(35)
        effect.setOffset(0, 8)
        effect.setColor(color)
        self.setGraphicsEffect(effect)


class HomeInterface(ScrollArea):
    """Home interface"""

    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.scrollWidget = QWidget()
        self.vBoxLayout = QVBoxLayout(self.scrollWidget)

        self.searchCard = SearchCard(self)
        self.resultTitleLabel = QLabel(self)
        self.placeholderWidget = PlaceholderWidget(self)
        self.selectionCommandBar = SongSelectionCommandBarView(self)
        self.songListWidget = None
        self.searchThread = None
        self.searchRequestId = 0
        self.currentKeyword = ""
        self.currentPlatform = ""
        self.currentOffset = 0
        self.currentItems: list[MusicItem] = []
        self.isLoadingMore = False

        self._init_widget()
        self._connect_signals()

    def _init_widget(self):
        self.resize(1000, 800)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setViewportMargins(0, 0, 0, 0)
        self.setWidget(self.scrollWidget)
        self.setWidgetResizable(True)
        self.setObjectName('homeInterface')

        self.scrollWidget.setObjectName('scrollWidget')
        self.resultTitleLabel.setObjectName('resultTitleLabel')
        self.resultTitleLabel.hide()
        setFont(self.resultTitleLabel, 28, QFont.Weight.Light)

        StyleSheet.HOME_INTERFACE.apply(self)
        self.scrollWidget.setStyleSheet("QWidget{background:transparent}")
        self.selectionCommandBar.hide()

        self._init_layout()

    def _init_layout(self):
        self.vBoxLayout.setSpacing(24)
        self.vBoxLayout.setContentsMargins(24, 10, 24, 10)

        self.vBoxLayout.addWidget(self.searchCard)
        self.vBoxLayout.addWidget(self.resultTitleLabel)
        self.vBoxLayout.addWidget(self.placeholderWidget, 1)

    def _connect_signals(self):
        self.searchCard.searchRequested.connect(self._on_search)
        self.selectionCommandBar.downloadAction.triggered.connect(self._download_selected_songs)
        self.selectionCommandBar.selectAllAction.triggered.connect(self._select_all_songs)
        self.selectionCommandBar.cancelAction.triggered.connect(self._clear_song_selection)

    def _on_search(self, keyword: str, platform: str):
        """Handle search request"""
        self.searchRequestId += 1
        request_id = self.searchRequestId
        self.currentKeyword = keyword
        self.currentPlatform = platform
        self.currentOffset = 0
        self.currentItems = []
        self.isLoadingMore = False
        self.placeholderWidget.set_content_visible(False)
        self.placeholderWidget.show()
        self.resultTitleLabel.hide()
        self.searchCard.set_controls_enabled(False)
        self.searchCard.set_searching(True)
        self._clear_song_list()

        thread = MusicSearchThread(keyword, platform, request_id, PAGE_SIZE, 0, self)
        thread.searchFinished.connect(self._on_search_finished)
        thread.searchFailed.connect(self._on_search_failed)
        retain_thread(thread)
        self.searchThread = thread
        thread.start()

    def _on_search_finished(
            self,
            keyword: str,
            platform: str,
            request_id: int,
            offset: int,
            items: list[MusicItem],
    ):
        """Render search results"""
        if request_id != self.searchRequestId:
            return

        self.searchCard.set_controls_enabled(True)
        self.searchCard.set_searching(False)
        self.isLoadingMore = False
        if offset > 0:
            self._append_more_results(items)
            return

        if not items:
            InfoBar.warning(title=self.tr("暂无结果"), content=self.tr("未找到歌曲，或第三方渠道暂不可用，请更换关键词或渠道。"),
                            duration=5000, parent=self.window(), position=InfoBarPosition.TOP)
            self._clear_song_list()
            self._show_placeholder(
                self.tr("没有找到结果"),
                self.tr("平台 {platform} 没有返回可展示的歌曲").format(platform=self._platform_name(platform)),
            )
            return

        self.resultTitleLabel.setText(
            self.tr('"{keyword}" 的搜索结果').format(keyword=keyword)
        )
        self.resultTitleLabel.show()
        songs = [self._to_song_info(item) for item in items]
        self.currentItems = list(items)
        self.placeholderWidget.hide()
        self._set_song_list(songs)
        self.currentOffset = len(items)
        self._set_load_more_visible(self._supports_paging(platform) and len(items) == PAGE_SIZE)

    def _on_search_failed(
            self,
            keyword: str,
            platform: str,
            request_id: int,
            offset: int,
            message: str,
            error_kind: str,
    ):
        """Render search failure state"""
        if request_id != self.searchRequestId:
            return

        self.searchCard.set_controls_enabled(True)
        self.searchCard.set_searching(False)
        self.isLoadingMore = False
        self._show_search_error_info_bar(message, error_kind)
        if offset > 0:
            if self.songListWidget is not None:
                self.songListWidget.set_loading_more(False)
            return

        self._clear_song_list()
        self.resultTitleLabel.hide()
        self._show_placeholder(
            self.tr("搜索失败"),
            self.tr("{platform} 请求失败：{message}").format(
                platform=self._platform_name(platform),
                message=message or self.tr("未知错误"),
            ),
        )

    def _set_song_list(self, songs: list[SongInfo]):
        """Create or update song list widget"""
        if self.songListWidget is None:
            self.songListWidget = SongListWidget(songs, self.scrollWidget)
            self.songListWidget.loadMoreRequested.connect(self._on_load_more)
            self.songListWidget.songDownloadRequested.connect(self._on_song_download_requested)
            self.songListWidget.selectionCountChanged.connect(self._on_song_selection_count_changed)
            self.vBoxLayout.addWidget(self.songListWidget, 1)
        else:
            self.songListWidget.set_songs(songs)
            self.songListWidget.show()

    def _clear_song_list(self):
        """Hide previous search results"""
        if self.songListWidget is not None:
            self.songListWidget.hide()

    def _show_placeholder(self, title: str, description: str):
        """Show placeholder with custom text"""
        self.placeholderWidget.set_content_visible(True)
        self.placeholderWidget.titleLabel.setText(title)
        self.placeholderWidget.descLabel.setText(description)
        self.placeholderWidget.show()

    def _to_song_info(self, item: MusicItem) -> SongInfo:
        """Convert provider item to list row data"""
        return SongInfo(
            title=item.title,
            singer=item.artist,
            album=item.album or self.tr("未知专辑"),
            duration=self._format_duration(item.duration),
        )

    def _format_duration(self, duration: str | None) -> str:
        """Format optional provider duration for display"""
        if not duration:
            return "--:--"
        if duration.startswith("00:") and len(duration.split(":")) == 3:
            return duration[3:]
        return duration

    def _on_load_more(self):
        """Load next page for providers that support paging"""
        if self.isLoadingMore or not self._supports_paging(self.currentPlatform):
            return
        if not self.currentKeyword or self.songListWidget is None:
            return

        self.isLoadingMore = True
        self.searchCard.set_controls_enabled(False)
        self.searchCard.set_searching(True)
        self.songListWidget.set_loading_more(True)

        thread = MusicSearchThread(
            self.currentKeyword,
            self.currentPlatform,
            self.searchRequestId,
            PAGE_SIZE,
            self.currentOffset,
            self,
        )
        thread.searchFinished.connect(self._on_search_finished)
        thread.searchFailed.connect(self._on_search_failed)
        retain_thread(thread)
        self.searchThread = thread
        thread.start()

    def _append_more_results(self, items: list[MusicItem]) -> None:
        """Append paged results to the existing song list"""
        self.searchCard.set_controls_enabled(True)
        self.searchCard.set_searching(False)
        if self.songListWidget is None:
            return

        self.songListWidget.set_loading_more(False)
        if not items:
            self._set_load_more_visible(False)
            return

        songs = [self._to_song_info(item) for item in items]
        self.currentItems.extend(items)
        self.songListWidget.append_songs(songs)
        self.currentOffset += len(items)
        self._set_load_more_visible(len(items) == PAGE_SIZE)

    def _set_load_more_visible(self, visible: bool) -> None:
        if self.songListWidget is not None:
            self.songListWidget.set_load_more_visible(visible)

    def _supports_paging(self, platform: str) -> bool:
        return supports_paging(platform)

    def _platform_name(self, platform: str) -> str:
        return next((name for name, key in PROVIDER_DISPLAY_NAMES.items() if key == platform), platform)


    def _on_song_download_requested(self, index: int) -> None:
        if not 0 <= index < len(self.currentItems):
            return

        item = self.currentItems[index]
        self._request_download(item)

    def _request_download(self, item: MusicItem) -> None:
        if get_channel(item.provider).delivery == "source-page":
            thread = SourcePageResolveThread(item, self)
            retain_thread(thread)
            thread.resolved.connect(self._open_source_page)
            thread.failed.connect(lambda message: self._show_search_error_info_bar(message, ""))
            thread.start()
            return
        option_overrides = self._select_download_option(item)
        if option_overrides is None:
            return
        if option_overrides:
            signalBus.downloadRequested.emit(item, option_overrides)
            return

        signalBus.downloadRequested.emit(item, {})

    def _open_source_page(self, url: str) -> None:
        QDesktopServices.openUrl(QUrl(url))
        InfoBar.info(title=self.tr("前往源站下载"),
                     content=self.tr("请在源站选择保存入口，客户端无法跟踪保存结果。"),
                     parent=self, position=InfoBarPosition.TOP, duration=6000)

    def _download_selected_songs(self) -> None:
        if self.songListWidget is None:
            return
        indexes = self.songListWidget.selected_song_indices()
        if not indexes:
            return

        if any(not get_channel(self.currentItems[index].provider).batch_download for index in indexes):
            InfoBar.warning(title=self.tr("此渠道不支持批量下载"),
                            content=self.tr("力音需前往源站逐首保存，请点击歌曲的下载按钮。"),
                            parent=self, position=InfoBarPosition.TOP, duration=6000)
            return

        gd_overrides = {}
        gd_item = next((self.currentItems[index] for index in indexes if self.currentItems[index].provider in {"netease", "gdstudio-netease"}), None)
        if gd_item:
            gd_overrides = self._select_download_option(gd_item)
            if gd_overrides is None:
                return

        for index in indexes:
            item = self.currentItems[index]
            overrides = {"_batch": True}
            if item.provider in {"netease", "gdstudio-netease"}:
                overrides.update(gd_overrides)
            signalBus.downloadRequested.emit(item, overrides)
        self.songListWidget.clear_selection()

    def _select_all_songs(self) -> None:
        if self.songListWidget is not None:
            self.songListWidget.select_all_songs()

    def _clear_song_selection(self) -> None:
        if self.songListWidget is not None:
            self.songListWidget.clear_selection()

    def _on_song_selection_count_changed(self, count: int) -> None:
        self.selectionCommandBar.setVisible(count > 0)
        if count > 0:
            self.selectionCommandBar.raise_()
            self._move_selection_command_bar()





    def _select_download_option(self, item: MusicItem) -> dict[str, Any] | None:
        options = item.extra.get("qualityOptions")
        if not isinstance(options, list) or not options:
            return {}

        valid_options = [option for option in options if isinstance(option, dict)]
        if not valid_options:
            return {}

        is_gd = item.provider in {"netease", "gdstudio-netease"}
        dialog = DownloadOptionDialog(
            self.tr("选择下载音质") if is_gd else self.tr("选择下载线路"),
            self.tr("此渠道支持多种音质，实际音质以返回文件为准。") if is_gd else self.tr("{provider} 支持多个解析线路，请选择本次下载使用的线路。").format(provider=item.provider),
            valid_options,
            self._default_download_option_value(item),
            self.window(),
        )
        if not dialog.exec():
            return None

        selected = dialog.selected_option
        value = selected.get("value")
        if not isinstance(value, str) or not value:
            return {}
        if is_gd:
            return {"level": value, "selectedLevel": value}
        return {
            "selectedParser": selected.get("parser") or value,
            "selectedLevel": selected.get("level"),
            "selectedFormat": selected.get("format"),
        }

    def _default_download_option_value(self, item: MusicItem) -> str:
        selected_option = item.extra.get("selectedOption")
        if isinstance(selected_option, str) and selected_option:
            return selected_option

        parser = item.extra.get("selectedParser")
        level = item.extra.get("selectedLevel")
        if isinstance(parser, str) and isinstance(level, str) and parser and level:
            return f"{parser}-{level}"
        return str(parser or level or "")

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self._move_selection_command_bar()

    def _move_selection_command_bar(self) -> None:
        x = (self.width() - self.selectionCommandBar.width()) // 2
        y = self.height() - self.selectionCommandBar.sizeHint().height() - 20
        self.selectionCommandBar.move(max(0, x), max(0, y))

    def _show_search_error_info_bar(self, message: str, error_kind: str) -> None:
        parent = self.window()
        if error_kind == NETWORK_ERROR_TIMEOUT:
            InfoBar.warning(
                title=self.tr("请求超时"),
                content=message or self.tr("网络请求超时，请稍后重试"),
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=3000,
                parent=parent,
            )
            return

        if error_kind == NETWORK_ERROR_REDIRECT:
            title = self.tr("请求异常")
        elif error_kind == NETWORK_ERROR_HTTP_STATUS:
            title = self.tr("服务异常")
        else:
            title = self.tr("网络错误")

        content = message or self.tr("请求失败，请稍后重试")
        InfoBar.error(
            title=title,
            content=content,
            orient=Qt.Horizontal,
            isClosable=True,
            position=InfoBarPosition.TOP,
            duration=3000,
            parent=parent,
        )
