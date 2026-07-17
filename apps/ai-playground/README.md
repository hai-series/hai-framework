# AI 实验台

基于 SvelteKit 和 `@h-ai/ai` 的交互式示例，用一个页面验证真实 LLM、Memory、TTS 与 ASR 链路。

## 能力概览

- LLM：多轮流式对话；首个文本片段到达即显示，记忆在回复后后台提取，新一轮对话会取消旧提取并优先响应。
- Memory：按测试主体隔离的添加、检索、删除、自动注入与提取。
- TTS：预置音色、自然语言风格指令与 WAV 播放。
- ASR：WAV/MP3 文件转写，以及麦克风录音期间持续更新的实时转写。
- 中英文界面、深浅主题、标准 E2E 与显式真实接口 E2E。

> 默认接入 MiMo 系列模型，通过环境变量可切换到任意兼容 OpenAI 接口的模型服务。

## 快速开始

```bash
cd apps/ai-playground
cp .env.example .env
# 编辑 .env，填写 AI_API_KEY
pnpm dev
```

打开 `http://localhost:5173`。`.env` 已由仓库根 `.gitignore` 忽略，不会进入 Git；不要把密钥改写到 `.env.example` 或源码中。

应用按以下生命周期使用框架：服务端启动时 `ai.init(config)`，API 路由调用 `ai.llm` / `ai.memory` / `ai.audio`。当前示例使用进程内 Memory Store，服务重启会清空，适合能力验证；生产环境应先初始化 reldb 和 vecdb。

## API 契约

| Endpoint                        | 用途                                        |
| ------------------------------- | ------------------------------------------- |
| `GET /api/status`               | 查看实际模型和初始化状态                    |
| `POST /api/chat`                | 对话（可注入记忆），仅返回回复文本          |
| `POST /api/chat/stream`         | 对话（可注入记忆），NDJSON 流式返回当前回复 |
| `POST /api/chat/remember`       | 从一轮对话提取长期记忆，20 秒超时并支持取消 |
| `GET/POST/DELETE /api/memories` | 检索、添加、清空当前主体记忆                |
| `DELETE /api/memories/:id`      | 删除单条且校验主体归属                      |
| `POST /api/tts`                 | 返回 WAV 音频                               |
| `POST /api/asr`                 | multipart 上传 WAV/MP3 并返回文本           |
| `POST /api/asr/stream`          | multipart 上传音频，NDJSON 逐行流式返回转写 |

所有 JSON 输入先经 Zod 校验。音频最大 10 MiB，AI 密钥只在服务端读取。

> 麦克风示例在录音期间每 2 秒获取最新音频快照，编码为 16 kHz 单声道 WAV 后调用 `/api/asr` 更新当前文本；慢请求期间会跳过中间快照并在下一节拍使用最新录音，不会形成无界请求队列。点击停止只补齐最后尚未识别的尾段，不再等停止后才开始转写。

## 配置

| 环境变量            | 默认值                          | 说明                                        |
| ------------------- | ------------------------------- | ------------------------------------------- |
| `AI_API_KEY`        | 必填                            | 模型服务 API 密钥                           |
| `AI_BASE_URL`       | `https://api.xiaomimimo.com/v1` | 兼容 OpenAI 接口的基础地址                  |
| `AI_LLM_MODEL`      | `mimo-v2.5`                     | 对话模型                                    |
| `AI_TTS_MODEL`      | `mimo-v2.5-tts`                 | 语音合成模型                                |
| `AI_ASR_MODEL`      | `mimo-v2.5-asr`                 | 语音识别模型                                |
| `AI_AUDIO_PROVIDER` | `mimo`                          | 音频适配器：`openai`/`mimo`/`qwen`/`doubao` |
| `AI_TTS_VOICES`     | MiMo 预置音色                   | 逗号分隔的 TTS 音色列表（可选）             |

## 测试

默认 E2E 拦截外部 AI 请求，只验证完整 UI 交互，稳定且不消耗额度：

```bash
pnpm --filter ai-playground test
pnpm --filter ai-playground test:e2e
```

真实 E2E 会依次验证 LLM、Memory、TTS，并把 TTS 生成的 WAV 再交给 ASR 转写。PowerShell：

```powershell
$env:HAI_E2E_LIVE='1'
pnpm --filter ai-playground exec playwright test live-ai.spec.ts
Remove-Item Env:HAI_E2E_LIVE
```

Bash：

```bash
HAI_E2E_LIVE=1 pnpm --filter ai-playground exec playwright test live-ai.spec.ts
```

真实 E2E 会调用计费接口，仅在明确需要联调时运行。

## License

Apache-2.0
