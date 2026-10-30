# Python / PyQt 桌面客户端

客户端使用 Python 3.12、PyQt5 和 QFluentWidgets，仅提供音乐搜索和下载。Python 服务层独立保留，不依赖 Web 服务。

## 启动

建议使用 Python 3.12 与 uv。macOS/Linux 在仓库根目录执行：

```bash
uv venv --python 3.12 desktop/.venv
uv pip install --python desktop/.venv/bin/python -r desktop/requirements.txt
cd desktop
.venv/bin/python CoCo-downloader.py
```

Windows 在仓库根目录打开 PowerShell，执行：

```powershell
cd desktop
uv venv --python 3.12
uv pip install --python .venv\Scripts\python.exe -r requirements-lock.txt
.\.venv\Scripts\python.exe CoCo-downloader.py
```

已有环境时直接执行最后一条启动命令。`requirements-lock.txt` 是 Windows 构建清单，包含 `pywin32`；其他系统使用 `requirements.txt`。Windows 打包命令见 [根目录 README](../README.md#windows-打包)。

## 搜索与下载

搜索框采用 QFluentWidgets 的 `DropDownPushButton`、`RoundMenu` 和子菜单选择平台与渠道，保存稳定渠道 ID。两端渠道目录一致，默认使用 GD音乐台。搜索通过所选渠道适配器执行，保留原生歌曲 ID；部分原有适配器内部仍使用平台搜索接口。分页能力由渠道目录声明。

搜索结果继续使用原有的自定义 `QListWidget`、`SongRow` 和样式表，保留字体、悬浮操作、选中效果、行内下载按钮和动画。列表支持多选与加载更多。

桌面端仅提供搜索与下载，不包含播放器、试听、歌单发现、榜单或导入。界面不提供独立的官方曲库搜索模式；Meting、VKeys、90svip、波点等原有渠道及歌词获取能力保留。Web 端另有播放器，不影响桌面端的功能范围。

## 服务接口

| 文件 | 职责 |
| --- | --- |
| `app/services/channels.py` | 平台、渠道、分页和下载方式 |
| `app/services/music_service.py` | 搜索、下载解析、源站入口、歌词 |
| `app/services/lyrics.py` | 独立歌词获取，不提供搜索或音频解析 |
| `app/services/audio.py` | 音频字节签名识别，拒绝错误正文 |
| `app/services/providers/` | 第三方渠道网络和数据适配 |
| `app/services/download_service.py` | 下载队列、进度、取消、临时文件和完成后改名 |

```python
from app.services.music_service import search_music, resolve_item, get_item_lyric

# 网络调用应放在工作线程中。
items = search_music("at38-qq", "关键词", limit=20, offset=0)
if items:
    info = resolve_item(items[0])
    lyric = get_item_lyric(items[0])
```

下载先写唯一 `.part` 文件，完整结束后再改名。取消、断流和长度不符时清理临时文件，并发同名下载不会相互覆盖。扩展名优先依据音频签名确定。明确的下载限制会阻止解析，不自动切换其他渠道。适配器中的 `PlayInfo` 和 `get_play_info` 是既有的音频地址数据类型与解析方法名，在桌面端用于下载，并不启动播放器。

## 验证

```bash
QT_QPA_PLATFORM=offscreen PYTHONPATH=desktop desktop/.venv/bin/python -m unittest discover -s desktop/tests -v
```

Windows PowerShell 使用：

```powershell
$env:QT_QPA_PLATFORM = "offscreen"
$env:PYTHONPATH = "desktop"
.\desktop\.venv\Scripts\python.exe -m unittest discover -s desktop/tests -v
```

测试覆盖渠道目录、原列表交互、分页、搜索工作线程、下载限制、歌词回退、音频签名、取消清理和并发命名。离屏测试不替代原生窗口和安装包验证，也不保证第三方渠道实时在线。旧诊断数据的范围见 [diagnostics/README.md](diagnostics/README.md)。

## Qt 资源

在 `desktop` 目录使用当前虚拟环境编译资源，完成后重启程序：

```bash
.venv/bin/python -m PyQt5.pyrcc_main app/resource/resource.qrc -o app/common/resource.py
```

Windows 将解释器替换为 `.\.venv\Scripts\python.exe`。图片和样式表以 `:/app/...` 路径读取；修改 `.qrc`、图片或 QSS 后，需要同时更新生成的 `app/common/resource.py`。更多工具说明见 [tools/README.md](tools/README.md)。
