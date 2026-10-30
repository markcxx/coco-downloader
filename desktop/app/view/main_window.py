# coding: utf-8
from PyQt5.QtCore import Qt, QSize, QEasingCurve, QFile, QPropertyAnimation, QTextStream
from PyQt5.QtGui import QIcon
from PyQt5.QtWidgets import QApplication, QHBoxLayout, QVBoxLayout, QFrame, QWidget, QLabel

from qfluentwidgets import (NavigationBar, NavigationItemPosition, SplashScreen, isDarkTheme,
                            PopUpAniStackedWidget, InfoBar, InfoBarIcon, InfoBarPosition,
                            IndeterminateProgressRing)
from qfluentwidgets import FluentIcon as FIF
from qframelesswindow import FramelessWindow, TitleBar

from .download_interface import DownloadInterface
from .home_interface import HomeInterface
from .setting_interface import SettingInterface
from ..common.config import cfg
from ..common.icon import Icon
from ..common.setting import APP_LOGO_PATH
from ..common.signal_bus import signalBus
from ..common import resource  # noqa: F401 - registers Qt resources
from ..services.download_service import DownloadService


TITLE_BAR_ICON_SIZE = 28


class StackedWidget(QFrame):

    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.hBoxLayout = QHBoxLayout(self)
        self.view = PopUpAniStackedWidget(self)
        self.opacityAnimation = QPropertyAnimation(self)

        self.hBoxLayout.setContentsMargins(0, 0, 0, 0)
        self.hBoxLayout.addWidget(self.view)

    def addWidget(self, widget):
        self.view.addWidget(widget)

    def widget(self, index: int):
        return self.view.widget(index)

    def setCurrentWidget(self, widget, popOut=False):
        if not popOut:
            self.view.setCurrentWidget(widget, duration=300)
        else:
            self.view.setCurrentWidget(widget, True, False, 200, QEasingCurve.InQuad)

    def setCurrentIndex(self, index, popOut=False):
        self.setCurrentWidget(self.view.widget(index), popOut)



class CustomTitleBar(TitleBar):

    def __init__(self, parent):
        super().__init__(parent)
        self.setFixedHeight(48)
        self.hBoxLayout.removeWidget(self.minBtn)
        self.hBoxLayout.removeWidget(self.maxBtn)
        self.hBoxLayout.removeWidget(self.closeBtn)

        self.iconLabel = QLabel(self)
        self.iconLabel.setFixedSize(TITLE_BAR_ICON_SIZE, TITLE_BAR_ICON_SIZE)
        self.hBoxLayout.insertSpacing(0, 20)
        self.hBoxLayout.insertWidget(1, self.iconLabel, 0, Qt.AlignLeft | Qt.AlignVCenter)
        self.window().windowIconChanged.connect(self.setIcon)

        self.titleLabel = QLabel(self)
        self.hBoxLayout.insertWidget(2, self.titleLabel, 0, Qt.AlignLeft | Qt.AlignVCenter)
        self.titleLabel.setObjectName('titleLabel')
        self.window().windowTitleChanged.connect(self.setTitle)

        self.vBoxLayout = QVBoxLayout()
        self.buttonLayout = QHBoxLayout()
        self.buttonLayout.setSpacing(0)
        self.buttonLayout.setContentsMargins(0, 0, 0, 0)
        self.buttonLayout.setAlignment(Qt.AlignTop)
        self.buttonLayout.addWidget(self.minBtn)
        self.buttonLayout.addWidget(self.maxBtn)
        self.buttonLayout.addWidget(self.closeBtn)
        self.vBoxLayout.addLayout(self.buttonLayout)
        self.vBoxLayout.addStretch(1)
        self.hBoxLayout.addLayout(self.vBoxLayout, 0)

    def setTitle(self, title):
        self.titleLabel.setText(title)
        self.titleLabel.adjustSize()

    def setIcon(self, icon):
        self.iconLabel.setPixmap(QIcon(icon).pixmap(TITLE_BAR_ICON_SIZE, TITLE_BAR_ICON_SIZE))


class MainWindow(FramelessWindow):

    def __init__(self):
        super().__init__()
        self.setTitleBar(CustomTitleBar(self))

        self.mainLayout = QVBoxLayout()
        self.contentLayout = QHBoxLayout()

        self.navigationBar = NavigationBar(self)
        self.stackedWidget = StackedWidget(self)

        self.homeInterface = HomeInterface(self)
        self.downloadInterface = DownloadInterface(self)
        self.settingInterface = SettingInterface(self)
        self.downloadService = DownloadService(self)

        self.initLayout()
        self.initNavigation()
        self.initWindow()
        self.connectSignalToSlot()

    def connectSignalToSlot(self):
        signalBus.micaEnableChanged.connect(lambda x: None)
        signalBus.downloadStarted.connect(self.showDownloadStarted)
        signalBus.downloadFinished.connect(self.showDownloadFinished)
        signalBus.downloadFailed.connect(self.showDownloadFailed)
        self.stackedWidget.view.currentChanged.connect(self.onCurrentInterfaceChanged)
        cfg.themeChanged.connect(self.setQss)

    def initLayout(self):
        centralWidget = QWidget(self)
        centralWidget.setLayout(self.mainLayout)

        self.mainLayout.setSpacing(0)
        self.mainLayout.setContentsMargins(0, 48, 0, 0)

        self.contentLayout.setSpacing(0)
        self.contentLayout.setContentsMargins(0, 0, 0, 0)
        self.contentLayout.addWidget(self.navigationBar)
        self.contentLayout.addWidget(self.stackedWidget)
        self.contentLayout.setStretchFactor(self.stackedWidget, 1)

        self.mainLayout.addLayout(self.contentLayout, 1)

        self.setLayout(self.mainLayout)

    def initNavigation(self):
        self.addSubInterface(
            self.homeInterface,
            FIF.HOME,
            '首页',
            FIF.HOME_FILL
        )

        self.addSubInterface(
            self.downloadInterface,
            FIF.CLOUD_DOWNLOAD,
            '下载任务',
        )

        self.addSubInterface(
            self.settingInterface,
            Icon.SETTINGS,
            self.tr('Settings'),
            Icon.SETTINGS_FILLED,
            NavigationItemPosition.BOTTOM
        )

        self.navigationBar.setCurrentItem(self.homeInterface.objectName())

    def initWindow(self):
        self.resize(1160, 880)
        self.setMinimumWidth(1060)
        self.setWindowIcon(QIcon(APP_LOGO_PATH))
        self.setWindowTitle('Coco Downloader')
        self.titleBar.setAttribute(Qt.WA_StyledBackground)

        self.setQss()

        self.splashScreen = SplashScreen(self.windowIcon(), self)
        self.splashScreen.setIconSize(QSize(106, 106))
        self.splashScreen.raise_()

        desktop = QApplication.primaryScreen().availableGeometry()
        w, h = desktop.width(), desktop.height()
        self.move(w//2 - self.width()//2, h//2 - self.height()//2)
        self.show()
        QApplication.processEvents()

        self.splashScreen.finish()

    def addSubInterface(self, interface, icon, text: str, selectedIcon=None, position=NavigationItemPosition.TOP):
        self.stackedWidget.addWidget(interface)
        self.navigationBar.addItem(
            routeKey=interface.objectName(),
            icon=icon,
            text=text,
            onClick=lambda: self.switchTo(interface),
            selectedIcon=selectedIcon,
            position=position,
        )

    def switchTo(self, widget):
        self.setNormalContentMode()
        self.navigationBar.show()
        self.stackedWidget.setCurrentWidget(widget)

    def onCurrentInterfaceChanged(self, index):
        widget = self.stackedWidget.widget(index)
        self.navigationBar.setCurrentItem(widget.objectName())




    def setNormalContentMode(self):
        self.mainLayout.setContentsMargins(0, 48, 0, 0)
        self.titleBar.setStyleSheet("")


    def showDownloadStarted(self, song_name: str, task_info=None):
        if getattr(task_info, "is_batch", False):
            return

        ring = IndeterminateProgressRing(self)
        ring.setFixedSize(18, 18)
        ring.setStrokeWidth(3)

        bar = InfoBar(
            InfoBarIcon.INFORMATION,
            self.tr("正在下载"),
            song_name or self.tr("正在准备下载任务"),
            orient=Qt.Horizontal,
            isClosable=True,
            duration=2500,
            position=InfoBarPosition.TOP,
            parent=self,
        )
        bar.iconWidget.hide()
        bar.hBoxLayout.insertWidget(0, ring, 0, Qt.AlignVCenter)
        bar.show()

    def showDownloadFinished(self, file_path: str, task_info=None):
        InfoBar.success(
            title=self.tr("下载完成"),
            content=file_path,
            orient=Qt.Horizontal,
            isClosable=True,
            position=InfoBarPosition.TOP,
            duration=4000,
            parent=self,
        )

    def showDownloadFailed(self, message: str, task_info=None):
        InfoBar.error(
            title=self.tr("下载失败"),
            content=message or self.tr("无法下载当前歌曲"),
            orient=Qt.Horizontal,
            isClosable=True,
            position=InfoBarPosition.TOP,
            duration=4000,
            parent=self,
        )

    def setQss(self):
        theme = 'dark' if isDarkTheme() else 'light'
        qss_path = f':/app/qss/{theme}/main_window.qss'
        qss_file = QFile(qss_path)
        if qss_file.open(QFile.ReadOnly | QFile.Text):
            stream = QTextStream(qss_file)
            stream.setCodec('UTF-8')
            self.setStyleSheet(stream.readAll())
            qss_file.close()

    def resizeEvent(self, e):
        super().resizeEvent(e)
        if hasattr(self, 'splashScreen'):
            self.splashScreen.resize(self.size())
