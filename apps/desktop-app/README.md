# hai Desktop App

> hai Agent Framework 的桌面端示例 — **Tauri v2 + Svelte 5 + Vite**，通过 `@h-ai/api-client` + `@h-ai/api-service-contract` 调用 `apps/api-service`。

## 技术栈

- **Tauri v2** — 跨平台原生外壳（Rust + WebView）
- **Svelte 5（runes）+ Vite** — 纯 SPA，**不依赖 SvelteKit / @h-ai/kit**
- **Tailwind CSS v4 + DaisyUI** — UI 体系（与 `@h-ai/ui` 共享）
- **`@h-ai/api-client`** — typed oRPC 客户端，调用 `apps/api-service`
- **`@h-ai/api-service-contract`** — 与 api-service 共享的应用级 contract（含 `app.info` / `app.echo`）
- **`@h-ai/crypto`** — 负责与 `api-service` 的 transport 密钥协商与请求/响应加解密
- **`@h-ai/ui`** — 共享组件库（按需）
- **极简 hash router**（`src/lib/router.svelte.ts`）— 适配 Tauri webview（无 server，无 file:// URL 路由）

## 范围

这是一个**示例**应用，演示桌面端如何对接 hai api-service：

- 注册 / 登录 / 当前会话恢复
- Dashboard（`desktopApiClient.app.info` / `desktopApiClient.app.echo`）
- 用户列表（`apiClient.iam.users.list`，需要 `user:list` 权限）
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
│   │   ├── api.ts             # 绑定 @h-ai/api-service-contract 的 desktopApiClient 初始化
│   │   ├── crypto-config.ts   # config/_crypto.yml 解析与默认值
│   │   ├── router.svelte.ts   # hash router + NavAdapter
│   │   └── auth-store.svelte.ts  # runes 认证状态
│   └── views/
│       ├── AppShellView.svelte
│       ├── LoginView.svelte
│       ├── RegisterView.svelte
│       ├── DashboardView.svelte
│       ├── UsersView.svelte
│       └── ProfileView.svelte
├── config/_crypto.yml         # 桌面端 transport 加密配置
├── src-tauri/                 # Tauri Rust 端（v2）
├── tests/                     # vitest（jsdom）
├── vite.config.ts             # vite + tailwind + svelte
├── svelte.config.js           # autoImportHaiUi + vitePreprocess
└── package.json
```

## 设计要点

- **Token 默认仅存内存**：Tauri webview 与 api-service 跨域时无法直接复用 httpOnly cookie；示例选择安全的内存存储，应用重启后需重新登录。生产应用如需持久会话，应实现基于操作系统密钥库（如 [`tauri-plugin-stronghold`](https://v2.tauri.app/plugin/stronghold/)）的 `TokenStorage`，禁止把 access/refresh token 写入 localStorage。
- **权限由服务端刷新**：`iam.auth.currentUser()` 同时返回当前用户、角色与权限；客户端不持久化权限快照，UI 状态始终来自已校验会话。
- **业务 API 默认走 transport 加密**：`src/lib/api.ts` 启动时会读取 `config/_crypto.yml`，启用 `@h-ai/crypto` + `@h-ai/api-client` 的密钥协商与请求/响应加解密。
- **完整 api-service contract**：桌面端通过 `apiClient.create(apiServiceContract)` 创建 `desktopApiClient`，避免跨应用源码 import，也能访问 api-service 自有 `app.*` 端点。
- **权限感知导航**：`/users` 仅在当前会话拥有 `user:list` 权限时显示；普通注册用户会自动保留在 `/dashboard`。
- **路由 = hash**：file:// 协议不支持 history API，全部走 `#/path`。
- **CSP**：`tauri.conf.json` 的 `app.security.csp` 已放行 `connect-src http://localhost:3000`。生产部署需根据实际域名调整。
- **`@h-ai/ui` 完全解耦**：`@h-ai/ui` 不再包含任何 SvelteKit 依赖；SvelteKit 适配器迁至 `@h-ai/kit/client` 的 `createSvelteKitNavAdapter()`（本应用未使用）。

## API 调用与加密配置

桌面端通过 `PUBLIC_API_BASE` 配置完整 API 基础 URL，transport 客户端设置放在 `config/_crypto.yml`：

```yaml
transport:
  keyExchangePath: /_hai/key-exchange
```

- `PUBLIC_API_BASE` 需包含服务端 `_serv.yml.http.apiPrefix`。
- `keyExchangePath` 需与服务端 `_serv.yml.transport.keyExchangePath` 一致。

桌面端初始化入口在 `src/lib/api.ts`，调用顺序为：

1. 读取 `PUBLIC_API_BASE`
2. 读取 `config/_crypto.yml`
3. 若启用 transport，则先 `crypto.init()`
4. 再 `desktopApiClient.init({ baseUrl, transport, auth })`

## 验证

```bash
pnpm --filter desktop-app typecheck
pnpm --filter desktop-app lint
pnpm --filter desktop-app test
pnpm --filter desktop-app build
```

## License

MIT
