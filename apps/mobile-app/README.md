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

## License

Apache-2.0
