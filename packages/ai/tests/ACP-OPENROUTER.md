# 原生 ACP 与 OpenRouter 真实验收

`ai-acp-openrouter.e2e.test.ts` 使用实际 Codex、DeepSeek Harness 和真实 OpenRouter 模型，分别验证 embedded 和 builtin-service，共四组。它不会启动模拟模型服务或 stdio 网关。

每组先把唯一随机标识写入临时工作区的 `files/challenge.txt`。提示词只给文件名，智能体必须实际读取文件、写出 `files/result.txt`，并返回相同标识。测试核验 ACP 工具事件和磁盘内容；随后 close、向工作区导入另一个新标识，再用同一原生 sessionId 恢复并重复读写，核验原生历史和文件持久性。只返回固定口令或没有实际文件不能通过。

## 启用和准备

普通开发默认跳过。即使进程中存在密钥，也必须设置 `HAI_ACP_E2E_OPENROUTER=1` 或 `HAI_ACP_E2E_REQUIRED=1` 才会发送真实请求。设置 REQUIRED 后，缺少密钥、模型、能力、程序或镜像会失败，不会冒充跳过成功。密钥使用已有的服务端 `OPENROUTER_APIKEY` 环境变量，不写入仓库。

先安装与 `models/agents/*/agent.json` 相匹配的原生程序，并构建两个基础镜像。embedded 使用宿主的程序；builtin-service 使用指定镜像和一次性 volume。容器引擎 `auto` 优先就绪的 Podman，其次 Docker；验收只使用已存在的镜像，不隐式升级或安装工具。

下面为 2026-11-01 核对的 OpenRouter 模型示例；升级时重新核对模型目录、工具支持、协议及容量。`maxTokens=1024` 是本次验收的请求预算，`maxOutputTokens=65535` 是供应商声明的容量，两者不能混用。一个智能体任务可能产生多次模型调用及工具调用。

```powershell
$env:HAI_ACP_E2E_REQUIRED = '1'
$env:HAI_ACP_E2E_MODEL = 'google/gemini-2.5-flash-lite'
$env:HAI_ACP_E2E_BASEURL = 'https://openrouter.ai/api/v1'
$env:HAI_ACP_E2E_CAPABILITIES = '{"contextWindow":1048576,"maxOutputTokens":65535,"inputModalities":["text","image"],"outputModalities":["text"],"toolCalling":true,"reasoning":{"supported":false}}'
$env:HAI_ACP_E2E_IMAGE = 'localhost/hai-ai/codex-acp:2.5.0'
$env:HAI_ACP_E2E_DSH_IMAGE = 'localhost/hai-ai/deepseek-harness:0.2.1-rc.5'
pnpm.cmd --filter @h-ai/ai exec vitest run tests/ai-acp-openrouter.e2e.test.ts --maxWorkers=1
```

模型目录：[OpenRouter models API](https://openrouter.ai/api/v1/models)。测试只声明本次任务使用且原生适配器支持的 text/image 输入子集，不把模型的所有模态强加给智能体。

Linux/macOS 默认从 PATH 启动 `codex-acp` 和 `dsh`。Windows 尝试默认 AppData npm 安装目录中的 Node bin；非默认 prefix、二进制布局或独立安装可以明确配置：

```powershell
$env:HAI_ACP_E2E_CODEX_COMMAND = 'C:/Program Files/nodejs/node.exe'
$env:HAI_ACP_E2E_CODEX_ARGS = '["C:/your/npm/node_modules/@agentclientprotocol/codex-acp/bin/codex-acp.js"]'
$env:HAI_ACP_E2E_DSH_COMMAND = 'C:/Program Files/nodejs/node.exe'
$env:HAI_ACP_E2E_DSH_ARGS = '["C:/your/npm/node_modules/@deepseek-ai/dsh/bin/dsh.js"]'
```

上面的 bin 路径必须替换为实际安装的 `package.json.bin`，不是固定安装契约。COMMAND 直接执行，ARGS 为 JSON 字符串数组，不经 shell；Windows `.cmd/.bat` 不可用作 COMMAND。

## 证据和清理

四组证据写入 `packages/ai/test-results/acp-openrouter/*.json`，包含开始/结束时间、真实模型与模式、ACP 事件白名单摘要、两轮随机标识、实际文件内容、回复、工具调用计数、恢复的 nativeId 及清理状态。配置、环境变量、密钥、请求头和完整工具输入不写入证据；已知密钥和 Bearer 形式再次脱敏。

在仓库根目录生成截图：

```powershell
node scripts/render-acp-evidence.mjs --require-records
```

截图来自本次 JSON 证据，仅当四组均 `passed` 且清理成功时表示完整通过。测试失败保留脱敏证据，便于查看失败阶段。测试的 finally 关闭拥有的会话和进程、回收专属容器/volume、删除专属临时目录；不删除公共镜像、用户项目或其他容器。`test-results` 不提交 Git。
