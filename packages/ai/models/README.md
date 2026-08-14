# @h-ai/ai 模型服务

将开源模型部署为 CPU/GPU Model Service，通过统一 Provider 机制接入 hai-framework，支持完全离线运行。

镜像与权重下载**优先使用 ModelScope**，失败自动回退 HuggingFace（默认 `hf-mirror.com` 镜像）；PyPI 依赖默认使用清华镜像。

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
# 列出全部模型
node models/build.mjs list

# 校验某个模型清单
node models/build.mjs inspect indextts-2.5

# 下载权重（优先 ModelScope）到 models/.cache/<name>
node models/build.mjs prepare indextts-2.5

# 构建镜像（CPU / GPU）
node models/build.mjs build indextts-2.5 --device cpu
node models/build.mjs build indextts-2.5 --device gpu

# 构建离线镜像（打包权重，需先 prepare）
node models/build.mjs build indextts-2.5 --device gpu --bundle-model

# 启动服务并做健康检查
node models/build.mjs run indextts-2.5
```

也可使用 package 脚本：`pnpm --filter @h-ai/ai model:list` / `model:prepare` / `model:build` / `model:run`。

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
  "model": { "id": "Systran/faster-whisper-large-v3" } // 供 prepare 下载
}
```

## 通用服务契约

所有镜像至少实现：

- `GET /health` → `{ status, model, device }`（Qwen 经 vLLM，其 `/health` 为纯 200）
- `GET /v1/models` → OpenAI 风格模型列表
- 认证：设置 `HAI_MODEL_API_KEY` 后要求 `Authorization: Bearer <token>`，未设置则无认证

## 环境变量

| 变量                   | 用途                                                   |
| ---------------------- | ------------------------------------------------------ |
| `MODEL_PATH`           | 容器内模型目录（默认 `/opt/models`，运行镜像经卷挂载） |
| `DEVICE`               | `auto` / `cpu` / `cuda`                                |
| `HAI_MODEL_API_KEY`    | 端点认证令牌（可选）                                   |
| `HAI_MODELSCOPE_ID`    | 覆盖 ModelScope 仓库 ID（当默认仓库不可用时）          |
| `HAI_MODEL_OUTPUT_DIR` | prepare 输出目录（build.mjs 自动注入）                 |

## 适配说明

- **GPU 依赖**：faster-whisper（CTranslate2）与 IndexTTS 的 GPU 运行需匹配的 CUDA/cuDNN 运行库，生产 GPU 构建可将基础镜像换为对应 `nvidia/cuda` 版本。
- **IndexTTS 版本**：若 `IndexTeam/IndexTTS-2.5` 尚未在 ModelScope 发布，用 `HAI_MODELSCOPE_ID` 指向实际可用的 IndexTTS 仓库。
- **Qwen CPU**：CPU 推理需 vLLM 的 CPU 构建，官方 GPU 镜像不含 CPU 后端。
- **离线运行**：离线镜像设置 `HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1`，断网启动不访问外部模型源。

## License

Apache-2.0
