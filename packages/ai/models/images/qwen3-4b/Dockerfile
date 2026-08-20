# syntax=docker/dockerfile:1

# Qwen3-4B 通过 vLLM 官方镜像对外提供 OpenAI-compatible API。
# CPU 与 GPU 必须使用不同的官方运行时；GPU 镜像不能通过 DEVICE=cpu 变成 CPU 构建。
ARG VLLM_VERSION=v0.27.1
ARG PYPI_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

FROM vllm/vllm-openai:${VLLM_VERSION} AS gpu-base
ENV MODEL_PATH=/opt/models \
    SERVED_MODEL_NAME=qwen3-4b \
    PORT=8000 \
    HOST=0.0.0.0 \
    HF_ENDPOINT=https://hf-mirror.com \
    VLLM_USE_MODELSCOPE=true

# -------------------------
# GPU 运行镜像（vLLM 默认 CUDA 后端）
# -------------------------
FROM gpu-base AS gpu
ARG PYPI_INDEX_URL
ENV DEVICE=cuda
RUN python3 -m pip install --no-cache-dir --index-url "${PYPI_INDEX_URL}" "modelscope==1.38.1"
WORKDIR /app
COPY server.py /app/server.py
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=20 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1
ENTRYPOINT []
CMD ["python3", "server.py"]

# -------------------------
# CPU 运行镜像（官方 x86_64 CPU 构建）
# -------------------------
FROM vllm/vllm-openai-cpu:${VLLM_VERSION}-x86_64 AS cpu
ARG PYPI_INDEX_URL
ENV MODEL_PATH=/opt/models \
    SERVED_MODEL_NAME=qwen3-4b \
    PORT=8000 \
    HOST=0.0.0.0 \
    DEVICE=cpu \
    VLLM_USE_MODELSCOPE=true \
    VLLM_CPU_KVCACHE_SPACE=2 \
    VLLM_EXTRA_ARGS="--max-model-len 4096"
RUN python3 -m pip install --no-cache-dir --index-url "${PYPI_INDEX_URL}" "modelscope==1.38.1"
WORKDIR /app
COPY server.py /app/server.py
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=20 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1
ENTRYPOINT []
CMD ["python3", "server.py"]

# -------------------------
# 离线镜像（打包权重，供隔离网络部署）
# -------------------------
FROM cpu AS cpu-bundled
COPY --from=hai_model . /opt/models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 VLLM_USE_MODELSCOPE=false

FROM gpu AS gpu-bundled
COPY --from=hai_model . /opt/models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 VLLM_USE_MODELSCOPE=false
