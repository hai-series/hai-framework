# 原生 ACP 与 OpenRouter 真实验收

`ai-acp-openrouter.e2e.test.ts` 使用实际 Codex、DeepSeek Harness 和真实 OpenRouter 模型，分别验证 embedded 和 builtin-service，共四组。它不会启动模拟模型服务或 stdio 网关。

每组先把唯一随机标识写入临时工作区的 `files/challenge.txt`。提示词只给文件名，智能体必须实际读取文件并写出 `files/result.txt`；先核验真实工具事件、正常结束和磁盘内容，再固定发出一个独立请求，要求用工具重新读取结果并返回完整标识。写入可以正常回复完成摘要，读回必须实际调用工具并在回复中包含标识。随后 close、导入另一个新标识，再用同一原生 sessionId 恢复并重复两个步骤。每组两轮、每轮两个固定请求，不按回复内容重试；固定口令、没有文件或没有实际工具调用均不能通过。

## 启用和准备

普通开发默认跳过。即使进程中存在密钥，也必须设置 `HAI_ACP_E2E_OPENROUTER=1` 或 `HAI_ACP_E2E_REQUIRED=1` 才会发送真实请求。设置 REQUIRED 后，缺少密钥、模型、能力、程序或镜像会失败，不会冒充跳过成功。密钥使用已有的服务端 `OPENROUTER_APIKEY` 环境变量，不写入仓库。

先安装与 `models/agents/*/agent.json` 相匹配的原生程序，并构建两个基础镜像。embedded 使用宿主的程序；builtin-service 使用指定镜像和一次性 volume。容器引擎 `auto` 优先就绪的 Podman，其次 Docker；验收只使用已存在的镜像，不隐式升级或安装工具。

内置 Podman 容器和本验收自行启动的 Goose 服务夹具不继承远程服务的代理变量，需在容器中直接访问 OpenRouter。业务部署如需代理，通过 Agent/workspace 的 `environmentRefs` 指定容器可访问的代理地址，勿使用宿主回环地址。此边界由实际容器回归覆盖，并保留显式代理注入的验证；已有自定义服务的网络与模型配置由服务部署方维护。

下面为 2026-11-01 实际验收通过的低价 Flash 模型；升级时重新核对模型目录、工具支持、协议及容量。`maxOutputTokens=65536` 是容量声明；dsh 的请求预算为 `min(maxTokens=1024, maxOutputTokens)`。Codex 的采样上限依其原生设置，测试另有限时与输出体积约束。一个智能体任务可能产生多次模型调用及工具调用。

```powershell
$env:HAI_ACP_E2E_REQUIRED = '1'
$env:HAI_ACP_E2E_MODEL = 'qwen/qwen3.7-flash'
$env:HAI_ACP_E2E_BASEURL = 'https://openrouter.ai/api/v1'
$env:HAI_ACP_E2E_CAPABILITIES = '{"contextWindow":1000000,"maxOutputTokens":65536,"inputModalities":["text","image"],"outputModalities":["text"],"toolCalling":true,"reasoning":{"supported":true,"efforts":["low","medium","high"]}}'
$env:HAI_ACP_E2E_IMAGE = 'localhost/hai-ai/codex-acp:2.5.0'
$env:HAI_ACP_E2E_DSH_IMAGE = 'localhost/hai-ai/deepseek-harness:0.2.1-rc.5'
pnpm.cmd --filter @h-ai/ai exec vitest run tests/ai-acp-openrouter.e2e.test.ts --maxWorkers=1
```

模型目录：[OpenRouter models API](https://openrouter.ai/api/v1/models)。测试只声明本次任务使用且原生适配器支持的 text/image 输入子集，不把模型的所有模态强加给智能体。

Linux/macOS 默认从 PATH 启动 `codex-acp` 和 `dsh`。Windows 尝试默认 AppData npm 安装目录中的 Node bin；非默认 prefix、二进制布局或独立安装可以明确配置：

```powershell
$env:HAI_ACP_E2E_CODEX_COMMAND = 'C:/Program Files/nodejs/node.exe'
$env:HAI_ACP_E2E_CODEX_ARGS = '["C:/your/npm/node_modules/@agentclientprotocol/codex-acp/dist/index.js"]'
$env:HAI_ACP_E2E_DSH_COMMAND = 'C:/Program Files/nodejs/node.exe'
$env:HAI_ACP_E2E_DSH_ARGS = '["C:/your/npm/node_modules/@deepseek-ai/dsh/lib/bin.js"]'
```

上面的 bin 路径必须替换为实际安装的 `package.json.bin`，不是固定安装契约。COMMAND 直接执行，ARGS 为 JSON 字符串数组，不经 shell；Windows `.cmd/.bat` 不可用作 COMMAND。

## Goose HTTP/WS 与六组验收

构建 `hai-ai/goose:1.57.0` 后，在上面的模型配置基础上启用 Goose。它自行配置模型，Hai 通过原生 custom-service 连接 `/acp`，分别验证 HTTP 和 WS 的鉴权、工具和恢复：

```powershell
$env:HAI_ACP_E2E_GOOSE = '1'
$env:HAI_ACP_E2E_GOOSE_IMAGE = 'localhost/hai-ai/goose:1.57.0'
pnpm.cmd --filter @h-ai/ai exec vitest run tests/ai-acp-openrouter.e2e.test.ts tests/ai-acp-goose.e2e.test.ts --maxWorkers=1
```

读回回复可含原生 commentary 或 Markdown，但必须包含完整随机标记；文件内容仍逐字匹配，写入和读回分别要求真实工具事件，并核验相同 nativeId 的第二轮恢复。六组使用相同的两步验收方式，不要求模型在写入确认摘要中复述文件内容。真实上游的可用区域可能不同，以目标执行环境实测为准。

## 证据和清理

六组证据写入 `packages/ai/test-results/acp-openrouter/*.json`，包含开始/结束时间、真实模型、模式与传输、ACP 事件白名单摘要、两轮随机标识、实际文件内容、写入确认和读回回复、两步各自的工具调用计数、恢复的 nativeId 及清理状态。配置、环境变量、密钥、请求头和完整工具输入不写入证据；已知密钥和 Bearer 形式再次脱敏。

在仓库根目录生成截图：

```powershell
node scripts/render-acp-evidence.mjs --require-records
```

截图来自本次 JSON 证据，仅当所选六组均 `passed` 且清理成功时表示完整通过。测试失败保留脱敏证据，便于查看失败阶段。测试的 finally 关闭拥有的会话和进程、回收专属容器/volume、删除专属临时目录；不删除公共镜像、用户项目或其他容器。`test-results` 不提交 Git。
