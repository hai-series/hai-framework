# @h-ai/ai 模型服务

在本机或受控服务器运行CPU/GPU推理服务，再通过AI模块的LLM/音频门面调用。模型镜像、权重、推理源码是不同制品：构建完成不表示权重齐全，健康成功不表示实际推理已验收。

推理工具和images目录供源码仓库开发/部署使用；npm发布包含dist及独立models/agents资产，不包含本目录全部推理工具。

## 快速开始

在框架根准备可用Docker/Podman，先查看与校验清单，再构建和运行：

```sh
pnpm model:list
node packages/ai/models/build.mjs inspect faster-whisper-large-v3
pnpm model faster-whisper-large-v3 --device cpu
pnpm model:run faster-whisper-large-v3 --device cpu --port 8101
```

输入模型名、设备和端口，输出镜像及本机 `http://127.0.0.1:8101` 服务。run仅发布宿主回环地址；首次运行需要下载权重，后续复用模型卷。用已获授权、无敏感内容的短录音确认转写，再进入业务接入。

## 功能

### 模型与命令

| 模型                    | 逻辑能力 / 服务协议          | 输入与输出                                              |
| ----------------------- | ---------------------------- | ------------------------------------------------------- |
| faster-whisper-large-v3 | audio.transcribe / whisper   | 音频文件→转写文本，可含段/词时间戳与VAD结果             |
| indextts-2.5            | audio.synthesize / indextts  | 文本与所需参考音频→合成音频，支持风格/语速/目标时长选项 |
| qwen3-4b                | llm.chat / OpenAI-compatible | 对话消息→回复或SSE，CPU使用x86_64官方vLLM CPU镜像       |

| 命令    | 场景与输入示例                                           | 输出                                                        |
| ------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| list    | `pnpm model:list`                                        | 可用清单与能力，不下载模型                                  |
| inspect | `node packages/ai/models/build.mjs inspect indextts-2.5` | 校验并显示该model.json                                      |
| prepare | `pnpm model:prepare indextts-2.5`                        | 按固定revision下载校验权重到.cache对应目录                  |
| build   | `pnpm model indextts-2.5 --device cpu`                   | 指定设备镜像，auto先选就绪Podman再Docker                    |
| run     | `pnpm model:run indextts-2.5 --device cpu --port 8102`   | 本机容器与健康结果；独立超时可用 `--health-timeout 1200000` |

显式 `--engine podman|docker` 不降级。GPU需要匹配CUDA/cuDNN、驱动和可用资源，CPU/GPU镜像不能仅靠环境变量互换。Qwen CPU默认上下文4096、KV cache2GiB；按实际资源和任务评估，不直接按模型最大容量预留。

### 固定源码与依赖缓存

IndexTTS的推理源码不在ModelScope权重里。构建器每轮从固定GitHub HTTPS树端点取得清单，校验目标tree及各文件Git blob SHA，再作为独立上下文交给引擎。匹配源码文件可复用；即使命中缓存，仍需要取得本轮树元数据。离线目标应运行预先完成的镜像，不把断网重构建当作已支持流程。

缓存与仓库父目录必须可信且稳定。缓存祖先拒绝symlink/junction，文件必须普通单链接；下载只进入本轮私有暂存目录，校验后原子发布，不跟随预置链接改写外部文件。下载失败清理本轮暂存，不发布完成标记；修复网络或路径后可重试。

### 离线权重与镜像

```sh
pnpm model:prepare indextts-2.5
pnpm model indextts-2.5 --device cpu --bundle-model
pnpm model:run indextts-2.5 --device cpu --bundled --port 8102
```

prepare输出固定权重，bundle-model把它装入独立 `*-bundled` 镜像，bundled选择该镜像运行。离线镜像启用HF_HUB_OFFLINE/TRANSFORMERS_OFFLINE；交付前在断网环境实际启动并推理，检查辅助权重也完整。普通在线模式优先ModelScope并复用卷，Hugging Face作为回退。推理源码、基础镜像、Python依赖和所有权重都要在交付前准备。

### 接入Framework

服务端初始化AI并配置实际可达地址。下例音频输入分别选择转写/合成，输出为文本/音频：

```yaml
# config/_ai.yml；密钥与模型容器的HAI_MODEL_API_KEY匹配。
audio:
  transcribeModel: whisper-main
  synthesizeModel: indextts-main
  models:
    - id: whisper-main
      provider: whisper
      model: faster-whisper-large-v3
      operations: [transcribe]
      baseUrl: http://127.0.0.1:8101/v1
      apiKey: ${LOCAL_MODEL_API_KEY}
    - id: indextts-main
      provider: indextts
      model: indextts-2.5
      operations: [synthesize]
      baseUrl: http://127.0.0.1:8102/v1
      apiKey: ${LOCAL_MODEL_API_KEY}
```

Qwen使用现有Chat Completions协议。`id` 是Hai选择名，`model` 是服务公开的型号：

```yaml
llm:
  models:
    - id: qwen-local
      model: qwen3-4b
      protocol: chat
      baseUrl: http://127.0.0.1:8103/v1
      apiKey: ${LOCAL_MODEL_API_KEY}
  scenarios: {chat: qwen-local, default: qwen-local}
```

上例输出应由qwen-local注册项处理，不能把未实现的provider字段当LLM协议。AI服务在另一容器/主机时，127.0.0.1不指模型宿主，改用显式生产部署的真实地址。完整调用与错误处理见[AI配置](../../../docs/usage/configuration/ai.md)。

### 服务契约与ACP镜像

Whisper/IndexTTS的 `GET /health` 返回status/model/device，`GET /v1/models` 返回模型列表；Qwen由vLLM提供对应入口，health为HTTP200。健康与列表不等于推理成功。音频接口为 `/v1/audio/transcriptions` / `/v1/audio/speech`，Qwen为 `/v1/chat/completions`。

[ACP Agent镜像](agents/README.md)是代码执行环境，通过ai.acp接入；不是LLM推理服务，不在llm模型池中注册它们。

## 配置

### model.json

清单字段包括schemaVersion/name/version/image/provides/protocol/devices/port/health、可选startupTimeout、权重model及推理source。name与目录一致，revision/tree使用真实完整40位提交值。现成输入见[Whisper清单](images/faster-whisper-large-v3/model.json)、[IndexTTS清单](images/indextts-2.5/model.json)、[Qwen清单](images/qwen3-4b/model.json)。inspect校验清单形状，实际下载另校验权重/源码。

### 环境变量、代理与认证

| 配置                                                              | 用途与边界                                                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| MODEL_PATH / DEVICE                                               | 容器权重位置与auto/cpu/cuda设备；run按清单和挂载装配                                                           |
| HAI_MODEL_API_KEY                                                 | 推理认证密钥。宿主已设置时run只通过引擎 `--env HAI_MODEL_API_KEY` 名字传入，不在argv打印值；为空时不启用此认证 |
| HAI_MODELSCOPE_ID / HAI_MODELSCOPE_REVISION                       | 显式覆盖权重来源及固定revision，需重新验证制品                                                                 |
| HAI_MODEL_OUTPUT_DIR                                              | prepare输出位置，由构建器注入                                                                                  |
| --proxy / --http-proxy / --https-proxy / --all-proxy / --no-proxy | 宿主下载代理与绕过；使用容器可达代理才能传入运行/构建                                                          |
| --container-proxy / HAI_CONTAINER_PROXY                           | 容器显式可达代理，Podman VM不能使用宿主loopback地址                                                            |
| VLLM_EXTRA_ARGS                                                   | Qwen额外可信推理参数，例如max-model-len；不接受api-key，凭据使用HAI_MODEL_API_KEY                              |

Qwen在进程内把统一密钥映射到vLLM的VLLM_API_KEY，启动日志不打印完整参数。客户端发送匹配Bearer；生产必须显式部署网络、HTTPS、凭据、资源限额和监控。本机run的回环限制不会把容器内部接口变成安全沙箱，推理健康/列表的开放范围按实际服务核对。

## 错误处理

清单非法、引擎未就绪、链接缓存、下载/校验失败和健康超时都会明确失败。健康失败会读取容器诊断并移除本轮容器；日志仍应由部署方避免记录秘密。先区分引擎网络、权重源、固定revision、资源不足与推理异常，不用反复延长超时掩盖原因。

## 开发测试

```sh
pnpm --filter @h-ai/ai typecheck
pnpm --filter @h-ai/ai lint
pnpm --filter @h-ai/ai exec vitest run tests/ai-models.test.ts tests/ai-model-source.test.ts tests/ai-model-run.test.ts tests/ai-model-qwen.test.ts
```

工具/引擎夹具和Python参数桥接不运行真实推理；CPU/GPU镜像、认证拒绝、模型输出和离线启动仍要用目标环境独立验证。模型权重或受限第三方服务不会因单元测试成功而自动可用。

## 许可证

Apache-2.0
