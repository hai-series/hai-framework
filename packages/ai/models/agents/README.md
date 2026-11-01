# ACP Agent 镜像

## 用途

Codex/dsh 镜像为 `ai.acp` 的 builtin-service 提供原生 stdio 执行环境；Goose 镜像提供自身的原生 HTTP/WS 服务，通过 custom-service 接入。默认非 root 用户 node，不包含引擎 socket；不把 stdio 转成 HTTP/WS。

## 构建与使用

```sh
pnpm --filter @h-ai/ai agent:build codex-acp
pnpm --filter @h-ai/ai agent:build deepseek-harness --engine=podman
pnpm --filter @h-ai/ai agent:build goose
pnpm --filter @h-ai/ai agent:build codex-acp --engine=docker --java --rust --go
```

auto 默认先探测可用 Podman，再探测 Docker；显式选择不会降级。镜像标签来自各目录 agent.json。

| 镜像                               | 必需程序                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| hai-ai/codex-acp:2.5.0             | codex-acp 2.5.0 + 原生 codex 0.165.0                                          |
| hai-ai/deepseek-harness:0.2.1-rc.5 | dsh 0.2.1-rc.5，profile=acp                                                   |
| hai-ai/goose:1.57.0                | 官方 Goose 1.57.0 Linux amd64 musl 二进制，校验固定 SHA256，原生 /acp HTTP/WS |

所有镜像含 Git、Node 24、Python 3；可选 Java JDK、Rust/Cargo、Go。Git 缺失属于明确错误，不降级跳过。构建需要 Debian 和 npm 网络访问；版本升级应同步 manifest、Dockerfile、适配器和实际 Agent E2E。

Agent 配置指定 builtin-service、adapter、image、modelIds；workspace 指定 volume、name、相同 image 和 engine。workspace 卷挂 `/workspace`，持久状态卷 `<name>-state` 挂 `/state`。Git/worktree 和 Agent 都在同样的容器路径执行，关闭容器不删除两个卷。Git 认证使用 workspace.environmentRefs，由宿主注入环境；不把密钥写进镜像。

Podman 不继承其远程服务的代理变量。代理通过 Agent/workspace 的 environmentRefs 显式授予，并使用容器能访问的地址，不能直接使用宿主回环代理。

完整 API 示例见 [ACP 接入指南](../../../cli/templates/skills/hai-ai/acp.md)。

## Goose 原生远程服务

Goose 使用 `goose serve --host 0.0.0.0 --port 3284`，在 `/acp` 同时提供 HTTP 和 WebSocket。镜像预启用 Developer 扩展；模型由 Goose 服务端通过 `GOOSE_PROVIDER`、`GOOSE_MODEL` 和供应商密钥变量维护，Hai 的 custom-service 不注入模型配置。OpenRouter 对应 `GOOSE_PROVIDER=openrouter` 和 `OPENROUTER_API_KEY`。服务凭据使用独立的 `GOOSE_SERVER__SECRET_KEY`，客户端用 `headerEnv` 注入 `X-Secret-Key`；不将密钥写在地址中。依据：[固定版本 ACP 文档](https://github.com/aaif-goose/goose/blob/v1.57.0/documentation/docs/gdk/acp/index.md)、[供应商配置](https://github.com/aaif-goose/goose/blob/v1.57.0/documentation/docs/getting-started/providers.md)。

部署方启动容器，将工作区卷挂到 `/workspace`、状态卷挂到 `/state`，再登记 Hai 自定义服务。Hai 只管理 ACP 连接和原生会话；远程服务、卷、Git 与模型的生命周期由部署方管理。镜像当前只提供 linux/amd64；明确检查平台，不在其它架构上误装 x86 二进制。

`tests/ai-acp-goose.e2e.test.ts` 对真实 Goose 服务分别验证 HTTP/WS 鉴权、随机文件读写、原生工具调用；仅当握手声明恢复能力时验收恢复，否则验证显式不支持。设置 `HAI_ACP_E2E_GOOSE=1`、`HAI_ACP_E2E_GOOSE_IMAGE=hai-ai/goose:1.57.0` 和 `OPENROUTER_APIKEY` 启用；`HAI_ACP_E2E_GOOSE_MODEL` 可覆盖测试型号，默认沿用 `HAI_ACP_E2E_MODEL`，再回退 qwen/qwen3.7-flash。模型服务会发生真实调用，测试报告与截图沿用 `test-results/acp-openrouter`，不记录凭据。

## 验证

AI 包的 `test:e2e` 包含原生 stdio/HTTP/WS、临时 Git remote 和容器卷测试。容器 E2E 用 `HAI_ACP_E2E_IMAGE` 指定已构建的镜像，`HAI_ACP_E2E_ENGINE` 可选 auto/podman/docker。未提供镜像时明确跳过容器测试，不能视为容器通过。`HAI_ACP_E2E_DSH_IMAGE` 开启真实 DeepSeek Harness 验收；native E2E 使用镜像内实际 Codex/dsh 和容器内测试模型 HTTP 服务，检查模型配置、认证、协议请求和返回文本。真实模型推理仍需部署方自己的模型端点，夹具推理不代表真实模型验收。

连接真实 OpenRouter 的四组合（Codex/dsh × embedded/builtin-service）验收使用独立测试，核验实际工具读写与关闭后恢复，并保留脱敏 JSON 与截图。必须显式启用，普通开发与仅存在密钥时均不运行；操作步骤见 [真实模型验收](../../tests/ACP-OPENROUTER.md)。

## 许可证

Apache-2.0
