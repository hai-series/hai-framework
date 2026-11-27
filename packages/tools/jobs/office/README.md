# Office 转换与公式重算镜像

`office` 镜像用 LibreOffice 将 Office 文档转为可预览的 PDF，也可以重算 XLSX 或 ODS 工作簿里的公式，供后续读取最新计算值。容器每次处理一条离线请求。

## 快速开始

在 Linux 上用非 root 的 Podman。先从仓库根目录执行[共用快速开始](../README.md#quick-start)中的脚本，在当前 Bash 会话准备临时目录、`build_hai_job` 和 `run_hai_job`。本机已有 `localhost/hai-tools-office:local` 时可跳过构建。

```bash
build_hai_job office
```

## 功能

| 操作                 | 输入                              | 输出                         |
| -------------------- | --------------------------------- | ---------------------------- |
| `office.convert`     | DOCX、ODT、XLSX、ODS、PPTX 或 ODP | PDF                          |
| `office.recalculate` | XLSX 或 ODS                       | 与输入扩展名相同的工作簿副本 |

两项操作都接收 `input` 和 `output` 文件名。响应的 `data.artifact` 返回产物文件名和字节数，实际文件在本次结果目录的 `output/` 下。

<a id="convert-pdf"></a>

### 将发版清单转成 PDF 供审批

准备一份 `./release-checklist.docx`。也可在同一 Bash 会话用 [documents 镜像生成示例发版清单](../documents/README.md#generate-documents)，并把下方 `source` 设为 `$hai_job_work/generate-docx/output/report.docx`。

```bash
(
  set -eu
  source=./release-checklist.docx
  cp -- "$source" "$hai_job_work/input/approval.docx"
  run_hai_job office approval-pdf <<'JSON'
{"operation":"office.convert","input":"approval.docx","output":"approval.pdf"}
JSON
  test -s "$hai_job_work/approval-pdf/output/approval.pdf"
  printf '%s\n' "$hai_job_work/approval-pdf/output/approval.pdf"
)
```

打开打印出的 PDF 文件。如果用的是生成的发版清单，应能看到 `Release checklist` 和 `Build`、`Review` 两行数据。用其他支持的源格式时，把复制目标和 `input` 一并改成该格式的扩展名，输出仍用 `.pdf`。

<a id="recalculate-spreadsheet"></a>

### 更新预算表中的合计值

用电子表格应用准备 `./budget.xlsx`。在 A1 和 B1 分别填入 `2` 和 `3`，在 C1 填入 `=SUM(A1:B1)`，也可把 `source` 换成现有预算表。

```bash
(
  set -eu
  source=./budget.xlsx
  cp -- "$source" "$hai_job_work/input/budget.xlsx"
  run_hai_job office budget-recalculated <<'JSON'
{"operation":"office.recalculate","input":"budget.xlsx","output":"calculated.xlsx"}
JSON
  test -s "$hai_job_work/budget-recalculated/output/calculated.xlsx"
  printf '%s\n' "$hai_job_work/budget-recalculated/output/calculated.xlsx"
)
```

打开 `calculated.xlsx` 核对 C1 的公式和计算结果 `5`。应用也可以把生成的 XLSX 交给 [`documents.extract`](../documents/README.md#extract-text) 读取保存后的计算值。对于 ODS，把 `input` 和 `output` 都改成 `.ods` 文件名。

## 接入应用

在离线 Runner 环境中声明 `office.convert`、`office.recalculate` 中需要的能力，用 `toolsRunner.createJobTools()` 的 `environments.office` 指向该环境，再启用 `office_convert` 或 `office_recalculate`。两者的 `input` 都是 `{ fileId }`，其中 `fileId` 是应用文件库已经保存的文件 ID。宿主通过 `files.read` 按调用权限读取源文件，通过 `files.publish` 保存生成文件。`service.invoke()` 成功后从 `data.artifacts` 获取 PDF 或工作簿的文件引用。 [受管作业接入](../../../../docs/usage/function/tools-runner.md#job-tools)

## 失败排查

- 遇到 `INVALID_REQUEST`，核对输入扩展名与输出格式。输出文件重名时会返回 `INVALID_OUTPUT`，重试使用新的结果目录。
- 遇到 `UNSAFE_DOCUMENT`，检查归档大小、外部关系、嵌入对象、ActiveX、宏或脚本。每次运行使用独立的 LibreOffice profile，打开文件时禁用宏和外部链接更新。
- 普通输入文件和生成文件最多 50 MiB。镜像给转换和重算子进程各限定 90 秒，超时返回 `TIMEOUT`。保留需要的文件后，按[共用清理方式](../README.md#错误处理)清理本次临时目录。

## 许可证

Apache-2.0
