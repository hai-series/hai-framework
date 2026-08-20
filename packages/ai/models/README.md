# @h-ai/ai 模型服务

将开源模型部署为 CPU/GPU Model Service，通过统一 Provider 机制接入 hai-framework，支持完全离线运行。

镜像依赖固定到已验证的上游版本，模型清单分别记录 ModelScope 与 Hugging Face revision。普通运行优先从 ModelScope 下载权重并复用容器 volume，Hugging Face 仅作回退；离线部署可显式准备、校验并打包固定权重。

> 本目录仅在开发/部署阶段使用，不进入 npm 发布物（`package.json` 的 `files` 仅含 `dist`）。

## 能力概览

- 统一 `model.json` 清单：声明 `provides`（能做什么）与 `protocol`（用哪种 Provider 契约调用）。
- Node 构建工具 `build.mjs`：列表、校验、权重准备、镜像构建、本地运行。
- 每个模型一套 `Dockerfile` + `server.py` + `prepare.py`，支持 CPU/GPU 与离线打包。

首批模型：

| 名称                    | provides         | protocol | 说明                                 |
| ----------------------- | ---------------- | -------- | ------------------------------------ |
| faster-whisper-large-v3 | audio.transcribe | whisper  | ASR，段/词时间戳、VAD                |
| indextts-2.5            | audio.synthesize | indextts | TTS，说话人/风格参考、语速、目标时长 |
| qwen3-4b                | llm.chat         | openai   | 经 vLLM 暴露 OpenAI-compatible API   |

## 快速开始

```bash
# 在仓库根目录列出全部模型
pnpm model:list

# 校验某个模型清单
node packages/ai/models/build.mjs inspect indextts-2.5

# 构建 CPU 镜像（auto 默认优先 Podman，随后才尝试 Docker）
pnpm model indextts-2.5 --device cpu
pnpm model faster-whisper-large-v3 --device cpu
pnpm model qwen3-4b --device cpu

# 启动服务并等待健康检查；首次运行会下载并持久化权重
pnpm model:run faster-whisper-large-v3 --device cpu --port 8101
pnpm model:run indextts-2.5 --device cpu --port 8102
pnpm model:run qwen3-4b --device cpu --port 8103

# 也可显式选择引擎或宿主机代理
pnpm model indextts-2.5 --device cpu --engine podman --proxy http://127.0.0.1:10808
```

`--proxy` 用于宿主机拉取镜像/源码，并在容器可访问时传入构建与运行阶段。Windows/macOS 上 Podman 位于独立 VM；若代理只监听 `127.0.0.1`，工具不会把不可达地址注入容器。需要容器内联网时，请用 `--container-proxy http://<VM可达地址>:<端口>` 显式指定。

IndexTTS-2.5 的 ModelScope 仓库提供模型权重，不包含 `indextts/infer_v2_5.py` 等推理源码。构建工具因此在宿主机下载并校验固定 Git tree 的必要源码文件，再作为本地构建上下文交给 Podman/Docker；模型权重仍优先从 ModelScope 下载。

离线部署需要先准备权重，再构建独立的 `*-bundled` 镜像：

```bash
pnpm model:prepare indextts-2.5
pnpm model indextts-2.5 --device cpu --bundle-model
pnpm model:run indextts-2.5 --device cpu --bundled --port 8102
```

直接使用包内工具时，等价命令仍然可用：

```bash
node packages/ai/models/build.mjs build indextts-2.5 --device cpu
node packages/ai/models/build.mjs run indextts-2.5 --device cpu --port 8102
```

`model:run` 会使用清单中的模型级启动超时（Whisper 20 分钟，IndexTTS/Qwen 30 分钟），也可按实际网络和 CPU 冷启动时间覆盖：

```bash
pnpm model:run qwen3-4b --device cpu --health-timeout 1200000
```

## 接入 Framework

服务实现协议对应的 Provider 契约，Framework 只需配置 `baseUrl` 指向服务实例：

```yaml
audio:
  transcribeModel: whisper-main
  synthesizeModel: indextts-main
  models:
    - id: whisper-main
      provider: whisper
      model: faster-whisper-large-v3
      operations: [transcribe]
      baseUrl: http://127.0.0.1:8101/v1
    - id: indextts-main
      provider: indextts
      model: indextts-2.5
      operations: [synthesize]
      baseUrl: http://127.0.0.1:8102/v1
```

Qwen3-4B 走现有 OpenAI-compatible LLM Provider（`llm.models[].provider: openai` + `baseUrl` 指向服务），无需新增专用 Provider。

```yaml
llm:
  model: qwen-local
  models:
    - id: qwen-local
      provider: openai
      model: qwen3-4b
      baseUrl: http://127.0.0.1:8103/v1
```

## 模型清单 model.json

```jsonc
{
  "schemaVersion": 1,
  "name": "faster-whisper-large-v3", // 与目录名一致
  "version": "1",
  "image": "hai-ai/faster-whisper-large-v3", // Docker 仓库名
  "provides": ["audio.transcribe"], // 逻辑能力，可多项
  "protocol": "whisper", // Provider 契约
  "devices": ["cpu", "gpu"],
  "port": 8000,
  "health": "/health",
  "model": {
    "id": "Systran/faster-whisper-large-v3", // Hugging Face 回退源
    "revision": "...",
    "modelscope": {
      "id": "keepitsimple/faster-whisper-large-v3", // 默认权重源
      "revision": "..."
    }
  }
}
```

## 通用服务契约

所有镜像至少实现：

- `GET /health` → `{ status, model, device }`（Qwen 经 vLLM，其 `/health` 为纯 200）
- `GET /v1/models` → OpenAI 风格模型列表
- 认证：设置 `HAI_MODEL_API_KEY` 后要求 `Authorization: Bearer <token>`，未设置则无认证

## 环境变量

| 变量                      | 用途                                                   |
| ------------------------- | ------------------------------------------------------ |
| `MODEL_PATH`              | 容器内模型目录（默认 `/opt/models`，运行镜像经卷挂载） |
| `DEVICE`                  | `auto` / `cpu` / `cuda`                                |
| `HAI_MODEL_API_KEY`       | 端点认证令牌（可选）                                   |
| `HAI_MODELSCOPE_ID`       | 覆盖 ModelScope 仓库 ID（当默认仓库不可用时）          |
| `HAI_MODELSCOPE_REVISION` | 覆盖 ModelScope 固定版本                               |
| `HAI_CONTAINER_PROXY`     | 容器内可访问的 HTTP/HTTPS 代理                         |
| `HAI_MODEL_OUTPUT_DIR`    | prepare 输出目录（build.mjs 自动注入）                 |

## 适配说明

- **GPU 依赖**：faster-whisper（CTranslate2）与 IndexTTS 的 GPU 运行需匹配的 CUDA/cuDNN 运行库，生产 GPU 构建可将基础镜像换为对应 `nvidia/cuda` 版本。
- **IndexTTS 版本**：默认从 `IndexTeam/IndexTTS-2.5` 的固定 ModelScope revision 下载权重；推理源码与权重是两个独立依赖。
- **Qwen CPU**：使用官方 `vllm-openai-cpu` x86_64 镜像；默认限制上下文为 4096、KV cache 为 2 GiB，避免本地 CPU 环境按模型最大上下文预留过多内存。
- **在线权重源**：Whisper、IndexTTS 与 Qwen 首次启动均优先使用 ModelScope，避免 Hugging Face/Xet 在部分网络环境下长时间无进展；后续启动复用 named volume，不重复下载。
- **IndexTTS CPU**：CPU 镜像使用官方源码与 CPU-only PyTorch；首次真实合成会下载主模型和辅助模型，速度明显慢于 GPU，但协议与能力一致。
- **离线运行**：离线镜像设置 `HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1`，断网启动不访问外部模型源。

## License

Apache-2.0
