# syntax=docker/dockerfile:1

ARG UV_VERSION=0.12.5
ARG DEBIAN_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian
ARG DEBIAN_SECURITY_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian-security
ARG PYPI_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PYTORCH_CPU_FIND_LINKS=https://mirrors.aliyun.com/pytorch-wheels/cpu/

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

# 官方 IndexTTS 要求 Python 3.10-3.11，并推荐使用 uv 解析其锁定依赖。
FROM python:3.10-slim AS source
ARG DEBIAN_MIRROR
ARG DEBIAN_SECURITY_MIRROR
ARG PYPI_INDEX_URL
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_DEFAULT_INDEX=${PYPI_INDEX_URL} \
    MODEL_PATH=/opt/models \
    PORT=8000

RUN sed -i \
      -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
      -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
      /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

ENV UV_CONCURRENT_DOWNLOADS=4 \
    UV_CONCURRENT_BUILDS=2 \
    UV_CONCURRENT_INSTALLS=2

COPY --from=uv /uv /uvx /bin/
COPY --from=hai_source . /opt/indextts
WORKDIR /opt/indextts

# -------------------------
# CPU 运行镜像：uv 强制选择 CPU-only PyTorch，避免把 CUDA 运行库带入镜像。
# -------------------------
FROM source AS cpu-deps
ARG PYTORCH_CPU_FIND_LINKS
RUN sed -i '/^\[tool\.uv\.sources\]/,$d' pyproject.toml \
    && uv venv --python /usr/local/bin/python \
    && uv pip install --python .venv/bin/python --find-links "${PYTORCH_CPU_FIND_LINKS}" \
      "torch==2.8.*" "torchaudio==2.8.*" \
    && uv pip install --python .venv/bin/python \
      --find-links "${PYTORCH_CPU_FIND_LINKS}" --editable . \
    && uv pip install --python .venv/bin/python \
      "fastapi==0.141.1" "uvicorn[standard]==0.52.3" "python-multipart==0.0.32" \
      "pydub==0.25.1" "modelscope==1.38.1"

FROM cpu-deps AS cpu
ENV DEVICE=cpu USE_MODELSCOPE=true HF_ENDPOINT=https://hf-mirror.com PATH="/opt/indextts/.venv/bin:${PATH}"
WORKDIR /app
COPY server.py /app/server.py
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=240s --retries=12 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1
CMD ["python", "server.py"]

# -------------------------
# GPU 运行镜像：与官方项目一致使用 CUDA 12.8 PyTorch 依赖。
# -------------------------
FROM source AS gpu-deps
RUN sed -i '/^\[tool\.uv\.sources\]/,$d' pyproject.toml \
    && uv venv --python /usr/local/bin/python \
    && uv pip install --python .venv/bin/python --torch-backend cu128 --editable . \
    && uv pip install --python .venv/bin/python \
      "fastapi==0.141.1" "uvicorn[standard]==0.52.3" "python-multipart==0.0.32" \
      "pydub==0.25.1" "modelscope==1.38.1"

FROM gpu-deps AS gpu
ENV DEVICE=cuda USE_MODELSCOPE=true HF_ENDPOINT=https://hf-mirror.com PATH="/opt/indextts/.venv/bin:${PATH}"
WORKDIR /app
COPY server.py /app/server.py
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=240s --retries=12 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1
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
