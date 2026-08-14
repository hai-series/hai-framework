# syntax=docker/dockerfile:1

# 默认使用清华 PyPI 镜像，可用 --build-arg PIP_INDEX_URL=... 覆盖
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# -------------------------
# 公共服务阶段
# -------------------------
FROM python:3.11-slim AS base
ARG PIP_INDEX_URL
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    MODEL_PATH=/opt/models \
    PORT=8000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py /app/server.py

# IndexTTS 遵循其自身依赖体系；此处安装服务依赖与推理运行时。
# 注意：IndexTTS 的实际安装（indextts 包 / git 源）与 GPU CUDA 依赖请按官方发布调整。
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" python-multipart pydub indextts

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=240s --retries=12 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# -------------------------
# CPU 运行镜像（模型经 /opt/models 卷提供）
# -------------------------
FROM base AS cpu
ENV DEVICE=cpu
CMD ["python", "server.py"]

# -------------------------
# GPU 运行镜像
# 生产 GPU 构建建议将 base 改为与 PyTorch/CUDA 匹配的 nvidia/cuda 运行时镜像。
# -------------------------
FROM base AS gpu
ENV DEVICE=cuda
CMD ["python", "server.py"]

# -------------------------
# 离线镜像（打包权重，供隔离网络部署）
# -------------------------
FROM cpu AS cpu-bundled
COPY --from=hai_model . /opt/models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1

FROM gpu AS gpu-bundled
COPY --from=hai_model . /opt/models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
