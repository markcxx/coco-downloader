"""Keep workers alive until QThread.finished, including during application exit."""
from PyQt5.QtCore import QCoreApplication, QThread

_threads: set[QThread] = set()
_connected = False


def retain_thread(thread: QThread) -> None:
    global _connected
    app = QCoreApplication.instance()
    if not _connected:
        app.aboutToQuit.connect(shutdown_threads)
        _connected = True
    thread.setParent(app)
    _threads.add(thread)
    thread.finished.connect(lambda: _threads.discard(thread))
    thread.finished.connect(thread.deleteLater)


def shutdown_threads() -> None:
    for thread in list(_threads):
        thread.requestInterruption()
        if hasattr(thread, "cancel"):
            thread.cancel()
    for thread in list(_threads):
        thread.wait()

