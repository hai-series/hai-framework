---
applyTo: "**/*.svelte"
---

# Svelte 组件开发规范

> 编辑 .svelte 文件时自动激活。组件结构、i18n、安全等规范。

## 组件职责

- 组件只负责渲染和用户交互
- 禁止在组件中写业务逻辑（数据库操作、加密、支付等）
- 业务逻辑放在 services / stores 中，组件通过 import 调用

## i18n

- 所有用户可见文本必须使用 i18n key，不硬编码中文/英文字符串
- @h-ai/ui 场景组件已内置翻译，不需要传入翻译 props
- 应用层翻译文件位于 `messages/{zh-CN,en-US}.json`

## 安全

- 禁止使用 `{@html}` 渲染未经消毒的用户输入
- `{@html}` 仅用于受控 HTML（Markdown 渲染器等，内容已经过 sanitize）
- 用户输入必须经过校验后才提交到服务端
- 禁止在客户端 localStorage 存储敏感 token

## 组件复用

- @h-ai/ui 已有的组件不得重复实现
- 公共组件放在 @h-ai/ui，应用专属组件放在 `src/lib/components/`
- 组件 props 使用 TypeScript 类型定义，禁止 `any`
