# AGENTS.md

> Capacitor Mobile App 项目 AI 编程助手入口。详细 Skill 文件位于 `.agents/skills/`。

## 项目概述

本项目是 hai-framework Mobile/Capacitor 模板：直接使用 Svelte 5 + Vite 输出 SPA，Capacitor 负责 Android/iOS 原生壳和设备能力。

## 核心规范

- 不使用 SvelteKit 路由、server hooks 或 `@h-ai/kit`。
- 原生能力通过 `@h-ai/capacitor` 使用；token 原生端使用 Capacitor 安全存储，Web 预览仅使用内存存储。
- 页面文本走 i18n，同步中英文 messages。
- API 调用使用 `@h-ai/api-client`，业务错误按 HaiResult 处理。
- 禁止 `any`、`console.log`、硬编码密钥。

## 常用命令

```bash
pnpm build
pnpm cap:sync:android
pnpm cap:run:android
pnpm cap:build:android:debug
pnpm cap:build:android:release
```

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```