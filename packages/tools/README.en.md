# @h-ai/tools

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

Tools defines, validates, authorizes, and calls business tools in Node and the browser. Node applications can create and read artifacts using host file callbacks. To queue tool calls durably, install [Tools Runner](../tools-runner/README.en.md).

## Quick Start

```sh
pnpm add @h-ai/tools zod
```

Import `tools` from `@h-ai/tools`, define `sum`, and call it directly to get `5`. [Quick start](../../docs/usage/function/tools.en.md#quick-start) · [Dependencies](../../docs/usage/function/tools.en.md#module-dependencies)

## Configuration Reference

Pass options when defining tools or creating a registry. Supply authorized file callbacks when creating artifact tools. [Configuration](../../docs/usage/configuration/tools.en.md)

## Features

The root entry provides `tools.define()` and `tools.createRegistry()`. Use `tools.createArtifactTools()` from `@h-ai/tools/server` in Node. [API reference](../../docs/usage/function/tools.en.md#api-reference)

`packages/tools/jobs` contains the `hai-tool` implementation and the job Dockerfiles. Build an image and run it from the terminal for a single request, or connect the same image to an application through Tools Runner. [Job image list and guides in Chinese](jobs/README.md#job-images)

## Data Structures

The current process holds tool definitions and registrations. The host stores artifact bytes, versions, and ownership. [In-process data and artifacts](../../docs/usage/data/tools.en.md)

## Development and Testing

```sh
pnpm exec turbo run typecheck lint build test --filter=@h-ai/tools
pnpm --filter @h-ai/tools test:jobs
```

## License

Apache-2.0
