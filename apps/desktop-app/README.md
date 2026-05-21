# hai Desktop App

> hai Agent Framework 的桌面端示例 — **Tauri v2 + Svelte 5 + Vite**，通过 `@h-ai/api-client` + `@h-ai/api-contract` 调用 `apps/api-service`。

## 技术栈

- **Tauri v2** — 跨平台原生外壳（Rust + WebView）
- **Svelte 5（runes）+ Vite** — 纯 SPA，**不依赖 SvelteKit / @h-ai/kit**
- **Tailwind CSS v4 + DaisyUI** — UI 体系（与 `@h-ai/ui` 共享）
- **`@h-ai/api-client`** — typed oRPC 客户端，调用 `apps/api-service`
- **`@h-ai/ui`** — 共享组件库（按需）
- **极简 hash router**（`src/lib/router.svelte.ts`）— 适配 Tauri webview（无 server，无 file:// URL 路由）

## 范围

这是一个**示例**应用，演示桌面端如何对接 hai api-service：

- 注册 / 登录 / 自动登录
- Dashboard
- 用户列表（`api.iam.users.list`）
- 个人信息维护

不包含的（保持示例精简）：

- i18n（hard-coded 英文）
- 端到端测试
- 复杂的权限/菜单系统
- Storage / AI 子领域 demo（接口可用，UI 未提供）

## 前置条件

1. **Rust 工具链**（Tauri v2 必需）：参考 [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
2. **api-service 已启动**：

   ```bash
   pnpm --filter api-service dev
   # 默认监听 http://localhost:3000
   ```

3. 复制环境文件：

   ```bash
   cp .env.example .env
   ```

## 启动

```bash
# 仅前端开发（不启 Tauri）
pnpm --filter desktop-app dev    # http://localhost:5176

# Tauri 桌面应用（推荐）
pnpm --filter desktop-app tauri:dev

# 生产构建
pnpm --filter desktop-app tauri:build
```

## 项目结构

```
apps/desktop-app/
├── src/
│   ├── main.ts                # 入口：initApi → mount(App)
│   ├── App.svelte             # 路由 + 认证守卫
│   ├── app.css                # Tailwind + @h-ai/ui 样式
│   ├── lib/
│   │   ├── api.ts             # api-client 初始化
│   │   ├── router.svelte.ts   # hash router + NavAdapter
│   │   └── auth-store.svelte.ts  # runes 认证状态
│   └── views/
│       ├── AppShellView.svelte
│       ├── LoginView.svelte
│       ├── RegisterView.svelte
│       ├── DashboardView.svelte
│       ├── UsersView.svelte
│       └── ProfileView.svelte
├── src-tauri/                 # Tauri Rust 端（v2）
├── tests/                     # vitest（jsdom）
├── vite.config.ts             # vite + tailwind + svelte
├── svelte.config.js           # autoImportHaiUi + vitePreprocess
└── package.json
```

## 设计要点

- **Token 存储 = localStorage**：Tauri webview 与 api-service 跨域，httpOnly cookie 不可用，因此使用 `createLocalStorageTokenStorage()`。Tauri 沙箱内 XSS 面较小，但仍建议生产应用结合 [`tauri-plugin-stronghold`](https://v2.tauri.app/plugin/stronghold/) 或自定义 secure storage。
- **路由 = hash**：file:// 协议不支持 history API，全部走 `#/path`。
- **CSP**：`tauri.conf.json` 的 `app.security.csp` 已放行 `connect-src http://localhost:3000`。生产部署需根据实际域名调整。
- **`@h-ai/ui` 完全解耦**：`@h-ai/ui` 不再包含任何 SvelteKit 依赖；SvelteKit 适配器迁至 `@h-ai/kit/client` 的 `createSvelteKitNavAdapter()`（本应用未使用）。

## 验证

```bash
pnpm --filter desktop-app typecheck
pnpm --filter desktop-app lint
pnpm --filter desktop-app test
pnpm --filter desktop-app build
```

## License

MIT
