# ACP Agent 镜像

为 `ai.acp` 提供原生 Agent 环境。Codex、DSH 和 Goose 均支持受管 stdio。Goose 也可以启动 HTTP/WS 服务，由 `custom-service` 接入。镜像默认以 node 用户运行，执行 Agent 仍需可信工作区和业务授权。

## 快速开始

在框架根准备可用引擎并构建：

```sh
pnpm --filter @h-ai/ai agent:build codex-acp
pnpm --filter @h-ai/ai agent:build deepseek-harness --engine=podman --variant=documents
pnpm --filter @h-ai/ai agent:build goose --variant=office
```

脚本输出 JSON，包括 `image` 本地标签、`imageId` 本地镜像 ID、`variant` 和 `engine`。构建日志走标准错误。默认变体为 `minimal`。`auto` 优先就绪的 Podman，再尝试 Docker；显式选择的引擎须可用。构建需 Debian/npm 网络，Goose 还需下载固定版本的官方二进制并核验 SHA256。

## 功能

### 镜像与工具链

| 镜像仓库                  | 执行契约与输入                                                 | 输出                              |
| ------------------------- | -------------------------------------------------------------- | --------------------------------- |
| `hai-ai/codex-acp`        | codex-acp 2.5.0 + Codex 0.165.0，stdio                         | 原生 ACP 会话、工具事件和工程文件 |
| `hai-ai/deepseek-harness` | dsh 0.2.1-rc.5，profile=acp                                    | 原生 stdio 会话与工具结果         |
| `hai-ai/goose`            | 官方 linux/amd64 musl 二进制，`goose acp` stdio 或原生 HTTP/WS | 原生 ACP 会话、工具事件和工程文件 |

| 变体        | 基于 minimal 增加的内容                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `minimal`   | Git、Node 24、证书及原生 Agent 所需运行时；Codex 另含 Debian 的 bubblewrap |
| `documents` | Python 3、DOCX/XLSX 库和 Poppler                                           |
| `office`    | documents 内容、LibreOffice Writer/Calc/Impress 和字体                     |
| `browser`   | Chromium 和字体                                                            |
| `developer` | 编译基础工具、Python 3、pip 和 venv，可另选 JDK、Rust/Cargo、Go            |

运行 Codex 工作区沙箱要求宿主容器引擎支持 bubblewrap。Chromium 镜像需要满足浏览器沙箱和部署网络策略。固定的文档、Office、OCR 和浏览器作业另有独立镜像。[独立工具镜像](../../tools/README.md)

在 developer 变体按需增加工具链。

```sh
pnpm --filter @h-ai/ai agent:build codex-acp --variant=developer --engine=docker --java --rust --go
```

标签格式为 `<原生版本>-<变体>[-工具链]-<完整镜像 ID>`，构建完成后以引擎报告的实际内容 ID 命名。不同配置或内容变化产生不同标签。运行节点使用同一节点构建的本地 `imageId`，或者使用推送后取得的 `registry/repository@sha256:...`。本地 `imageId` 是 OCI 配置摘要，远程仓库引用使用清单摘要。镜像配方固定基础镜像 digest；Debian 安全更新可能改变重建产物。

### 本机托管容器

builtin-service 绑定 Hai 模型和持久 volume。示例写入服务端 AI 配置，将 `ACP_AGENT_IMAGE` 设置为脚本输出的完整本地 `image`，再填写模型端点、型号和凭据。

```yaml
llm:
  models:
    - id: coding
      model: your-responses-model
      protocol: responses
      baseUrl: https://models.example.invalid/v1
      apiKey: ${MODEL_API_KEY}
acp:
  agents:
    - id: coder
      name: Codex
      mode: builtin-service
      adapter: codex
      image: ${ACP_AGENT_IMAGE}
      engine: auto
      modelIds: [coding]
      defaultModelId: coding
  workspaces:
    - id: project
      storage: {type: volume, name: project-work, image: '${ACP_AGENT_IMAGE}', engine: auto}
      repositories: []
      gitEnvironmentRefs: {GIT_ASKPASS: HAI_GIT_ASKPASS}
```

输入coder/project和受控任务，输出会话事件以及/workspace中的文件；必须独立读回文件确认真实工具效果。工作卷挂/workspace，持久状态卷 `<name>-state` 挂/state。关闭容器保留两个卷，清理数据前按业务备份核对。

Agent与workspace的image/engine保持一致。仓库url/mainBranch显式登记；受管远程Git秘密只放workspace.gitEnvironmentRefs，在clone/fetch/push时解析，不传给Agent。Agent专用变量放agents[].environmentRefs，共用workspace.environmentRefs不放Git专属凭据。

### Goose 受管接入和原生远程服务

受管 Goose 使用 `adapter: goose` 和 `mode: builtin-service`，Agent 与工作区使用同一 Goose 镜像，绑定 Hai 模型后由框架运行 `goose acp`。支持 Chat Completions、Responses 和 Anthropic。每个进程只注入所选模型的凭据，使用独立状态目录及 Goose 的逐次工具审批模式。

镜像入口为 `goose serve --host 0.0.0.0 --port 3284`，/acp提供HTTP和WebSocket，Developer扩展已启用。部署方配置GOOSE_PROVIDER/GOOSE_MODEL及供应商密钥；使用OpenRouter时为GOOSE_PROVIDER=openrouter和OPENROUTER_API_KEY。服务认证独立使用GOOSE_SERVER__SECRET_KEY，密钥不写入URL或镜像。

```yaml
acp:
  agents:
    - id: goose
      name: Goose
      mode: custom-service
      adapter: goose
      transport: http
      url: https://goose.internal.example/acp
      supportedTransports: [http, ws]
      headerEnv: {X-Secret-Key: HAI_GOOSE_SECRET}
```

输入原生服务地址和宿主密钥变量名，输出ACP连接和服务端会话事件；WebSocket改用transport=ws及wss地址。custom-service不绑定Hai modelIds，模型由远端维护。部署方挂载/workspace和/state、配置TLS及网络、登记对应工作区；Hai只管理连接/会话，不替远端维护模型、卷、Git或服务进程。

## 配置

原生版本、程序和传输见各目录的 `agent.json`。构建选项包括 `--engine=auto|podman|docker`、`--variant=minimal|documents|office|browser|developer` 及 developer 的 `--java`、`--rust`、`--go`。

代理通过Agent/workspace环境引用显式提供，并使用容器可达地址。Podman VM不能访问宿主127.0.0.1代理，受管运行不自动继承引擎服务代理。能力容量、超时、模型绑定和凭据隔离见[ACP接入](../../../cli/templates/skills/hai-ai/acp.md)与[配置手册](../../../../docs/usage/configuration/ai.md)。

## 错误处理

无可用引擎、未知选项或镜像构建失败返回非零码。会话接入还可能因原生程序、模型协议、权限、凭据或工作区不符失败；分别核对并保留脱敏事件，不将握手当工具执行成功。取消/超时后先核对外部动作，不能无条件重放任务。服务端日志和客户端诊断不打印密钥或完整私密模型定义。

## 开发测试

AI包test:e2e包含stdio/HTTP/WS、临时Git remote和容器卷测试。HAI_ACP_E2E_IMAGE指定已构建镜像，HAI_ACP_E2E_ENGINE选择引擎；缺少镜像时相应测试跳过，不算容器通过。DSH专用镜像变量为HAI_ACP_E2E_DSH_IMAGE。

Goose 真实远程服务测试需要 HAI_ACP_E2E_GOOSE=1、HAI_ACP_E2E_GOOSE_IMAGE 和 OPENROUTER_APIKEY，模型可由 HAI_ACP_E2E_GOOSE_MODEL 覆盖。它检查 HTTP/WS 鉴权、工具读写和恢复。受管 stdio 的本机验收可向 `HAI_ACP_E2E_GOOSE_COMMAND` 和 `HAI_ACP_E2E_DSH_COMMAND` 分别传入已安装的程序绝对路径，执行 `pnpm --filter @h-ai/ai test tests/ai-acp-native.e2e.test.ts`。这组用例启动真实 Agent 和本地模型夹具，检查握手、prompt、关闭、恢复及模型协议路径。

Codex/DSH真实模型四组合的准备、显式启用、费用及输出证据见[真实模型验收](../../tests/ACP-OPENROUTER.md)。仅存在密钥不会自动执行；夹具协议通过不能代替真实模型工具流程或生产工作区验收。

## 许可证

Apache-2.0
