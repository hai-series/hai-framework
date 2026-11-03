# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-client](../api-client/README.md) · [@h-ai/core](../core/README.md)

## 简介

Capacitor 原生桥接模块，为 hai Framework 移动应用提供原生安全 Token 存储、设备信息、推送通知、相机与状态栏等能力的统一封装。

## 核心功能清单

- **Token 存储**：`@aparajita/capacitor-secure-storage`（原生必需）。Android 使用 KeyStore + 加密 SharedPreferences，iOS 使用 Keychain；Web 不回退。
- **Preferences**：`@capacitor/preferences`（必需）。通用偏好数据存储，适合非敏感配置，不用于认证 Token。
- **设备信息**：`@capacitor/device`（可选）。平台、版本、型号检测。
- **应用版本**：`@capacitor/app`（可选）。读取 appVersion / appBuild。
- **推送通知**：`@capacitor/push-notifications`（可选）。注册 FCM/APNs Token、监听推送事件。
- **相机/相册**：`@capacitor/camera`（可选）。拍照、选取相册图片。
- **状态栏**：`@capacitor/status-bar`（可选）。沉浸式、背景色、样式配置。

## 使用入门

### 快速开始

```ts
import { capacitor } from '@h-ai/capacitor'

// 应用启动时初始化（检测 Capacitor 环境）
const result = await capacitor.init()
if (!result.success) {
  // 非 Capacitor 环境（纯 Web）
}
```

#### 与 api-client 配合的 Token 安全存储

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

#### 设备信息与推送

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

#### 状态栏

```ts
import { capacitor } from '@h-ai/capacitor'

await capacitor.statusBar.configure({
  style: 'dark',
  overlay: true,
  backgroundColor: '#ffffff',
})
```

#### 相机

```ts
const photo = await capacitor.camera.takePhoto({
  source: 'camera',
  resultType: 'base64',
  quality: 80,
})
```

#### Preferences

```ts
await capacitor.preferences.set('my_key', 'value')
const result = await capacitor.preferences.get('my_key')
await capacitor.preferences.remove('my_key')
```

`capacitor.preferences` 适合保存语言、主题、草稿等普通偏好数据；认证 Token 请使用 `createCapacitorTokenStorage()`。

### 配置

本模块无配置文件。`capacitor.init()` 仅检测 Capacitor 运行环境是否可用。

Capacitor 应用必须使用 SPA 模式：

```ts
// src/routes/+layout.ts
export const prerender = true
export const ssr = false
```

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

### 错误处理

`capacitor.*` 业务操作与 `safe*Preference` 返回 `HaiResult<T>`；TokenStorage 适配器方法以 Promise 拒绝报告平台与存储错误：

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
