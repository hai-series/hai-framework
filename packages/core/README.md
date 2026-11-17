# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md)

`@h-ai/core` 是 Hai Framework 的公共基础层，为应用和其他框架模块提供一致的配置、错误、日志和国际化能力。常用工具可直接使用；Node 应用需要加载配置时再调用 `core.init()`。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/core`。

[跟着最小示例完成接入](../../docs/usage/function/core.md#quick-start)。

## 配置清单

应用启动时调用 `core.init({ configDir: './config' })` 读取 `config/_core.yml` 里的应用信息和日志设置。[Serv](../../docs/usage/configuration/serv.md) 或 [Kit](../../docs/usage/configuration/kit.md) 在创建 HTTP 服务时读取各自的访问策略。

在[模块配置清单](../../docs/usage/configuration/core.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/core.md#api-reference)，包含调用入口、输入、返回值和用法。

<a id="应用启动与关闭"></a>

[应用启动与关闭](../../docs/usage/function/core.md#应用启动与关闭)

<a id="文件与环境配置coreconfig"></a>

[文件与环境配置](../../docs/usage/function/core.md#文件与环境配置coreconfig)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/core.md)，了解应用配置、语言、日志与请求上下文的归属。

## 开发测试

在仓库根目录执行（PowerShell 使用 `pnpm.cmd`）：

```bash
pnpm --filter @h-ai/core typecheck
pnpm --filter @h-ai/core lint
pnpm --filter @h-ai/core build
pnpm --filter @h-ai/core test
```

公开声明与示例检查见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
