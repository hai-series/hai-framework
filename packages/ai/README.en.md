# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/datapipe](../datapipe/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/vecdb](../vecdb/README.en.md)

AI capabilities through a unified `ai` service: LLM chat, image generation, tools, MCP, embeddings, memory, retrieval/RAG, knowledge bases, context management, file parsing, reranking, audio (ASR/TTS), and A2A. Initialize with `ai.init()` on Node.js; browsers access it through APIs/clients.

[Tools](../tools/README.en.md) owns shared definitions and execution. `ai.tools.adapt` handles model protocols; `createBuiltinTools` wraps images, audio, document rewriting and an optional full website-video workflow. `createMcpTools/createBroker` reuse MCP. Factories do not call models immediately; the host configures enabled tools, resource permissions and Runner. See the [AI tools guide](../cli/templates/skills/hai-ai/tools.md) (Chinese).

## Quick Start

Install with pnpm: `pnpm add @h-ai/ai`.

[Open the quick-start guide](../../docs/usage/function/ai.en.md#quick-start).

[Dependencies and setup order](../../docs/usage/function/ai.en.md#module-dependencies).

## Configuration Reference

Generated projects define model names, endpoints, and other model settings in `config/_ai.yml`. At startup, the application reads the file and passes the settings object to `ai.init(config, options)`.

See the [configuration reference](../../docs/usage/configuration/ai.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/ai.en.md#api-reference) for entry points, inputs, results and examples.
[Local parsing](../../docs/usage/function/ai.en.md#bounded-local-files) extracts private files in Node. Structured output supports a selected-field preview, and [browser recording](../../docs/usage/function/ai.en.md#browser-recording) shares microphone control and bounded WAV conversion.

## Data Structures

See the [data reference](../../docs/usage/data/ai.en.md) for the built-in DB Store, vector collections and native memory namespaces.

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
