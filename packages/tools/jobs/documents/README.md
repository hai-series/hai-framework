# 文档提取与生成镜像

`documents` 镜像可以从合同、报告或工作表提取纯文本，也可以用结构化内容生成可编辑的 Word、Excel 和 PowerPoint 文件。容器离线运行，每次处理一条请求。

## 快速开始

在 Linux 上用非 root 的 Podman。先从仓库根目录执行[共用快速开始](../README.md#quick-start)中的脚本，在当前 Bash 会话准备临时目录、`build_hai_job` 和 `run_hai_job`。本机已有 `localhost/hai-tools-documents:local` 时可跳过构建。

```bash
build_hai_job documents
```

## 功能

| 操作                 | 输入                                                                | 成功结果                                                              |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `documents.extract`  | `/input` 里的 TXT、Markdown、CSV、TSV、带文字层的 PDF、DOCX 或 XLSX | `data.text` 中的 UTF-8 纯文本                                         |
| `documents.generate` | `/input` 里的 UTF-8 JSON 规格和输出文件名                           | `/output` 中的 DOCX、XLSX 或 PPTX。`data.artifact` 返回文件名和字节数 |

<a id="generate-documents"></a>

### 生成可编辑的发版清单

把同一份发版清单保存成三种格式。`input` 指向装有标题、段落和表格的 JSON 文件，`output` 的扩展名决定生成格式。

```bash
cat > "$hai_job_work/input/release-source.json" <<'JSON'
{
  "title": "Release checklist",
  "paragraphs": ["Review security updates before publishing."],
  "table": {
    "headers": ["Step", "Owner"],
    "rows": [["Build", "Tools"], ["Review", "Runner"]]
  }
}
JSON

(
  set -euo pipefail
  for format in docx xlsx pptx; do
    jq -nc --arg output "report.$format" \
      '{operation:"documents.generate",input:"release-source.json",output:$output}' |
      run_hai_job documents "generate-$format"
    test -s "$hai_job_work/generate-$format/output/report.$format"
    printf '%s\n' "$hai_job_work/generate-$format/output/report.$format"
  done
)
```

成功后分别打开三个文件，核对标题、检查说明和表格的两行数据。XLSX 的工作表名为 `Report`，表格单元格按字符串写入。需要重算已有工作簿的公式时，使用 [Office 重算镜像](../office/README.md#recalculate-spreadsheet)。

生成规格最多 256 KiB。DOCX 和 XLSX 的 `title` 最多 200 字符，`paragraphs` 最多 100 段、每段最多 2000 字符。`table.headers` 可有 1～20 列，`table.rows` 最多 200 行，每行列数与表头相同，单元格最多 2000 字符。PPTX 可用相同顶层字段生成单页，也可用顶层 `title` 和 `slides` 生成 1～20 页。每页最多 100 字符的标题、6 段文字，每段 160 字符、合计 800 字符。带表格的页最多 6 列、6 行数据，每格 32 字符和一段最多 120 字符的说明。

<a id="extract-text"></a>

### 将文档正文交给全文检索

示例提取刚生成的 Word 发版清单。处理自己的文档时，把 `source` 改为实际 DOCX 路径。处理带文字层的 PDF 时，把复制目标和 `input` 一并改成 `.pdf` 文件名。

```bash
(
  set -eu
  source="$hai_job_work/generate-docx/output/report.docx"
  cp -- "$source" "$hai_job_work/input/release-checklist.docx"
  run_hai_job documents extract-release <<'JSON'
{"operation":"documents.extract","input":"release-checklist.docx"}
JSON
  jq -er '.data.text | select(length > 0)' "$hai_job_work/extract-release/response.json" \
    > "$hai_job_work/extract-release/release-checklist.txt"
)
```

打开 `extract-release/release-checklist.txt`，示例文档应能读到 `Release checklist` 和 `Review security updates before publishing.`。核对需要的内容后，可把这个文本接到检索或摘要流程。DOCX 提取主文档中的段落和表格文字，XLSX 提取单元格数据和公式缓存，PDF 提取最多 100 页的文字层。纯扫描件可以先转成图片，再用 [OCR 镜像](../ocr/README.md#recognize-text)。

## 接入应用

在离线 Runner 环境中声明 `documents.extract`、`documents.generate` 中需要的能力，用 `toolsRunner.createJobTools()` 的 `environments.documents` 指向该环境，再在服务中启用所需工具。

| 受管工具             | 传给 `service.invoke()` 的 `input`                                                                                                             | 成功结果                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `documents_extract`  | `{ fileId }`，已有文档在应用文件库中的 ID                                                                                                      | `data.text`                   |
| `documents_generate` | `{ format: 'docx', title: 'Release checklist', paragraphs: ['Review security updates before publishing.'] }`，`format` 还可为 `xlsx` 或 `pptx` | `data.artifacts` 中的文件引用 |

生成文件时，宿主通过 `files.publish` 保存产物字节。提取时，`files.read` 按调用者的权限读取源文档。用 `service.invoke()` 等结果时先检查 `success`，再读取 `data`。 [受管作业接入](../../../../docs/usage/function/tools-runner.md#job-tools)

## 失败排查

- 普通输入文件和输出文件最多 50 MiB。提取文本最多 256 KiB，超过上限时响应为 `OUTPUT_LIMIT`。
- 缺失文件、无效文件或不支持的扩展名会返回 `INVALID_INPUT`。结构化内容包含重复或未知字段、超出生成规格时检查 `INVALID_REQUEST`。
- DOCX 或 XLSX 归档包含受限制的主动内容或超出归档配额时会返回 `UNSAFE_DOCUMENT`。保留要交付的结果后，按[共用清理方式](../README.md#错误处理)清理本次临时目录。

## 许可证

Apache-2.0
