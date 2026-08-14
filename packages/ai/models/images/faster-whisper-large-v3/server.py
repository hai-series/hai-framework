"""faster-whisper Model Service。

实现 hai-framework whisper 协议：完整文件识别，返回文本、语言、时长与结构化时间轴（段 / 词，毫秒整数）。
运行设备（cpu / cuda）与计算精度由环境变量解析，仅通过 /health 暴露，不进入业务能力声明。
"""

import os
import tempfile
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

MODEL_PATH = os.environ.get("MODEL_PATH", "/opt/models")
MODEL_NAME = "faster-whisper-large-v3"
PORT = int(os.environ.get("PORT", "8000"))
API_KEY = os.environ.get("HAI_MODEL_API_KEY")


def resolve_device() -> str:
    """解析运行设备：auto 时按 CUDA 可用性选择。"""
    device = os.environ.get("DEVICE", "auto")
    if device != "auto":
        return device
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:  # noqa: BLE001 - torch 缺失/异常一律回退 CPU
        return "cpu"


RUNTIME_DEVICE = resolve_device()
# CPU 推荐 int8，GPU 推荐 float16
RUNTIME_COMPUTE = os.environ.get("COMPUTE_TYPE", "auto")
if RUNTIME_COMPUTE == "auto":
    RUNTIME_COMPUTE = "float16" if RUNTIME_DEVICE == "cuda" else "int8"

whisper_model = WhisperModel(MODEL_PATH, device=RUNTIME_DEVICE, compute_type=RUNTIME_COMPUTE)

app = FastAPI(title="hai faster-whisper service")


def require_auth(authorization: str | None) -> None:
    """配置了 HAI_MODEL_API_KEY 时校验 Bearer；未配置则无认证。"""
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="invalid credentials")


@app.get("/health")
def health() -> dict:
    """健康检查：返回状态、模型与运行设备。"""
    return {"status": "ok", "model": MODEL_NAME, "device": RUNTIME_DEVICE}


@app.get("/v1/models")
def list_models() -> dict:
    """列出服务提供的模型（OpenAI 风格）。"""
    return {"object": "list", "data": [{"id": MODEL_NAME, "object": "model"}]}


@app.post("/v1/audio/transcriptions")
async def transcriptions(
    file: UploadFile = File(...),
    model: str = Form(MODEL_NAME),
    language: str | None = Form(None),
    prompt: str | None = Form(None),
    timestamp_granularities: list[str] | None = Form(None),
    vad: bool = Form(False),
    authorization: str | None = Header(None),
) -> JSONResponse:
    """执行完整文件 ASR，输出 hai-framework whisper 协议 DTO。"""
    require_auth(authorization)

    # 保存上传音频到临时文件（faster-whisper 从路径读取）
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        audio_path = tmp.name

    try:
        want_words = bool(timestamp_granularities and "word" in timestamp_granularities)
        segments, info = whisper_model.transcribe(
            audio_path,
            language=language,
            initial_prompt=prompt,
            word_timestamps=want_words,
            vad_filter=vad,
        )
        return JSONResponse(build_result(segments, info, want_words))
    finally:
        # 无论成功失败都清理临时文件
        try:
            os.remove(audio_path)
        except OSError:
            pass


def build_result(segments, info, want_words: bool) -> dict:
    """将 faster-whisper 惰性生成器转换为公共 DTO（秒 → 毫秒整数）。"""
    out_segments = []
    full_text = []
    for index, segment in enumerate(segments):
        full_text.append(segment.text)
        item = {
            "id": str(getattr(segment, "id", index)),
            "text": segment.text.strip(),
            "startMs": to_ms(segment.start),
            "endMs": to_ms(segment.end),
        }
        if want_words and getattr(segment, "words", None):
            item["words"] = [
                {
                    "text": word.word,
                    "startMs": to_ms(word.start),
                    "endMs": to_ms(word.end),
                    "confidence": float(getattr(word, "probability", 0.0)),
                }
                for word in segment.words
            ]
        out_segments.append(item)

    return {
        "text": "".join(full_text).strip(),
        "language": info.language,
        "durationMs": to_ms(info.duration),
        "segments": out_segments,
    }


def to_ms(seconds: float | None) -> int:
    """秒（浮点）转毫秒整数。"""
    return int(round((seconds or 0.0) * 1000))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)  # noqa: S104 - 容器内监听所有网卡
