# 使用 ACP 智能体处理工程

[AI 内容与模型](ai.md) · [配置](../configuration/ai.md)

`ai.acp` 把智能体接入和项目目录管理放在服务端。应用仍负责用户权限、需求、任务状态、预览和业务部署，不必为每个智能体复制模型配置和 Git 工作流。

## 接入顺序

1. 在 Hai `llm.models` 登记模型，填写已确认的容量/输入模态/工具/推理能力。
2. 用 `agents.register` 登记 Codex、DeepSeek Harness 或通用 ACP 程序。本机选 embedded；容器选 builtin-service；已有远程地址选 custom-service。
3. 用 `workspaces.register` 登记 directory 或 volume，逐个 Git 写明 url 和 mainBranch。`prepare` 克隆缺失工程；`importFiles` 添加普通文件。
4. `sessions.create({ agentId, workspaceId, newWorktree: true })` 建立隔离会话。通过 prompt、stream 或 promptStructured 执行任务，处理每次返回的 HaiResult。
5. 完成后显式 publish 或 close；代码和状态保留，后续通过原生 resume 恢复。

## 支持范围

Codex/dsh 原生通过 stdio 连接。HTTP/WS 连接使用官方 SDK 的实验传输，服务要支持对应协议，不自动为仅支持 stdio 的 Agent 增设网关。custom-service 管理自己的模型和远端目录，Hai 不操作其 Git。

builtin-service 默认选择就绪 Podman，否则 Docker。挂载 workspace/state 持久卷，Git 与 Agent 始终使用容器内同一路径；所有镜像有 Git、Node、Python，构建时可选 Java/Rust/Go。Codex 镜像包含 ACP 适配器和 Codex CLI 两个组件。

共享目录只能有一个受管会话占用；需要并行时选 newWorktree。worktree 从当前已提交的本地主分支建立，普通文件复制，不自动 pull。它不提供安全隔离，评审只读和跨租户执行需要部署层限制权限。

## 更新和发布

`session.updateMain()` 停止该会话执行环境后，fetch 并 ff-only 更新每个登记的主分支；不更新 session 分支。`session.publish({ mode: 'push-branch', message, author })` 提交并推同名分支，`mode: 'merge-main'` 合并到明确的主分支再推送。只允许受管隔离 session 发布，不 force push。

多工程逐一执行，失败返回 `ACP_PARTIAL_FAILURE` 和每仓库报告，保留冲突和已完成操作。不要把跨仓库操作看成事务。继续编码用 sessions.resume；失联进程未确认停止时不能按超时抢占其目录。

托管 Git 首期支持普通仓库，发现子模块或 Git LFS 属性时返回 `ACP_UNSUPPORTED`，避免将不完整工程报告为准备成功。此类工程可由应用准备并通过低层 connect 管理原生会话。

## Goose 原生远程接入

框架提供 Goose 1.57.0 镜像，使用其自身的 `goose serve` 原生 `/acp` HTTP/WS 服务。登记为 `custom-service`，选择实际 transport、服务地址，并在 `headerEnv` 引用服务端 `X-Secret-Key` 凭据；传入服务端可见的 cwd。Goose 在服务端配置模型，Hai 不向自定义服务传入模型密钥。框架的 builtin-service 仍用于原生 stdio 进程，Goose 服务的容器、卷与 Git 由部署方管理。

真实远程验收分别检查 HTTP/WS 的认证失败、原生工具读取未披露随机标记并写回文件；根据握手声明决定验收原生恢复或明确不支持。示例与环境配置见生成项目的 `.agents/skills/hai-ai/acp.md`；官方协议依据见 [固定版本 Goose ACP 文档](https://github.com/aaif-goose/goose/blob/v1.57.0/documentation/docs/gdk/acp/index.md)。

## 模型与交互

Codex 需要 Responses 模型服务，现有 Hai 的客户端协议转换不会提供反向网关。DeepSeek Harness 支持自身的多供应商协议，通过原生配置引用 Hai 模型。自定义服务不接收 Hai 模型密钥。

权限请求默认取消；应用提供可信回调并声明 fs/terminal/elicitation 能力后才启用。终端能力需全套回调。图片、音频和远程 MCP 由握手能力控制。严格 JSON 输出只在完整结束并通过 Schema 时成功，取消、超时和无效输出不自动重试。

框架包 README 和生成项目的 `.agents/skills/hai-ai/acp.md` 包含完整 TypeScript 接入示例、原生配置扩展、环境变量和错误码。

## 配置与数据库清单

`llm.models`、`audio.models`、`image.models`、`mcp.servers`、`retrieval.sources`、`acp.agents`、`acp.workspaces` 同时读取初始化配置和数据库，按 ID 合并，配置优先且不可修改。对应 API 均提供 list/get/register/update/remove；条目包含 value/source，数据库 get 带 version。更新为完整替换，可附版本拒绝过期写入。配置不会被写入数据库。

ACP 会话通过 `mcpServerIds` 使用外部 MCP 清单；凭据用 environmentRefs/headerEnv 在启动时解析。运行中的会话保留模型绑定，恢复时检测配置变化。音频同步 getCapabilities 使用最近目录读写或异步调用刷新的快照。目录是可信服务端管理 API，不应直接向浏览器暴露含密钥的模型定义。

错误码 090 只读、091 不存在、092 冲突、093 无效定义、094 存储失败。CLI 生成项目中的 `.agents/skills/hai-ai/resources.md` 包含配置和 CRUD 示例。
