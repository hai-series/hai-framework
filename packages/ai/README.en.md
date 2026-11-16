# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/datapipe](../datapipe/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/vecdb](../vecdb/README.en.md)

AI capabilities through a unified `ai` service: LLM chat, image generation, tools, MCP, embeddings, memory, retrieval/RAG, knowledge bases, context management, file parsing, reranking, audio (ASR/TTS), and A2A. Initialize with `ai.init()` on Node.js; browsers access it through APIs/clients.

## Quick Start

`ai.close()` waits for any initialization in progress, then releases resources. Concurrent callers share that cleanup. If you call `ai.init()` with new settings, it closes the previous instance first. Initialization returns a failure while a close is in progress.

### Development LLM-only (no database dependencies)

```ts
import { ai } from '@h-ai/ai'

const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
})
if (!init.success)
  throw new Error(init.error.message)

try {
  const result = await ai.llm.chat({
    messages: [
      { role: 'user', content: '你好！' }
    ],
  })
  if (!result.success)
    throw new Error(result.error.message)
  const reply = result.data.choices[0]?.message.content ?? ''
}
finally {
  await ai.close()
}
```

In development or explicit test mode, AI can keep sessions and other records in the current process when RelDB and a vector database are unavailable. Closing the module, restarting, or switching instances loses access to those records. If either `NODE_ENV` or `HAI_CORE_ENV` is `production`, connect a shared relational database and a network vector database first, or supply a custom store that shares records across instances and supports conditional updates by version.

## Configuration Reference

Generated projects define model names, endpoints, and other model settings in `config/_ai.yml`. At startup, the application reads the file and passes the settings object to `ai.init(config, options)`.

See the [configuration reference](../../docs/usage/configuration/ai.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/ai.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `ai.init` / `ai.close` / `ai.config` / `ai.isInitialized` — Initialize model settings, check readiness, or close the module. You can configure storage for sessions that must survive a restart
- `ai.llm` / `ai.stream` / `ai.reasoning` / `ai.token` / `ai.summary` / `ai.compress` / `ai.context` — Send chat requests, stream responses, estimate token counts, and shorten conversation history
- `ai.embedding` / `ai.rerank` / `ai.retrieval` / `ai.rag` / `ai.knowledge` — Turn content into vectors, retrieve and rerank matches, and add documents to a knowledge base
- `ai.memory` / `ai.persona` — Manage conversation memory and personas
- `ai.tools` / `ai.mcp` / `ai.acp` / `ai.a2a` — Register tools, connect MCP, control ACP sessions and call A2A agents
- `ai.file` / `ai.image` / `ai.audio` — Work with files, images and audio

## Data Structures

See the [data reference](../../docs/usage/data/ai.md) in Chinese for the built-in DB Store, vector collections and native memory namespaces.

## Development and Testing

```bash
pnpm --filter @h-ai/ai typecheck
pnpm --filter @h-ai/ai lint
pnpm --filter @h-ai/ai test
pnpm --filter @h-ai/ai build
```

Public JSDoc examples import actual package entrypoints; internal factory examples are marked with their module context and compiled against real local declarations. Run `pnpm check:jsdoc --package ai` from the repository root to verify coverage and example types. Ordinary business calls check HaiResult; streams and the browser AudioClient retain their explicit throwing contracts.

## License

Apache-2.0
