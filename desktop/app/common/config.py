# coding:utf-8
import sys
from enum import Enum
from pathlib import Path

from PyQt5.QtCore import QLocale
from qfluentwidgets import (qconfig, QConfig, ConfigItem, OptionsConfigItem, BoolValidator,
                            OptionsValidator, Theme, FolderValidator, ConfigSerializer)

from .setting import CONFIG_FILE
from app.services.channels import MUSIC_PLATFORMS

class Language(Enum):
    """ Language enumeration """

    CHINESE_SIMPLIFIED = QLocale(QLocale.Chinese, QLocale.China)
    CHINESE_TRADITIONAL = QLocale(QLocale.Chinese, QLocale.HongKong)
    ENGLISH = QLocale(QLocale.English)
    AUTO = QLocale()


class LanguageSerializer(ConfigSerializer):
    """ Language serializer """

    def serialize(self, language):
        return language.value.name() if language != Language.AUTO else "Auto"

    def deserialize(self, value: str):
        return Language(QLocale(value)) if value != "Auto" else Language.AUTO


class DownloadFilenameRule(Enum):
    """Downloaded music filename rule."""

    TITLE_ARTIST = "title_artist"
    TITLE = "title"
    TITLE_ID = "title_id"
    ARTIST_TITLE = "artist_title"


class DownloadFilenameRuleSerializer(ConfigSerializer):
    """Download filename rule serializer."""

    def serialize(self, rule):
        return rule.value

    def deserialize(self, value: str):
        try:
            return DownloadFilenameRule(value)
        except ValueError:
            return DownloadFilenameRule.TITLE_ARTIST


def isWin11():
    return sys.platform == 'win32' and sys.getwindowsversion().build >= 22000


class Config(QConfig):
    """ Config of application """

    # TODO: ADD YOUR CONFIG GROUP HERE


    # main window
    searchChannel = OptionsConfigItem("Search", "Channel", "gdstudio-netease", OptionsValidator(
        [c.id for p in MUSIC_PLATFORMS for c in p.channels]))
    micaEnabled = ConfigItem("MainWindow", "MicaEnabled", isWin11(), BoolValidator())
    dpiScale = OptionsConfigItem(
        "MainWindow", "DpiScale", "Auto", OptionsValidator([1, 1.25, 1.5, 1.75, 2, "Auto"]), restart=True)
    language = OptionsConfigItem(
        "MainWindow", "Language", Language.AUTO, OptionsValidator(Language), LanguageSerializer(), restart=True)

    # download
    downloadFolder = ConfigItem(
        "Download",
        "Folder",
        str(Path.home() / "Downloads"),
        FolderValidator(),
    )
    downloadFilenameRule = OptionsConfigItem(
        "Download",
        "FilenameRule",
        DownloadFilenameRule.TITLE_ARTIST,
        OptionsValidator(DownloadFilenameRule),
        DownloadFilenameRuleSerializer(),
    )

    # software update
    checkUpdateAtStartUp = ConfigItem("Update", "CheckUpdateAtStartUp", True, BoolValidator())


cfg = Config()
cfg.themeMode.value = Theme.AUTO
qconfig.load(str(CONFIG_FILE.absolute()), cfg)
