# @h-ai/feedback

[简体中文](README.md) · [日本語](README.ja.md)

Submit feedback and discuss it with authorized staff in the same report. The first post can save a screenshot, recent logs, operation replay, and a recording. Replies and requests take text, images, and files. Staff can update the handling status.

## Quick Start

```bash
pnpm add @h-ai/feedback @h-ai/reldb
```

[Quick Start](../../docs/usage/function/feedback.en.md#quick-start) · [RelDB](../../docs/usage/function/reldb.en.md)

## Configuration Reference

Connect RelDB, then initialize Feedback with an `appId`. Example deployments read it from `config/_feedback.yml`. [Configuration](../../docs/usage/configuration/feedback.en.md)

## Features

Find APIs and examples for submitting, viewing your reports, replying, requesting information, updating status, and downloading files. [API reference](../../docs/usage/function/feedback.en.md#api-reference)

## Data Structures

The relational database stores reports, messages, and attachments. A single transaction saves text, files, and related status changes. [Data structures](../../docs/usage/data/feedback.en.md)

## Development and Testing

Run these commands from the repository root.

```bash
pnpm --filter @h-ai/feedback typecheck
pnpm --filter @h-ai/feedback lint
pnpm --filter @h-ai/feedback build
pnpm --filter @h-ai/feedback test
```

## License

Apache-2.0
