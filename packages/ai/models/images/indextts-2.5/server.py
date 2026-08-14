"""IndexTTS Model Service。

实现 hai-framework indextts 协议：`POST /v1/audio/speech`，multipart 输入，二进制音频响应 + 元数据响应头。
公共层只表达业务语义（说话人 / 风格参考、语速、目标时长），本服务负责映射到 IndexTTS 私有参数
（spk_audio_prompt / emo_audio_prompt / emo_alpha / duration_factor）并做目标时长闭环。
"""

import io
import os
import tempfile
import wave
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

MODEL_PATH = os.environ.get("MODEL_PATH", "/opt/models")
MODEL_NAME = "indextts-2.5"
PORT = int(os.environ.get("PORT", "8000"))
API_KEY = os.environ.get("HAI_MODEL_API_KEY")

# 目标时长闭环最大迭代次数（防止无法收敛时无限推理）
MAX_DURATION_ITERATIONS = 3


def resolve_device() -> str:
    """解析运行设备：auto 时按 CUDA 可用性选择。"""
    device = os.environ.get("DEVICE", "auto")
    if device != "auto":
        return device
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:  # noqa: BLE001
        return "cpu"


RUNTIME_DEVICE = resolve_device()
MIME_BY_FORMAT = {
    "wav": "audio/wav",
    "pcm16": "application/octet-stream",
    "mp3": "audio/mpeg",
    "opus": "audio/opus",
}

app = FastAPI(title="hai IndexTTS service")
_engine = None


def get_engine():
    """惰性加载 IndexTTS 引擎（首次合成时初始化）。"""
    global _engine
    if _engine is None:
        # 集成点：按实际 IndexTTS 发布的 Python API 初始化推理引擎
        from indextts.infer_v2 import IndexTTS2

        _engine = IndexTTS2(model_dir=MODEL_PATH, device=RUNTIME_DEVICE)
    return _engine


def require_auth(authorization: Optional[str]) -> None:
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


def resolve_duration_factor(speed: Optional[float]) -> float:
    """Framework speed（>1 更快）→ IndexTTS duration_factor（>1 更慢），互为倒数并夹取有效区间。"""
    if speed is None:
        return 1.0
    if speed <= 0:
        raise HTTPException(status_code=400, detail="speed must be greater than 0")
    return max(0.5, min(2.0, 1.0 / speed))


@app.post("/v1/audio/speech")
async def speech(
    text: str = Form(...),
    model: str = Form(MODEL_NAME),
    language: Optional[str] = Form(None),
    speaker_reference: UploadFile = File(...),
    speaker_reference_text: Optional[str] = Form(None),
    speaker_reference_language: Optional[str] = Form(None),
    style_reference: Optional[UploadFile] = File(None),
    style_reference_text: Optional[str] = Form(None),
    style_reference_language: Optional[str] = Form(None),
    style_strength: Optional[float] = Form(None),
    speed: Optional[float] = Form(None),
    target_duration_ms: Optional[int] = Form(None),
    duration_tolerance_ms: Optional[int] = Form(None),
    response_format: str = Form("wav"),
    sample_rate: Optional[int] = Form(None),
    authorization: Optional[str] = Header(None),
) -> Response:
    """执行 TTS 合成，返回音频二进制与真实元数据响应头。"""
    require_auth(authorization)
    if response_format not in MIME_BY_FORMAT:
        raise HTTPException(status_code=400, detail=f"unsupported response_format: {response_format}")

    speaker_path = await save_upload(speaker_reference)
    style_path = await save_upload(style_reference) if style_reference is not None else None

    try:
        duration_factor = resolve_duration_factor(speed)
        wav_bytes, out_rate, channels, applied_speed, duration_matched = synthesize(
            text=text,
            language=language,
            speaker_path=speaker_path,
            style_path=style_path,
            style_strength=style_strength,
            duration_factor=duration_factor,
            speed=speed,
            target_duration_ms=target_duration_ms,
            duration_tolerance_ms=duration_tolerance_ms,
        )
        audio_bytes, out_rate, channels = encode_audio(wav_bytes, response_format, sample_rate)
        duration_ms = wav_duration_ms(wav_bytes)

        headers = {
            "X-HAI-Audio-Duration-Ms": str(duration_ms),
            "X-HAI-Applied-Speed": str(applied_speed),
            "X-HAI-Audio-Sample-Rate": str(out_rate),
            "X-HAI-Audio-Channels": str(channels),
        }
        # 无法判断时不写 matched 头（保留 undefined 语义）
        if duration_matched is not None:
            headers["X-HAI-Duration-Matched"] = "true" if duration_matched else "false"
        return Response(content=audio_bytes, media_type=MIME_BY_FORMAT[response_format], headers=headers)
    finally:
        cleanup(speaker_path)
        cleanup(style_path)


def synthesize(
    *,
    text: str,
    language: Optional[str],
    speaker_path: str,
    style_path: Optional[str],
    style_strength: Optional[float],
    duration_factor: float,
    speed: Optional[float],
    target_duration_ms: Optional[int],
    duration_tolerance_ms: Optional[int],
):
    """调用 IndexTTS 合成，必要时做目标时长闭环迭代。

    返回 (wav_bytes, sample_rate, channels, applied_speed, duration_matched)。
    """
    engine = get_engine()
    factor = duration_factor
    matched: Optional[bool] = None

    wav_bytes = infer_once(engine, text, language, speaker_path, style_path, style_strength, factor)

    if target_duration_ms is not None:
        tolerance = duration_tolerance_ms if duration_tolerance_ms is not None else max(80, int(target_duration_ms * 0.05))
        for _ in range(MAX_DURATION_ITERATIONS):
            actual = wav_duration_ms(wav_bytes)
            if abs(actual - target_duration_ms) <= tolerance:
                matched = True
                break
            # 实际比目标长 → 需要更快（更小 duration_factor）；反之更慢
            factor = max(0.5, min(2.0, factor * (target_duration_ms / max(actual, 1))))
            wav_bytes = infer_once(engine, text, language, speaker_path, style_path, style_strength, factor)
        else:
            matched = abs(wav_duration_ms(wav_bytes) - target_duration_ms) <= tolerance
        # 显式提供容差时才回报匹配结论；否则保持 undefined
        if duration_tolerance_ms is None:
            matched = None

    # 采用的 Framework speed（供调用方观测）
    applied_speed = speed if speed is not None else round(1.0 / factor, 4)
    return wav_bytes, *wav_meta(wav_bytes), applied_speed, matched


def infer_once(engine, text, language, speaker_path, style_path, style_strength, duration_factor) -> bytes:
    """单次 IndexTTS 推理，返回 WAV 字节。

    集成点：不同 IndexTTS 发布的推理签名不同，此处按 IndexTTS2 常见参数映射：
    spk_audio_prompt=说话人参考、emo_audio_prompt=风格参考、emo_alpha=风格强度、duration_factor=时长因子。
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        output_path = tmp.name
    try:
        engine.infer(
            spk_audio_prompt=speaker_path,
            text=text,
            output_path=output_path,
            emo_audio_prompt=style_path,
            emo_alpha=style_strength if style_strength is not None else 1.0,
            duration_factor=duration_factor,
            language=language,
        )
        return Path(output_path).read_bytes()
    finally:
        cleanup(output_path)


def encode_audio(wav_bytes: bytes, response_format: str, sample_rate: Optional[int]):
    """将 WAV 转换为请求的输出格式，返回 (bytes, sample_rate, channels)。"""
    rate, channels = wav_meta(wav_bytes)
    if response_format == "wav":
        return wav_bytes, rate, channels
    if response_format == "pcm16":
        return wav_pcm_data(wav_bytes), rate, channels
    # mp3 / opus 通过 pydub + ffmpeg 转码
    from pydub import AudioSegment

    segment = AudioSegment.from_wav(io.BytesIO(wav_bytes))
    if sample_rate:
        segment = segment.set_frame_rate(sample_rate)
    buffer = io.BytesIO()
    segment.export(buffer, format="mp3" if response_format == "mp3" else "opus")
    return buffer.getvalue(), segment.frame_rate, segment.channels


async def save_upload(upload: UploadFile) -> str:
    """将上传音频保存到临时文件，返回路径。"""
    data = await upload.read()
    suffix = Path(upload.filename or "ref.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        return tmp.name


def wav_meta(wav_bytes: bytes):
    """读取 WAV 采样率与声道数。"""
    with wave.open(io.BytesIO(wav_bytes), "rb") as reader:
        return reader.getframerate(), reader.getnchannels()


def wav_pcm_data(wav_bytes: bytes) -> bytes:
    """提取 WAV 的裸 PCM 数据帧。"""
    with wave.open(io.BytesIO(wav_bytes), "rb") as reader:
        return reader.readframes(reader.getnframes())


def wav_duration_ms(wav_bytes: bytes) -> int:
    """计算 WAV 时长（毫秒整数）。"""
    with wave.open(io.BytesIO(wav_bytes), "rb") as reader:
        frames = reader.getnframes()
        rate = reader.getframerate() or 1
        return int(round(frames * 1000 / rate))


def cleanup(path: Optional[str]) -> None:
    """安全删除临时文件。"""
    if not path:
        return
    try:
        os.remove(path)
    except OSError:
        pass


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)  # noqa: S104 - 容器内监听所有网卡
