"""Qwen3-4B Model Service。

以 vLLM 的 OpenAI-compatible API server 对外提供 `GET /health`、`GET /v1/models`、
`POST /v1/chat/completions`（含 SSE 流式），Framework 直接复用现有 OpenAI-compatible LLM Provider 调用，
无需新增专用 Provider。本脚本仅负责按环境变量组装参数并启动 vLLM 服务进程。
"""

import os
import shlex

MODEL_PATH = os.environ.get("MODEL_PATH", "/opt/models")
SERVED_MODEL_NAME = os.environ.get("SERVED_MODEL_NAME", "qwen3-4b")
PORT = os.environ.get("PORT", "8000")
HOST = os.environ.get("HOST", "0.0.0.0")
# 额外 vLLM 参数（如 --max-model-len、--dtype、--tensor-parallel-size），空格分隔
EXTRA_ARGS = os.environ.get("VLLM_EXTRA_ARGS", "")


def build_args() -> list[str]:
    """组装 vLLM OpenAI api_server 启动参数。"""
    args = [
        "python3",
        "-m",
        "vllm.entrypoints.openai.api_server",
        "--model",
        MODEL_PATH,
        "--served-model-name",
        SERVED_MODEL_NAME,
        "--host",
        HOST,
        "--port",
        str(PORT),
    ]
    if EXTRA_ARGS:
        args.extend(shlex.split(EXTRA_ARGS))
    return args


def main() -> None:
    args = build_args()
    print(f"[qwen3-4b] exec: {' '.join(args)}")
    # 用 exec 替换当前进程，保证容器信号正确传递给 vLLM
    os.execvp(args[0], args)


if __name__ == "__main__":
    main()
