# ACP Agent 镜像

为 `ai.acp` 提供原生Agent环境。Codex/DSH使用builtin-service的stdio，Goose运行原生HTTP/WS服务后通过custom-service连接。镜像默认以node用户运行，不挂载容器引擎socket；执行Agent仍需可信工作区和业务授权，非root不等于不可信代码沙箱。

## 快速开始

在框架根准备可用引擎并构建：

```sh
pnpm --filter @h-ai/ai agent:build codex-acp
pnpm --filter @h-ai/ai agent:build deepseek-harness --engine=podman
pnpm --filter @h-ai/ai agent:build goose
```

输入镜像种类和可选引擎，输出agent.json指定标签的本地镜像。auto优先就绪Podman，再选Docker；显式选择不降级。构建需Debian/npm网络，Goose还需固定官方二进制下载和SHA256核验。

## 功能

### 镜像与工具链

| 镜像                               | 执行契约与输入                               | 输出                                  |
| ---------------------------------- | -------------------------------------------- | ------------------------------------- |
| hai-ai/codex-acp:2.5.0             | codex-acp2.5.0 + Codex0.165.0，stdio         | 原生ACP会话、工具事件和工程文件       |
| hai-ai/deepseek-harness:0.2.1-rc.5 | dsh0.2.1-rc.5，profile=acp                   | 原生stdio会话与工具结果               |
| hai-ai/goose:1.57.0                | 官方linux/amd64 musl二进制，原生/acp HTTP/WS | 远程ACP连接、工具事件与服务端工程文件 |

所有镜像含 Git、Node 24、Python 3。Codex 镜像还包含 Debian 的 bubblewrap，宿主容器引擎需支持容器内的 Codex 工作区沙箱。用 `--java --rust --go` 按需增加 JDK、Rust/Cargo、Go，例如：

```sh
pnpm --filter @h-ai/ai agent:build codex-acp --engine=docker --java --rust --go
```

输入工具链标志后，输出镜像中才包含对应编译器；缺Git会明确失败。Goose二进制固定linux/amd64，不能在其他架构上假定可运行。

### 本机托管容器

builtin-service绑定Hai模型和持久volume。示例写入服务端AI配置，替换模型端点、型号和凭据：

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
      image: hai-ai/codex-acp:2.5.0
      engine: auto
      modelIds: [coding]
      defaultModelId: coding
  workspaces:
    - id: project
      storage: {type: volume, name: project-work, image: 'hai-ai/codex-acp:2.5.0', engine: auto}
      repositories: []
      gitEnvironmentRefs: {GIT_ASKPASS: HAI_GIT_ASKPASS}
```

输入coder/project和受控任务，输出会话事件以及/workspace中的文件；必须独立读回文件确认真实工具效果。工作卷挂/workspace，持久状态卷 `<name>-state` 挂/state。关闭容器保留两个卷，清理数据前按业务备份核对。

Agent与workspace的image/engine保持一致。仓库url/mainBranch显式登记；受管远程Git秘密只放workspace.gitEnvironmentRefs，在clone/fetch/push时解析，不传给Agent。Agent专用变量放agents[].environmentRefs，共用workspace.environmentRefs不放Git专属凭据。

### Goose原生远程服务

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

镜像版本、程序和传输见各目录agent.json，构建选项仅为 `--engine=auto|podman|docker`、`--java`、`--rust`、`--go`。源码镜像与实际原生程序配套维护。

代理通过Agent/workspace环境引用显式提供，并使用容器可达地址。Podman VM不能访问宿主127.0.0.1代理，受管运行不自动继承引擎服务代理。能力容量、超时、模型绑定和凭据隔离见[ACP接入](../../../cli/templates/skills/hai-ai/acp.md)与[配置手册](../../../../docs/usage/configuration/ai.md)。

## 错误处理

无可用引擎、未知选项或镜像构建失败返回非零码。会话接入还可能因原生程序、模型协议、权限、凭据或工作区不符失败；分别核对并保留脱敏事件，不将握手当工具执行成功。取消/超时后先核对外部动作，不能无条件重放任务。服务端日志和客户端诊断不打印密钥或完整私密模型定义。

## 开发测试

AI包test:e2e包含stdio/HTTP/WS、临时Git remote和容器卷测试。HAI_ACP_E2E_IMAGE指定已构建镜像，HAI_ACP_E2E_ENGINE选择引擎；缺少镜像时相应测试跳过，不算容器通过。DSH专用镜像变量为HAI_ACP_E2E_DSH_IMAGE。

Goose真实服务测试需要HAI_ACP_E2E_GOOSE=1、HAI_ACP_E2E_GOOSE_IMAGE和OPENROUTER_APIKEY，模型可由HAI_ACP_E2E_GOOSE_MODEL覆盖。它检查HTTP/WS鉴权、工具读写及实际声明的恢复能力；未声明恢复就验证明确不支持。

Codex/DSH真实模型四组合的准备、显式启用、费用及输出证据见[真实模型验收](../../tests/ACP-OPENROUTER.md)。仅存在密钥不会自动执行；夹具协议通过不能代替真实模型工具流程或生产工作区验收。

## 许可证

Apache-2.0
