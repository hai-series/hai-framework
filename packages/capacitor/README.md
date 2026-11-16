# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-client](../api-client/README.md) · [@h-ai/core](../core/README.md)

Capacitor 原生桥接模块，为 hai Framework 移动应用提供原生安全 Token 存储、设备信息、推送通知、相机与状态栏等能力的统一封装。

## 快速开始

```ts
import { capacitor } from '@h-ai/capacitor'

const initialized = await capacitor.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
const failures: unknown[] = []
try {
  const saved = await capacitor.preferences.set('theme', 'dark')
  if (!saved.success)
    throw new Error(saved.error.message)
  const theme = await capacitor.preferences.get('theme')
  if (!theme.success)
    throw new Error(theme.error.message)
  // theme.data 为 'dark'；尚未保存的键为 null。
}
catch (cause) {
  failures.push(cause)
}
finally {
  const closed = await capacitor.close()
  if (!closed.success)
    failures.push(closed.error)
}
if (failures.length)
  throw new AggregateError(failures, 'Native preference operation failed')
```

## 配置清单

原生插件在 Capacitor 工程中配置，应用通过 `capacitor.init()` 装配。

在[模块配置清单](../../docs/usage/configuration/capacitor.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/capacitor.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `close` / `isInitialized` / `getPlatform` / `isNative` — 管理插件初始化和平台判断
- `device` / `camera` / `push` / `statusBar` — 读取设备信息、拍照、注册推送和调整状态栏
- `preferences` / `createCapacitorTokenStorage` — 按用途存储设置与认证凭据

<a id="android-容器打包"></a>

[Android 容器打包](../../docs/usage/function/capacitor.md#android-容器打包)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/capacitor.md)，了解原生 Preferences、认证凭据、照片与推送令牌。

## 开发测试

```bash
pnpm --filter @h-ai/capacitor test
```

> 由于原生插件依赖，测试中需 mock `@capacitor/*` 模块。

公开操作、内部资源作用域与类型均提供可类型检查的示例；见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)。推送示例的类型检查不证明设备权限或 FCM/APNs 实际可用。

## 许可证

Apache-2.0
