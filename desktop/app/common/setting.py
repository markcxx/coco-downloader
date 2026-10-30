# coding: utf-8
from pathlib import Path

from PyQt5.QtCore import QStandardPaths

# change DEBUG to False if you want to compile the code to exe
DEBUG = "__compiled__" not in globals()


YEAR = 2026
AUTHOR = "markcxx"
VERSION = "v0.0.3"
APP_NAME = "coco-downloader"
APP_LOGO_PATH = ":/app/images/logo/CocoDownloader.svg"
HELP_URL = "https://github.com/markcxx/coco-downloader"
REPO_URL = "https://github.com/markcxx/coco-downloader"
FEEDBACK_URL = "https://github.com/markcxx/coco-downloader/issues/new"
DOC_URL = "https://github.com/markcxx/coco-downloader"


def _app_data_folder() -> Path:
    app_data_path = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    if app_data_path:
        return Path(app_data_path) / APP_NAME
    return Path.home() / f".{APP_NAME}"


CONFIG_FOLDER = _app_data_folder()
CONFIG_FOLDER.mkdir(exist_ok=True, parents=True)
CONFIG_FILE = CONFIG_FOLDER / "config.json"
