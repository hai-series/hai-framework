# hai Mobile App

基于 Svelte 5、`@h-ai/api-client`、`@h-ai/api-service-contract` 与 Capacitor 的移动端应用，可同步构建 Android / iOS 原生工程。

## 能力概览

- **移动端壳**：沿用 `h5-app` 的触屏布局，使用 `AppBar`、`BottomNav`、`PullRefresh`、`InfiniteScroll` 等移动组件。
- **偏好设置**：语言切换与主题切换放在“我的”tab，避免顶栏下拉在小屏中被遮挡。
- **后端接入**：通过 `@h-ai/api-client.create(apiServiceContract)` 连接 `apps/api-service`。
- **认证流程**：参考 `desktop-app`，支持登录、注册、自动拉取当前用户、退出登录。
- **服务联调**：调用 `app.info` / `app.echo` 验证 contract、认证与 transport 加密链路。
- **原生构建**：通过 Capacitor 同步 Android / iOS 工程，原生端 token 使用安全存储。

## 快速开始

```bash
# 1. 启动后端
pnpm --filter api-service dev

# 2. 启动移动端 Web 预览
pnpm --filter mobile-app dev

# 3. 构建静态产物
pnpm --filter mobile-app build
```

首次生成原生工程：

```bash
pnpm --filter mobile-app cap:add:android
pnpm --filter mobile-app cap:add:ios
```

同步并打开原生工程：

```bash
pnpm --filter mobile-app cap:sync:android
pnpm --filter mobile-app cap:android

pnpm --filter mobile-app cap:sync:ios
pnpm --filter mobile-app cap:ios
```

> iOS 构建需要 macOS + Xcode；Windows / Linux 环境只能完成 Web 构建与 Android 工程同步。

## API 契约

移动端不跨应用导入后端源码，只依赖共享契约：

```ts
import { apiClient } from '@h-ai/api-client'
import { apiServiceContract } from '@h-ai/api-service-contract'

export const mobileApiClient = apiClient.create(apiServiceContract)
```

默认 API 地址为 `http://localhost:3000/api/v1`；部署时应通过环境变量与服务端 `_serv.yml` 对齐。

## 配置

本目录 `.env.example` 完整说明字段用途、枚举和范围；`.env` 为公共基础，`.env.dev` / `.env.test` / `.env.prod` 为公共环境覆盖，均提交 Git。`.env.local` 保存本机私有覆盖，不提交。优先级为进程环境 > `.env.local` > 环境文件 > `.env`。使用 `dev:test` / `dev:prod`、`build:prod` 或 Node `start:test` / `start:prod` 切换，详见 [配置与环境变量](../../README.md#配置与环境变量)。

| 变量                           | 说明                                                       | 默认值                         |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------ |
| `PUBLIC_API_BASE`              | `apps/api-service` API 基础 URL；覆盖时需包含共享 API 前缀 | `http://localhost:3000/api/v1` |
| `PUBLIC_API_TRANSPORT`         | transport 加密开关；服务端关闭 transport 时才设为 `off`    | `on`                           |
| `PUBLIC_API_KEY_EXCHANGE_PATH` | transport 密钥协商路径                                     | `/_hai/key-exchange`           |
| `CAPACITOR_SERVER_URL`         | Capacitor live reload 前端地址；只用于调试前端页面         | 空                             |

Android 模拟器访问宿主机后端时通常使用：

```env
PUBLIC_API_BASE=http://10.0.2.2:3000/api/v1
```

### 认证页面

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

认证方式、注册、重置、协议和品牌由服务端 config/_iam.yml 控制。SvelteKit 页面消费 iam.publicConfig；移动/桌面页面从 API 服务读取公开配置。选用 Reach 时，初始化成功后传入 iam.init({ ...settings, reach })，使用标准通知模板。多节点共享 DB 与 Redis。UI 复用 AuthPanel/LoginForm 和框架认证动作，应用只负责业务导航与用户状态。

[完整配置与安全约束](../../packages/iam/README.md)

## 错误处理

- `api-client` procedure 返回 `HaiResult`，store 层统一转换为页面错误文案。
- 原生端 token 使用 `createCapacitorTokenStorage()`；Web 预览使用内存 token，不写入 `localStorage`。
- transport 默认开启，需确保 `apps/api-service` 同样启用 `_serv.yml.transport`。

## 测试

```bash
pnpm --filter mobile-app check
pnpm --filter mobile-app lint
pnpm --filter mobile-app test
pnpm --filter mobile-app build
pnpm --filter mobile-app test:e2e
```

## 原生交付与验收

移动端原生打包独立于 Web 构建：`build` 仅产出静态资源，Capacitor 命令才同步并构建原生工程。CI 的 [`native.yml`](../../.github/workflows/native.yml) 在对应 OS 上完成原生构建；打包成功不代替安装后的行为验收。

| 平台          | 必需环境                               | 构建入口                                                                                | 产物                                        |
| ------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| Android       | JDK 21、Android SDK 36、Gradle wrapper | `cap add android` → `cap sync android` → `gradlew assembleDebug`                        | `android/app/build/outputs/apk/debug/*.apk` |
| iOS Simulator | macOS、Xcode、SPM                      | `cap add ios --packagemanager SPM` → `cap sync ios` → `xcodebuild -sdk iphonesimulator` | `App.app`                                   |

生产移动端使用 HTTPS API；HTTP 模拟器地址需显式调试网络策略，不能把 Web 可访问误认为设备可访问（`CAPACITOR_SERVER_URL` 仅用于前端 live reload）。debug APK 与 Simulator `.app` 都不是正式签名产物，真机签名、商店发布与升级验收需对应签名身份。

打包后须在设备 / 模拟器完成安装后验收：下载同一提交产物、连接独立验收后端、只用测试账号，证据不得含密码 / token / 密钥。

| 步骤       | 通过条件                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 安装与启动 | 干净环境安装后进入登录页，无白屏 / 崩溃，UI 资源从安装包加载                                                                 |
| 认证与网络 | 注册 / 登录测试账号、读取当前用户、执行 `app.info` / `app.echo`，核对真实 API 域名、TLS、CORS 与 transport                   |
| 断网恢复   | 断网调用失败并保留输入，恢复网络后可重试，无假成功                                                                           |
| 安全存储   | Android 用 KeyStore、iOS 用 Keychain 加密存储，未过期会话可恢复、refresh token 过期回到登录；Web / 普通 Preferences 无 token |
| 退出与升级 | 退出后旧 token 不再被读取；同一应用 ID + 签名身份 + 递增版本覆盖安装后重复认证 / 退出 / 网络流程                             |

安装命令：Android 用 `adb install -r <apk>`，iOS Simulator 用 `xcrun simctl install booted <App.app>`。每次结果记录日期、提交 SHA、包 SHA256、平台 / 工具链、真实命令与退出码及逐步骤通过 / 失败 / 未验证；无设备或凭证时保留「未验证」，不用 skip 制造通过。依据 [Capacitor 官方文档](https://capacitorjs.com/docs)。

## License

Apache-2.0

LDAP 与 Reach 为可选集成。需要默认 LDAP 客户端时，在负责 IAM 的服务端 workspace 安装 ldapts，设置 `login.ldap: true` 与 LDAP 连接配置；也可注入自定义工厂。邮件/短信可以选择 Reach 标准模板，或直接注入 `onOtpSendEmail/onOtpSendSms/onPasswordResetRequest` 回调，投递失败须拒绝 Promise。协议在弹窗内展示；LoginForm/RegisterForm 的 `header/extraFields/footer` 和 AuthPanel 的 `login*/register*` snippet 可用于应用扩展。完整配置与自定义发送示例见 [IAM 用法](../../packages/iam/README.md#可选-ldap-与通知接入)。
