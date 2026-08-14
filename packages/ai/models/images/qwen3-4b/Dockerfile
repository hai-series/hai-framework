# syntax=docker/dockerfile:1

# Qwen3-4B 通过 vLLM 官方镜像对外提供 OpenAI-compatible API（已含 CUDA 运行时与 SSE 流式）。
# vLLM 会优先从 ModelScope 拉取（设置 VLLM_USE_MODELSCOPE=true）；本服务默认从 /opt/models 本地加载。
FROM vllm/vllm-openai:latest AS base
ENV MODEL_PATH=/opt/models \
    SERVED_MODEL_NAME=qwen3-4b \
    PORT=8000 \
    HOST=0.0.0.0 \
    VLLM_USE_MODELSCOPE=true

WORKDIR /app
COPY server.py /app/server.py
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=20 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# vLLM 官方镜像自带 ENTRYPOINT，需清空后改用本服务启动脚本
ENTRYPOINT []

# -------------------------
# GPU 运行镜像（vLLM 默认 CUDA 后端）
# -------------------------
FROM base AS gpu
ENV DEVICE=cuda
CMD ["python3", "server.py"]

# -------------------------
# CPU 运行镜像
# 注意：CPU 推理需 vLLM 的 CPU 构建（VLLM_TARGET_DEVICE=cpu），官方 GPU 镜像不含 CPU 后端，
# 生产 CPU 构建请改用 vLLM CPU 基础镜像或安装 CPU 版 vLLM。
# -------------------------
FROM base AS cpu
ENV DEVICE=cpu
CMD ["python3", "server.py"]

# -------------------------
# 离线镜像（打包权重，供隔离网络部署）
# -------------------------
FROM gpu AS gpu-bundled
COPY --from=hai_model . /opt/models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 VLLM_USE_MODELSCOPE=false

FROM cpu AS cpu-bundled
COPY --from=hai_model . /opt/models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 VLLM_USE_MODELSCOPE=false
