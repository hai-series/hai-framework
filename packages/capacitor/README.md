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

## 功能

### 用途、输入与输出

capacitor 的子功能在初始化成功后使用。HaiResult<T> 先判断 success，再读成功 data；void 没有业务数据，Promise 必须 await。tokens 是 createCapacitorTokenStorage() 返回的独立适配器，其读写/清理在原生存储失败时拒绝 Promise。独立 Preferences 辅助函数不依赖模块状态，把同一插件操作包装为 HaiResult。

| 入口                             | 使用场景               | 输入（`—` 表示无参数）                                                                                 | 返回值                                                                                                | 调用示例                                                                        |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `capacitor.init`                 | 检测并准备原生宿主     | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.init()`                                                        |
| `capacitor.close`                | 释放推送监听等资源     | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.close()`                                                       |
| `capacitor.getPlatform`          | 选择平台行为           | `—`                                                                                                    | `string: ios / android / web`                                                                         | `capacitor.getPlatform()`                                                       |
| `capacitor.isNative`             | 判断是否原生环境       | `—`                                                                                                    | `boolean`                                                                                             | `capacitor.isNative()`                                                          |
| `capacitor.isInitialized`        | 检查模块状态           | `—`                                                                                                    | `boolean`                                                                                             | `capacitor.isInitialized`                                                       |
| `capacitor.device.getInfo`       | 显示设备诊断信息       | `—`                                                                                                    | `Promise<HaiResult<{ platform, osVersion, model, manufacturer, isVirtual, appVersion?, appBuild? }>>` | `await capacitor.device.getInfo()`                                              |
| `capacitor.device.getAppVersion` | 显示当前安装版本       | `—`                                                                                                    | `Promise<HaiResult<{ version, build }>>`                                                              | `await capacitor.device.getAppVersion()`                                        |
| `capacitor.camera.takePhoto`     | 拍照或选择相册图片     | `{ source?: camera/photos/prompt, quality?: 0…100, width?, height?, resultType?: uri/base64/dataUrl }` | `Promise<HaiResult<{ data: string, format: string }>>`                                                | `await capacitor.camera.takePhoto({ source: "photos", resultType: "dataUrl" })` |
| `capacitor.push.register`        | 申请权限并获取推送标识 | `{ signal?: AbortSignal }`                                                                             | `Promise<HaiResult<{ token: string }>>`                                                               | `await capacitor.push.register()`                                               |
| `capacitor.push.listen`          | 接收推送与点击事件     | `{ onReceived?, onActionPerformed? }, { signal? }`                                                     | `Promise<HaiResult<() => Promise<HaiResult<void>>>>`                                                  | `await capacitor.push.listen(callbacks, { signal })`                            |
| `capacitor.statusBar.configure`  | 设置状态栏显示         | `{ style?: dark/light/default, backgroundColor?: color, overlay?: boolean }`                           | `Promise<HaiResult<void>>`                                                                            | `await capacitor.statusBar.configure({ style: "dark", overlay: true })`         |
| `capacitor.statusBar.show`       | 显示状态栏             | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.statusBar.show()`                                              |
| `capacitor.statusBar.hide`       | 隐藏状态栏             | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.statusBar.hide()`                                              |
| `capacitor.preferences.get`      | 读取普通偏好           | `key: string`                                                                                          | `Promise<HaiResult<string / null>>`                                                                   | `await capacitor.preferences.get("theme")`                                      |
| `capacitor.preferences.set`      | 保存普通偏好           | `key: string, value: string`                                                                           | `Promise<HaiResult<void>>`                                                                            | `await capacitor.preferences.set("theme", "dark")`                              |
| `capacitor.preferences.remove`   | 删除普通偏好           | `key: string`                                                                                          | `Promise<HaiResult<void>>`                                                                            | `await capacitor.preferences.remove("theme")`                                   |
| `createCapacitorTokenStorage`    | 创建原生安全凭据适配器 | `—`                                                                                                    | `TokenStorage`                                                                                        | `createCapacitorTokenStorage()`                                                 |
| `tokens.getAccessToken`          | 读取已保存的访问令牌   | `—`                                                                                                    | `Promise<string / null>`                                                                              | `await tokens.getAccessToken()`                                                 |
| `tokens.getRefreshToken`         | 读取已保存的刷新令牌   | `—`                                                                                                    | `Promise<string / null>`                                                                              | `await tokens.getRefreshToken()`                                                |
| `tokens.setAccessToken`          | 保存访问令牌           | `token: string`                                                                                        | `Promise<void>`                                                                                       | `await tokens.setAccessToken(accessToken)`                                      |
| `tokens.setRefreshToken`         | 保存刷新令牌           | `token: string`                                                                                        | `Promise<void>`                                                                                       | `await tokens.setRefreshToken(refreshToken)`                                    |
| `tokens.clear`                   | 删除本机两类凭据       | `—`                                                                                                    | `Promise<void>`                                                                                       | `await tokens.clear()`                                                          |
| `safeGetPreference`              | 独立读取非敏感偏好     | `key: string`                                                                                          | `Promise<HaiResult<string / null>>`                                                                   | `await safeGetPreference("theme")`                                              |
| `safeSetPreference`              | 独立保存非敏感偏好     | `key: string, value: string`                                                                           | `Promise<HaiResult<void>>`                                                                            | `await safeSetPreference("theme", "dark")`                                      |
| `safeRemovePreference`           | 独立删除非敏感偏好     | `key: string`                                                                                          | `Promise<HaiResult<void>>`                                                                            | `await safeRemovePreference("theme")`                                           |

照片的 source 选择相机、相册或交互选择器；quality 是 0–100 的质量值，width/height 是像素约束。成功时 data 随 resultType 返回可显示的 webPath、裸 Base64 或带 MIME 前缀的 Data URL，format 是插件返回的图片格式。callbacks 的 onReceived/onActionPerformed 接收推送对象，signal 来自应用创建的 AbortController；成功 listen 的 data 是需要 await 并检查结果的清理函数。独立工厂与 Preferences 辅助函数从 @h-ai/capacitor 根入口导入。

- **Token 存储**：`@aparajita/capacitor-secure-storage`（原生必需）。Android 使用 KeyStore + 加密 SharedPreferences，iOS 使用 Keychain；Web 不回退。
- **Preferences**：`@capacitor/preferences`（必需）。通用偏好数据存储，适合非敏感配置，不用于认证 Token。
- **设备信息**：`@capacitor/device`（可选）。平台、版本、型号检测。
- **应用版本**：`@capacitor/app`（可选）。读取 appVersion / appBuild。
- **推送通知**：`@capacitor/push-notifications`（可选）。注册 FCM/APNs Token、监听推送事件。
- **相机/相册**：`@capacitor/camera`（可选）。拍照、选取相册图片。
- **状态栏**：`@capacitor/status-bar`（可选）。沉浸式、背景色、样式配置。

### 与 api-client 配合的 Token 安全存储

```ts
import { apiClient } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

await apiClient.init({
  baseUrl: 'https://api.example.com/v1',
  auth: {
    storage: createCapacitorTokenStorage(),
    refreshPath: '/auth/refresh',
  },
})
```

`createCapacitorTokenStorage()` 仅在 Android/iOS 原生环境中持久化 token，并要求已安装 `@aparajita/capacitor-secure-storage`。适配器的方法直接返回 Promise：Web 调用、插件不可用、读写或删除失败都会拒绝 Promise，不能当作空凭据或保存/退出成功。Web 入口应选择 api-client 的 Cookie/内存存储。

`clear()` 一开始就屏蔽本实例两类旧凭据，并等待所有原生删除结束后才报告结果；失败时保持屏蔽，相应 key 成功写入后才重新开放。通过 `apiClient.auth` 更新凭据以串行提交写入，并处理 `setTokens()` / `clear()` 的拒绝；界面仍须释放 loading、清理退出身份并提示失败。屏蔽只作用于当前适配器实例，不代表持久数据已删除，跨重启撤销依赖服务端退出/撤销会话。插件恢复后可以用同一实例重试，无需重建模块。

任一凭据写入失败都会屏蔽整对凭据，因此 access 已保存而 refresh 保存失败时也不会留下可读的半完成会话。登录/注册保存失败后应尝试 `auth.clear()` 清理部分持久数据；清理再次失败须明确提示，不得声称设备凭据已删除。

同一模块中的全部 TokenStorage 实例共享原生变更队列。`clear()` 等待更早调用的写入完成再删除，避免迟到写入在清理成功后恢复旧凭据；之后显式调用的写入可保存新凭据。该顺序不跨独立 WebView/JavaScript 运行环境提供进程间协调。

### 设备信息与推送

```ts
import { capacitor } from '@h-ai/capacitor'

const info = await capacitor.device.getInfo()
if (info.success) {
  // info.data.platform — 'android' | 'ios' | 'web'
}

const reg = await capacitor.push.register()
if (reg.success) {
  // reg.data.token — FCM/APNs 推送 Token
}
```

推送仅在实际原生平台调用插件。`push.register({ signal? })` 与 `push.listen(callbacks, { signal? })` 的设置阶段限时 30 秒（包含权限和监听器挂载）；失败、超时、取消及 `capacitor.close()` 都会停止回调并移除本次拥有的句柄，迟到的句柄在完成后立即移除，不调用影响其他消费者的 removeAllListeners。listen 成功后信号仍有效，也可调用返回的 cleanup。cleanup 与 close 均返回 `HaiResult<void>`；原生 remove 失败返回 `PUSH_CLEANUP_FAILED`（`capacitor:032`），失败句柄保留供再次调用重试，成功移除的句柄不重复操作。模块关闭后立即不可用；重新初始化前先重试遗留清理。自动化验证控制插件时序，不能代替 Android/iOS 真机 FCM/APNs 权限、注册与反复挂载验收。

### 状态栏

```ts
import { capacitor } from '@h-ai/capacitor'

await capacitor.statusBar.configure({
  style: 'dark',
  overlay: true,
  backgroundColor: '#ffffff',
})
```

### 相机

```ts
const photo = await capacitor.camera.takePhoto({
  source: 'camera',
  resultType: 'base64',
  quality: 80,
})
```

### Preferences

```ts
await capacitor.preferences.set('my_key', 'value')
const result = await capacitor.preferences.get('my_key')
await capacitor.preferences.remove('my_key')
```

`capacitor.preferences` 适合保存语言、主题、草稿等普通偏好数据；认证 Token 请使用 `createCapacitorTokenStorage()`。

### Android 容器打包

在 Hai 工程根运行 `pnpm build --target app --platform android --runtime auto --debug`。省略 `--debug` 构建签名发布包，成功后在 `.hai/build/app/android/<构建类型>/` 查看最新批次。签名设置见 [原生和离线条件](../../docs/usage/getting-started/build.md#原生和离线条件)。

构建镜像提供 Node.js 24、pnpm 12.11.2、JDK 21、Android SDK 36 和 Build Tools 35.0.0 / 36.0.0。构建机使用 `linux/amd64`，APK 的 `arm64-v8a`、`armeabi-v7a` 等目标 ABI 由应用的 Gradle 工程及其原生插件决定。iOS 打包需要 macOS 和 Xcode。

从框架仓库根目录构建镜像。已安装本包的项目可将 `image_dir` 指向 `@h-ai/capacitor` 实际安装目录下的 `images`。

```sh
image_dir=packages/capacitor/images
docker build --platform linux/amd64 -t hai-capacitor-android:36 \
  -f "$image_dir/android.Dockerfile" "$image_dir"
```

在待打包项目的根目录运行容器。使用干净的工作副本，在容器内执行 `pnpm install --frozen-lockfile`，先构建应用依赖的本地 workspace 包，再执行应用已有的构建、`cap sync android` 和 APK 打包命令。APK 写入挂载的工程目录。使用 rootless Podman 时，将 `docker` 换成 `podman`，在 `--user` 之外加上 `--userns=keep-id`。

```sh
docker run --rm -it --platform linux/amd64 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e GRADLE_USER_HOME=/tmp/.gradle -e ANDROID_USER_HOME=/tmp/.android \
  -v "$PWD:/workspace" hai-capacitor-android:36 bash
```

构建下载依赖时需要访问 npm、Gradle 分发站点、Google Maven 和 Maven Central。发布包沿用应用的签名流程，密钥库从容器外只读挂载，口令由构建环境注入。应用示例见 [mobile-app 原生交付与验收](../../apps/mobile-app/README.md#原生交付与验收)。

## 配置

本模块无配置文件。`capacitor.init()` 仅检测 Capacitor 运行环境是否可用。

原生 WebView 运行客户端页面。若应用使用 SvelteKit，配置静态 SPA；纯 Svelte/Vite 模板不使用下面的路由文件：

```ts
// src/routes/+layout.ts
export const prerender = true
export const ssr = false
```

## 错误处理

`init/close`、device/camera/push/statusBar/preferences 业务操作与 `safe*Preference` 返回 `HaiResult<T>`；`getPlatform/isNative/isInitialized` 返回直接值。TokenStorage 适配器方法以 Promise 拒绝报告平台与存储错误：

```ts
import { capacitor, HaiCapacitorError } from '@h-ai/capacitor'

const result = await capacitor.camera.takePhoto({ source: 'camera' })
if (!result.success) {
  if (result.error.code === HaiCapacitorError.CAMERA_FAILED.code) {
    // 相机权限被拒绝或插件未安装
  }
}
```

常用错误码：

| 错误码                                        | code                | 说明                 |
| --------------------------------------------- | ------------------- | -------------------- |
| `HaiCapacitorError.INIT_FAILED`               | `hai:capacitor:001` | 初始化失败           |
| `HaiCapacitorError.NOT_AVAILABLE`             | `hai:capacitor:002` | 能力不可用           |
| `HaiCapacitorError.INIT_IN_PROGRESS`          | `hai:capacitor:003` | 初始化进行中         |
| `HaiCapacitorError.NOT_INITIALIZED`           | `hai:capacitor:010` | 未初始化             |
| `HaiCapacitorError.PREFERENCES_GET_FAILED`    | `hai:capacitor:011` | Preferences 读取失败 |
| `HaiCapacitorError.PREFERENCES_SET_FAILED`    | `hai:capacitor:012` | Preferences 写入失败 |
| `HaiCapacitorError.PREFERENCES_REMOVE_FAILED` | `hai:capacitor:013` | Preferences 删除失败 |
| `HaiCapacitorError.DEVICE_INFO_FAILED`        | `hai:capacitor:020` | 设备信息获取失败     |
| `HaiCapacitorError.APP_VERSION_FAILED`        | `hai:capacitor:021` | 应用版本获取失败     |
| `HaiCapacitorError.PUSH_REGISTER_FAILED`      | `hai:capacitor:030` | 推送注册失败         |
| `HaiCapacitorError.PUSH_LISTEN_FAILED`        | `hai:capacitor:031` | 推送监听失败         |
| `HaiCapacitorError.CAMERA_FAILED`             | `hai:capacitor:040` | 相机操作失败         |
| `HaiCapacitorError.STATUS_BAR_FAILED`         | `hai:capacitor:050` | 状态栏操作失败       |

## 开发测试

```bash
pnpm --filter @h-ai/capacitor test
```

> 由于原生插件依赖，测试中需 mock `@capacitor/*` 模块。

公开操作、内部资源作用域与类型均提供可类型检查的示例；见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)。推送示例的类型检查不证明设备权限或 FCM/APNs 实际可用。

## 许可证

Apache-2.0
