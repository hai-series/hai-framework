# @h-ai/tools

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

模型无关的工具定义、校验、注册和授权执行。轻量入口适用于 Node 和浏览器，无需初始化；`@h-ai/tools/server` 提供可恢复工具服务、产物及独立作业工厂，复用 Runner 和宿主授权。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/tools zod`。

[最小接入与自定义工具](../../docs/usage/function/tools.md#quick-start)

## 配置清单

[定义、执行和启用策略](../../docs/usage/configuration/tools.md)

## 功能说明

[公开功能和模型协议适配](../../docs/usage/function/tools.md)

## 数据结构

[注册器与任务数据归属](../../docs/usage/data/tools.md)

## 开发测试

```sh
pnpm --filter @h-ai/tools typecheck
pnpm --filter @h-ai/tools lint
pnpm --filter @h-ai/tools build
pnpm --filter @h-ai/tools test
pnpm --filter @h-ai/tools test:jobs
```

## 许可证

Apache-2.0
