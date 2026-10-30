"""Log unexpected Python exceptions and show them on the GUI thread."""
import logging
from logging.handlers import RotatingFileHandler
import sys
import threading

from PyQt5.QtCore import QObject, Qt, pyqtSignal
from PyQt5.QtWidgets import QApplication
from qfluentwidgets import InfoBar, InfoBarPosition

from .setting import CONFIG_FOLDER


class ErrorReporter(QObject):
    reported = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.window = None
        self.reported.connect(self.show_error)

    def show_error(self, message):
        parent = self.window or QApplication.activeWindow()
        if parent is not None:
            InfoBar.error(
                title="操作失败", content=message, orient=Qt.Horizontal,
                isClosable=True, position=InfoBarPosition.TOP,
                duration=8000, parent=parent,
            )

    def handle_exception(self, error_type, error, traceback):
        logging.getLogger("app").error("Unhandled exception", exc_info=(error_type, error, traceback))
        self.reported.emit(f"操作未完成：{str(error)[:240] or error_type.__name__}。详情已记录到日志。")


def install_error_handler(app):
    handler = RotatingFileHandler(CONFIG_FOLDER / "app.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logging.getLogger().addHandler(handler)
    reporter = ErrorReporter(app)
    sys.excepthook = reporter.handle_exception
    threading.excepthook = lambda args: reporter.handle_exception(args.exc_type, args.exc_value, args.exc_traceback)
    return reporter
