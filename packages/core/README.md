# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md)

`@h-ai/core` 是 Hai Framework 的公共基础层，为应用和其他框架模块提供一致的配置、错误、日志和国际化能力。常用工具可直接使用；Node 应用需要加载配置时再调用 `core.init()`。

## 快速开始

```bash
pnpm add @h-ai/core
```

从 `@h-ai/core` 导入 `core` 后，就可以记录日志、读取消息或使用通用工具。`ok`、`err`、类型、Schema 和错误常量也从同一入口导入。运行自定义配置和表单校验示例前，请安装 Zod（`pnpm add zod`）。

### 初始化：`core.init`

Node 应用可以在启动时读取 YAML 并设置日志。浏览器只需传入页面使用的日志选项。数据库、缓存等模块的启动见[应用启动与关闭](../../docs/usage/function/core.md#应用启动与关闭)。

#### Node.js

准备 `config/_core.yml`：

```yaml
name: orders
version: 0.1.0
env: development
defaultLocale: zh-CN
logging:
  level: info
  format: pretty
```

```ts
import type { CoreConfig } from '@h-ai/core'
import { core } from '@h-ai/core'

// 读取 config 目录。_core.yml 校验成功后以 core 为名存入缓存。
core.init({ configDir: './config' })
const settings = core.config.getOrThrow<CoreConfig>('core')

// 应用默认语言并记录启动成功。
core.i18n.setGlobalLocale(settings.defaultLocale)
core.logger.info('Application ready', { app: settings.name }) // app: 'orders'
```

`core.init()` 同步加载目录。单项配置读取或校验失败时，日志会记录文件和错误码，然后继续加载其他文件。示例中的 `getOrThrow()` 会在必需的 `core` 配置缺失时中止启动。目录扫描和日志设置仍可能抛出异常。

#### 浏览器

```ts
import { core } from '@h-ai/core'

// 在页面启动时设置日志阈值和默认语言。
core.init({
  logging: { level: 'warn' }
})
core.i18n.setGlobalLocale('zh-CN')

// 把请求编号写入日志，便于关联后续记录。
const requestId = core.id.request()
core.logger.warn('Request needs attention', { requestId })
```

浏览器配置由宿主通过公开字段下发，不传完整服务端配置或密钥。`core.config.get()` / `has()` / `keys()` 分别返回 `undefined` / `false` / `[]`；`loadEnvFiles()`、`load()`、`validate()`、`reload()` 返回 `SERVICE_UNAVAILABLE`，`getOrThrow()` 抛错。`watch()` 立即回调同一不可用错误并返回空取消函数。

## 配置清单

生成项目使用 `config/_core.yml`。应用可以通过 `core.init({ configDir })` 接入配置。

在[模块配置清单](../../docs/usage/configuration/core.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/core.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `config` / `module` — 加载配置、初始化日志和编排应用依赖
- `logger` / `context` / `sanitize` — 记录并关联日志，清理诊断数据
- `error` / `i18n` / `zodValidation` / `access` — 处理结果与错误、本地化校验消息并检查请求策略
- `id` / `typeUtils` / `object` / `string` / `array` / `async` / `time` — 生成标识并处理常用数据与异步操作

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
