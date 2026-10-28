# hai Desktop App

## 简介

hai Agent Framework 的桌面端示例 — **Tauri v2 + Svelte 5 + Vite**，通过 `@h-ai/api-client` + `@h-ai/api-service-contract` 调用 `apps/api-service`。

## 核心功能清单

- 宽屏下工作区随窗口扩展，列表在自身区域内滚动；手机端自动收拢，登录框和长篇正文保留阅读宽度。

- 使用 Tauri 打包桌面应用，共用 typed API 与认证界面。
- 支持运行时 API 地址、主题、个人设置和原生安装包验证。

## 使用入门

### 技术栈

- **Tauri v2** — 跨平台原生外壳（Rust + WebView）
- **Svelte 5（runes）+ Vite** — 纯 SPA，**不依赖 SvelteKit / @h-ai/kit**
- **Tailwind CSS v4 + DaisyUI** — UI 体系（与 `@h-ai/ui` 共享）
- **`@h-ai/api-client`** — typed oRPC 客户端，调用 `apps/api-service`
- **`@h-ai/api-service-contract`** — 与 api-service 共享的应用级 contract（含 `app.info` / `app.echo`）
- **`@h-ai/crypto`** — 负责与 `api-service` 的 transport 密钥协商与请求/响应加解密
- **`@h-ai/ui`** — 共享组件库（按需）
- **极简 hash router**（`src/lib/router.svelte.ts`）— 适配 Tauri webview（无 server，无 file:// URL 路由）

### 范围

这是一个**示例**应用，演示桌面端如何对接 hai api-service：

- 注册 / 登录 / 当前会话恢复
- Dashboard（`desktopApiClient.app.info` / `desktopApiClient.app.echo`）
- 用户列表（`apiClient.iam.users.list`，需要 `user:list` 权限）
- 个人信息维护
- 中文、英文、日语界面（页面文案在 `messages/`，语言偏好自动保存）

不包含的（保持示例精简）：

- 端到端测试
- 复杂的权限/菜单系统
- Storage / AI 子领域 demo（接口可用，UI 未提供）

### 前置条件

1. **Rust 工具链**（Tauri v2 必需）：参考 [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
2. **api-service 已启动**：

   ```bash
   pnpm --filter api-service dev
   # 默认监听 http://localhost:3000
   ```

3. 按 `.env.example` 的字段说明，在 `.env.local` 中仅填写需要覆盖的本机私有值。

### 启动

```bash
# 仅前端开发（不启 Tauri）
pnpm --filter desktop-app dev    # http://localhost:5176

# Tauri 桌面应用（推荐）
pnpm --filter desktop-app tauri:dev

# 生产构建
pnpm --filter desktop-app tauri:build
```

### 项目结构

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

### 设计要点

用户列表使用卡片内查询栏、独立滚动表格与底部分页。查询/Enter 一次提交草稿，重置清空条件；用户名、邮箱和状态的列头排序交由服务端在分页前执行，翻页与排序保留已提交搜索条件。

- **Token 默认仅存内存**：Tauri webview 与 api-service 跨域时无法直接复用 httpOnly cookie；示例选择安全的内存存储，应用重启后需重新登录。生产应用如需持久会话，应实现基于操作系统密钥库（如 [`tauri-plugin-stronghold`](https://v2.tauri.app/plugin/stronghold/)）的 `TokenStorage`，禁止把 access/refresh token 写入 localStorage。
- **权限由服务端刷新**：`iam.auth.currentUser()` 同时返回当前用户、角色与权限；客户端不持久化权限快照，UI 状态始终来自已校验会话。
- **业务 API 默认走 transport 加密**：`src/lib/api.ts` 启动时会读取 `config/_crypto.yml`，启用 `@h-ai/crypto` + `@h-ai/api-client` 的密钥协商与请求/响应加解密。
- **完整 api-service contract**：桌面端通过 `apiClient.create(apiServiceContract)` 创建 `desktopApiClient`，避免跨应用源码 import，也能访问 api-service 自有 `app.*` 端点。
- **权限感知导航**：`/users` 仅在当前会话拥有 `user:list` 权限时显示；普通注册用户会自动保留在 `/dashboard`。
- **路由 = hash**：file:// 协议不支持 history API，全部走 `#/path`。
- **CSP**：`tauri.conf.json` 的 `app.security.csp` 已放行 `connect-src http://localhost:3000`。生产部署需根据实际域名调整。
- **`@h-ai/ui` 完全解耦**：`@h-ai/ui` 不再包含任何 SvelteKit 依赖；SvelteKit 适配器迁至 `@h-ai/kit/client` 的 `createSvelteKitNavAdapter()`（本应用未使用）。

### API 调用与加密配置

本目录 `.env.example` 完整说明字段用途、枚举和范围；`.env` 为公共基础，`.env.dev` / `.env.test` / `.env.prod` 为公共环境覆盖，均提交 Git。`.env.local` 保存本机私有覆盖，不提交。优先级为进程环境 > `.env.local` > 环境文件 > `.env`。命令和加载规则见 [配置与环境变量](../../README.md#配置与环境变量)。

桌面端通过 `PUBLIC_API_BASE` 配置完整 API 基础 URL，transport 客户端设置放在 `config/_crypto.yml`：

```yaml
transport:
  keyExchangePath: ${HAI_CRYPTO_TRANSPORT_KEYEXCHANGEPATH:/_hai/key-exchange}
```

- `PUBLIC_API_BASE` 需包含服务端 `_serv.yml.http.apiPrefix`。
- `keyExchangePath` 需与服务端 `_serv.yml.transport.keyExchangePath` 一致。

桌面端初始化入口在 `src/lib/api.ts`，调用顺序为：

1. 读取 `PUBLIC_API_BASE`
2. 构建期通过 core 解析 `config/_crypto.yml` 的公开默认值；开发与预览才读取环境文件
3. 若启用 transport，则先 `crypto.init()`
4. 再 `desktopApiClient.init({ baseUrl, transport, auth })`

#### 认证页面

登录、注册及公开认证配置失败统一使用 `@h-ai/ui/i18n` 的 `authErrorMessage`；未知服务端或网络异常不显示原文，保留有效追踪编号。AuthPanel 的首次改密、密码复用和凭据错误提示与 fullstack 模板保持一致。

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

认证方式、注册、重置、协议和品牌由服务端 config/_iam.yml 控制。SvelteKit 页面消费 iam.publicConfig；移动/桌面页面从 API 服务读取公开配置。选用 Reach 时，初始化成功后传入 iam.init({ ...settings, reach })，使用标准通知模板。多节点共享 DB 与 Redis。UI 复用 AuthPanel/LoginForm 和框架认证动作，应用只负责业务导航与用户状态。

[完整配置与安全约束](../../packages/iam/README.md)

登出会检查服务端 HaiResult，并在网络或服务端撤销失败时显示本地化 Toast；仍清理本地身份。安全存储清理失败会显示独立警告并结束加载，不能把本地页面退出当作服务端凭据已经失效。认证提示位于 `messages/zh-CN.json`、`messages/en-US.json`、`messages/ja-JP.json`。

### 原生交付与验收

桌面端原生打包独立于 Web 构建：`pnpm build` 默认编译资源，`pnpm build --target desktop` 调用 Tauri 生成安装包。CI 的 [`native.yml`](../../.github/workflows/native.yml) 在 Windows 上安装锁定依赖、构建共享包后调用相同入口，不接收部署环境或 API 地址。API Origin 与 CSP 在程序启动时注入；打包成功不代替安装后的行为验收。

| 平台        | 必需环境                             | 构建入口                                | 产物                                               |
| ----------- | ------------------------------------ | --------------------------------------- | -------------------------------------------------- |
| Windows x64 | Rust MSVC、C++ Build Tools、WebView2 | `pnpm --filter desktop-app tauri:build` | `src-tauri/target/release/bundle/nsis/*-setup.exe` |

安装包默认未签名，不是正式发布产物；真机签名、商店发布与升级验收需对应签名身份，不得为跑通流程绕过签名或安全存储。

打包后须在干净环境完成安装后验收：下载同一提交产物、连接独立验收后端、只用测试账号，证据不得含密码 / token / 密钥。

| 步骤       | 通过条件                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 安装与启动 | 干净环境安装后进入登录页，无白屏 / 崩溃，UI 资源从安装包加载                                               |
| 认证与网络 | 注册 / 登录测试账号、读取当前用户、执行 `app.info` / `app.echo`，核对真实 API 域名、TLS、CORS 与 transport |
| 断网恢复   | 断网调用失败并保留输入，恢复网络后可重试，无假成功                                                         |
| 关闭重启   | 内存 token 决定重启后需重新登录                                                                            |
| 退出与升级 | 退出后重启仍未登录、旧 token 不再被读取；同一应用 ID + 递增版本覆盖安装后重复认证 / 退出 / 网络流程        |

Windows 可用 NSIS `/S /D=<绝对路径>` 在隔离目录静默安装。每次结果记录日期、提交 SHA、包 SHA256、平台 / 工具链、真实命令与退出码及逐步骤通过 / 失败 / 未验证；无设备或凭证时保留「未验证」，不用 skip 制造通过。依据 [Tauri Windows 安装包](https://v2.tauri.app/distribute/windows-installer/)。

### 镜像构建与部署

在本应用目录执行，镜像定义为 `images/web.Dockerfile`，`hai.json` 的 `build.images` 指定文件与仓库根构建上下文。Web 运行配置位于 `images/web/`（如有）。容器角色为 web，项目身份来自本目录的 package.json.name；手机和桌面原生包分别使用 app/desktop 目标。应用版本来自本目录的 `package.json.version`。

```sh
pnpm build:images                         # 只构建镜像并导出 tar
pnpm run deploy --env prod --build        # 构建、打包、上传、启动并检查访问
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

先准备 `.env.prod` 与项目根 `hai.json` 的 `deploy`；首次向导以说明文字收集服务器连接信息并保存到 `.env.local`。完整离线包包含应用和自建中间件镜像，目标 Linux 需预装容器引擎、Compose 与脚本要求的工具。把本次 `.hai/deploy/<环境>/bundle-*/` 整个目录复制到操作机（tar、配置和脚本均在其中），Windows 执行 `deploy.ps1`，Linux/macOS 执行 `deploy.sh`；完全隔离的服务器复制整个交付目录后执行 `sh deploy-local.sh`，自动解包并部署。

已有成功安装时，可用 `--services web` 只更新本应用；多个镜像的工程按服务名选择。局部发布保留其他容器和持久化卷，不执行整个项目 `down`，失败保留诊断并尝试恢复旧容器。相同版本允许重建，每次以独立构建 ID 区分内容。`images/dependencies/` 为忽略 Git 的依赖输入，配合引擎缓存和分层减少重复下载。

完整参数、缓存、版本与恢复说明见[使用指南](../../docs/usage/README.md#4-编译源码与打包产物)。移动端和桌面端的原生安装包仍需在对应系统另行构建；容器部署交付的是 Web 页面。

### 可选集成

LDAP 与 Reach 为可选集成。需要默认 LDAP 客户端时，在负责 IAM 的服务端 workspace 安装 ldapts，设置 `login.ldap: true` 与 LDAP 连接配置；也可注入自定义工厂。邮件/短信可以选择 Reach 标准模板，或直接注入 `onOtpSendEmail/onOtpSendSms/onPasswordResetRequest` 回调，投递失败须拒绝 Promise；回调第三参数 context 提供 expiresAt/idempotencyKey，发送服务按稳定键持久化去重，异常/超时为结果未知且不自动重发。协议在弹窗内展示；LoginForm/RegisterForm 的 `header/extraFields/footer` 和 AuthPanel 的 `login*/register*` snippet 可用于应用扩展。完整配置与自定义发送示例见 [IAM 用法](../../packages/iam/README.md#可选-ldap-与通知接入)。

原生安装包不烘焙环境地址；启动前设置进程 `PUBLIC_API_BASE=https://server.example/api/v1`，Rust 校验后注入页面并将该 Origin 加入 CSP，缺省为 http://localhost:3000/api/v1。

## 开发测试

桌面 Web 预览的跨端浏览器验证由 `pnpm --filter mobile-app test:e2e` 托管，显式使用本轮 loopback API、可信 transport 与独立数据目录。`HAI_E2E=1` 时预览不读取用户 `.env.local`；普通开发、生产启动的 dotenv 规则保持不变。浏览器结果不能代替桌面安装包和原生设备验收。

```bash
pnpm --filter desktop-app typecheck
pnpm --filter desktop-app lint
pnpm --filter desktop-app test
pnpm --filter desktop-app build
```

## 许可证

Apache-2.0
