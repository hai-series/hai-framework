# AI 实验台

[框架首页](../../README.md) · [AI 模块](../../packages/ai/README.md) · [Runner](../../packages/runner/README.md)

AI 实验台是 `@h-ai/ai` 的 SvelteKit 示例。可以切换模型、知识、上下文、工具和智能体、媒体实验。每项都可展开「接入示例」，查看公开 API、复制 TypeScript，并对照调用参数、返回值和所需配置。默认界面支持中文、英文、日文及主题切换。

## 快速开始

环境要求为 Node.js `^22.23.4 || ^24.22.1 || ^26.12.1` 和 pnpm `12.11.2`。开发默认使用 SQLite 和 LanceDB，文件保存在本应用的 `data/` 下，限流使用内存缓存。流处理、Token 估算、滑动窗口压缩、HTML 文件解析、本地工具和进程内 MCP 可以先在无模型凭据的情况下试用。

```sh
pnpm install --frozen-lockfile       # 在仓库根安装锁定依赖。
pnpm exec turbo run build --filter=ai-playground^...  # 构建应用所依赖的工作区模块。
pnpm --filter ai-playground dev      # 启动本地 Web 服务，终端显示实际访问地址。
```

Vite 通常显示 `http://localhost:5173`。运行对话、摘要、推理、语音或图片前，在 [`.env.example`](./.env.example) 找到对应配置，在本应用的 `.env.local` 写入私有值。模型端点和凭据只在服务端读取。录音功能需要浏览器的麦克风权限以及 `localhost` 或 HTTPS 安全上下文。

## 功能

| 工作台       | 可运行实验                                                                 | 环境与配置                                                                                                                 | 输入 → 可观察结果                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型与流     | 多轮对话、单次文本、实时对话流、流处理器、结构化输出、推理                 | 对话与结构化用 `llm`，推理可用 `llm.scenarios.reasoning`。流处理器使用本地片段                                             | 提问 → 文本或逐段回复。结构化卡片输入一段正文 → `{ title, points }`。流处理器输入文字 → `{ chunks, text }`。推理 → `{ answer, strategy, rounds }`                     |
| 文件与知识   | HTML 解析、向量嵌入、重排序、检索、RAG、知识集合                           | `file`、`llm.scenarios.embedding`、`llm.scenarios.rerank`、`embedding`、`retrieval.sources`、`knowledge`。见下文的模型配置 | HTML → 解析文本。文本 → 向量维度和前 12 项。查询 → 固定候选重排、匹配资料、带引用回答或知识文档与命中                                                                 |
| 上下文与记忆 | 记忆的添加、搜索、删除、对话注入和提取，Persona、上下文、Token、摘要、压缩 | `memory`、`token`、`summary`、`compress`。摘要与自动提取需要模型，Persona 组合和滑动窗口压缩可本地运行                     | 保存偏好后查询 → 当前浏览器标签下的命中。Persona 输入 → 组合提示词和特征。上下文 → 初始消息和预算。正文 → Token 估算或摘要，压缩 → 缩减后的消息                       |
| 工具与智能体 | 本地工具、进程内 MCP、远程 MCP、离线 MCP 作业、A2A、受管 ACP               | 本地工具和进程内 MCP 可直接运行。其余按下文登记服务、Agent Card 或 Runner 环境                                             | 输入 `two words` → 工具统计 `2`。MCP → 工具结果、资源和提示词。远程查询 → 上游 MCP 内容。离线固定文件 → 手册文本。A2A → Echo 响应。ACP → 执行计划、任务 ID 和模型输出 |
| 媒体         | 图片生成和参考图、音频能力、TTS 和流式合成、上传 ASR 和转写流、麦克风识别  | `image.models`、`image.generateModel`、`audio.models` 和默认操作 ID。图片编辑和流能力依模型而定                            | 提示词 → 可预览图片。文字和音色 → WAV 或合成统计。上传音频或录音 → 文本。流式上传可观察分段事件                                                                       |

文档索引使用应用自带的固定资料，首次执行检索、RAG 或知识实验时写入固定文档 ID。浏览器的查询和 HTML 不会被导入公共知识集合。记忆及 Persona 使用服务器签发的 HttpOnly 浏览器 Cookie 绑定主体。切换标签只在当前浏览器内切换数据范围，清除 Cookie 后无法通过旧标签访问原记录。此 Cookie 用于演示隔离，部署到共享环境应由可信入口配置访问控制。

结构化卡片调用 `ai.llm.generateObject` 时显式选择 `responseFormat: 'json_object'`，适用于提供通用 JSON 模式的网关，框架继续用 Zod 校验返回结果。模型支持服务端 Schema 时，省略该参数或显式用 `'json_schema'`。

### API 示例

以下请求使用 `GET /api/demos` 查看当前不可用项。`POST /api/demos` 接收 `{ id, input }`，`input` 为 1–4000 字符，请求体最多 16 KiB。保留同一个 Cookie 以便后续请求复用浏览器作用域。

```sh
# 输入本地地址，输出可用性摘要，并保存本次会话的 Cookie。
curl -sS -c ./playground.cookies http://localhost:5173/api/demos
# 输入工具 ID 和示例文本，成功响应中 data.result.toolResult.content 为字符串 '{"words":2}'。
curl -sS -b ./playground.cookies -H 'Content-Type: application/json' \
  -d '{"id":"tools","input":"two words"}' http://localhost:5173/api/demos
```

| 接口                                                        | 输入                               | 输出                                                                          |
| ----------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/status`                                           | 无                                 | 成功响应的 `data` 包含已选模型与存储模式摘要                                  |
| `GET /api/demos`、`POST /api/demos`                         | 无，或 `{ id, input }`             | 成功响应的 `data` 为 `{ unavailable }` 或 `{ result }`，失败返回 Hai API 错误 |
| `POST /api/chat`、`POST /api/chat/stream`                   | 消息、当前记忆标签及是否注入记忆   | 对话回复或 NDJSON 流                                                          |
| `POST /api/chat/remember`                                   | 一轮用户/助手消息与当前标签        | 记忆提取结果，20 秒超时                                                       |
| `GET/POST/DELETE /api/memories`、`DELETE /api/memories/:id` | 当前标签、可选查询，或显式记忆内容 | 检索、保存、清空或删除结果，范围由服务端确定                                  |
| `POST /api/tts`                                             | 文本、音色和可选风格               | WAV 音频                                                                      |
| `POST /api/image`                                           | multipart 提示词、尺寸及可选参考图 | 图片二进制                                                                    |
| `POST /api/asr`、`POST /api/asr/stream`                     | multipart WAV/MP3 和语言           | 完整文本或 NDJSON 事件                                                        |

### 音频能力与流式演示

`audio-capabilities` 用 `ai.audio.getCapabilities` 查询当前合成与转写模型的能力。输入只需满足卡片非空校验，查询不会将输入发给供应商。`tts-stream` 用默认合成模型调用 `ai.audio.synthesizeStream`，显示 `started.format`、`audioChunks`、`bytes` 和 `completed`。分块数与字节数取决于模型响应。

```sh
# 查询已登记能力。data.result.transcription 和 data.result.synthesis 分别包含转写与合成能力。
curl -sS -b ./playground.cookies -H 'Content-Type: application/json' \
  -d '{"id":"audio-capabilities","input":"check"}' http://localhost:5173/api/demos
# 输入要朗读的短句，data.result 返回 WAV 格式、块数、总字节数和完成标志。
curl -sS -b ./playground.cookies -H 'Content-Type: application/json' \
  -d '{"id":"tts-stream","input":"Hello from Hai"}' http://localhost:5173/api/demos
# 上传本地 WAV 与语言，按行查看实际转写事件，-N 禁用 curl 缓冲。
curl -sSN -b ./playground.cookies -F 'audio=@sample.wav;type=audio/wav' \
  -F 'language=en' http://localhost:5173/api/asr/stream
```

单张参考图和音频文件最大 10 MiB。文件流式转写由 `ai.audio.transcribeStream` 产生事件。麦克风演示约每两秒发送一份从录音开始到当前时刻的完整 WAV 快照，慢请求期间跳过中间快照，停止录音时补齐最后片段。

## 配置

加载优先级为进程环境 > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML。`config/_ai.yml` 定义 AI 默认值，`_db.yml`、`_vecdb.yml`、`_cache.yml` 管理存储和限流，`_core.yml` 设置日志，`_kit.yml` 管理入口策略。`config/_runner.yml` 可选，配置后在 AI 启动前初始化 Runner。环境变量和 YAML 的合并规则见 [配置与环境变量](../../docs/usage/configuration/runtime.md)。

开发默认对话与语音示例使用 MiMo，图片示例使用 Pollinations。用 `HAI_AI_LLM_BASEURL`、`HAI_AI_LLM_MODEL`、`HAI_AI_LLM_PROTOCOL`、`HAI_AI_LLM_APIKEY` 覆盖默认对话端点。音频或图片另用供应商时，在 `_ai.yml` 配置对应 `models` 条目和默认 ID，只在确认为同一服务凭据时开启 `audio.inheritLlmApiKey`。图像密钥可用 `HAI_AI_IMAGE_POLLINATIONS_APIKEY`。供应商、模型与凭据不匹配时，先按网关错误检查协议和权限。

### 向量和重排序模型

将以下内容合并到 `config/_ai.yml`，保留已有音频、图片和检索配置。用实际网关、模型与维度替换示例。向量客户端把 `/embeddings` 加到模型的 `baseUrl`。重排序客户端把 `/v1/rerank` 加到 `baseUrl`，示例使用不带 `/v1` 的地址。

```yaml
llm:
  models:
    - id: vector # 应用绑定 ID，供 embedding 场景选择。
      model: your-embedding-model # 供应商的实际向量模型名。
      baseUrl: https://embedding.example.invalid/v1 # 应能调用 embeddings。
      apiKey: ${PLAYGROUND_EMBEDDING_KEY:} # 从私有环境加载。
    - id: ranker # 应用绑定 ID，供 rerank 场景选择。
      model: your-rerank-model # 供应商的实际重排模型名。
      baseUrl: https://rerank.example.invalid # 客户端请求 /v1/rerank。
      apiKey: ${PLAYGROUND_RERANK_KEY:} # 从私有环境加载。
  scenarios: {embedding: vector, rerank: ranker} # 启用向量、知识和重排演示。
embedding:
  dimensions: 1536 # 改成模型返回维度。
knowledge:
  dimension: 1536 # 使用相同维度。
```

应用的默认知识集合固定为 `hai_playground_demo_knowledge`，默认检索源为 `playground-handbook`。需要切换已建集合的向量维度时，使用新的实验数据目录，或先备份后移除旧实验集合再重新启动。

### 远程 MCP 与 A2A

以下配置合并到 `config/_ai.yml`。远程 MCP 卡片只请求部署方配置的 `playground-manuals` 服务与 `search_manual` 操作。输入是搜索文本，应用将它映射为 `{ query }`。`a2a.agentCard` 启用进程内 Echo 演示，页面返回公开卡片摘要和 JSON-RPC 结果，示例 URL 是卡片元数据。

```yaml
mcp:
  servers:
    - id: playground-manuals # 页面固定使用此服务 ID。
      name: Manuals # 目录中的服务名。
      transport: http # Streamable HTTP。
      url: https://mcp.example.invalid/mcp # 换成经过部署审核的服务地址。
      headerEnv: {Authorization: PLAYGROUND_MCP_AUTHORIZATION} # 需要时设置完整请求头值。
      allowedTools: [search_manual] # 服务端许可的具体工具名。
a2a:
  agentCard:
    name: Playground Echo # 返回的 Agent Card 名称。
    url: https://playground.example.invalid/a2a # 演示卡片中的标识地址。
```

### 容器内的离线工具和受管 ACP

在 Linux cgroup v2 执行节点准备 Podman 或 Docker、固定镜像与可用模型网络。默认 Web 镜像不含容器引擎 CLI。使用宿主 Node.js 运行本示例，或由部署方设置可用执行节点。Runner 容器默认断网，Codex 需要部署方登记实际可访问 Responses 网关的命名内部网络。部署方控制可信节点与出口。

在仓库根构建镜像并读取摘要：

```sh
# 构建 Codex 精简镜像，JSON 输出含 imageId。将它放入私有变量 PLAYGROUND_AGENT_IMAGE。
pnpm --filter @h-ai/ai agent:build codex-acp --engine=podman
# 构建文档工具镜像，输入为文档 Dockerfile 与通用工具构建目录。
podman build -f packages/ai/tools/documents/Dockerfile -t localhost/hai-tools-documents:playground packages/ai/tools
# 输出文档工具的镜像 ID，放入私有变量 PLAYGROUND_DOCS_IMAGE，必要时补 sha256: 前缀。
podman image inspect --format '{{.Id}}' localhost/hai-tools-documents:playground
```

添加 `config/_runner.yml`。将示例网络名换成已配置的内部网络。仅运行离线作业时可保留 `documents-demo` 环境并删去 ACP 环境块。

```yaml
nodeId: playground-executor # 执行节点唯一，重启后保持稳定。
engine: podman # Docker 环境改为 docker。
environments:
  - id: documents-demo # 离线工具所用环境。
    image: ${PLAYGROUND_DOCS_IMAGE} # 预先缓存的固定摘要。
    networkPolicy: offline # 文档处理不需要网络。
    capabilities: [documents.extract] # 允许文档提取。
    resources: {cpu: 1, memoryMiB: 256, pids: 64, scratchMiB: 64} # 单容器资源上限。
  - id: acp-demo # Agent 对应的环境。
    image: ${PLAYGROUND_AGENT_IMAGE} # 预先缓存的 Codex 摘要。
    networkPolicy: internal # 由容器引擎核验内部网络。
    network: playground-model # 替换为能访问可信模型网关的内部网络。
    resources: {cpu: 1, memoryMiB: 512, pids: 128, scratchMiB: 128} # 单容器资源上限。
```

合并到 `_ai.yml` 已有字段，并将 `playground-documents` 加入现有 `mcp.servers` 列表。ACP 卡片固定使用 `task`、`read-only`、`never`，不接收用户的工作区、额外工具或附件。离线工具卡片仅接受内置 `playground-handbook.txt`，返回手册文字。

```yaml
llm:
  models:
    - id: playground-coding # 由下方 Agent 绑定。
      model: your-responses-model # 服务端实际模型名称。
      protocol: responses # Codex 需要 Responses 协议。
      baseUrl: https://models.example.invalid/v1 # 换成容器可达的内部模型网关。
      apiKey: ${PLAYGROUND_ACP_MODEL_KEY:} # 私有凭据。
acp:
  agents:
    - id: playground-acp # 页面固定使用此 Agent。
      name: Playground Codex
      adapter: codex
      mode: embedded # 原生 stdio 接入，受管调用仍由 Runner 启动容器。
      modelIds: [playground-coding] # 使用已登记模型。
      environmentIds: [acp-demo] # 使用 Runner 的固定环境。
mcp:
  servers:
    - id: playground-documents # 页面固定使用此工具服务。
      name: Playground documents
      transport: job # 通过 Runner 启动离线容器。
      environmentId: documents-demo
      allowedTools: [documents.extract] # 接受固定的文档提取操作。
```

应用按 `RelDB → VecDB → Runner（可选）→ AI` 初始化，并在启动失败时逆序清理。生产 `.env.prod` 默认使用 PostgreSQL、Qdrant 与 Redis。按实际部署配置 `db/cache/vecdb` 的 DNS 地址、认证和访问规则。缺少共享依赖时启动失败。应用默认限流为每分钟 120 个请求，可在可信代理或应用侧补充用户授权和模型消费预算。具体参数见 [AI 配置手册](../../docs/usage/configuration/ai.md) 和 [Runner 配置](../../packages/runner/README.md#配置)。

启用原生记忆向量检索时，为本应用分配专用的 `hai_ai_memory_vectors` 集合。只有共享同一个关系库的 Playground 实例可以共用该集合。后台按关系库当前版本清理旧点，向量写入迟到或服务重启后会继续处理。独立测试环境使用自己的向量库命名空间。

使用 Node 产物部署时，SvelteKit 默认按 HTTPS 计算请求来源。若由可信反向代理提供 HTTP 环境，配置 `PROTOCOL_HEADER=x-forwarded-proto`，由代理覆盖该请求头为实际外部协议，并限制应用端口仅由代理访问。浏览器删除或清空记忆时需要同源校验。

试用 DeepSeek Harness 时，保留 `playground-acp` 和 `playground-coding` 这两个 ID，把 `acp-demo` 的镜像换成构建好的 `deepseek-harness`，并将 Agent 的 `adapter` 设为 `deepseek-harness`。模型可使用 `model: deepseek-flash`、`protocol: chat` 和容器可达的 DeepSeek Chat 根地址。按供应商实际能力填写 `capabilities` 的 `contextWindow`、`maxOutputTokens`、`inputModalities`、`outputModalities`、`toolCalling` 和 `reasoning`，启用推理时列出支持的 `efforts`。完成配置后在「工具与智能体 → 受管 ACP 任务」运行，查看实际输出的 `plan.adapter` 和 `output.text`。 [模型能力参数](../../docs/usage/configuration/ai.md#acp-接入与模型能力)

## 错误处理

实验卡片会标出缺少的模型场景、服务或 Runner 环境。配置正确后重启 Web 服务，再从环境卡片核对状态。可用性检查确认登记与配置，模型网络、凭据和镜像仍需运行时验证。请求失败时保留关联编号供服务端排查。限流超限返回 429，限流存储不可用返回 503。模型上游 402 时检查服务账户与预算。服务端日志避免输出私有配置和凭据。

## 镜像构建与部署

在本应用目录执行，镜像定义为 `images/web.Dockerfile`，`hai.json` 的 `build.images` 指定文件与仓库根构建上下文。Web 运行配置位于 `images/web/`（如有）。容器角色为 web，项目身份来自本目录的 package.json.name；应用版本来自本目录的 `package.json.version`。

```sh
pnpm build:images                         # 只构建镜像并导出 tar
pnpm run deploy --env prod --build        # 构建、打包、上传、启动并检查访问
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

先准备 `.env.prod` 与项目根 `hai.json` 的 `deploy`；首次向导以说明文字收集服务器连接信息并保存到 `.env.local`。完整离线包包含应用和自建中间件镜像，目标 Linux 需预装容器引擎、Compose 与脚本要求的工具。把本次 `.hai/deploy/<环境>/bundle-*/` 整个目录复制到操作机（tar、配置和脚本均在其中），Windows 执行 `deploy.ps1`，Linux/macOS 执行 `deploy.sh`；完全隔离的服务器复制整个交付目录后执行 `sh deploy-local.sh`，自动解包并部署。

已有成功安装时，可用 `--services web` 只更新本应用；多个镜像的工程按服务名选择。局部发布保留其他容器和持久化卷，不执行整个项目 `down`，失败保留诊断并尝试恢复旧容器。相同版本允许重建，每次以独立构建 ID 区分内容。`images/dependencies/` 为忽略 Git 的依赖输入，配合引擎缓存和分层减少重复下载。

完整参数、缓存、版本与恢复说明见[使用指南](../../docs/usage/README.md#4-编译源码与打包产物)。移动端和桌面端的原生安装包仍需在对应系统另行构建；容器部署交付的是 Web 页面。

## 框架能力导航

本应用的启动、页面和业务操作按上文执行；各框架模块的完整用途、输入输出、配置和错误处理见下表。不要从应用示例推断模块全部能力；服务端与浏览器入口按对应模块契约选择。

| 模块                                            | 本应用相关能力                 |
| ----------------------------------------------- | ------------------------------ |
| [@h-ai/ai](../../packages/ai/README.md)         | 模型、记忆与工具流程           |
| [@h-ai/cache](../../packages/cache/README.md)   | 共享缓存与会话状态             |
| [@h-ai/core](../../packages/core/README.md)     | 配置、日志、结果与国际化       |
| [@h-ai/kit](../../packages/kit/README.md)       | SvelteKit 路由、请求与页面集成 |
| [@h-ai/reldb](../../packages/reldb/README.md)   | 关系型数据库与事务             |
| [@h-ai/runner](../../packages/runner/README.md) | 独立工具与 ACP 容器执行        |
| [@h-ai/ui](../../packages/ui/README.md)         | 页面、表单和交互组件           |
| [@h-ai/vecdb](../../packages/vecdb/README.md)   | 向量集合与检索                 |

## 开发测试

单测检查请求边界、身份隔离及演示路由，默认 E2E 使用受控响应验证页面交互，不调用商业模型。

```bash
pnpm --filter ai-playground test
pnpm --filter ai-playground test:e2e
```

真实 E2E 会依次验证 LLM、Memory、TTS，并把 TTS 生成的 WAV 再交给 ASR 转写。PowerShell：

```powershell
$env:HAI_E2E_LIVE='1'
pnpm --filter ai-playground test:e2e live-ai.spec.ts
Remove-Item Env:HAI_E2E_LIVE
```

Bash：

```bash
HAI_E2E_LIVE=1 pnpm --filter ai-playground test:e2e live-ai.spec.ts
```

真实 E2E 会调用计费接口，仅在明确需要联调时运行。

经 `test:e2e` 托管入口分配本轮绝对数据目录。服务显式使用隔离的 SQLite、Memory 和 LanceDB，不继承外部模块配置，也不读取开发者 `.env.local`；普通开发与生产加载规则保持不变。live 模式只转发调用方明确注入进程的 `HAI_AI_*` 配置，需自行提供真实服务凭据；默认 mock 结果不代表真实商业模型验收。

## 许可证

Apache-2.0
