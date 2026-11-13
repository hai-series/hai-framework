# 独立文档、Office、OCR 与浏览器工具

四个镜像使用同一个 JSON 协议。工具以非 root 用户执行一次请求，由部署侧选择镜像并分配资源。Agent 可通过受控 MCP 服务调用这些操作，应用也可直接提交相同的工具作业。部署方需要先接通受权文件和网络，才能对外登记相应操作。

| 镜像        | 操作                 | 输入与输出                                                                                           |
| ----------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `documents` | `documents.extract`  | TXT、Markdown、CSV、TSV、文本 PDF、DOCX、XLSX → 文本。XLSX 读已有单元格值与缓存，公式重算使用 Office |
| `office`    | `office.convert`     | DOCX、ODT、XLSX、ODS、PPTX、ODP → PDF                                                                |
| `office`    | `office.recalculate` | XLSX、ODS → 同格式文件。LibreOffice 重新计算公式                                                     |
| `ocr`       | `ocr.recognize`      | PNG、JPEG、TIFF → 文本。可选 `language` 为 `eng`、`chi_sim`、`jpn`、`eng+chi_sim` 或 `eng+jpn`       |
| `browser`   | `browser.navigate`   | 访问受控代理允许的 HTTPS 地址，输出 1280 × 720 PNG。关闭 JavaScript、下载和 Service Worker           |

## 构建和调用

在仓库根目录构建，选择需要的镜像。发布时应为每种镜像独立版本化，并在执行环境中登记产物 digest。

```sh
podman build -f packages/ai/tools/documents/Dockerfile -t localhost/hai-tools-documents:local packages/ai/tools
```

入口 `/usr/local/bin/hai-tool` 从标准输入读取一个 UTF-8 JSON 对象，在 EOF 后运行。每次请求最多 64 KiB。文件名最多 128 个 ASCII 字符，可用字母、数字、点、下划线和连字符，首字符必须是字母或数字。挂载独立的 `/input` 只读目录和空的 `/output` 目录，UID 1000 必须能够读取输入及写入输出。输入单文件和产物上限 50 MiB，抽取文本上限 256 KiB，文本 PDF 上限 100 页。

```json
{ "operation": "documents.extract", "input": "report.pdf" }
```

文本结果形如 `{"success":true,"data":{"text":"..."}}`。产物结果形如 `{"success":true,"data":{"artifact":{"name":"report.pdf","bytes":1234}}}`。业务失败返回 `success: false` 和稳定的 `error.code`；调用方须检查结果和实际产物。每个进程只处理一个请求，成功后回收工作环境。

```json
{ "operation": "office.convert", "input": "report.docx", "output": "report.pdf" }
```

部署时将文件工具连接到无网络的独立作业容器，使用只读根文件系统、受限临时目录、PID/CPU/内存上限。LibreOffice 使用每次新建的 profile，以 UNO 设置禁用宏执行和链接更新，且拒绝包含外部关系、嵌入对象、宏及超限 ZIP 的输入。需要访问外部资源的文档应事先在受控流程中移除这些引用。[LibreOffice 宏执行模式](https://api.libreoffice.org/docs/idl/ref/namespacecom_1_1sun_1_1star_1_1document_1_1MacroExecMode.html) · [文档更新模式](https://api.libreoffice.org/docs/idl/ref/namespacecom_1_1sun_1_1star_1_1document_1_1UpdateDocMode.html)

应用可将文档、Office、OCR 环境登记到 Runner，再在 `mcp.servers` 用 `transport: job` 绑定环境和工具白名单。任务只传授权文件 ID，执行节点通过 `mcpJobFiles` 复核权限后读入对象和暂存产物。Runner 用独立的工具容量领取作业，服务的 `pool.maxRunning` 控制所有执行节点上的并发上限。应用按产物所有者验证下载权限。配置示例见 [MCP 配置](../../../docs/usage/configuration/ai.md#mcp和a2a)。

```json
{ "operation": "browser.navigate", "url": "https://example.com/", "output": "page.png" }
```

浏览器镜像要求部署提供 `HAI_TOOL_BROWSER_PROXY=http://<代理的 IPv4 地址>:<端口>`。作业网络必须只允许连接该代理的地址和端口。代理逐个校验 CONNECT 目的地，执行任务授权、DNS/IP、内网限制及重定向和子资源策略。镜像启用 Chromium 沙箱，启动失败时由上层报告环境错误。部署未提供这些边界前保持操作停用。[Chromium 代理规则](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md)

## 验证

```sh
python3 -B -m unittest discover -s packages/ai/tools/tests
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
  podman build -f "packages/ai/tools/$kind/Dockerfile" -t "localhost/hai-tools-$kind:local" packages/ai/tools || exit 1
done
HAI_TOOL_IMAGE_DOCUMENTS=localhost/hai-tools-documents:local \
HAI_TOOL_IMAGE_OFFICE=localhost/hai-tools-office:local \
HAI_TOOL_IMAGE_OCR=localhost/hai-tools-ocr:local \
HAI_TOOL_IMAGE_BROWSER=localhost/hai-tools-browser:local \
node packages/ai/tools/tests/image-smoke.mjs
```

工具验收需用实际镜像补齐代表性输入、输出内容、离线与网络边界。`office` 还需验证宏、链接和外部数据源不会执行，`browser` 需用受控 HTTPS 站点及代理核对最终截图和拒绝访问的场景。单元测试覆盖请求协议、文件范围与上限、文档链接、OCR 参数和浏览器代理前置条件。
