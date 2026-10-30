# coding: utf-8
from PyQt5.QtCore import QObject, pyqtSignal


class SignalBus(QObject):
    """ Signal bus """

    checkUpdateSig = pyqtSignal()
    micaEnableChanged = pyqtSignal(bool)
    downloadStarted = pyqtSignal(str, object)
    downloadRequested = pyqtSignal(object, object)
    downloadTaskUpdated = pyqtSignal(object)
    downloadProgressChanged = pyqtSignal(object, object)
    downloadRetryRequested = pyqtSignal(object)
    downloadCancelRequested = pyqtSignal(object)
    downloadFinished = pyqtSignal(str, object)
    downloadFailed = pyqtSignal(str, object)


signalBus = SignalBus()
