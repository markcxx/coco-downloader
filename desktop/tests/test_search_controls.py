import os
import unittest
from unittest.mock import patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
from PyQt5.QtCore import QEvent
from PyQt5.QtWidgets import QApplication, QListWidget
from qfluentwidgets import DropDownPushButton, RoundMenu
from app.common.config import cfg
from app.components.search_card import SearchCard
from app.components.song_list_widget import SongListWidget, SongInfo, SongRow
from app.view.home_interface import MusicSearchThread, HomeInterface

APP = QApplication.instance() or QApplication([])


class SearchControlTests(unittest.TestCase):
    def test_download_only_controls(self):
        card = SearchCard()
        self.assertIsInstance(card.platformComboBox, DropDownPushButton)
        self.assertIsInstance(card.platformComboBox.menu(), RoundMenu)
        self.assertEqual(len(card.platformComboBox._actions), 15)
        self.assertFalse(hasattr(card, "sourceComboBox"))
        self.assertFalse(hasattr(cfg, "searchSource"))
        card.deleteLater()

    @patch.object(cfg, "set")
    def test_menu_persists_choice(self, save):
        card = SearchCard()
        # The user's saved channel may already be the target; test a real change.
        card.platformComboBox.setCurrentData("gdstudio-netease")
        card.platformComboBox._actions["at38-qq"].trigger()
        self.assertEqual(card.platformComboBox.currentData(), "at38-qq")
        save.assert_called_with(cfg.searchChannel, "at38-qq")
        card.deleteLater()

    def test_original_list_selection_download_and_paging(self):
        listing = SongListWidget([SongInfo("歌", "歌手", "专辑", "03:00")])
        self.assertIsInstance(listing, QListWidget)
        self.assertFalse(hasattr(listing, "songPlayRequested"))
        first = listing.itemWidget(listing.item(0))
        self.assertIsInstance(first, SongRow)
        self.assertEqual(first.height(), 60)
        self.assertEqual(first.song_name_card.song_name_label.font().pixelSize(), 16)
        self.assertFalse(hasattr(first.song_name_card, "play_button"))
        self.assertEqual(len(first.animations), 4)
        first.enterEvent(QEvent(QEvent.Enter))
        self.assertFalse(first.song_name_card.button_group.isHidden())
        self.assertEqual(first.property("state"), "notSelected-enter")
        listing.select_all_songs()
        self.assertEqual(listing.selected_song_indices(), [0])
        listing.set_load_more_visible(True)
        listing.append_songs([SongInfo("第二首", "歌手", "专辑", "04:00")])
        self.assertEqual(listing.selected_song_indices(), [0])
        self.assertEqual(listing.count(), 3)
        listing.clear_selection()
        self.assertEqual(listing.selected_song_indices(), [])
        downloads = []
        listing.songDownloadRequested.connect(downloads.append)
        second = listing.itemWidget(listing.item(1))
        second.song_name_card.add_button.click()
        self.assertEqual(downloads, [1])
        more = []
        listing.loadMoreRequested.connect(lambda: more.append(True))
        listing._load_more_button.click()
        self.assertEqual(more, [True])
        listing.set_loading_more(True)
        self.assertFalse(listing._load_more_button.isEnabled())
        listing.set_load_more_visible(False)
        self.assertEqual(listing.count(), 2)
        listing.deleteLater()

    @patch("app.view.home_interface.search_music")
    def test_worker_only_searches_channel(self, search):
        search.return_value = []
        thread = MusicSearchThread("test", "at38-qq", 7, 20, 20)
        thread.run()
        search.assert_called_once_with("test", "at38-qq", limit=20, offset=20)

    def test_home_constructs_without_player(self):
        home = HomeInterface()
        self.assertFalse(hasattr(home, "_on_song_play_requested"))
        home.deleteLater()
