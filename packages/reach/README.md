# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

用户触达模块，支持同时注册多个 Provider（邮件、短信、API 回调等），通过模板绑定 Provider 实现按场景路由发送。内置免打扰（DND）机制，支持通过配置文件定义模板。

## 快速开始

### 依赖

- `@h-ai/reldb` — 数据库（发送日志与模板持久化）；配置非空 `templates` 或启用 DND delay 时必须先初始化，模板保存或必需表准备失败时 `reach.init()` 返回 `CONFIG_ERROR` 并关闭候选 Provider。不使用模板/延迟队列的即时发送可选
- `@h-ai/cache` — 缓存（DND delay 策略分布式锁），可选；已初始化时自动启用分布式锁

#### 安装

```bash
pnpm add @h-ai/reach
```

邮件发送需安装 `nodemailer`。

#### 多 Provider 初始化

```ts
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

const runtime = core.module.createRuntime([
  {
    name: 'reldb',
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    close: () => reldb.close()
  },
  {
    name: 'reach',
    start: () => reach.init({
      providers: [
        { name: 'local', type: 'console' }
      ],
      templates: [
        {
          name: 'welcome',
          provider: 'local',
          subject: 'Welcome',
          body: 'Hello {userName}'
        }
      ],
    }),
    close: () => reach.close()
  },
])
const initialized = await runtime.start()
if (!initialized.success)
  throw new Error(initialized.error.message)

let result: Awaited<ReturnType<typeof reach.send>>
try {
  result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' }
  })
}
catch (error) {
  const closed = await runtime.close()
  throw new AggregateError(closed.success
    ? [error]
    : [error, closed.error], 'Reach operation failed')
}
const closed = await runtime.close()
if (!closed.success) {
  throw new AggregateError(result.success
    ? [closed.error]
    : [result.error, closed.error], 'Reach cleanup failed')
}
if (!result.success)
  throw new Error(result.error.message)
```

以上示例使用开发 Console Provider，只记录发送元数据，不实际发邮件或短信。需要真实投递时，按下方配置 SMTP、短信或 API Provider；数据库持久化和共享缓存按需初始化。

`reach.config` 返回的是**脱敏后的配置快照**：`api.url` / `endpoint` 的内嵌凭证、所有自定义请求头值、SMTP `pass` 和短信密钥都会隐藏。网关正文不进入快照；部署向导把 API 请求头整体保存到私有环境文件，不依赖头名猜测认证信息。

Provider 失败保留完整模块错误定义（含 HTTP 状态），SMTP/短信原始响应不进入返回消息或 cause；前端使用本地化提示，服务端日志保留诊断上下文。

一次模板发送使用同一个模板快照渲染主题、正文并选择默认 Provider，避免并发编辑时混用不同版本。显式 `provider` 仍可覆盖模板渠道。

## 配置清单

生成项目使用 `config/_reach.yml`。应用可以通过 `reach.init(config)` 接入配置。

在[模块配置清单](../../docs/usage/configuration/reach.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/reach.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `close` / `config` / `isInitialized` — 启停通知 Provider 和队列
- `send` / `template` — 发送邮件、短信或 API 通知，渲染模板
- `queue` — 检查结果、处理死信和未知发送状态

## 数据结构

查看[数据结构](../../docs/usage/data/reach.md)，了解通知任务、结果、死信、幂等记录和共享锁。

## 开发测试

```bash
pnpm --filter @h-ai/reach test
```

跨库时间回归用例 `tests/reach-repository-send-log-databases.test.ts` 通过 Testcontainers 启动隔离 PostgreSQL 16.15 / MySQL 8.4.11，并在结束时清理容器；须提供可用的 Docker API。使用 Podman 时，将 `DOCKER_HOST` 指向其兼容 socket；rootless 环境可按 Testcontainers 要求设置 `TESTCONTAINERS_RYUK_DISABLED=true`。

## 许可证

Apache-2.0
