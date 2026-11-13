# ACP 新建会话等待的定位与复测

日期：2026-11-13。对应[三种 Worker 模式方案](acp-multi-user-platform-plan.md)。已在 Codex 适配器实现启动配置，以下保留修复前后的对照和本次验收记录。

## 1. 已确认的结论

两段约 5 秒等待都与远程模型目录刷新有关。不是固定的 sleep，也不是模型推理耗时。当前提供方配置只进入 thread，没有在 App Server 启动时生效；目录管理因此仍使用默认提供方。

在独立 `CODEX_HOME/config.toml` 中提前配置 Hai 提供方后，断网时新建 session 约 10–26 ms；真实 DeepSeek 网关下约 11–54 ms。真实模型回答成功，仍另有数秒的 prompt 响应时间。这里只确认固定版本和本次环境，不外推所有 ACP Agent。

## 2. 源码上的完整路径

| 位置 | 核验结果 |
| --- | --- |
| 修复前的 [Hai Codex 适配器](../packages/ai/src/acp/ai-acp-adapters.ts) | 设置 `MODEL_PROVIDER=hai` 和 `CODEX_CONFIG`，没有生成启动用的 `config.toml` |
| [codex-acp 2.5.0 入口](https://github.com/agentclientprotocol/codex-acp/blob/v2.5.0/src/index.ts) | 读取 `CODEX_CONFIG`；分别构造 App Server 启动参数和会话配置 |
| [CodexHookConfig.ts](https://github.com/agentclientprotocol/codex-acp/blob/v2.5.0/src/CodexHookConfig.ts) | 只将 `hooks` 提前转换为 App Server 参数，其余配置留给会话 |
| [CodexAcpClient.ts](https://github.com/agentclientprotocol/codex-acp/blob/v2.5.0/src/CodexAcpClient.ts) | `newSession` 先 `threadStart`，再 `fetchAvailableModels`；后者调用 `model/list` |
| [Codex 0.165.0 models endpoint](https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/model-provider/src/models_endpoint.rs) | `MODELS_REFRESH_TIMEOUT = Duration::from_secs(5)`；默认 API-key 目录路径可转到 Codex 后端，并非 Hai 模型推理地址 |
| [models manager](https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/models-manager/src/manager.rs) | 目录刷新受提供方、认证模式、发现开关及缓存策略控制；成功缓存有 300 秒 TTL，刷新失败不会生成成功缓存 |
| [features](https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/features/src/lib.rs) | 该版本 `api_key_model_discovery` 默认启用 |

因而同一个 `session/new` 的两个顺序调用都可能消耗一次目录超时。下一次新建也可能重试；只预热进程或设置会话配置不能保证消除它。开始 prompt 的 `turn/start` 在本次基线里也出现了额外数秒等待。

## 3. 实验输入和测量方法

- 主机：Ubuntu，i7-12700K，20 个逻辑 CPU，约 30.4 GiB RAM；rootless Podman、cgroup v2。宿主还有其他服务运行，未做独占节点压测。
- 本轮使用现有镜像 `localhost/hai-builder-t007-codex:2.5.0-0.165.0`，核对原生版本为 Codex ACP 2.5.0 / Codex 0.165.0。容器限额为 2 CPU、1 GiB、256 PID。
- 每种配置启动新的 ACP 进程，使用全新 `/state` 临时状态目录，工作目录 `/workspace`，没有 Git 克隆、附件和外部 MCP。
- 通过真实 stdio JSON-RPC 调用 `initialize → session/new → session/close`，用单调时钟记录；透明转发器只记录原生 RPC 方法名及耗时，不保存参数和密钥。
- 断网对照使用 `--network none` 和占位 key；每种配置 3 次新建。真实网关最终对照每种配置 5 次新建，保留首个 session，关闭后续 session；全部新建结束后才对首个 session 发起一次 prompt，避免模型请求干扰新建计时。
- 真实 key 从用户指定的 `.env.local` 读取，仅作为进程环境传入；不把文件挂到容器，不输出 key，也不修改该文件。真实模型为 `deepseek-flash`，地址为 `https://api.deepseek.com`，使用 Responses 协议。
- 默认目录认证使用占位 key，Hai 提供方使用独立环境变量中的真实 key，避免第三方 key 被默认目录请求带走。与当前适配器的差异是凭据环境变量分离，API-key 认证流程不变；不据此预测有效 OpenAI key 或 ChatGPT 登录的表现。
- prompt 只要求返回 `ACP_GATEWAY_OK`，不要求调用工具或读取文件。最后两组均正确返回，并以 `end_turn` 结束。未验证工具调用、图片、多轮长上下文和并发吞吐。

此前性能评估另行按仓库当前 Dockerfile 构建过带 bubblewrap 的镜像，用于沙箱、文档与镜像体积测量；已清理该次临时镜像。本轮使用的现有镜像不作为当前 Dockerfile 完整环境验收依据；两轮共同固定了 Agent 版本。

## 4. 断网对照结果

单位为毫秒，每行同一进程连续创建 3 个 session。

| 配置 | 第 1 次 | 第 2 次 | 第 3 次 | 说明 |
| --- | ---: | ---: | ---: | --- |
| 现有会话配置 | 10063.419 | 10032.022 | 10015.082 | 两次目录刷新超时仍在 |
| 只在 `CODEX_CONFIG` 关闭目录发现 | 10047.907 | 10041.448 | 10027.733 | 会话设置没有修正启动阶段的目录管理 |
| 在启动 `config.toml` 关闭目录发现 | 33.171 | 17.736 | 13.731 | 可避免等待，但提供方仍应正确配置 |
| 在启动 `config.toml` 配置 Hai 提供方 | 26.038 | 10.172 | 14.927 | 优先采用的修复方向 |

基线第 1 次底层 `thread/start = 5036.245 ms`，`model/list = 5009.412 ms`。启动提供方配置组第 1 次分别为 `12.601 ms`、`1.277 ms`。

## 5. 真实网关最终对照结果

每组 1 个新 Worker、5 次新建，不把首次和后续新建混称为大量独立冷启动。没有计算 P95/P99。

| 指标 | 当前配置 | 启动时加载提供方 |
| --- | ---: | ---: |
| 进程启动到 ACP initialize 完成 | 168.995 ms | 170.871 ms |
| 第 1 次 session/new | 7984.403 ms | 23.189 ms |
| 第 2 次 | 4696.026 ms | 11.060 ms |
| 第 3 次 | 7375.150 ms | 10.920 ms |
| 第 4 次 | 2656.431 ms | 53.644 ms |
| 第 5 次 | 7447.669 ms | 30.341 ms |
| session/new 中位数 | 7375.150 ms | 23.189 ms |
| 第 1 次 thread/start | 2959.164 ms | 10.794 ms |
| 第 1 次 model/list | 5008.627 ms | 1.064 ms |
| prompt 内的 turn/start | 4239.977 ms | 18.192 ms |
| prompt 到实际回答首字 | 10304.732 ms | 5894.854 ms |
| prompt 到最终完成 | 10392.230 ms | 5952.109 ms |
| 回答校验 | 通过 | 通过 |

prompt 指标各只有一次，不能给出模型服务的稳定延迟或加速比例。首字时间已排除 ACP 提前转发的 `Model metadata ... not found` 警告；初版探针曾把该警告当成首字，得到不正确的个位数毫秒，已作废该统计。

两组真实短回答后，进程树 PSS 分别约 182.00 / 160.94 MiB，RSS 约 266.61 / 299.32 MiB。PSS 受共享页分摊和临时子进程影响，这两次快照不构成优化内存收益证明，也不等于容器峰值。

## 6. 正式代码与验收

`ACPAgentAdapter.configure()` 同时生成会话配置和启动用的 `config.toml`。运行时在连接前写入受管状态目录。模型条目按精确目录 ID 选择，凭据通过进程专用环境变量传给该提供方。

```toml
model_provider = "hai"
model = "deepseek-flash"

[model_providers.hai]
name = "Hai"
base_url = "https://api.deepseek.com"
wire_api = "responses"
env_key = "HAI_ACP_CODEX_MODEL_KEY"
```

复测使用 Codex ACP 2.5.0 / Codex 0.165.0，每组新启一个进程，在同一进程连续新建 3 次。探针采用正式适配器的配置结构和专用凭据变量。

| 环境 | 原生初始化 | 原生 session/new（ms） | prompt |
| --- | ---: | --- | --- |
| Podman 禁网，离线凭据 | 167.25 ms | 19.99 / 11.04 / 9.24 | 未发送 |
| DeepSeek Responses，`deepseek-flash` | 148.56 ms | 21.20 / 9.97 / 9.70 | 首字 984 ms，1063 ms 完成，返回 `ACP_GATEWAY_OK` |

测试覆盖启动和会话配置一致、TOML 字符转义、精确模型选择、凭据只经环境传递。框架的原生 Codex 集成用例通过本地 Responses 服务验证会话启动、发送请求的实际模型和凭据、项目规则与 skill 发现。Codex 首轮结束时可能发起辅助标题请求，集成测试只记录用户提示词对应的首个请求。

Codex 模型条目应显式使用 `protocol: responses`。网关默认 `chat` 可继续供其他调用使用。真实 prompt 为单样本；多轮恢复、其他网关、原生模型元数据和并发仍需分别验收。[DeepSeek Responses 文档](https://api-docs.deepseek.com/guides/responses_api/)

本机原始探针和结果位于被 Git 忽略的 `tmp/acp-three-modes-20261113/`：`latency-probe.py`、`real-probe.py`、`codex-proxy.py`、`latency-offline.jsonl`、`real-final.jsonl`。早期 `latency-real.jsonl` / `real-diagnostic.jsonl` 保留用于解释警告事件，正式首字数字只取 `real-final.jsonl`。临时容器随运行结束自动移除，临时状态清理；现有用户镜像和服务未改动。
