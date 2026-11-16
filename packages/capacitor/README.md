# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-client](../api-client/README.md) · [@h-ai/core](../core/README.md)

Capacitor 原生桥接模块，为 hai Framework 移动应用提供原生安全 Token 存储、设备信息、推送通知、相机与状态栏等能力的统一封装。

## 快速开始

[跟着最小示例完成接入](../../docs/usage/function/capacitor.md#最小接入示例)。

## 配置清单

在 Capacitor 项目中安装并配置要用的推送、相机等原生插件。应用启动时调用 `capacitor.init()`，随后从 `capacitor.push`、`capacitor.camera` 等入口使用已配置的插件。

在[模块配置清单](../../docs/usage/configuration/capacitor.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/capacitor.md#api-reference)，包含调用入口、输入、返回值和用法。

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
