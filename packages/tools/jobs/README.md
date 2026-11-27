# Tools 作业镜像

这里提供文档、Office、OCR、网页与视频作业的镜像构建文件。例如，从旧 Word 合同提取正文后导入检索系统，或把 Office 文档转成 PDF 供浏览。终端可以直接处理手头的文件。宿主启动一次性容器，向 `/usr/local/bin/hai-tool` 的标准输入提交一条 JSON 请求，再从标准输出读取 JSON 响应。宿主负责检查权限、准备输入输出目录、等待容器退出、核对业务结果和清理临时文件。远程导航与采集需先验收下文的代理和出网限制。 [从 Word 合同提取正文](#extract-contract-text)

若应用需要保存回执并交给执行节点领取任务，用 `@h-ai/tools-runner` 的 `toolsRunner.createJobTools()` 将相同镜像登记为受管工具。适配器按宿主授权读取文件，将相同的 JSON 请求交给镜像内的 `hai-tool`，由 Runner 管理容器启动和清理。例如直接运行时请求操作 `documents.extract`，受管目录中的对应工具名是 `documents_extract`。 [应用接入示例](../../../docs/usage/function/tools-runner.md#managed-job-example)

<a id="job-images"></a>

## 镜像清单

| 镜像与使用手册                                        | 操作                 | 输入与输出                                                                                                  |
| ----------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`documents`](documents/README.md#extract-text)       | `documents.extract`  | TXT、Markdown、CSV、TSV、文本 PDF、DOCX、XLSX → 文本。XLSX 读已有单元格值与缓存，公式重算使用 Office        |
| [`documents`](documents/README.md#generate-documents) | `documents.generate` | 有界 JSON 标题、段落、表格或幻灯片 → DOCX、XLSX、PPTX。表格文字保持字符串                                   |
| [`office`](office/README.md#convert-pdf)              | `office.convert`     | DOCX、ODT、XLSX、ODS、PPTX、ODP → PDF                                                                       |
| [`office`](office/README.md#recalculate-spreadsheet)  | `office.recalculate` | XLSX、ODS → 同格式文件。LibreOffice 重新计算公式                                                            |
| [`ocr`](ocr/README.md)                                | `ocr.recognize`      | PNG、JPEG、TIFF → 文本。可选 `language` 为 `eng`、`chi_sim`、`jpn`、`eng+chi_sim` 或 `eng+jpn`              |
| [`browser`](browser/README.md)                        | `browser.navigate`   | 访问受控代理允许的 HTTPS 地址，输出 1280 × 720 PNG。页面以禁用 JavaScript、下载和 Service Worker 的方式加载 |
| [`preview_build`](preview_build/README.md)            | `preview.build`      | 受支持的本地 HTML/JS/TS/CSS/Svelte 项目 ZIP → 自包含 HTML。使用固定的离线工具链                             |
| [`web_capture`](web_capture/README.md)                | `web.capture`        | HTTPS 网页 → 包含来源、正文、截图、品牌颜色与素材的 ZIP。固定 HyperFrames 0.9.56，支持动态页面              |
| [`video_render`](video_render/README.md)              | `video.render`       | 自包含 HTML 动画项目 ZIP → H.264 MP4。固定 HyperFrames 0.9.56，离线逐帧渲染并用 FFprobe 校验                |

<a id="quick-start"></a>

## 快速开始

每个镜像的入口 `/usr/local/bin/hai-tool` 在收到 EOF 后处理一个 UTF-8 JSON 请求，向 stdout 写一行 JSON 响应。容器运行器或宿主适配均可复用该协议。将授权文件挂到只读的 `/input`，将空目录挂到可写的 `/output`，确保容器内 UID 1000 能读取输入并写入输出。请求只传文件名，最多 128 个 ASCII 字符，首字符必须是字母或数字，其余可用字母、数字、点、下划线和连字符。

请求最多 64 KiB，输入单文件和产物最多 50 MiB，抽取文本最多 256 KiB。文本响应的内容在 `data.text`，文件响应的 `data.artifact` 包含 `name` 和 `bytes`。容器退出码为 0 时，也要读 `success` 判断业务是否成功。只有成功响应所指的实际文件才可交付。

下面的两个函数供各作业示例复用。`build_hai_job documents` 按 Dockerfile 构建一个本地镜像。`run_hai_job documents extract` 从标准输入接收一条请求，用该镜像执行一次。`extract` 是本机结果目录名，具体要执行的操作由 JSON 的 `operation` 字段决定。

在 Linux 上使用 rootless Podman、Bash 与 `jq`，从仓库根目录在同一个 Bash 会话中定义两个函数，再到对应章节执行。准备表格和 ZIP 需要 Python 3。从 PDF 制作 OCR 输入需要 Poppler 的 `pdftoppm`。若使用 npm 安装的 `@h-ai/tools`，将 `build_hai_job()` 中的两处 `packages/tools/jobs` 替换为应用项目下的 `node_modules/@h-ai/tools/jobs`，使用整个目录作为构建上下文。构建需要访问 Dockerfile 的依赖来源，运行使用已构建镜像。生产部署时固定执行镜像的 digest。

```bash
hai_job_work="$(mktemp -d)"
mkdir "$hai_job_work/input"

build_hai_job() {
  local kind="$1"
  podman build -f "packages/tools/jobs/$kind/Dockerfile" \
    -t "localhost/hai-tools-$kind:local" packages/tools/jobs
}

run_hai_job() {
  local kind="$1" job_dir="$hai_job_work/$2"
  local network=none memory=512m pids=128 scratch=128m
  local -a proxy=()

  case "$kind" in
    browser|web_capture)
      network="${HAI_JOB_NETWORK:-}"
      if [[ -z "$network" || -z "${HAI_TOOL_BROWSER_PROXY:-}" ]]; then
        printf '%s\n' 'Set HAI_JOB_NETWORK and HAI_TOOL_BROWSER_PROXY first.' >&2
        return 1
      fi
      if [[ "$(podman network inspect --format '{{.Internal}}' "$network")" != true ]]; then
        printf '%s\n' 'The job needs a deployment-controlled internal Podman network.' >&2
        return 1
      fi
      proxy=(--env "HAI_TOOL_BROWSER_PROXY=$HAI_TOOL_BROWSER_PROXY")
      memory=1024m pids=512 scratch=512m
      ;;
    video_render)
      memory=1536m pids=512 scratch=1536m
      ;;
  esac

  mkdir "$job_dir" && mkdir "$job_dir/output" || return
  podman run --rm --pull=never -i --userns=keep-id:uid=1000,gid=1000 \
    --network="$network" --http-proxy=false "${proxy[@]}" \
    --read-only --read-only-tmpfs=false --cap-drop=all --security-opt=no-new-privileges \
    --cpus=1 --memory="$memory" --memory-swap="$memory" --pids-limit="$pids" \
    --tmpfs "/tmp:rw,nosuid,nodev,size=$scratch" \
    -v "$hai_job_work/input:/input:ro,Z" -v "$job_dir/output:/output:rw,Z" \
    "localhost/hai-tools-$kind:local" > "$job_dir/response.json" || return
  jq . "$job_dir/response.json" &&
    jq -e '.success == true' "$job_dir/response.json" >/dev/null
}
```

在本次结果目录查看 `response.json` 和 `output/`。对文件响应，核对 `data.artifact.name` 对应的文件实际存在，且 `wc -c` 读到的长度与 `data.artifact.bytes` 相同。重试时换一个目录名，避免把先前文件当成本次结果。

<a id="job-operations"></a>

## 功能

<a id="extract-contract-text"></a>

### 提取文档文字

采购部门要把原有 Word 合同导入全文检索系统。可以先在终端挑一份合同试跑，确认付款、交付等条款提取完整后，再把导出的纯文本交给索引程序。镜像负责解析 Word 文档并返回正文，应用或导入程序负责保存索引。

先完成本页快速开始里的目录和函数准备。在仓库根目录运行下面的命令，把 `contract` 改成本机已有 Word 合同的路径。本机已有 `localhost/hai-tools-documents:local` 时，可跳过 `build_hai_job documents`。

```bash
(
  set -eu
  build_hai_job documents
  contract=./supplier-contract.docx
  cp -- "$contract" "$hai_job_work/input/supplier-contract.docx"
  run_hai_job documents contract-text <<'JSON'
{"operation":"documents.extract","input":"supplier-contract.docx"}
JSON
  jq -er '.data.text | select(length > 0)' "$hai_job_work/contract-text/response.json" \
    > "$hai_job_work/contract-text/supplier-contract.txt"
)
```

命令成功后，打开 `$hai_job_work/contract-text/supplier-contract.txt` 核对合同条款，再交给全文检索或摘要程序。也可处理有文字层的 PDF，把本地复制和请求中的文件名都改为对应的 `.pdf`，最多 100 页。扫描图像交给 [OCR](#识别扫描图像)。

### 生成可编辑的 Office 文档

复用上一节的 `documents` 镜像。如果从本节开始，先执行 `build_hai_job documents`。创建不超过 256 KiB 的 UTF-8 JSON 输入，再用同一份内容生成 Word 文档、Excel 工作簿和单页演示文稿。输出扩展名决定格式。

```bash
cat > "$hai_job_work/input/source.json" <<'JSON'
{
  "title": "Release checklist",
  "table": {
    "headers": ["Step", "Owner"],
    "rows": [["Build", "Tools"], ["Review", "Runner"]]
  }
}
JSON

for format in docx xlsx pptx; do
  jq -nc --arg output "report.$format" \
    '{operation:"documents.generate",input:"source.json",output:$output}' |
    run_hai_job documents "generate-$format" || break
  ls -l "$hai_job_work/generate-$format/output/report.$format"
done
```

使用对应 Office 应用打开任一输出文件，可查看标题和两行表格。XLSX 固定使用 `Report` 工作表，标题、段落和表格依次写入。所有用户文字显式设为字符串，包括以 `=`、`+` 或 `@` 开头的内容。

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

#### 转为 PDF

将上一节的 DOCX 复制到输入目录，也可使用自己的受支持 Office 文件。打开输出的 PDF，应看到原文档的标题与表格。

```bash
build_hai_job office
cp "$hai_job_work/generate-docx/output/report.docx" "$hai_job_work/input/report.docx"
run_hai_job office convert <<'JSON'
{"operation":"office.convert","input":"report.docx","output":"report.pdf"}
JSON
file "$hai_job_work/convert/output/report.pdf"
```

#### 重算表格公式

复用已经构建的 `office` 和 `documents` 镜像。下面用 Python 标准库和前面生成的 XLSX 创建 `budget.xlsx`，把第一行的 A1、B1 设置为数字 `2` 和 `3`，C1 保存公式 `=A1+B1`，暂不填充计算值。也可以把自行创建的表格放到输入目录。XLSX 和 ODS 的输出扩展名须与输入一致。

```bash
python3 - "$hai_job_work/generate-xlsx/output/report.xlsx" "$hai_job_work/input/budget.xlsx" <<'PY'
from sys import argv
from zipfile import ZIP_DEFLATED, ZipFile

sheet_name = "xl/worksheets/sheet1.xml"
sheet = """<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1">
    <c r="A1"><v>2</v></c>
    <c r="B1"><v>3</v></c>
    <c r="C1"><f>A1+B1</f></c>
  </row></sheetData>
</worksheet>"""
with ZipFile(argv[1]) as template, ZipFile(argv[2], "w", compression=ZIP_DEFLATED) as budget:
    for name in template.namelist():
        budget.writestr(name, sheet if name == sheet_name else template.read(name))
PY
run_hai_job office recalculate <<'JSON'
{"operation":"office.recalculate","input":"budget.xlsx","output":"calculated.xlsx"}
JSON
cp "$hai_job_work/recalculate/output/calculated.xlsx" "$hai_job_work/input/calculated.xlsx"
run_hai_job documents read-calculated <<'JSON'
{"operation":"documents.extract","input":"calculated.xlsx"}
JSON
jq -er '.data.text' "$hai_job_work/read-calculated/response.json"
```

最后一行数据依次是 `2`、`3` 和已经写入工作簿的计算值 `5`。用表格应用打开 `calculated.xlsx` 也能查看公式与结果。

### 识别扫描图像

用宿主机的 Poppler `pdftoppm` 把上例 PDF 的第一页转成 PNG，也可以把自己拍摄的清晰标牌 PNG 放到同一输入位置。示例识别英文，其他语言用表中支持的 `language` 值。

```bash
build_hai_job ocr
pdftoppm -r 150 -f 1 -l 1 -png -singlefile \
  "$hai_job_work/convert/output/report.pdf" "$hai_job_work/input/label"
run_hai_job ocr recognize <<'JSON'
{"operation":"ocr.recognize","input":"label.png","language":"eng"}
JSON
jq -er '.data.text' "$hai_job_work/recognize/response.json"
```

使用生成的图像时，返回的文字应包含 `Release checklist`。其他文字和换行取决于图像和 OCR 识别结果。

### 从受控网站生成截图

使用 `browser` 镜像。代理允许访问示例地址且页面返回成功时，生成 `/output/page.png`，返回 `data.artifact.name: "page.png"` 和字节数。截图固定为 1280 × 720，应用在交付产物前复核归属。

`browser.navigate` 和 `web.capture` 的原始地址最多 2048 个 Unicode 字符。地址使用 HTTPS 和 ASCII DNS 域名，端口省略或为 443。地址中禁止凭据、ASCII 空格、C0 控制字符和反斜杠，域名不得以 `localhost`、`local`、`internal`、`test` 或 `invalid` 为后缀。工具服务在排队前校验，镜像入口按相同规则复核。

先完成[出网代理和浏览器沙箱配置](#配置)。终端会提示输入已配置的内部 Podman 网络、HTTP IPv4 代理和代理允许的 HTTPS 地址，例如部署策略允许时可用 `https://example.com/`。截图和网页采集共用这些变量。

```bash
build_hai_job browser
read -r -p 'Podman 内部网络名: ' HAI_JOB_NETWORK
read -r -p 'HTTP 代理（IPv4 和端口）: ' HAI_TOOL_BROWSER_PROXY
read -r -p '代理允许访问的 HTTPS URL: ' hai_page_url

jq -nc --arg url "$hai_page_url" \
  '{operation:"browser.navigate",url:$url,output:"page.png"}' |
  run_hai_job browser screenshot
file "$hai_job_work/screenshot/output/page.png"
```

用图像查看器打开 `page.png`。对于通过代理正常访问的页面，`file` 会显示 1280 × 720 的 PNG 图像。

### 构建多文件网页预览

用 Python 标准库的 `zipfile` 创建带 HTML 和 JavaScript 入口的示例 ZIP，再用 `preview.build` 生成一个自包含的 HTML 文件。

```bash
build_hai_job preview_build
mkdir "$hai_job_work/site"
cat > "$hai_job_work/site/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Release checklist</title>
<main id="app"></main>
<script type="module" src="./main.js"></script>
</html>
HTML
cat > "$hai_job_work/site/main.js" <<'JS'
document.querySelector('#app').textContent = 'Release checklist'
JS
(
  cd "$hai_job_work/site" &&
    python3 -m zipfile -c "$hai_job_work/input/site.zip" index.html main.js
)
run_hai_job preview_build preview <<'JSON'
{"operation":"preview.build","input":"site.zip","output":"preview.html"}
JSON
ls -l "$hai_job_work/preview/output/preview.html"
```

在浏览器中打开自己刚生成的 `preview.html`，页面显示 `Release checklist`。应用内接入时在 Runner 登记 `preview.build` 能力及 `networkPolicy: offline`，再将环境 ID 传给 `toolsRunner.createJobTools()` 的 `environments.preview`。Agent 工具名为 `preview_build`，属于 `web` 组。 [应用内项目预览](../../../docs/usage/function/tools-runner.md#web-preview)

ZIP 根目录必须有 `index.html`，允许一个模块入口及其本地 JS/TS/JSX/TSX/JSON、CSS 和 Svelte 浏览器组件。例如 HTML 使用 `<div id="app"></div><script type="module" src="/src/main.ts"></script>`，入口通过固定 `svelte` 运行时的 `mount` 加载本地 `App.svelte`。站点根引用映射到 ZIP 根，不能访问宿主路径。CSS 导入、图片/字体/音视频、本地组件静态 `src/poster` 会内联；动态组件资源先 import，再作为属性使用。组件 `srcset` 等不支持的资源形式明确失败，不发布缺少素材的预览。

固定版本为 esbuild 0.28.2、Svelte 5.57.3、parse5 8.1.0、acorn 8.19.0，使用镜像内的 lockfile 安装并核验。用户项目的 package.json、Vite/Svelte/TypeScript 配置可存在，但一律不执行或采纳；不安装用户依赖，不支持 SvelteKit、任意 npm 裸导入、运行期动态 import 或远程构建素材。`import.meta.env` 只提供固定的生产字段，不支持 `import.meta.url`。归档不要包含 node_modules、Git、环境或凭据点文件。

预览项目展开合计最多 8 MiB，单源码与最终 HTML 各最多 1 MiB，沿用最多 256 个安全归档条目的限制；编译最多 60 秒。建议从 CPU 1 核、内存 512 MiB、PID 128、临时盘 128 MiB 开始实测。成功返回真实 HTML 产物，应用发布为 `kind: html`、`mediaType: text/html`，直接交现有隔离工作台显示。作业结束即销毁构建容器；没有常驻开发服务器或预览网关。修改源码后重新构建得到新产物，构建失败不会发布旧输出；关闭预览卸载 iframe。

### 采集网页正文与制作素材

使用 `web_capture` 镜像。部署代理必须先允许访问目标网站和需要的素材来源。此请求生成 `/output/capture.zip`；其中 `capture.json` 记录原始 `sourceUrl`、标题、正文 `text`、颜色、截图和素材相对路径。成功响应的 `data.summary` 同时返回这些内容，调用方可以直接将来源文本交给后续文案和分镜工具。`capture-status.json` 记录实际 HTTP 状态、缺失素材数量及警告，其他目录保留捕获到的文件。网页正文为空、HTTP 请求失败或没有截图时不发布成功产物。

复用截图示例中输入的网络、代理和 URL。也可以用 `read` 重新设置这三个值。选择代理已批准并且包含可见正文的站点。

```bash
build_hai_job web_capture
jq -nc --arg url "$hai_page_url" \
  '{operation:"web.capture",url:$url,output:"capture.zip",maxScreenshots:4}' |
  run_hai_job web_capture capture

unzip -l "$hai_job_work/capture/output/capture.zip"
unzip -p "$hai_job_work/capture/output/capture.zip" capture.json |
  jq '{sourceUrl,title,text,screenshots}'
unzip -p "$hai_job_work/capture/output/capture.zip" capture-status.json | jq .
```

`maxScreenshots` 省略时为 4，支持 1～8 个主截图；HyperFrames 还可能生成素材联系表。协议不接受请求级代理、凭据或命令。素材可能因源站限制而缺失，上层应读取状态文件后再决定是否能够完成视频。

打包时仅排除 HyperFrames 自动生成的根 `AGENTS.md`、`CLAUDE.md`、`.cursorrules` 助手指令文件；网页正文、截图、素材和素材缺失报告保留。其他未知点文件仍按原有归档规则拒绝，不会作为素材静默丢弃。

### 渲染真实 HTML 动画视频

使用 `video_render` 镜像。输入 `/input/project.zip` 必须在根目录包含 `index.html`，并携带所引用的本地脚本、图片、字体和音频。根合成元素必须声明 `data-composition-id`、`data-duration`、`data-width`、`data-height`；`data-start` 省略或为 0。项目声明时长大于 0 且不超过 30 秒，宽高为 16～1920 的偶数，总像素不超过 1920 × 1080，支持等像素量的竖屏。静态资源引用必须位于项目内，远程脚本、图片与字体应在采集或准备阶段本地化。

下面创建一个完全本地的两秒标题动画。ZIP 中直接放置 `index.html`，无需先运行网页采集。

```bash
build_hai_job video_render
mkdir "$hai_job_work/video"
cat > "$hai_job_work/video/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Release checklist</title>
<style>
  html, body { margin: 0; }
  main { width: 640px; height: 360px; background: #172554; color: white; }
  section { display: grid; place-items: center; width: 100%; height: 100%; }
  h1 { font: bold 42px sans-serif; animation: rise 1.5s ease-out both; }
  @keyframes rise {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
</head>
<body>
<main data-composition-id="intro" data-start="0" data-duration="2"
      data-width="640" data-height="360" data-no-timeline>
  <section id="title" data-start="0" data-duration="2" data-track-index="0">
    <h1>Release checklist</h1>
  </section>
</main>
</body>
</html>
HTML
(
  cd "$hai_job_work/video" &&
    python3 -m zipfile -c "$hai_job_work/input/intro.zip" index.html
)
run_hai_job video_render render <<'JSON'
{"operation":"video.render","input":"intro.zip","output":"intro.mp4","fps":30}
JSON
ls -l "$hai_job_work/render/output/intro.mp4"
```

用播放器打开 `intro.mp4`，应看到标题渐入并上移。也可用宿主机的 `ffprobe` 核对 H.264、640 × 360 和约两秒时长。

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height:format=duration \
  -of json "$hai_job_work/render/output/intro.mp4"
```

这个示例把 `/tmp` 配额设置为 1536 MiB，宿主文件系统上的 `output/` 也须至少有 1024 MiB 可用空间。Runner 部署的预算详见[配置](#配置)。

`fps` 省略时为 30，支持 24、25、30。镜像用固定版本 HyperFrames 渲染，再核验 H.264 视频流、尺寸及实际时长与项目声明一致后返回产物元数据。

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

下例请求一个不存在的输入文件。已构建 `documents` 镜像时，工具返回 `success: false`，调用函数打印响应并返回非零状态。

```bash
if ! run_hai_job documents missing-input <<'JSON'
{"operation":"documents.extract","input":"missing.txt"}
JSON
then
  jq -er '.error.code' "$hai_job_work/missing-input/response.json"
fi
```

预期错误码为 `INVALID_INPUT`。请求结构不合规返回 `INVALID_REQUEST`，输出文件名无效或已存在返回 `INVALID_OUTPUT`。代理不可用时返回 `NETWORK_POLICY_REQUIRED`，工具子进程失败通常返回 `TOOL_FAILED`。容器启动失败可能没有 JSON 响应，此时查看 Podman 的退出状态和 stderr。

媒体作业还会返回 `UNSAFE_PROJECT`（归档不安全或超限）、`INVALID_PROJECT`（合成参数或本地资源不符合要求）、`INVALID_OUTPUT`（捕获或渲染结果不完整）、`OUTPUT_LIMIT`（采集素材超限）、`SANDBOX_UNAVAILABLE`（无法启用远程网页所需的 Chromium sandbox）及 `TIMEOUT`。生成文档时缺少库返回 `ENVIRONMENT_UNAVAILABLE`。取消与进程树回收继续由 Runner 负责。

独立示例通过 `podman run --rm` 回收退出的容器。将需要保留的成功产物复制到正式目录后，清理本次示例的临时目录。失败时从新目录重试。

```bash
rm -rf -- "${hai_job_work:?}"
```

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
