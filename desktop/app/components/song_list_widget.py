# coding: utf-8
from dataclasses import dataclass
from enum import Enum

from PyQt5.QtCore import QEasingCurve, QPoint, QPropertyAnimation, QSize, Qt, pyqtSignal
from PyQt5.QtGui import QFont, QFontMetrics, QIcon
from PyQt5.QtWidgets import (
    QCheckBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from qfluentwidgets import PushButton, isDarkTheme

from ..common.config import cfg
from ..common.style_sheet import StyleSheet


def _label_font(pixel_size: int) -> QFont:
    font = QFont()
    if hasattr(font, "setFamilies"):
        font.setFamilies(["Segoe UI", "Microsoft YaHei"])
    else:
        font.setFamily("Microsoft YaHei")
    font.setPixelSize(pixel_size)
    return font


class WidgetState(Enum):
    """Widget state enumeration"""
    NORMAL = "notSelected-notPlay"
    SELECTED = "selected"


class CardState(Enum):
    """Card state enumeration"""
    LEAVE = "notSelected-leave"
    ENTER = "notSelected-enter"
    PRESSED = "notSelected-pressed"
    SELECTED_LEAVE = "selected-leave"
    SELECTED_ENTER = "selected-enter"
    SELECTED_PRESSED = "selected-pressed"


@dataclass
class SongInfo:
    """Song information data class"""
    title: str
    singer: str
    album: str
    duration: str


class IconButton(QToolButton):
    """Icon button with state management"""

    def __init__(self, icon_type: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.icon_type = icon_type
        self.state = WidgetState.NORMAL
        self.setFixedSize(60, 60)
        self.setIconSize(QSize(20, 20))
        self.set_state(WidgetState.NORMAL)
        cfg.themeChanged.connect(self._on_theme_changed)

    def set_state(self, state: WidgetState) -> None:
        """Set button state and update icon"""
        self.state = state
        self.setProperty("state", state.value)

        name = self.icon_type
        if state == WidgetState.SELECTED:
            file_name = f"{name}_white.svg"
        else:
            suffix = "white" if isDarkTheme() else "black"
            file_name = f"{name}_{suffix}.svg"

        self.setIcon(QIcon(f":/app/images/song_list_widget/{file_name}"))
        self.style().unpolish(self)
        self.style().polish(self)

    def _on_theme_changed(self, *_) -> None:
        """Refresh icon color when theme changes"""
        self.set_state(self.state)


class ButtonGroup(QWidget):
    """Button group container"""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.add_button = IconButton("Download", self)

        self.setAttribute(Qt.WA_StyledBackground)
        self.setFixedSize(80, 60)
        self.setObjectName("buttonGroup")

        self.add_button.move(20, 0)

        self.set_state(CardState.LEAVE)

    def set_button_state(self, state: WidgetState) -> None:
        """Set state for all buttons"""
        self.add_button.set_state(state)

    def set_state(self, state: CardState) -> None:
        """Set button group state"""
        self.setProperty("state", state.value)
        self.style().unpolish(self)
        self.style().polish(self)


class SongNameCard(QWidget):
    """Song name card with checkbox and buttons"""

    def __init__(self, title: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.song_name = title
        self.song_name_width = 0

        self.check_box = QCheckBox(self)
        self.song_name_label = QLabel(title, self)
        self.button_group = ButtonGroup(self)
        self.add_button = self.button_group.add_button

        self._init_ui()
        self._measure_song_width()
        self._move_button_group()

    def _init_ui(self) -> None:
        """Initialize UI"""
        self.setFixedHeight(60)
        self.resize(390, 60)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setObjectName("songNameCard")

        self.song_name_label.setObjectName("songNameLabel")
        self.song_name_label.setFont(_label_font(16))
        self.check_box.setFocusPolicy(Qt.NoFocus)


        self.check_box.move(15, 18)
        self.song_name_label.move(57, 18)

        self.set_widgets_hidden(True)

    def resizeEvent(self, event) -> None:
        """Handle resize event"""
        super().resizeEvent(event)
        self._move_button_group()

    def _measure_song_width(self) -> None:
        """Measure song name width"""
        metrics = QFontMetrics(self.song_name_label.font())
        self.song_name_width = metrics.horizontalAdvance(self.song_name)
        self.song_name_label.setFixedWidth(self.song_name_width)

    def _move_button_group(self) -> None:
        """Move button group to appropriate position"""
        if self.song_name_width + self.song_name_label.x() >= self.width() - self.button_group.width():
            x = self.width() - self.button_group.width()
        else:
            x = self.song_name_width + self.song_name_label.x()
        self.button_group.move(x, 0)

    def set_widgets_hidden(self, hidden: bool) -> None:
        """Set widgets visibility"""
        self.button_group.setHidden(hidden)
        self.check_box.setHidden(hidden)

    def set_button_group_state(self, state: CardState) -> None:
        """Set button group state"""
        self.button_group.set_state(state)

    def set_widget_state(self, state: WidgetState) -> None:
        """Set widget state"""
        self.check_box.setProperty("state", state.value)
        self.song_name_label.setProperty("state", state.value)
        self.button_group.set_button_state(state)

        for widget in (self.check_box, self.song_name_label, self.button_group):
            widget.style().unpolish(widget)
            widget.style().polish(widget)


class SongRow(QWidget):
    """Song row widget with animations"""

    downloadRequested = pyqtSignal()
    selectionChanged = pyqtSignal(bool)
    DELTAS = [13, 6, -3, -6]

    def __init__(self, song: SongInfo, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.song = song
        self.is_selected = False
        self.is_pressed = False
        self.has_enter = False

        self._init_ui()
        self._init_layout()
        self._setup_animations()
        self._connect_signals()

        self.set_selected(False)

    def _init_ui(self) -> None:
        """Initialize UI"""
        self.setFixedHeight(60)
        self.setAttribute(Qt.WA_StyledBackground)
        self.setMouseTracking(True)

        self.song_name_card = SongNameCard(self.song.title, self)
        self.singer_label = QLabel(self.song.singer, self)
        self.album_label = QLabel(self.song.album, self)
        self.duration_label = QLabel(self.song.duration, self)

        self.labels = [
            self.singer_label,
            self.album_label,
            self.duration_label,
        ]
        self._init_label_fonts()

        self.widgets = [
            self.song_name_card,
            self.singer_label,
            self.album_label,
            self.duration_label,
        ]

    def _init_label_fonts(self) -> None:
        """Set stable fonts before the first paint and layout pass"""
        for label in self.labels:
            label.setFont(_label_font(15))

    def _init_layout(self) -> None:
        """Initialize layout"""
        row_width = max(0, self.width())
        widths = [326, 191, 191]
        spacings = [30, 15]
        x = 0

        self.song_name_card.resize(widths[0], 60)
        self.song_name_card.move(0, 0)
        x = widths[0]

        # Singer and Album labels
        for label, width, spacing in zip(self.labels[:-1], widths[1:], spacings):
            label.move(x + spacing, 20)
            x = label.x() + width

        # Duration label
        self.duration_label.move(row_width - 45, 20)

    def _setup_animations(self) -> None:
        """Setup position animations"""
        self.base_positions: list[QPoint] = [widget.pos() for widget in self.widgets]
        self.animations: list[QPropertyAnimation] = []

        for widget in self.widgets:
            animation = QPropertyAnimation(widget, b"pos", self)
            animation.setDuration(400)
            animation.setEasingCurve(QEasingCurve.OutQuad)
            self.animations.append(animation)

    def _connect_signals(self) -> None:
        """Connect signals"""
        self.song_name_card.add_button.clicked.connect(self.downloadRequested)
        self.song_name_card.check_box.toggled.connect(self._on_checked)

    def resizeEvent(self, event) -> None:
        """Handle resize event"""
        super().resizeEvent(event)
        self._init_layout()
        self._setup_animations()

    def _refresh_style(self) -> None:
        """Refresh widget style"""
        self.style().unpolish(self)
        self.style().polish(self)
        self.update()

    def _apply_state(self, widget_state: WidgetState, card_state: CardState) -> None:
        """Apply state to all widgets"""
        self.song_name_card.set_widget_state(widget_state)
        self.song_name_card.set_button_group_state(card_state)

        for label in self.labels:
            label.setProperty("state", widget_state.value)
            label.style().unpolish(label)
            label.style().polish(label)

        self.setProperty("state", card_state.value)
        self._refresh_style()

    def set_selected(self, selected: bool) -> None:
        """Set selected state"""
        self.is_selected = selected
        self.song_name_card.check_box.blockSignals(True)
        self.song_name_card.check_box.setChecked(selected)
        self.song_name_card.check_box.blockSignals(False)
        self._apply_state(self._current_widget_state(), self._current_card_state())
        self.song_name_card.set_widgets_hidden(not self.has_enter)


    def _on_checked(self, checked: bool) -> None:
        """Handle checkbox toggled"""
        self.set_selected(checked)
        self.selectionChanged.emit(checked)

    def enterEvent(self, event) -> None:
        """Handle mouse enter event"""
        super().enterEvent(event)
        self.has_enter = True
        self.song_name_card.check_box.show()
        self.song_name_card.button_group.show()

        self._apply_state(self._current_widget_state(), self._current_card_state())

    def leaveEvent(self, event) -> None:
        """Handle mouse leave event"""
        super().leaveEvent(event)
        self.has_enter = False

        self.song_name_card.button_group.hide()
        self.song_name_card.check_box.hide()
        self._apply_state(self._current_widget_state(), self._current_card_state())

    def mousePressEvent(self, event) -> None:
        """Handle mouse press event"""
        super().mousePressEvent(event)
        if event.button() != Qt.LeftButton:
            return

        self.is_pressed = True
        self.song_name_card.button_group.show()

        for widget, delta in zip(self.widgets, self.DELTAS):
            widget.move(widget.x() + delta, widget.y())

        if self.is_selected:
            card_state = CardState.SELECTED_PRESSED
        else:
            card_state = CardState.PRESSED
        self._apply_state(self._current_widget_state(), card_state)

    def mouseReleaseEvent(self, event) -> None:
        """Handle mouse release event"""
        super().mouseReleaseEvent(event)
        if not self.is_pressed or event.button() != Qt.LeftButton:
            return

        self.is_pressed = False

        for widget, delta, base, animation in zip(
            self.widgets, self.DELTAS, self.base_positions, self.animations
        ):
            animation.stop()
            animation.setStartValue(widget.pos())
            animation.setEndValue(base)
            animation.start()

        self._apply_state(self._current_widget_state(), self._current_card_state())


    def _current_widget_state(self) -> WidgetState:
        if self.is_selected:
            return WidgetState.SELECTED
        return WidgetState.NORMAL

    def _current_card_state(self) -> CardState:
        if self.is_selected:
            return CardState.SELECTED_ENTER if self.has_enter else CardState.SELECTED_LEAVE
        return CardState.ENTER if self.has_enter else CardState.LEAVE


class SongListWidget(QListWidget):
    """Song list widget"""

    loadMoreRequested = pyqtSignal()
    songDownloadRequested = pyqtSignal(int)
    selectionCountChanged = pyqtSignal(int)

    def __init__(self, songs: list[SongInfo] | None = None, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._song_count = 0
        self._has_load_more = False
        self._is_loading_more = False
        self._load_more_item: QListWidgetItem | None = None
        self._load_more_button: PushButton | None = None

        self.setObjectName("songListWidget")
        self.setAlternatingRowColors(True)
        self.setFrameShape(QFrame.NoFrame)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setVerticalScrollMode(self.ScrollPerPixel)
        self.setSpacing(0)
        StyleSheet.SONG_LIST_WIDGET.apply(self)

        if songs:
            self.set_songs(songs)

    def set_songs(self, songs: list[SongInfo]) -> None:
        """Set song list"""
        self.clear()
        self._song_count = 0
        self._load_more_item = None
        self._load_more_button = None
        for song in songs:
            self._add_song_row(song)

        if self._has_load_more:
            self._add_load_more_row()
        self._sync_height()
        self._sync_row_sizes()

    def append_songs(self, songs: list[SongInfo]) -> None:
        """Append songs before the load-more row"""
        self._remove_load_more_row()
        for song in songs:
            self._add_song_row(song)

        if self._has_load_more:
            self._add_load_more_row()
        self._sync_height()
        self._sync_row_sizes()

    def set_load_more_visible(self, visible: bool) -> None:
        """Show or hide load more row"""
        if self._has_load_more == visible:
            self._sync_load_more_state()
            return

        self._has_load_more = visible
        if visible:
            self._add_load_more_row()
        else:
            self._remove_load_more_row()
        self._sync_height()
        self._sync_row_sizes()

    def set_loading_more(self, loading: bool) -> None:
        """Set load more button state"""
        self._is_loading_more = loading
        self._sync_load_more_state()

    def resizeEvent(self, event) -> None:
        """Handle resize event"""
        super().resizeEvent(event)
        self._sync_row_sizes()

    def _sync_row_sizes(self) -> None:
        """Synchronize item widgets with the current viewport width"""
        width = max(0, self.viewport().width())

        for index in range(self.count()):
            item = self.item(index)
            row = self.itemWidget(item)
            if row is None:
                continue
            height = 64 if item is self._load_more_item else 60
            item.setSizeHint(QSize(width, height))
            row.resize(width, height)

    def _add_song_row(self, song: SongInfo) -> None:
        item = QListWidgetItem(self)
        item.setSizeHint(QSize(1090, 60))
        row = SongRow(song, self)
        row.downloadRequested.connect(lambda checked=False, song_row=row: self._emit_song_download_requested(song_row))
        row.selectionChanged.connect(lambda checked=False: self.selectionCountChanged.emit(len(self.selected_song_indices())))
        self.addItem(item)
        self.setItemWidget(item, row)
        self._song_count += 1


    def _emit_song_download_requested(self, row: SongRow) -> None:
        for index in range(self.count()):
            item = self.item(index)
            if item is self._load_more_item:
                continue
            if self.itemWidget(item) is row:
                self.songDownloadRequested.emit(index)
                return


    def selected_song_indices(self) -> list[int]:
        """Return selected song row indexes, excluding the load-more row."""
        indexes: list[int] = []
        for index in range(self.count()):
            item = self.item(index)
            if item is self._load_more_item:
                continue
            row = self.itemWidget(item)
            if isinstance(row, SongRow) and row.is_selected:
                indexes.append(index)
        return indexes

    def select_all_songs(self) -> None:
        """Select all song rows."""
        for index in range(self.count()):
            item = self.item(index)
            if item is self._load_more_item:
                continue
            row = self.itemWidget(item)
            if isinstance(row, SongRow):
                row.set_selected(True)
        self.selectionCountChanged.emit(len(self.selected_song_indices()))

    def clear_selection(self) -> None:
        """Clear all selected song rows."""
        for index in range(self.count()):
            item = self.item(index)
            if item is self._load_more_item:
                continue
            row = self.itemWidget(item)
            if isinstance(row, SongRow):
                row.set_selected(False)
        self.selectionCountChanged.emit(0)

    def _add_load_more_row(self) -> None:
        if self._load_more_item is not None:
            return

        item = QListWidgetItem(self)
        item.setSizeHint(QSize(1090, 64))
        row = QWidget(self)
        layout = QVBoxLayout(row)
        button_layout = QHBoxLayout()
        button = PushButton(self.tr("加载更多"), row)

        button.setFixedHeight(36)
        button.clicked.connect(self.loadMoreRequested)
        button_layout.addStretch(1)
        button_layout.addWidget(button)
        button_layout.addStretch(1)
        layout.setContentsMargins(0, 12, 0, 12)
        layout.addLayout(button_layout)

        self.addItem(item)
        self.setItemWidget(item, row)
        self._load_more_item = item
        self._load_more_button = button
        self._sync_load_more_state()

    def _remove_load_more_row(self) -> None:
        if self._load_more_item is None:
            return

        row = self.row(self._load_more_item)
        if row >= 0:
            self.takeItem(row)
        self._load_more_item = None
        self._load_more_button = None

    def _sync_load_more_state(self) -> None:
        if self._load_more_button is None:
            return

        self._load_more_button.setEnabled(not self._is_loading_more)
        text = self.tr("正在加载...") if self._is_loading_more else self.tr("加载更多")
        self._load_more_button.setText(text)

    def _sync_height(self) -> None:
        footer_height = 64 if self._has_load_more else 0
        total_height = self._song_count * 60 + footer_height
        self.setMinimumHeight(total_height)
        self.setMaximumHeight(total_height)
