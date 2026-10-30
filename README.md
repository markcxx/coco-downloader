<div align="center">
  <img src="desktop/app/resource/images/logo/CocoDownloader.png" alt="CoCo Downloader Logo" width="112" height="112" />
  <h1>CoCo Downloader</h1>
  <p>音乐搜索与下载工具，提供 Web 和 Python/PyQt 桌面客户端。</p>

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-149eca)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![PyQt5](https://img.shields.io/badge/PyQt5-Desktop-41cd52)
![QFluentWidgets](https://img.shields.io/badge/QFluentWidgets-UI-0078d4)
![License](https://img.shields.io/badge/License-MIT-green)

[下载桌面客户端](https://github.com/markcxx/coco-downloader/releases)

</div>

## 功能介绍

### Web 端

- **歌曲搜索**：按平台与第三方渠道搜索，支持结果筛选、分页和多选。
- **音乐下载**：单曲下载、批量下载、音质选择和任务管理，具体能力随渠道而定。
- **主题切换**：支持浅色与深色主题。
- **在线播放**：播放/暂停、上下曲、进度与音量、播放模式及全屏歌词。
- 不包含发现歌单、排行榜和歌单导入。

### 桌面端

- 使用 QFluentWidgets 级联菜单选择平台及渠道，保留自定义搜索结果列表。
- 支持搜索、分页、单曲与批量下载、音质选择和任务管理。
- 支持下载目录、文件命名规则、主题与配置保存。
- 独立 Python 服务层，仅提供搜索下载，不包含播放器。
- 支持 Nuitka 打包和 Windows Inno Setup 安装包构建。

## 平台与渠道

| 音乐平台 | 渠道 |
| --- | --- |
| 网易云音乐 | Meting、GD音乐台、51ape、煎饼 |
| QQ 音乐 | VKeys、51ape、煎饼 |
| 酷狗音乐 | 煎饼、90svip |
| 酷我音乐 | 波点 · 天宝、米兔（QQMP3）、煎饼、歌曲海、歌曲客、力音 · 网盘下载 |

两端按所选渠道执行搜索与解析，保留上表中各渠道的原有实现。部分渠道内部直接请求音乐平台的搜索接口；界面不提供独立的“官方曲库搜索”模式。默认渠道为 GD音乐台。

渠道的可用音质、分页和下载方式有所不同。Web 中标注“浏览器下载”的渠道需逐首交给浏览器处理；力音仅提供源站网盘入口。PyQt 可对返回音频直链的渠道进行批量下载，源站入口仍需逐首操作。渠道可用性以服务实际状态为准。

## 快速开始

### Web 开发

使用 Node.js 20.9 或更高版本，在项目根目录执行：

```bash
npm ci
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

生产环境运行：

```bash
npm run build
npm run start
```

### Docker 部署

使用仓库提供的 Compose 配置：

```bash
docker compose up -d
```

默认使用 `markcxx/coco-downloader:latest` 镜像并监听 `3000` 端口，可通过 `PORT` 环境变量调整端口。

### 桌面端开发

使用 Python 3.12 与 uv。首次配置环境时，在项目根目录打开 PowerShell，执行：

```powershell
cd desktop
uv venv --python 3.12
uv pip install -r requirements-lock.txt
```

已有环境时，在 `desktop` 目录直接启动：

```powershell
.\.venv\Scripts\python.exe CoCo-downloader.py
```

修改 Qt 资源后，在同一目录重新生成资源文件：

```powershell
.\.venv\Scripts\python.exe -m PyQt5.pyrcc_main app/resource/resource.qrc -o app/common/resource.py
```

macOS/Linux 使用普通依赖清单创建环境，在项目根目录执行：

```bash
uv venv --python 3.12 desktop/.venv
uv pip install --python desktop/.venv/bin/python -r desktop/requirements.txt
cd desktop
.venv/bin/python CoCo-downloader.py
```

桌面服务接口、资源编译和测试说明见 [desktop/README.md](desktop/README.md)。

### Windows 打包

安装 Visual Studio C++ Build Tools 与 Inno Setup，在 `desktop` 目录执行 Nuitka 打包脚本：

```powershell
.\.venv\Scripts\python.exe deploy.py
```

程序输出到 `desktop/build/CoCo-downloader.dist/`。随后用 Inno Setup 打开并编译 `desktop/CoCo-downloader.iss`，安装包输出到 `desktop/dist/`。

安装包版本可通过 `APP_VERSION` 环境变量设置，应与桌面程序版本保持一致。

## 项目结构

```text
coco-downloader/
├─ src/
│  ├─ app/                  # Web 页面与 API 路由
│  ├─ components/           # 共用界面组件
│  ├─ hooks/                # Web 播放状态与音频生命周期
│  ├─ lib/
│  │  ├─ providers/         # 搜索与音频解析渠道
│  │  └─ lyrics/            # 独立歌词获取
│  └─ types/                # TypeScript 类型定义
├─ desktop/
│  ├─ CoCo-downloader.py    # 桌面程序入口
│  ├─ app/                  # 桌面界面、服务、配置与资源
│  ├─ deploy.py             # Nuitka 打包脚本
│  └─ CoCo-downloader.iss   # Inno Setup 安装脚本
├─ tests/                   # Web 接口与播放队列测试
├─ Dockerfile
├─ docker-compose.yml
└─ package.json
```

## 验证

在仓库根目录执行：

```bash
npm run lint
npm test
npm run build
npx tsc --noEmit
```

Python 测试命令见 [桌面端文档](desktop/README.md#验证)。测试通过不代表第三方渠道实时可用；需要联网诊断时，可按 [工具说明](desktop/tools/README.md) 单独运行探测。

## Web 接口

| 路由 | 用途 |
| --- | --- |
| `GET /api/search` | 使用 `q`、`provider`、`limit`、`offset` 搜索所选渠道 |
| `GET /api/url` | 获取播放地址，接收 `id`、`provider` 和 JSON 编码的 `extra` |
| `GET /api/download` | 获取下载地址或源站入口，音频由用户浏览器获取 |
| `GET /api/lyric` | 获取歌词，歌词失败不影响播放或下载 |
| `GET /api/jbsou/asset` | 煎饼渠道的图片资源适配 |

搜索结果保留渠道原生 ID。播放与下载直接交给对应渠道解析，不提供歌单发现、榜单、分享链接导入或跨渠道歌曲身份转换。

## 技术栈

| 部分 | 主要技术 |
| --- | --- |
| Web | Next.js、React、TypeScript、Tailwind CSS、Ant Design、Framer Motion |
| 桌面端 | Python、PyQt5、QFluentWidgets、PyQt5-Frameless-Window |
| 构建与部署 | Docker、Nuitka、Inno Setup |

## 致谢

- [QFluentWidgets](https://github.com/zhiyiYo/PyQt-Fluent-Widgets)：桌面端 Fluent Design 界面组件。
- [musicdl](https://github.com/CharlesPikachu/musicdl)：部分接口实现参考。
- [LINUX DO](https://linux.do/)：社区支持与帮助。

## 使用说明

音乐内容来自第三方服务，本项目不存储音乐文件。请遵守相关平台规则，尊重音乐版权并支持正版音乐。

## 许可证

本项目使用 MIT License。
