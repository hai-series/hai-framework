# 独立文档、Office、网页与视频工具

这些镜像使用同一个 JSON 协议。工具以非 root 用户执行一次请求，由部署方选择镜像并分配资源。文档、Office 和 OCR 支持通过受管 MCP 作业调用，应用也可直接提交这些作业。网页与视频镜像提供独立作业协议；上层需要登记实际操作及权限后才能开放给用户。远程导航与采集需先验收下文的代理和出网限制。

| 镜像            | 操作                 | 输入与输出                                                                                           |
| --------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `documents`     | `documents.extract`  | TXT、Markdown、CSV、TSV、文本 PDF、DOCX、XLSX → 文本。XLSX 读已有单元格值与缓存，公式重算使用 Office |
| `documents`     | `documents.generate` | 有界 JSON 标题、段落、表格或幻灯片 → 真实 DOCX、XLSX、PPTX；表格文字保持字符串，不执行公式           |
| `office`        | `office.convert`     | DOCX、ODT、XLSX、ODS、PPTX、ODP → PDF                                                                |
| `office`        | `office.recalculate` | XLSX、ODS → 同格式文件。LibreOffice 重新计算公式                                                     |
| `ocr`           | `ocr.recognize`      | PNG、JPEG、TIFF → 文本。可选 `language` 为 `eng`、`chi_sim`、`jpn`、`eng+chi_sim` 或 `eng+jpn`       |
| `browser`       | `browser.navigate`   | 访问受控代理允许的 HTTPS 地址，输出 1280 × 720 PNG。关闭 JavaScript、下载和 Service Worker           |
| `preview_build` | `preview.build`      | 受支持的本地 HTML/JS/TS/CSS/Svelte 项目 ZIP → 自包含 HTML；离线固定工具链，不执行项目脚本或安装依赖  |
| `web_capture`   | `web.capture`        | HTTPS 网页 → 包含来源、正文、截图、品牌颜色与实际素材的 ZIP；固定 HyperFrames 0.9.56，支持动态页面   |
| `video_render`  | `video.render`       | 自包含 HTML 动画项目 ZIP → H.264 MP4；固定 HyperFrames 0.9.56，离线逐帧渲染并用 FFprobe 校验         |

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

### 生成可编辑的 Office 文档

使用 `documents` 镜像。部署侧把已授权的 UTF-8 JSON 文件放入 `/input/source.json`，输入不超过 256 KiB。下面的内容可分别生成带标题、段落和表格的 DOCX、XLSX 或单页 PPTX；选择输出扩展名决定格式。

```json
{
  "title": "工具平台说明",
  "paragraphs": ["工具定义、受管执行与可复用产物。"],
  "table": {
    "headers": ["模块", "用途"],
    "rows": [["Tools", "验证与授权"], ["Runner", "隔离执行"]]
  }
}
```

```json
{ "operation": "documents.generate", "input": "source.json", "output": "report.docx" }
```

将 `output` 改为 `report.xlsx` 或 `report.pptx` 可生成相应文件，成功返回实际 `data.artifact`。XLSX 固定使用 `Report` 工作表，标题、段落和表格依次写入；所有用户文字显式设为字符串，包括以 `=`、`+` 或 `@` 开头的内容。

标题最多 200 字符，段落可省略或最多 100 项、每项 2000 字符；表格必须提供 1～20 个 `headers`，`rows` 可省略或最多 200 行，每行列数与表头一致，单元格最多 2000 字符。输入拒绝未知字段、重复 JSON 字段和 XML 不支持的控制字符。

多页 PPTX 使用 `slides`，每页提供 `title` 和可选的 `paragraphs`、`table`。提供 `slides` 时，顶层只保留文档 `title` 与 `slides`，不要再传顶层段落或表格。最多 20 页；每页标题最多 100 字符，正文最多 6 段、每段 160 字符、合计 800 字符。带表格的页最多 6 列、6 行数据，单元格最多 32 字符，并最多附一段 120 字符的说明，避免生成无法阅读的拥挤页面。

```json
{
  "title": "工具平台",
  "slides": [
    { "title": "一个入口", "paragraphs": ["直接业务和 AI 复用同一工具。"] },
    { "title": "受管执行", "paragraphs": ["Runner 负责容量、隔离与取消。"] }
  ]
}
```

镜像复用 Debian 的 DOCX、XLSX 和 XML/图像支持库，PPTX 使用固定的 `python-pptx` 1.0.2；额外 wheel 及其 SHA-256 在 [requirements.txt](documents/requirements.txt) 维护，构建时校验并安装，运行时不下载依赖。

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

### 构建多文件网页预览

使用可选 `preview_build` 镜像，在 Runner 登记 `preview.build` 能力及 `networkPolicy: offline`，再将环境 ID 传入 `tools.createJobTools` 的 `environments.preview`。Agent 的对应工具名为 `preview_build`，属于 `web` 组；只构建本地项目不需要出网代理。构建方式与其他镜像相同，将 Dockerfile 路径改为 `packages/tools/jobs/preview_build/Dockerfile`。

```json
{ "operation": "preview.build", "input": "project.zip", "output": "preview.html" }
```

ZIP 根目录必须有 `index.html`，允许一个模块入口及其本地 JS/TS/JSX/TSX/JSON、CSS 和 Svelte 浏览器组件。例如 HTML 使用 `<div id="app"></div><script type="module" src="/src/main.ts"></script>`，入口通过固定 `svelte` 运行时的 `mount` 加载本地 `App.svelte`。站点根引用映射到 ZIP 根，不能访问宿主路径。CSS 导入、图片/字体/音视频、本地组件静态 `src/poster` 会内联；动态组件资源先 import，再作为属性使用。组件 `srcset` 等不支持的资源形式明确失败，不发布缺少素材的预览。

固定版本为 esbuild 0.28.2、Svelte 5.57.3、parse5 8.1.0、acorn 8.19.0，使用镜像内的 lockfile 安装并核验。用户项目的 package.json、Vite/Svelte/TypeScript 配置可存在，但一律不执行或采纳；不安装用户依赖，不支持 SvelteKit、任意 npm 裸导入、运行期动态 import 或远程构建素材。`import.meta.env` 只提供固定的生产字段，不支持 `import.meta.url`。归档不要包含 node_modules、Git、环境或凭据点文件。

预览项目展开合计最多 8 MiB，单源码与最终 HTML 各最多 1 MiB，沿用最多 256 个安全归档条目的限制；编译最多 60 秒。建议从 CPU 1 核、内存 512 MiB、PID 128、临时盘 128 MiB 开始实测。成功返回真实 HTML 产物，应用发布为 `kind: html`、`mediaType: text/html`，直接交现有隔离工作台显示。作业结束即销毁构建容器；没有常驻开发服务器或预览网关。修改源码后重新构建得到新产物，构建失败不会发布旧输出；关闭预览卸载 iframe。

### 采集网页正文与制作素材

使用 `web_capture` 镜像。部署代理必须先允许访问目标网站和需要的素材来源。此请求生成 `/output/capture.zip`；其中 `capture.json` 记录原始 `sourceUrl`、标题、正文 `text`、颜色、截图和素材相对路径。成功响应的 `data.summary` 同时返回这些内容，调用方可以直接将来源文本交给后续文案和分镜工具。`capture-status.json` 记录实际 HTTP 状态、缺失素材数量及警告，其他目录保留捕获到的文件。网页正文为空、HTTP 请求失败或没有截图时不发布成功产物。

```json
{ "operation": "web.capture", "url": "https://example.com/", "output": "capture.zip", "maxScreenshots": 4 }
```

`maxScreenshots` 省略时为 4，支持 1～8 个主截图；HyperFrames 还可能生成素材联系表。协议不接受请求级代理、凭据或命令。素材可能因源站限制而缺失，上层应读取状态文件后再决定是否能够完成视频。

打包时仅排除 HyperFrames 自动生成的根 `AGENTS.md`、`CLAUDE.md`、`.cursorrules` 助手指令文件；网页正文、截图、素材和素材缺失报告保留。其他未知点文件仍按原有归档规则拒绝，不会作为素材静默丢弃。

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

`browser.navigate` 保持 JavaScript、下载和 Service Worker 禁用，只对 `page.goto` 首行精确返回当前 URL 的 `net::ERR_NETWORK_CHANGED` 重试一次。两次导航共用最多 20 秒预算，整体使用 40 秒单调截止时间，另为截图保留最多 10 秒及关闭时间；Python 外层仍在 45 秒兜底回收。HTTP 403、沙箱失败、其他网络错误及截图失败不重试。失败时删除本次图片并关闭页面和浏览器，不发布旧图，也不公开原始 stderr。

`web_capture` 复用相同部署代理校验，并将其传给 HyperFrames 自身的受控采集器；它允许页面 JavaScript，必须使用独立的受限容器，不能放进应用主进程。包装固定传入 `HYPERFRAMES_CHROME_SANDBOX=1`，禁止 HyperFrames 在检测到容器后自动关闭 Chromium sandbox；宿主环境的 `=0` 不能覆盖。Runner 使用非 root UID 1000，部署还须允许该用户创建 Chromium 需要的用户命名空间，并在 seccomp/AppArmor 策略中明确允许必要操作。不能通过增加 `CAP_SYS_ADMIN`、关闭整个安全策略或传入 `--no-sandbox` 让验证通过。环境拒绝 Chromium sandbox 时返回 `SANDBOX_UNAVAILABLE`，操作保持失败且不发布产物。

部分 Podman 默认 seccomp 策略在外层容器移除 `CAP_SYS_CHROOT` 后同时拒绝 `chroot` 系统调用，但 Chromium 的嵌套用户命名空间仍需要该调用。应先用实际启动诊断确认原因；若确为这一条件规则，可从当前默认策略复制，只调整 `chroot` 的规则，保留所有其他规则和内核能力检查，再使用标准 `CONTAINERS_CONF_OVERRIDE` 为专用执行节点进程指定 `[containers] seccomp_profile`。不修改宿主全局策略，不授予额外 capability；实际 Runner 作业也必须通过该配置验收，独立探测容器成功不能代替正式执行成功。

采集只对浏览器已启动、导航阶段明确返回 `net::ERR_NETWORK_CHANGED` 的只读请求重试一次；两次尝试及退避共用 170 秒内部截止时间。HTTP 403、沙箱启动失败和其他错误不重试。每次尝试使用独立临时目录，完整成功后原子发布；`capture-status.json` 的 `retries` 只记录固定阶段、错误码和次数，不包含 URL 或原始 stderr。再次导航失败返回 `NAVIGATION_RETRY_FAILED`，外层不会发布失败尝试残留的内容。

`video_render` 使用离线 Runner 环境，其隔离边界是无网络、非 root、只读根文件系统及容器资源限制；不声称所有离线渲染都启用了 Chromium 自身的 sandbox。两者不接收用户指定的程序路径或环境变量；镜像内部校验 HyperFrames 精确版本为 `0.9.56`，关闭自动更新、可选依赖安装和项目 `.env` 读取。生产使用时记录最终镜像 digest，同时固定浏览器、字体与 FFmpeg 的实际版本。

本轮媒体验收采用以下有界起测预算；应在实际站点、画幅和宿主上复测后调整，不能当作所有部署的性能保证：

| 环境              | CPU 核 | 内存 MiB | PID  | 临时盘 MiB | 网络                 |
| ----------------- | ------ | -------- | ---- | ---------- | -------------------- |
| web               | 1      | 1024     | 512  | 512        | internal，经受控代理 |
| video             | 1      | 1536     | 512  | 6144       | offline              |
| 节点 toolCapacity | 2      | 3072     | 1024 | 8192       | 不适用               |

`toolMaxRunning: 1` 可用于先验证串行作业，host 编排使用独立的 default 容量；节点物理预算还须额外覆盖该 host 容量。PID 128 的浏览器起测已出现线程创建失败，不能沿用旧的轻量作业 PID 配额。采集子进程上限 180 秒，渲染子进程上限 300 秒，上层作业期限需要另外留出产物读取与清理时间。这些是工具预算，不会自动修改 Runner 默认配置。

HyperFrames `0.9.56` 在渲染前要求临时目录和输出目录各至少有 1024 MiB 可用空间。含输入文件的 Runner 会把 `scratchMiB` 分给 state、workspace、output 和 tmp，tmp 仅占四分之一；因此视频的 6144 MiB 总临时盘给 tmp 1536 MiB，不等于进程已经占用这些内存。不能把总预算 512 MiB 当成可运行的视频配置，也不跳过工具原有磁盘检查；实际内存占用和输出大小仍须在目标视频上验收。

## 错误处理

校验 `success` 后再读 `data.text` 或 `data.artifact`。输入或输出文件名不合规时返回 `INVALID_REQUEST`。浏览器没有可用的部署代理配置时返回 `NETWORK_POLICY_REQUIRED`，工具子进程失败时返回 `TOOL_FAILED`。容器未返回成功时，宿主丢弃本次工作目录及未确认产物。

媒体作业还会返回 `UNSAFE_PROJECT`（归档不安全或超限）、`INVALID_PROJECT`（合成参数或本地资源不符合要求）、`INVALID_OUTPUT`（捕获或渲染结果不完整）、`OUTPUT_LIMIT`（采集素材超限）、`SANDBOX_UNAVAILABLE`（无法启用远程网页所需的 Chromium sandbox）及 `TIMEOUT`。生成文档时缺少库返回 `ENVIRONMENT_UNAVAILABLE`。取消与进程树回收继续由 Runner 负责。

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
