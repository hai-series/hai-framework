# AI 实验台

## 简介

基于 SvelteKit 和 `@h-ai/ai` 的交互式示例，用一个页面验证真实 LLM、文生图、Memory、TTS 与 ASR 链路。

## 核心功能清单

- 宽屏下工作区随窗口扩展，列表在自身区域内滚动；手机端自动收拢，登录框和长篇正文保留阅读宽度。

- LLM：多轮流式对话；首个文本片段到达即显示，记忆在回复后后台提取，新一轮对话会取消旧提取并优先响应。
- Memory：按测试主体隔离的添加、检索、删除、自动注入与提取。
- Image：通过 OpenAI、Gemini、Qwen、Seedream 或 Pollinations 免费额度模型生成并预览图片，可选上传一张或多张参考图。
- TTS：预置音色、自然语言风格指令与 WAV 播放。
- ASR：WAV/MP3 文件转写，以及麦克风录音期间持续更新的实时转写。
- 中英日文界面、深浅主题、标准 E2E 与显式真实接口 E2E。

> 默认接入 MiMo 系列模型，通过环境变量可切换到任意兼容 OpenAI 接口的模型服务。

## 使用入门

### 快速开始

```bash
cd apps/ai-playground
# 按 .env.example 的字段说明，在 .env.local 中仅填写需要覆盖的私有值
# 编辑 .env.local，填写 HAI_AI_LLM_APIKEY
pnpm dev
```

打开 `http://localhost:5173`。`.env.local` 已由仓库根 `.gitignore` 忽略，不会进入 Git；不要把密钥改写到 `.env.example` 或源码中。

应用先初始化 `reldb → vecdb → ai`，并发请求共用一次启动；失败按 `ai → vecdb → reldb` 关闭，关闭失败保留重试义务。API 路由使用 `ai.llm` / `ai.image` / `ai.memory` / `ai.audio`。开发默认 SQLite 与 LanceDB，状态持久化到 data；生产 `.env.prod` 选择共享 PostgreSQL、Qdrant，限流使用 Redis。数据库/缓存密码、受保护 Qdrant 密钥及模型密钥由 Secret/进程环境或忽略的 `.env.local` 注入。Compose 服务名为 `db/cache/vecdb`，容器外运行需覆盖地址；缺少共享依赖时启动失败，不会降级为内存 Store。

### API 契约

| Endpoint                        | 用途                                                   |
| ------------------------------- | ------------------------------------------------------ |
| `GET /api/status`               | 查看实际模型和初始化状态                               |
| `POST /api/chat`                | 对话（可注入记忆），仅返回回复文本                     |
| `POST /api/chat/stream`         | 对话（可注入记忆），NDJSON 流式返回当前回复            |
| `POST /api/chat/remember`       | 从一轮对话提取长期记忆，20 秒超时并支持取消            |
| `GET/POST/DELETE /api/memories` | 检索、添加、清空当前主体记忆                           |
| `DELETE /api/memories/:id`      | 删除单条且校验主体归属                                 |
| `POST /api/tts`                 | 返回 WAV 音频                                          |
| `POST /api/image`               | multipart 提交提示词、尺寸和可选参考图，返回图片二进制 |
| `POST /api/asr`                 | multipart 上传 WAV/MP3 并返回文本                      |
| `POST /api/asr/stream`          | multipart 上传音频，NDJSON 逐行流式返回转写            |

JSON 输入先经 Zod 校验；图片与音频上传在 multipart 边界校验。单张参考图和音频文件最大 10 MiB，AI 密钥只在服务端读取。

> 麦克风示例在录音期间每 2 秒获取最新音频快照，编码为 16 kHz 单声道 WAV 后调用 `/api/asr` 更新当前文本；慢请求期间会跳过中间快照并在下一节拍使用最新录音，不会形成无界请求队列。点击停止只补齐最后尚未识别的尾段，不再等停止后才开始转写。

### 配置

本目录 `.env.example` 完整说明字段用途、枚举和范围；`.env` 为公共基础，`.env.dev` / `.env.test` / `.env.prod` 为公共环境覆盖，均提交 Git。`.env.local` 保存本机私有覆盖，不提交。优先级为进程环境 > `.env.local` > 环境文件 > `.env`。使用 `dev:test` / `dev:prod` 或 Node `start:test` / `start:prod` 切换，详见 [配置与环境变量](../../README.md#配置与环境变量)。

应用启动时扫描 [`config/_db.yml`](./config/_db.yml)、[`config/_vecdb.yml`](./config/_vecdb.yml)、[`config/_core.yml`](./config/_core.yml) 和
[`config/_ai.yml`](./config/_ai.yml)：前者控制日志等级，后者集中声明 LLM、
ASR/TTS、文生图厂商、模型、端点和超时。切换 OpenAI、Google、Qwen 或
Seedream 时直接启用 `_ai.yml` 中对应示例块，不需要修改服务端代码。

YAML 提供默认值；环境变量按 `HAI_<配置名>_<YAML 路径>` 自动覆盖，
且优先级高于 YAML。camelCase key 不拆词，例如 `llm.apiKey` 对应
`HAI_AI_LLM_APIKEY`。数组模型密钥可使用索引约定名，也可像当前图片示例一样
在 YAML 中显式绑定稳定的厂商变量名。

| 环境变量                           | 用途                         |
| ---------------------------------- | ---------------------------- |
| `HAI_AI_LLM_APIKEY`                | 默认 MiMo 对话与音频密钥     |
| `HAI_AI_IMAGE_POLLINATIONS_APIKEY` | 默认 Pollinations 文生图密钥 |
| 其它厂商密钥                       | 见 `_ai.yml` 的注释示例      |

`_core.yml` 默认将开发日志设为 `debug`。文生图日志包含厂商、模型、尺寸、
参考图数量、耗时、HTTP 状态、上游错误码和请求 ID；不会记录密钥、提示词或图片内容。
Pollinations 返回 HTTP 402 表示账户余额或该 API Key 的预算耗尽，请在
[Pollinations 控制台](https://enter.pollinations.ai/) 检查余额、模型白名单和 Key 预算。

### 镜像构建与部署

在本应用目录执行，镜像定义为 `images/app.Dockerfile`，`hai.build.json` 指定文件与仓库根构建上下文。Web 运行配置位于 `images/web/`（如有）。应用版本来自本目录的 `package.json.version`。

```sh
pnpm build:images                         # 只构建镜像并导出 tar
pnpm run deploy --env prod --build        # 构建、打包、上传、启动并检查访问
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

先准备 `.env.prod` 与 `config/_deploy.yml`；首次向导以说明文字收集服务器连接信息并保存到 `.env.local`。完整离线包包含应用和自建中间件镜像，目标 Linux 需预装容器引擎、Compose 与脚本要求的工具。把 tar 和同名 `-deploy/` 目录一起搬到操作机，Windows 执行 `deploy.ps1`，Linux/macOS 执行 `deploy.sh`；完全隔离的服务器解包后执行 `sh apply.sh`。

已有成功安装时，可用 `--services app` 只更新本应用；多个镜像的工程按服务名选择。局部发布保留其他容器和持久化卷，不执行整个项目 `down`，失败保留诊断并尝试恢复旧容器。相同版本允许重建，每次以独立构建 ID 区分内容。`images/dependencies/` 为忽略 Git 的依赖输入，配合引擎缓存和分层减少重复下载。

完整参数、缓存、版本与恢复说明见[使用指南](../../docs/usage/README.md#4-编译源码与打包产物)。移动端和桌面端的原生安装包仍需在对应系统另行构建；容器部署交付的是 Web 页面。

## 开发测试

默认 E2E 拦截外部 AI 请求，只验证完整 UI 交互，稳定且不消耗额度：

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

服务端限流使用 @h-ai/cache：开发默认memory，生产必须配置共享Redis（HAI_CACHE_TYPE=redis及连接参数），并确保所有实例使用相同namespace和窗口。缓存不可用时503，超限429；HAI_E2E_MOCK仅用于测试，不得用于部署。初始化由hooks保证，AI和限流使用同一config目录。
