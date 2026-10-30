# coding: utf-8
import sys
from pathlib import Path
from shutil import copy, copytree
from subprocess import run
from sysconfig import get_paths

from app.common.setting import VERSION

APP_ENTRY = "CoCo-downloader.py"
APP_NAME = "CoCo-downloader"
PROJECT_DIR = Path(__file__).resolve().parent
BUILD_DIR = PROJECT_DIR / "build"
DIST_FOLDER = BUILD_DIR / f"{APP_NAME}.dist"
WINDOWS_VERSION = VERSION.lstrip("vV")
QT_PLUGIN_FAMILIES = "sensible"
LOGO_ICON = "app/resource/images/logo/CocoDownloader.ico"
LOGO_PNG = "app/resource/images/logo/CocoDownloader.png"
NUITKA_COMMAND = [sys.executable, "-m", "nuitka"]
GDSTUDIO_PACKAGES = ["--include-package=curl_cffi", "--include-package-data=curl_cffi",
                     "--include-package=certifi", "--include-package-data=certifi"]


def _copy_path(source: Path, target: Path) -> None:
    print(f"Copying `{source}` to `{target}`")
    if source.is_file():
        copy(source, target)
        return
    copytree(source, target, dirs_exist_ok=True)


def _copy_runtime_dependencies() -> None:
    site_packages = Path(get_paths()["purelib"])
    standard_library = Path(get_paths()["stdlib"])

    copied_site_packages: list[str] = []
    copied_standard_packages = ["ctypes"]

    for package_name in copied_site_packages:
        source = site_packages / package_name
        if source.exists():
            _copy_path(source, DIST_FOLDER / source.name)

    for package_name in copied_standard_packages:
        source = standard_library / package_name
        if source.exists():
            _copy_path(source, DIST_FOLDER / source.name)


def _windows_args() -> list[str]:
    return [
        *NUITKA_COMMAND,
        *GDSTUDIO_PACKAGES,
        "--standalone",
        "--windows-console-mode=disable",
        "--assume-yes-for-downloads",
        "--msvc=latest",
        "--jobs=4",
        f"--report={BUILD_DIR / 'compilation-report.xml'}",
        "--plugin-enable=pyqt5",
        f"--include-qt-plugins={QT_PLUGIN_FAMILIES}",
        f"--windows-icon-from-ico={LOGO_ICON}",
        "--windows-file-description=CoCo Downloader",
        "--windows-company-name=markcxx",
        "--windows-product-name=CoCo Downloader",
        f"--windows-product-version={WINDOWS_VERSION}",
        f"--windows-file-version={WINDOWS_VERSION}",
        "--show-progress",
        "--show-memory",
        f"--output-dir={BUILD_DIR}",
        APP_ENTRY,
    ]


def _macos_args() -> list[str]:
    return [
        *NUITKA_COMMAND,
        *GDSTUDIO_PACKAGES,
        "--standalone",
        "--macos-create-app-bundle",
        "--macos-disable-console",
        "--assume-yes-for-downloads",
        "--plugin-enable=pyqt5",
        f"--include-qt-plugins={QT_PLUGIN_FAMILIES}",
        "--show-progress",
        "--show-memory",
        f"--macos-app-version={WINDOWS_VERSION}",
        "--macos-app-name=CoCo-downloader",
        f"--macos-app-icon={LOGO_PNG}",
        "--copyright=markcxx",
        f"--output-dir={BUILD_DIR}",
        APP_ENTRY,
    ]


def _linux_args() -> list[str]:
    return [
        *NUITKA_COMMAND,
        *GDSTUDIO_PACKAGES,
        "--standalone",
        "--assume-yes-for-downloads",
        "--plugin-enable=pyqt5",
        f"--include-qt-plugins={QT_PLUGIN_FAMILIES}",
        "--show-progress",
        "--show-memory",
        f"--output-dir={BUILD_DIR}",
        APP_ENTRY,
    ]


def _build_args() -> list[str]:
    if sys.platform == "win32":
        return _windows_args()
    if sys.platform == "darwin":
        return _macos_args()
    return _linux_args()


def main() -> None:
    args = _build_args()
    run(args, cwd=PROJECT_DIR, check=True)
    if sys.platform != "darwin":
        _copy_runtime_dependencies()


if __name__ == "__main__":
    main()
