"""faster-whisper-large-v3 权重准备脚本。

优先从 ModelScope下载，失败回退 HuggingFace（默认使用 hf-mirror.com 镜像）。
输出目录由 `HAI_MODEL_OUTPUT_DIR` 指定（build.mjs prepare 注入），默认 `models/.cache/<name>`。
"""

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = json.loads((HERE / "model.json").read_text(encoding="utf-8"))

# 模型仓库 ID：HuggingFace 与 ModelScope 可分别覆盖
HF_ID = os.environ.get("HAI_MODEL_ID", MANIFEST.get("model", {}).get("id", ""))
MODELSCOPE_ID = os.environ.get("HAI_MODELSCOPE_ID", "keepitsimple/faster-whisper-large-v3")
REVISION = MANIFEST.get("model", {}).get("revision")

OUTPUT_DIR = Path(
    os.environ.get(
        "HAI_MODEL_OUTPUT_DIR",
        HERE.parent.parent / ".cache" / MANIFEST["name"],
    )
)


def prepare_from_modelscope() -> None:
    """使用 ModelScope 下载权重（首选）。"""
    from modelscope.hub.snapshot_download import snapshot_download

    print(f"[prepare] ModelScope snapshot_download {MODELSCOPE_ID} -> {OUTPUT_DIR}")
    snapshot_download(MODELSCOPE_ID, revision=REVISION, cache_dir=str(OUTPUT_DIR))


def prepare_from_huggingface() -> None:
    """使用 HuggingFace（默认 hf-mirror.com 镜像）下载权重（回退）。"""
    os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
    from huggingface_hub import snapshot_download

    print(
        f"[prepare] HuggingFace snapshot_download {HF_ID} "
        f"(endpoint={os.environ['HF_ENDPOINT']}) -> {OUTPUT_DIR}"
    )
    snapshot_download(repo_id=HF_ID, revision=REVISION, local_dir=str(OUTPUT_DIR))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        prepare_from_modelscope()
    except Exception as exc:  # noqa: BLE001 - 首选失败即回退，保留原因
        print(f"[prepare] ModelScope failed: {exc}; falling back to HuggingFace", file=sys.stderr)
        prepare_from_huggingface()
    print(f"[prepare] Done: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
