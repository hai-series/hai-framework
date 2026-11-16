# @h-ai/tools 配置清单

[功能说明](../function/tools.md) · [数据归属](../data/tools.md)

`tools.define/createRegistry` 是纯定义与工厂，无模块级 YAML、环境变量或 `init/close`。服务端工厂从 `@h-ai/tools/server` 导入，借用宿主已初始化的 Runner。

## 定义和轻量执行

| 配置位置 | 字段 | 默认和作用 |
| --- | --- | --- |
| 工具定义 | `name/description/parameters` | 必填；名称为 1～64 个 ASCII 字符，以字母开头，其余为字母、数字、下划线或连字符；参数使用 Zod 校验 |
| 工具定义 | `handler` 或 `resultHandler` | 必须且只能选一个；前者返回普通数据，后者返回已有 `HaiResult` |
| 工具定义 | `title/examples` | 可选界面名称和 `{ label, input }[]` 表单预设；不影响权限 |
| 工具定义 | `timeoutMs` | 整数 0～2147483647 毫秒；省略为 30 秒；0 立即超时 |
| 注册器 | `authorize` | 可选；配置后每次注册器调用都需通过 |
| 执行选项 | `signal` | 取消信号，继续透传给处理函数 |
| 执行选项 | `objectId/sessionId` | 可信主体和会话，不能取自未经认证的模型输入 |
| 执行选项 | `deadline/timeoutMs` | 绝对截止时间优先，之后为单次超时、工具超时、30 秒；覆盖校验、授权和处理函数 |
| 执行选项 | `authorize` | 单次额外授权，与注册器授权共同生效 |
| 批量执行 | `parallel` | 默认 false；只对可并行的调用启用 |

无效名称、默认超时或处理函数组合在定义时抛出 `TypeError`；执行失败返回 `HaiResult`。注册器只接受 `tools.define` 创建的工具。供模型使用的参数须能转换成 JSON Schema，通常使用对象参数。

## tools.createService

| 字段 | 必填或默认值 | 作用 |
| --- | --- | --- |
| `id` | 必填，1～60 个字母、数字、下划线、点或连字符 | 形成 Runner 类型 `hai.tools.<id>.v1`；同一服务各节点保持一致 |
| `runner` | 必填 | 已初始化的 Runner；服务不负责其生命周期 |
| `createTools` | 必填 | 接收可信 `ToolServiceContext`，返回 `ToolSet` 或 Promise；执行节点再次构造 |
| `enabled` | 必填 | `ToolSelection` 或上下文函数；组与工具取并集，再排除 `exclude`；`{}` 全部停用 |
| `authorize` | 必填 | 接收 `{ context, name, input, phase }`；`phase` 为 `submit` 或 `execute`，两个阶段均须允许 |
| `runTimeoutMs` | 300000 毫秒 | 执行时限，整数 1～86400000 |
| `queueTimeoutMs` | 300000 毫秒 | 排队时限，整数 1～86400000 |

`ToolServiceContext` 包括 `scope: { tenantId, userId }`、可选 `sessionId/signal`；真实 `execution` 由 Runner 执行节点补入。不要接受客户端自报的身份或执行上下文。

`ToolSet` 包括 `tools`、可选 `groups: { id, title, tools }[]` 及 `environments: Record<toolName, environmentId>`。环境映射将任务绑定到 Runner 环境，并在执行节点复核。`ToolSelection` 的字段为 `groups/tools/exclude`，值均为名称数组。

目录不逐项调用 `authorize`；需要按用户限制可见工具时，在 `createTools/enabled` 中筛选。授权、最终文件读取和提交仍在服务端检查，隐藏按钮不能替代停用。

调用 `service.submit/invoke` 时为同一用户意图保留稳定 idempotencyKey；响应未知时用 `service.find(key, context)` 找回，不生成新键重复提交。find 不受目录停用影响，仍按主体与服务核验旧任务。

## 产物和作业工厂

`tools.createArtifactTools({ context, files })` 需要 `ToolArtifactAccess.read/publish`，可选 `save`。未提供 `save` 时不包含 `artifact_save`。宿主负责版本、冲突、资源权限和字节存储。

`tools.createJobTools({ context, files, runner, environments, browserProxy? })` 的 `environments` 可配置以下键；省略的环境不生成对应工具。

| 环境键 | 工具 | 能力和出口要求 |
| --- | --- | --- |
| `documents` | `documents_extract/documents_generate` | 文档固定镜像；离线 |
| `office` | `office_convert/office_recalculate` | Office 固定镜像；离线 |
| `ocr` | `ocr_recognize` | OCR 固定镜像；离线 |
| `browser` | `browser_navigate` | 浏览器能力；内部网络与受控代理 |
| `web` | `web_capture` | 网页采集能力；内部网络与受控代理 |
| `preview` | `preview_build` | `preview.build` 固定构建镜像；离线 |
| `video` | `video_render` | 视频固定镜像；离线 |

`browser/web` 需要同时配置环境和 `browserProxy` 才进入目录。`browserProxy` 是可信宿主提供的 `http://非 loopback IPv4:port`，通过 `RunnerLaunch.env.HAI_TOOL_BROWSER_PROXY` 交给容器；模型不能指定或覆盖。可以复用已有模型出口代理，不要求另建一个代理服务。

browserProxy 必须是完整 IPv4 和显式端口组成的 HTTP 根地址（`http://<IPv4>:<port>`，可带结尾 /），端口为 1～65535；不支持主机名、IPv6、凭据、其他路径、query 或 fragment。拒绝 0.0.0.0、127.0.0.0/8、169.254.0.0/16、224.0.0.0/4。无效代理不会加入 browser/web 工具，宿主应先核对部署配置。

office/ocr 是环境键，其作业归 documents 组；browser/preview 环境的作业归 web 组。启用 documents/web 组并配置对应环境即可。

web/video 环境可从 resources.pids: 512 起测，并同步配置能容纳并发资源总量的 Runner toolCapacity；自定义资源对象须完整提供四项。实测浏览器在 128 的进程/线程额度下出现过 EAGAIN，512 是本次镜像的验收起点，不是适用于所有镜像和并发的保证。内存、CPU 与临时盘也需按负载测量。

视频环境本轮配置 `resources.scratchMiB: 6144`，节点配置 `toolCapacity.scratchMiB: 8192`；这些字段属于 Runner，不是 Tools 的新配置项。HyperFrames 0.9.56 在渲染前硬性要求临时目录与输出目录各至少有 1024 MiB 可用空间。含输入文件时 Runner 的 tmp 只分到总 scratchMiB 的四分之一，6144 MiB 为 tmp 留 1536 MiB；总量 512 MiB 无法满足该检查。配额不是已占用内存，不能绕过磁盘检查。节点物理预算还需覆盖视频、并发作业及 host 编排的 default 容量；6144/8192 是本轮起测值，不代表所有负载或完整流程已验收。详见 [作业资源说明](../../../packages/tools/jobs/README.md#配置)。

映射值是 Runner 环境 ID，而不是镜像名称。每个环境还须登记匹配的 capability、固定镜像及资源/网络配额，见 [作业说明](../../../packages/tools/jobs/README.md) 和 [Runner 配置](runner.md)。安装 Tools 不会下载镜像或启动容器。

AI 层的 website_video 仅在 `ai.tools.createBuiltinTools` 提供 `executeJob` 时登记，宿主仅转发同服务 web_capture/video_render。需要实际 LLM、默认 WAV TTS、web/video 环境及 browserProxy；长流程可显式设置服务 runTimeoutMs: 1200000，见 [功能流程](../function/tools.md#从网址生成可编辑介绍视频)。

## 应用和多节点

Tools 无全局启用开关；应用将自己的配置转换为工厂与 `enabled`。Hai Agent 使用 `workbench.selection` 复用 groups/tools/exclude：完全省略时选择默认内置组，显式 `{}` 全部停用。其工作台开关和环境映射见 [Agent 使用说明](../../../apps/agent/README.md#配置)。AI 图像和语音模型仍使用 [AI 配置](ai.md)。

同一服务各节点共享原有 Runner 数据库和 Storage，保持服务 ID、工具定义及环境配置一致；框架不创建新队列或状态表。API 节点可配置 Runner `executor: false`，执行节点配置唯一且重启稳定的 `nodeId`。执行节点会重新检查当前启用策略与授权；停用不能只改前端目录。

服务 `close()` 仅注销本服务处理器，不关闭借入的 Runner。取消后继续读取实际状态到终态，不能把停止等待当成进程已停止。

参数、单事件和输出还受 Runner 各 512 KiB JSON 上限；文件字节的 50 MiB 与 scratchMiB 是另一组约束，见 [数据边界](../data/tools.md#大小与保留期)。
