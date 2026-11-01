# ACP Agent 镜像

## 用途

为 `ai.acp` 的 builtin-service 提供原生 stdio 智能体执行环境。默认非 root 用户 node，不包含引擎 socket。镜像启动、配置生成和工作区绑定由 AI ACP 子功能负责；不把 stdio 转成 HTTP/WS。

## 构建与使用

```sh
pnpm --filter @h-ai/ai agent:build codex-acp
pnpm --filter @h-ai/ai agent:build deepseek-harness --engine=podman
pnpm --filter @h-ai/ai agent:build codex-acp --engine=docker --java --rust --go
```

auto 默认先探测可用 Podman，再探测 Docker；显式选择不会降级。镜像标签来自各目录 agent.json。

| 镜像                               | 必需程序                             |
| ---------------------------------- | ------------------------------------ |
| hai-ai/codex-acp:2.5.0             | codex-acp 2.5.0 + 原生 codex 0.165.0 |
| hai-ai/deepseek-harness:0.2.1-rc.5 | dsh 0.2.1-rc.5，profile=acp          |

所有镜像含 Git、Node 24、Python 3；可选 Java JDK、Rust/Cargo、Go。Git 缺失属于明确错误，不降级跳过。构建需要 Debian 和 npm 网络访问；版本升级应同步 manifest、Dockerfile、适配器和实际 Agent E2E。

Agent 配置指定 builtin-service、adapter、image、modelIds；workspace 指定 volume、name、相同 image 和 engine。workspace 卷挂 `/workspace`，持久状态卷 `<name>-state` 挂 `/state`。Git/worktree 和 Agent 都在同样的容器路径执行，关闭容器不删除两个卷。Git 认证使用 workspace.environmentRefs，由宿主注入环境；不把密钥写进镜像。

完整 API 示例见 [ACP 接入指南](../../../cli/templates/skills/hai-ai/acp.md)。

## 验证

AI 包的 `test:e2e` 包含原生 stdio/HTTP/WS、临时 Git remote 和容器卷测试。容器 E2E 用 `HAI_ACP_E2E_IMAGE` 指定已构建的镜像，`HAI_ACP_E2E_ENGINE` 可选 auto/podman/docker。未提供镜像时明确跳过容器测试，不能视为容器通过。`HAI_ACP_E2E_DSH_IMAGE` 开启真实 DeepSeek Harness 验收；native E2E 使用镜像内实际 Codex/dsh 和容器内测试模型 HTTP 服务，检查模型配置、认证、协议请求和返回文本。真实模型推理仍需部署方自己的模型端点，夹具推理不代表真实模型验收。

## 许可证

Apache-2.0
