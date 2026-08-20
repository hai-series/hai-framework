# syntax=docker/dockerfile:1

# 默认使用清华 PyPI 镜像，可用 --build-arg PIP_INDEX_URL=... 覆盖
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG DEBIAN_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian
ARG DEBIAN_SECURITY_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian-security

# -------------------------
# 公共服务阶段
# -------------------------
FROM python:3.11-slim AS base
ARG PIP_INDEX_URL
ARG DEBIAN_MIRROR
ARG DEBIAN_SECURITY_MIRROR
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    MODEL_PATH=/opt/models \
    PORT=8000

RUN sed -i \
      -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
      -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
      /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py /app/server.py
RUN pip install --no-cache-dir \
    "fastapi==0.141.1" \
    "uvicorn[standard]==0.52.3" \
    "python-multipart==0.0.32" \
    "faster-whisper==1.2.1" \
    "modelscope==1.38.1"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=10 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# -------------------------
# CPU 运行镜像（模型经 /opt/models 卷提供）
# -------------------------
FROM base AS cpu
ENV DEVICE=cpu COMPUTE_TYPE=int8
CMD ["python", "server.py"]

# -------------------------
# GPU 运行镜像
# 注意：CTranslate2 的 GPU 运行需要匹配的 CUDA / cuDNN 运行库；
# 生产 GPU 构建建议将 base 改为 nvidia/cuda 运行时镜像并安装对应依赖。
# -------------------------
FROM base AS gpu
ENV DEVICE=cuda COMPUTE_TYPE=float16
CMD ["python", "server.py"]

# -------------------------
# 离线镜像（打包权重，供隔离网络部署）
# build.mjs 以 --build-context hai_model=<.cache/name> 注入权重，--target cpu-bundled / gpu-bundled
# -------------------------
FROM cpu AS cpu-bundled
COPY --from=hai_model . /opt/models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1

FROM gpu AS gpu-bundled
COPY --from=hai_model . /opt/models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
