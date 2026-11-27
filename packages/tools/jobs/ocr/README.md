# 扫描图像文字识别镜像

`ocr` 镜像用 Tesseract 从扫描图片、收据或标牌照片识别文字，输出可校对、检索或录入应用的纯文本。容器离线运行，每次处理一个图像文件。

## 快速开始

在 Linux 上用非 root 的 Podman。先从仓库根目录执行[共用快速开始](../README.md#quick-start)中的脚本，在当前 Bash 会话准备临时目录、`build_hai_job` 和 `run_hai_job`。本机已有 `localhost/hai-tools-ocr:local` 时可跳过构建。

```bash
build_hai_job ocr
```

## 功能

`ocr.recognize` 的 `input` 是 `/input` 下的 PNG、JPEG 或 TIFF 文件名。`language` 默认是 `eng`，可选 `eng`、`chi_sim`、`jpn`、`eng+chi_sim`、`eng+jpn`。成功时识别结果位于 `data.text`。

<a id="recognize-text"></a>

### 把收据图片转成可校对的文本

准备一张清晰的英文收据图像 `./receipt.png`，或把 `source` 改为自己的文件路径。若手头是扫描 PDF，可在宿主机用 Poppler 的 `pdftoppm -r 150 -f 1 -l 1 -png -singlefile ./receipt.pdf ./receipt` 将第一页转为 `receipt.png`。带文字层的 PDF 可用 [documents 镜像直接提取](../documents/README.md#extract-text)。

```bash
(
  set -eu
  source=./receipt.png
  cp -- "$source" "$hai_job_work/input/receipt.png"
  run_hai_job ocr receipt-text <<'JSON'
{"operation":"ocr.recognize","input":"receipt.png","language":"eng"}
JSON
  jq -er '.data.text | select(length > 0)' "$hai_job_work/receipt-text/response.json" \
    > "$hai_job_work/receipt-text/receipt.txt"
  printf '%s\n' "$hai_job_work/receipt-text/receipt.txt"
)
```

打开 `receipt.txt` 对照图片核对店名、日期、金额后再录入。若用宿主机的 `pdftoppm` 把 [Office 示例发版清单 PDF](../office/README.md#convert-pdf) 转成图片，识别结果应包含 `Release checklist`。处理中文或中英混排的收据时，把 `language` 改为 `chi_sim` 或 `eng+chi_sim`。

## 接入应用

在离线 Runner 环境中声明 `ocr.recognize` 能力，用 `toolsRunner.createJobTools()` 的 `environments.ocr` 指向该环境，再在服务中启用 `ocr_recognize`。调用 `service.invoke()` 时传入 `{ fileId, language: 'eng' }`，`fileId` 是上传图片在应用文件库中的 ID，省略 `language` 时使用英文。宿主通过 `files.read` 按调用者权限读取图片，调用成功后从 `data.text` 获取文字。 [受管作业接入](../../../../docs/usage/function/tools-runner.md#job-tools)

## 失败排查

- 输入文件最多 50 MiB。镜像检查图像文件签名，文件不存在或签名不受支持时返回 `INVALID_INPUT`。
- 语言值不在支持范围时返回 `INVALID_REQUEST`。识别进程上限为 60 秒，超时返回 `TIMEOUT`，文本超过 256 KiB 返回 `OUTPUT_LIMIT`。
- 图片里没有清晰文字时，响应可能成功且 `data.text` 为空。检查图像方向、对比度和语言后，用新的结果目录重试。保留需要的文字后，按[共用清理方式](../README.md#错误处理)清理本次临时目录。

## 许可证

Apache-2.0
