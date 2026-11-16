# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/datapipe](../datapipe/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/vecdb](../vecdb/README.en.md)

AI capabilities through a unified `ai` service: LLM chat, image generation, tools, MCP, embeddings, memory, retrieval/RAG, knowledge bases, context management, file parsing, reranking, audio (ASR/TTS), and A2A. Initialize with `ai.init()` on Node.js; browsers access it through APIs/clients.

## Quick Start

`ai.close()` waits for an initialization already in progress and then cleans up; concurrent closes share one operation. Reinitialization first cleans up the previous instance, and new initialization is rejected while closing.

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

Development/explicit tests without initialized reldb/vecdb use a temporary process store, lost on close, exit, or instance switching. When either `NODE_ENV` or `HAI_CORE_ENV` is production, temporary stores, SQLite and local vector backends fail initialization. Initialize shared RelDB and network vecdb first, or supply a shared provider with equivalent atomic guarantees.

## Configuration Reference

Generated projects use `config/_ai.yml`, with `ai.init(config, options)` as the application configuration entry point.

See the [configuration reference](../../docs/usage/configuration/ai.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/ai.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `init` / `close` / `config` / `isInitialized` — Configure models and optional stores
- `llm` / `stream` / `reasoning` / `token` / `summary` / `compress` / `context` — Generate content, stream responses and manage context budgets
- `embedding` / `rerank` / `retrieval` / `rag` / `knowledge` — Embed, rerank, retrieve and ingest knowledge
- `memory` / `persona` — Manage conversation memory and personas
- `tools` / `mcp` / `acp` / `a2a` — Register tools, connect MCP, control ACP sessions and call A2A agents
- `file` / `image` / `audio` — Work with files, images and audio

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
