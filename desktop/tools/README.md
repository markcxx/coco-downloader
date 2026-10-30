# 桌面开发工具

以下命令均在 `desktop` 目录执行，并使用已安装依赖的虚拟环境。Windows 将 `.venv/bin/python` 替换为 `.\.venv\Scripts\python.exe`。

## 编译 Qt 资源

推荐直接调用 PyQt5 自带的资源编译器：

```bash
.venv/bin/python -m PyQt5.pyrcc_main app/resource/resource.qrc -o app/common/resource.py
```

资源被嵌入生成的 Python 模块。修改图片、QSS 或 `.qrc` 后，重新编译并重启程序。不要手动编辑 `app/common/resource.py`。

`make_compile_script.py` 可以在 `desktop` 目录生成 `compile_resources.bat` 和 `compile_resources.sh`；生成的脚本使用 PATH 中的 `python`，运行前应激活虚拟环境。

```bash
.venv/bin/python tools/make_compile_script.py
```

Qt 资源不能通过 Python 的 `open()` 读取，应使用 Qt API：

```python
from PyQt5.QtCore import QFile, QTextStream
from PyQt5.QtGui import QIcon
from app.common import resource  # 注册编译后的资源

icon = QIcon(":/app/images/logo/CocoDownloader.png")
qss = QFile(":/app/qss/light/song_list_widget.qss")
if qss.open(QFile.ReadOnly | QFile.Text):
    stylesheet = QTextStream(qss).readAll()
    qss.close()
```

## 渠道联网探测

`probe_providers.py` 检查渠道搜索、音频地址解析和少量音频字节，不启动播放器，不保存完整歌曲。探测依赖外部服务，可能因网络或服务限流而失败。

```bash
.venv/bin/python tools/probe_providers.py --provider at38-netease --query 晴天
.venv/bin/python tools/probe_providers.py --only at38-netease at38-qq --output build/provider-probe.json
```

不指定 `--only` 时探测注册表中的所有渠道。仅提供源站入口的渠道不返回音频，不能用音频校验结果判断网盘保存是否成功。该脚本不支持桌面播放验证参数。

## 其他 Qt 工具

```bash
# 将 .ui 编译成 Python
.venv/bin/python -m PyQt5.uic.pyuic input.ui -o output.py

# 从源码更新翻译源文件
.venv/bin/python -m PyQt5.pylupdate_main project.pro
```

项目测试和启动说明见 [desktop/README.md](../README.md)。历史诊断文件见 [diagnostics/README.md](../diagnostics/README.md)。
