# 独立文档、Office、网页与视频工具

这些镜像使用同一个 JSON 协议。工具以非 root 用户执行一次请求，由部署方选择镜像并分配资源。文档、Office 和 OCR 支持通过受管 MCP 作业调用，应用也可直接提交这些作业。网页与视频镜像提供独立作业协议；上层需要登记实际操作及权限后才能开放给用户。远程导航与采集需先验收下文的代理和出网限制。

| 镜像           | 操作                 | 输入与输出                                                                                           |
| -------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `documents`    | `documents.extract`  | TXT、Markdown、CSV、TSV、文本 PDF、DOCX、XLSX → 文本。XLSX 读已有单元格值与缓存，公式重算使用 Office |
| `office`       | `office.convert`     | DOCX、ODT、XLSX、ODS、PPTX、ODP → PDF                                                                |
| `office`       | `office.recalculate` | XLSX、ODS → 同格式文件。LibreOffice 重新计算公式                                                     |
| `ocr`          | `ocr.recognize`      | PNG、JPEG、TIFF → 文本。可选 `language` 为 `eng`、`chi_sim`、`jpn`、`eng+chi_sim` 或 `eng+jpn`       |
| `browser`      | `browser.navigate`   | 访问受控代理允许的 HTTPS 地址，输出 1280 × 720 PNG。关闭 JavaScript、下载和 Service Worker           |
| `web_capture`  | `web.capture`        | HTTPS 网页 → 包含来源、正文、截图、品牌颜色与实际素材的 ZIP；固定 HyperFrames 0.9.56，支持动态页面   |
| `video_render` | `video.render`       | 自包含 HTML 动画项目 ZIP → H.264 MP4；固定 HyperFrames 0.9.56，离线逐帧渲染并用 FFprobe 校验         |

## 快速开始

在仓库根目录构建，选择需要的镜像。发布时应为每种镜像独立版本化，并在执行环境中登记产物 digest。

```sh
# 输入 documents 的 Dockerfile 与共用构建目录，输出可由 Podman 启动的本地镜像。
podman build -f packages/tools/jobs/documents/Dockerfile -t localhost/hai-tools-documents:local packages/tools/jobs
```

入口 `/usr/local/bin/hai-tool` 从标准输入读取一个 UTF-8 JSON 对象，在 EOF 后运行。每次请求最多 64 KiB。文件名最多 128 个 ASCII 字符，可用字母、数字、点、下划线和连字符，首字符必须是字母或数字。挂载独立的 `/input` 只读目录和空的 `/output` 目录，UID 1000 必须能够读取输入及写入输出。输入单文件和产物上限 50 MiB，抽取文本上限 256 KiB，文本 PDF 上限 100 页。

文本结果形如 `{"success":true,"data":{"text":"..."}}`。产物结果形如 `{"success":true,"data":{"artifact":{"name":"report.pdf","bytes":1234}}}`。业务失败返回 `success: false` 和稳定的 `error.code`；调用方须检查结果和实际产物。每个进程只处理一个请求，成功后回收工作环境。

## 功能

### 提取文档文字

使用 `documents` 镜像读取 `/input/report.pdf`，文件中已有的文本通过标准输出返回。例如包含单行 `Release checklist` 的文本 PDF 会得到 `data.text` 中的 `Release checklist`。扫描图像交给 OCR。

```json
{ "operation": "documents.extract", "input": "report.pdf" }
```

### 转换 Office 文档与重算公式

使用 `office` 镜像。第一个请求读入 `/input/report.docx`，成功写出 `/output/report.pdf`，返回 `data.artifact.name` 和实际字节数。第二个请求读入 `/input/budget.xlsx`，成功写出 `/output/calculated.xlsx`，重新计算公式缓存并返回同样的产物元数据。两次请求各自启动一个容器。

```json
{ "operation": "office.convert", "input": "report.docx", "output": "report.pdf" }
```

```json
{ "operation": "office.recalculate", "input": "budget.xlsx", "output": "calculated.xlsx" }
```

### 识别扫描图像

使用 `ocr` 镜像。此例识别 `/input/label.png` 中的英文和简体中文，成功返回 `data.text`，如 `Warehouse 仓库`。`language` 省略时使用 `eng`，支持的组合见上表。图像由部署侧按文件授权提供。

```json
{ "operation": "ocr.recognize", "input": "label.png", "language": "eng+chi_sim" }
```

### 从受控网站生成截图

使用 `browser` 镜像。代理允许访问示例地址且页面返回成功时，生成 `/output/page.png`，返回 `data.artifact.name: "page.png"` 和字节数。截图固定为 1280 × 720，应用在交付产物前复核归属。

```json
{ "operation": "browser.navigate", "url": "https://example.com/", "output": "page.png" }
```

### 采集网页正文与制作素材

使用 `web_capture` 镜像。部署代理必须先允许访问目标网站和需要的素材来源。此请求生成 `/output/capture.zip`；其中 `capture.json` 记录原始 `sourceUrl`、标题、正文 `text`、颜色、截图和素材相对路径。`capture-status.json` 记录实际 HTTP 状态、缺失素材数量及警告，其他目录保留捕获到的文件。网页正文为空、HTTP 请求失败或没有截图时不发布成功产物。

```json
{ "operation": "web.capture", "url": "https://example.com/", "output": "capture.zip", "maxScreenshots": 4 }
```

`maxScreenshots` 省略时为 4，支持 1～8 个主截图；HyperFrames 还可能生成素材联系表。协议不接受请求级代理、凭据或命令。素材可能因源站限制而缺失，上层应读取状态文件后再决定是否能够完成视频。

### 渲染真实 HTML 动画视频

使用 `video_render` 镜像。输入 `/input/project.zip` 必须在根目录包含 `index.html`，并携带所引用的本地脚本、图片、字体和音频。根合成元素必须声明 `data-composition-id`、`data-duration`、`data-width`、`data-height`；`data-start` 省略或为 0。项目声明时长大于 0 且不超过 30 秒，宽高为 16～1920 的偶数，总像素不超过 1920 × 1080，支持等像素量的竖屏。静态资源引用必须位于项目内，远程脚本、图片与字体应在采集或准备阶段本地化。

```json
{ "operation": "video.render", "input": "project.zip", "output": "intro.mp4", "fps": 30 }
```

`fps` 省略时为 30，支持 24、25、30。成功后写出 `/output/intro.mp4`，返回实际文件名和字节数。工具调用固定版本 HyperFrames 渲染时间轴，再核验 H.264 视频流、尺寸及实际时长与项目声明一致；不把项目校验通过或任务已启动当作视频生成成功。

项目 ZIP 最多 256 项、解包后合计 100 MiB、单文件 50 MiB；拒绝路径逃逸、符号链接、特殊文件、重复路径和加密条目。容器无外网，不能依靠在项目中安装依赖或动态下载媒体完成渲染。脚本、分镜、语音合成和字幕编排由上层复用 LLM 与 Audio；渲染器只消费已准备的项目。

## 配置

部署时将文件工具连接到无网络的独立作业容器，使用只读根文件系统、受限临时目录、PID/CPU/内存上限。LibreOffice 使用每次新建的 profile，以 UNO 设置禁用宏执行和链接更新，且拒绝包含外部关系、嵌入对象、宏及超限 ZIP 的输入。需要访问外部资源的文档应事先在受控流程中移除这些引用。[LibreOffice 宏执行模式](https://api.libreoffice.org/docs/idl/ref/namespacecom_1_1sun_1_1star_1_1document_1_1MacroExecMode.html) · [文档更新模式](https://api.libreoffice.org/docs/idl/ref/namespacecom_1_1sun_1_1star_1_1document_1_1UpdateDocMode.html)

应用可将文档、Office、OCR 环境登记到 Runner，再在 `mcp.servers` 用 `transport: job` 绑定环境和工具白名单。任务只传授权文件 ID，执行节点通过 `mcpJobFiles` 复核权限后读入对象和暂存产物。Runner 用独立的工具容量领取作业，服务的 `pool.maxRunning` 控制所有执行节点上的并发上限。应用按产物所有者验证下载权限。配置示例见 [MCP 配置](../../../docs/usage/configuration/ai.md#mcp和a2a)。

部署配置可设置 `pool.minReady` 和 `pool.maxTotal`。预热实例为空容器，每次只交给一个作业，完成后销毁。工具实例准备、领取和销毁期间持续占用资源额度。

浏览器镜像要求部署提供 `HAI_TOOL_BROWSER_PROXY=http://<代理的 IPv4 地址>:<端口>`。作业网络必须只允许连接该代理的地址和端口。代理逐个校验 CONNECT 目的地，执行任务授权、DNS/IP、内网限制及重定向和子资源策略。镜像启用 Chromium 沙箱，启动失败时由上层报告环境错误。部署未提供这些边界前保持操作停用。[Chromium 代理规则](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md)

`web_capture` 复用相同部署代理校验，并将其传给 HyperFrames 自身的受控采集器；它允许页面 JavaScript，必须使用独立的受限容器，不能放进应用主进程。`video_render` 使用离线 Runner 环境。两者不接收用户指定的程序路径或环境变量；镜像内部校验 HyperFrames 精确版本为 `0.9.56`，关闭自动更新、可选依赖安装和项目 `.env` 读取。生产使用时记录最终镜像 digest，同时固定浏览器、字体与 FFmpeg 的实际版本。

视频环境建议从 CPU 2 核、内存 2048 MiB、临时盘 2048 MiB、PID 256 开始实测；Runner 节点的工具容量须覆盖这些额度。采集子进程上限 180 秒，渲染子进程上限 300 秒，上层作业期限需要另外留出产物读取与清理时间。这些是工具预算，不会自动修改 Runner 默认配置。

## 错误处理

校验 `success` 后再读 `data.text` 或 `data.artifact`。输入或输出文件名不合规时返回 `INVALID_REQUEST`。浏览器没有可用的部署代理配置时返回 `NETWORK_POLICY_REQUIRED`，工具子进程失败时返回 `TOOL_FAILED`。容器未返回成功时，宿主丢弃本次工作目录及未确认产物。

媒体作业还会返回 `UNSAFE_PROJECT`（归档不安全或超限）、`INVALID_PROJECT`（合成参数或本地资源不符合要求）、`INVALID_OUTPUT`（捕获或渲染结果不完整）、`OUTPUT_LIMIT`（采集素材超限）及 `TIMEOUT`。取消与进程树回收继续由 Runner 负责。

## 开发测试

```sh
python3 -B -m unittest discover -s packages/tools/jobs/tests
```

用已构建的文档和 Office 镜像复测受管工具。测试包含真实的 MCP HTTP 入口、Runner、离线容器以及 PDF 产物提交。

```sh
HAI_TOOL_IMAGE_DOCUMENTS=localhost/hai-tools-documents:local \
HAI_TOOL_IMAGE_OFFICE=localhost/hai-tools-office:local \
pnpm --filter @h-ai/ai exec vitest run tests/ai-mcp-services.test.ts
```

`HAI_TEST_CONTAINER_ENGINE=docker` 可选择 Docker，缺省使用 Podman。构建环境应先明确准备两种镜像。未设置对应镜像时，Vitest 会跳过其真实容器测试。

在根目录构建各镜像后执行只读、禁网的镜像启动检查。

```sh
for kind in documents office ocr browser; do
  podman build -f "packages/tools/jobs/$kind/Dockerfile" -t "localhost/hai-tools-$kind:local" packages/tools/jobs || exit 1
done
HAI_TOOL_IMAGE_DOCUMENTS=localhost/hai-tools-documents:local \
HAI_TOOL_IMAGE_OFFICE=localhost/hai-tools-office:local \
HAI_TOOL_IMAGE_OCR=localhost/hai-tools-ocr:local \
HAI_TOOL_IMAGE_BROWSER=localhost/hai-tools-browser:local \
node packages/tools/jobs/tests/image-smoke.mjs
```

工具验收需用实际镜像补齐代表性输入、输出内容、离线与网络边界。`office` 还需验证宏、链接和外部数据源不会执行，`browser` 需用受控 HTTPS 站点及代理核对最终截图和拒绝访问的场景。单元测试覆盖请求协议、文件范围与上限、文档链接、OCR 参数和浏览器代理前置条件。

网页与视频镜像按需构建：

```sh
podman build -f packages/tools/jobs/web_capture/Dockerfile -t localhost/hai-tools-web-capture:local packages/tools/jobs
podman build -f packages/tools/jobs/video_render/Dockerfile -t localhost/hai-tools-video-render:local packages/tools/jobs
```

Python 媒体协议测试用替换子进程验证产物发布、权限前置、归档与项目限制，不能替代真实媒体验收。真实验收应核对网页内容、截图、缺失素材报告、可播放视频、实际时长和解码后的运动变化，并验证受控网络、取消与资源回收。

## 许可证

Apache-2.0
