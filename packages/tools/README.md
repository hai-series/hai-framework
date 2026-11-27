# @h-ai/tools

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

Tools 在 Node 和浏览器中定义、校验、授权和调用业务工具。Node 服务可以用宿主文件接口生成和读取产物。需要将工具调用放进持久队列时，由宿主安装 [Tools Runner](../tools-runner/README.md)。

## 快速开始

```sh
pnpm add @h-ai/tools zod
```

从 `@h-ai/tools` 导入 `tools`，定义 `sum` 并直接执行，输出为 `5`。 [最小接入](../../docs/usage/function/tools.md#quick-start) · [依赖](../../docs/usage/function/tools.md#module-dependencies)

## 配置清单

直接定义或登记工具。使用产物工厂时由宿主提供已经授权的文件读写接口。 [配置入口](../../docs/usage/configuration/tools.md)

## 功能说明

根入口提供 `tools.define()`、`tools.createRegistry()`。Node 入口 `@h-ai/tools/server` 提供 `tools.createArtifactTools()`。 [完整功能参考](../../docs/usage/function/tools.md#api-reference)

`packages/tools/jobs` 保存 `hai-tool` 的实现和各作业的 Dockerfile。构建镜像后，可从终端执行一次请求，也可用 Tools Runner 将同一个镜像接入应用。 [镜像清单和使用手册](jobs/README.md#job-images)

## 数据结构

定义和注册器留在当前进程。宿主保存产物字节、版本和业务归属。 [进程内数据与产物](../../docs/usage/data/tools.md)

## 开发测试

```sh
pnpm exec turbo run typecheck lint build test --filter=@h-ai/tools
pnpm --filter @h-ai/tools test:jobs
```

## 许可证

Apache-2.0
