# hai-capacitor — 详细用法

从 [SKILL.md](SKILL.md) 选择主题后读取对应小节。代码片段展示 API 用法；省略的业务变量、schema、依赖与 return 上下文需由应用补齐。

> `@h-ai/capacitor` 是 hai-framework 的 Capacitor 原生桥接模块。设备、推送等领域操作返回 `HaiResult<T>`；TokenStorage 是直接 Promise 适配器，失败会拒绝。与 `@h-ai/api-client` 配合时，Token 仅存于原生安全存储，不回退到 Web `localStorage`。

## 运行环境

> **浏览器端 / 原生 App 专用。** 在 Capacitor 原生环境（Android/iOS）中提供完整能力；`capacitor.createTokenStorage()` 仅在原生环境持久化 token，纯 Web 不做不安全回退。`capacitor.preferences` 仍可用于普通偏好数据。

### Android 容器打包

在包含 `hai.json` 的 Hai 工程根目录执行下面的命令。`hai.json` 的 `build.app` 指向包含 `capacitor.config.ts` 的原生应用目录；单应用通常为 `.`，Fullstack 可为 `apps/orders-app`。宿主需有项目要求的 Node.js/pnpm 和可运行 `linux/amd64` 容器的 Docker/Podman，引擎需已启动。

```sh
# 在 Hai 工程根目录生成调试 APK；成功后使用命令打印的归档路径取包。
pnpm build --target app --platform android --runtime auto --debug
```

CLI 从已安装的 `@h-ai/capacitor` 定位 `images/android.Dockerfile`，按工具定义准备或复用镜像，再从锁文件所在目录创建临时工作副本。容器内按锁文件安装依赖，构建本地 workspace 依赖和应用前端，同步或创建 Android 工程，执行 Gradle、APK 校验和所需签名，最后归档并清理临时副本。普通应用无需取得框架源码或先手动构建镜像。

调试 APK 归档在 `.hai/build/app/android/debug/<批次目录>/`，`latest` 文件记录最新成功批次，具体文件路径见该批次 `manifest.json`。镜像和项目缓存保留供后续复用。首次调试构建可以在临时副本中生成 Android 壳，但源工程不会因此新增可维护的原生工程。

省略 `--debug` 构建发布 APK，需要已有 `android/` 工程，并通过进程或 CI 提供 `HAI_ANDROID_KEYSTORE`、`HAI_ANDROID_STORE_PASSWORD`、`HAI_ANDROID_KEY_ALIAS`、`HAI_ANDROID_KEY_PASSWORD`。密钥库路径相对于 Hai 工程根解析，只读挂载到独立签名容器。发布 APK 归档在 `.hai/build/app/android/release/<批次目录>/`。

镜像提供 Node.js 24、pnpm 12.11.2、JDK 21、Android SDK 36 和 Build Tools 35.0.0 / 36.0.0。`auto` 依次尝试 Podman、Docker，也可显式指定；省略 `--runtime` 会选择本机原生构建。构建容器为 `linux/amd64`，APK 目标 ABI 由 Gradle 工程和原生插件决定。iOS 使用 macOS/Xcode。

## 适用场景

- Android/iOS 原生应用开发（Svelte 5 + Vite + Capacitor）
- Token 安全存储（`@aparajita/capacitor-secure-storage`）
- 设备信息获取（平台、型号、版本）
- 推送通知注册与监听（FCM / APNs）
- 原生相机拍照 / 相册选取
- 状态栏配置（沉浸式、颜色、样式）

## 使用步骤

### 1. 初始化与关闭

`close()` 从调用开始使模块不可用，并使当时尚未完成的 `init()` 失效。旧初始化结束时返回既有的 `INIT_FAILED`，不会在关闭后恢复 `isInitialized`。需要重新使用时，等待关闭完成后再显式初始化。

```typescript
import { capacitor } from '@h-ai/capacitor'

// 应用启动时初始化（检测 Capacitor 环境可用性）
// 不传配置，检测当前运行平台并初始化。成功后模块可用，平台不可用或初始化失败时返回错误。
const result = await capacitor.init()
if (!result.success) {
  // 平台不可用、初始化失败或被 close 作废时，不继续调用子操作。
  throw new Error(result.error.message, { cause: result.error })
}

// 检查状态
capacitor.isInitialized // boolean
// 读取当前平台标识，例如 android、ios 或 web。
capacitor.getPlatform() // 'android' | 'ios' | 'web'
// 判断当前运行环境是否为原生宿主，返回布尔值。
capacitor.isNative()    // true = 原生 App

// 关闭模块（重置状态）
// 关闭当前实例并等待已知监听句柄移除。清理失败返回错误，可再次 close 重试。
const closed = await capacitor.close()
if (!closed.success)
  throw new Error(closed.error.message, { cause: closed.error })
```

### 2. Token 安全存储（与 api-client 配合）

先复用应用已有的 API 初始化入口。示例中的 `apiBase` 由应用解析公开运行配置，已经包含 API 前缀，不重复拼接 `/api/v1`。Web 部署可通过 `runtime-config.js` 覆盖地址；原生包在复制静态资源前设置公开配置。

```typescript
import { apiClient } from '@h-ai/api-client'
import { capacitor } from '@h-ai/capacitor'

// 使用应用提供的 apiBase 和原生凭据存储配置客户端。初始化失败返回错误。
await apiClient.init({
  baseUrl: apiBase,
  auth: {
    // 创建安全令牌适配器供客户端持久化凭据，后续访问原生插件可能失败。
    storage: capacitor.createTokenStorage(),
  },
})
```

`capacitor.createTokenStorage()` 返回 `TokenStorage` 实例（兼容 `@h-ai/api-client`），底层使用 `@aparajita/capacitor-secure-storage`：

- Android → Android KeyStore + 加密 SharedPreferences
- iOS → Keychain
- Web → **不提供原生存储回退**；适配器方法拒绝 Promise，Web 入口选择 api-client 的 Cookie/内存存储

读取、保存与删除失败均拒绝 Promise。调用方通过 `apiClient.auth` 串行更新凭据并捕获 setTokens/clear 失败；界面释放 loading，退出失败仍清理内存身份并提示错误。`clear()` 开始立即屏蔽本实例两类旧凭据，等待两个删除都结束；即使失败也保持屏蔽，相应 key 成功写入后重新开放。屏蔽不等于持久删除，跨实例/重启撤销仍依赖服务端退出/撤销会话。插件恢复后可以在同一实例重试，不缓存永久失败状态。

任一 key 写入失败也会屏蔽整对凭据，避免 access 已落盘而 refresh 保存失败后的半完成登录。登录/注册保存失败后尝试 `auth.clear()` 清理部分数据；清理失败继续显示未确认删除的错误，不能只清界面身份或宣称持久删除成功。

同一模块内全部 TokenStorage 共享原生写入/删除队列；clear 等待此前写入再删除，后续显式写入才可建立新凭据。该顺序覆盖同模块多适配器，不跨独立 WebView/JavaScript 运行环境提供进程间协调。

#### Preferences 子操作

```typescript
import { capacitor } from '@h-ai/capacitor'

// 无参初始化成功后才能使用偏好操作；失败时停止本示例。
const initialized = await capacitor.init()
if (!initialized.success)
  throw new Error(initialized.error.message, { cause: initialized.error })
const failures: unknown[] = []
try {
  // 将 dark 写入非敏感偏好 demo-theme；成功无数据，失败交给下方错误边界。
  const saved = await capacitor.preferences.set('demo-theme', 'dark')
  if (!saved.success)
    throw new Error(saved.error.message, { cause: saved.error })
  // 读取同一键，成功时为 dark；读取失败不继续删除。
  const current = await capacitor.preferences.get('demo-theme')
  if (!current.success)
    throw new Error(current.error.message, { cause: current.error })
  current.data // 'dark'
  // 删除 demo-theme；成功无数据，删除失败不宣称已清除。
  const removed = await capacitor.preferences.remove('demo-theme')
  if (!removed.success)
    throw new Error(removed.error.message, { cause: removed.error })
  // 再读已经删除的键，成功时为 null；插件读取失败仍需处理。
  const missing = await capacitor.preferences.get('demo-theme')
  if (!missing.success)
    throw new Error(missing.error.message, { cause: missing.error })
  missing.data // null
}
catch (cause) {
  failures.push(cause)
}
finally {
  // 关闭本示例初始化的模块；收集清理失败，关闭后偏好操作不可用。
  const closed = await capacitor.close()
  if (!closed.success)
    failures.push(closed.error)
}
if (failures.length)
  throw new AggregateError(failures, 'Preference verification failed')
```

### 3. 设备信息

```typescript
import { capacitor } from '@h-ai/capacitor'

// 读取当前设备的系统、型号等字段。插件不可用时返回错误。
const info = await capacitor.device.getInfo()
if (info.success) {
  info.data.platform    // 'android' | 'ios' | 'web'
  info.data.model       // 'Pixel 7'
  info.data.osVersion   // '14'
  info.data.manufacturer // 'Google'
  info.data.isVirtual   // false
}

// 读取应用版本和构建号。平台无这些数据时返回失败。
const version = await capacitor.device.getAppVersion()
if (version.success) {
  version.data.version // '1.0.0'
  version.data.build   // '42'
}
```

### 4. 推送通知

```typescript
import { capacitor } from '@h-ai/capacitor'

// 注册推送（请求权限 + 获取设备 Token）
// 为当前设备请求推送权限并注册。成功包含设备 token，拒权或注册失败返回错误。
const reg = await capacitor.push.register()
if (reg.success) {
  // 将 reg.data.token 上报给后端
  // 把注册返回的 token 交给应用后端，成功后后端才能向该设备寻址。
  await api.post('/push/register', { token: reg.data.token })
}

// 监听推送事件（返回 HaiResult 包裹的 async 清理函数）
// 将下方两个回调注册为推送监听。成功返回异步清理函数，注册失败返回错误。
const listenResult = await capacitor.push.listen({
  onReceived: (notification) => {
    // 前台收到推送
    // notification: { id, title?, body?, data? }
  },
  onActionPerformed: (notification) => {
    // 用户点击推送
  },
})

// 停止监听
if (listenResult.success) {
  // 移除本次注册的监听。清理失败通过返回结果报告。
  await listenResult.data()
}
```

### 5. 相机

```typescript
import { capacitor } from '@h-ai/capacitor'

// 拍摄图片并按下方质量、尺寸和 Base64 格式处理。成功包含数据和实际格式，取消或拍摄失败返回错误。
const photo = await capacitor.camera.takePhoto({
  quality: 80,           // 0-100
  source: 'camera',      // 'camera' | 'photos' | 'prompt'
  resultType: 'base64',  // 'uri' | 'base64' | 'dataUrl'
  width: 800,            // 最大宽度（可选）
  height: 600,           // 最大高度（可选）
})

if (photo.success) {
  const imgSrc = `data:image/${photo.data.format};base64,${photo.data.data}`
}
```

### 6. 状态栏

`style` 按 Capacitor 的背景主题命名：`dark` 为深色背景选择浅色文字，`light` 为浅色背景选择深色文字，`default` 跟随系统外观。它不设置背景色；背景由页面或平台支持的 `backgroundColor` 决定。下面在支持背景色和覆盖设置的原生平台上使用白底深字，并让 WebView 位于状态栏下方。

```typescript
import { capacitor } from '@h-ai/capacitor'

// 将当前原生状态栏设置为下方颜色和覆盖模式，插件操作失败返回错误。
await capacitor.statusBar.configure({
  backgroundColor: '#ffffff',
  style: 'light',    // 浅色背景主题，显示深色文字。
  overlay: false,    // 不覆盖 WebView。
})

// 隐藏当前状态栏，插件调用失败返回错误。
await capacitor.statusBar.hide()
// 重新显示当前状态栏，插件调用失败返回错误。
await capacitor.statusBar.show()
```

## 核心 API

| API | 用途 | 返回值 |
| --- | --- | --- |
| `capacitor.init()` | 初始化模块；被 close 作废的在途初始化返回 INIT_FAILED | `Promise<HaiResult<void>>` |
| `capacitor.close()` | 关闭模块并回收推送，失败可重试 | `Promise<HaiResult<void>>` |
| `capacitor.getPlatform()` | 获取当前平台 | `'android' \| 'ios' \| 'web'` |
| `capacitor.isNative()` | 是否为原生环境 | `boolean` |
| `capacitor.isInitialized` | 是否已初始化 | `boolean` |
| `capacitor.createTokenStorage()` | 创建 Token 存储 | `TokenStorage`（兼容 api-client） |
| `capacitor.preferences.get(key)` | 初始化成功后读取普通偏好 | `Promise<HaiResult<string \| null>>` |
| `capacitor.preferences.set(key, value)` | 初始化成功后写入普通偏好 | `Promise<HaiResult<void>>` |
| `capacitor.preferences.remove(key)` | 初始化成功后删除普通偏好 | `Promise<HaiResult<void>>` |
| `capacitor.device.getInfo()` | 设备信息 | `HaiResult<DeviceInfo>` |
| `capacitor.device.getAppVersion()` | 应用版本 | `HaiResult<{ version, build }>` |
| `capacitor.push.register(options?)` | token 与收尾清理共用自调用开始的 30 秒期限 | `Promise<HaiResult<PushRegistration>>` |
| `capacitor.push.listen(callbacks, options?)` | 设置阶段限时 30 秒，成功后信号仍可取消 | `Promise<HaiResult<PushCleanup>>`（cleanup 返回 `Promise<HaiResult<void>>`） |
| `capacitor.camera.takePhoto(options?)` | 拍照 / 选取图片 | `HaiResult<PhotoResult>` |
| `capacitor.statusBar.configure(config)` | 配置状态栏 | `HaiResult<void>` |
| `capacitor.statusBar.show()` | 显示状态栏 | `HaiResult<void>` |
| `capacitor.statusBar.hide()` | 隐藏状态栏 | `HaiResult<void>` |

## 错误码 — `HaiCapacitorError`

| 错误码                                       | code                   | 说明                 |
| -------------------------------------------- | ---------------------- | -------------------- |
| `HaiCapacitorError.INIT_FAILED`              | `hai:capacitor:001`    | 初始化失败           |
| `HaiCapacitorError.NOT_AVAILABLE`            | `hai:capacitor:002`    | Capacitor 不可用     |
| `HaiCapacitorError.INIT_IN_PROGRESS`         | `hai:capacitor:003`    | 正在初始化中         |
| `HaiCapacitorError.NOT_INITIALIZED`          | `hai:capacitor:010`    | 模块未初始化         |
| `HaiCapacitorError.PREFERENCES_GET_FAILED`   | `hai:capacitor:011`    | Preferences 读取失败 |
| `HaiCapacitorError.PREFERENCES_SET_FAILED`   | `hai:capacitor:012`    | Preferences 写入失败 |
| `HaiCapacitorError.PREFERENCES_REMOVE_FAILED`| `hai:capacitor:013`    | Preferences 删除失败 |
| `HaiCapacitorError.DEVICE_INFO_FAILED`       | `hai:capacitor:020`    | 获取设备信息失败     |
| `HaiCapacitorError.APP_VERSION_FAILED`       | `hai:capacitor:021`    | 获取应用版本失败     |
| `HaiCapacitorError.PUSH_REGISTER_FAILED`     | `hai:capacitor:030`    | 推送注册失败         |
| `HaiCapacitorError.PUSH_LISTEN_FAILED`       | `hai:capacitor:031`    | 推送监听失败         |
| `HaiCapacitorError.PUSH_CLEANUP_FAILED`      | `hai:capacitor:032`    | 推送监听清理失败，可重试 |
| `HaiCapacitorError.CAMERA_FAILED`            | `hai:capacitor:040`    | 拍照/相册失败        |
| `HaiCapacitorError.STATUS_BAR_FAILED`        | `hai:capacitor:050`    | 状态栏配置失败       |

## 常见模式

### Mobile App 标准初始化

```typescript
// src/lib/capacitor.ts
import { capacitor } from '@h-ai/capacitor'

export async function initCapacitor() {
  // 初始化当前平台。失败时本示例直接返回。
  const result = await capacitor.init()
  if (!result.success) {
    return
  }

  // 仅当当前运行平台为原生宿主时才进入状态栏配置。
  if (capacitor.isNative()) {
    // 配置原生状态栏的浅色样式、背景并关闭内容覆盖。配置失败返回结构化错误。
    await capacitor.statusBar.configure({
      backgroundColor: '#ffffff',
      style: 'light',
      overlay: false,
    })
  }
}
```

```svelte
<!-- src/App.svelte -->
<script lang='ts'>
  import { onMount } from 'svelte'
  import { initCapacitor } from './lib/capacitor'

  onMount(() => { initCapacitor() })
</script>
```

### SPA 模式配置（必需）

CLI `build --target app` 归档的 APK 使用工程标识、平台、debug/release 和版本命名，如 `todo-android-debug-0.1.0.apk`；批次目录使用可读本地时间 `build-todo-app-android-debug-20261105-171924-62e4f1-0.1.0`。底层 Gradle 原始输出仍由 Gradle 管理，归档名称与 Core 应用显示名分别承担制品识别和用户展示职责。

生成应用的 `appName` 通过 `scripts/native-name.mjs` 解析 Core `name`，支持 `HAI_CORE_NAME` 及 dotenv 覆盖。Fullstack 从工程根读取环境文件，从 serv 读取 `_core.yml`。父级 `HAI_CORE` JSON 替换 YAML，省略 `name` 且没有生效的 `HAI_CORE_NAME` 时使用 Core 默认名 `hai Admin`。正式打包默认 prod，可由进程 `HAI_CORE_ENV` 切换。已有 Android/iOS 工程需同步平台显示名称后重打包。下面的示例使用固定名称演示最小 Capacitor 配置。

Capacitor 原生壳读取 `webDir` 指定的静态产物。纯 Vite 模板默认为 `dist`；SvelteKit 项目需配置静态适配器，输出可能是 `build`。构建器、容器与 `webDir` 必须一致，以下是 Vite 示例：

```typescript
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'Example App',
  webDir: 'dist',
}

export default config
```

### Token 存储 + 认证流程

```typescript
// src/lib/api.ts
import { apiClient } from '@h-ai/api-client'
import { capacitor } from '@h-ai/capacitor'

export async function initApi(apiBase: string) {
  // 按调用方给出的 API 根地址和原生安全存储初始化。将成功或失败结果交回调用者。
  return apiClient.init({
    baseUrl: apiBase,
    auth: {
      // 创建原生安全令牌适配器，供认证模块后续读写。
      storage: capacitor.createTokenStorage(),
    },
  })
}

export { apiClient }
```

### 推送通知完整流程

```typescript
import { capacitor } from '@h-ai/capacitor'

export async function setupPush() {
  // 检测原生宿主。纯 Web 跳过推送流程。
  if (!capacitor.isNative()) {
    return
  }

  // 注册当前设备推送。成功提供 token，拒权或注册失败时直接返回。
  const reg = await capacitor.push.register()
  if (!reg.success) {
    return
  }

  // 上报 Token 给后端
  // 把注册返回的令牌及检测到的平台交给应用注册路由。
  await api.post('/push/register', {
    token: reg.data.token,
    // 读取当前平台标识，作为后端的设备平台字段。
    platform: capacitor.getPlatform(),
  })

  // 监听推送
  // 为前台接收和通知点击注册两个回调。成功结果带异步清理函数，失败返回错误。
  const listenResult = await capacitor.push.listen({
    onReceived: (n) => {
      // 前台通知处理
    },
    onActionPerformed: (n) => {
      // 用户点击跳转
    },
  })
}
```

### 拍照上传

```typescript
import { capacitor } from '@h-ai/capacitor'

async function captureAndUpload() {
  // 拍摄并输出质量 80、最大宽度 1024 的 Base64 图片。失败时跳过上传。
  const photo = await capacitor.camera.takePhoto({
    source: 'camera',
    resultType: 'base64',
    quality: 80,
    width: 1024,
  })

  if (!photo.success) {
    return
  }

  // 上传 base64 给后端
  // 用应用的上传接口发送此次拍照返回的图像数据及格式。
  await api.post('/files/upload', {
    data: photo.data.data,
    format: photo.data.format,
  })
}
```

## 插件依赖

| 插件 | 类型 | 用于 |
| --- | --- | --- |
| `@capacitor/core` | peerDependency（必需） | 核心运行时 |
| `@aparajita/capacitor-secure-storage` | 可选 peerDependency（原生 token 存储必需） | `capacitor.createTokenStorage()` |
| `@capacitor/preferences` | peerDependency（必需） | `capacitor.preferences.*` 普通偏好数据 |
| `@capacitor/device` | 可选 | `getDeviceInfo()` |
| `@capacitor/app` | 可选 | `getAppVersion()` |
| `@capacitor/push-notifications` | 可选 | `registerPush()` / `listenPush()` |
| `@capacitor/camera` | 可选 | `takePhoto()` |
| `@capacitor/status-bar` | 可选 | `configureStatusBar()` / `show/hide` |

可选插件未安装时，对应 API 调用会返回 `err`（动态 import 失败被 catch）。

## 相关 Skills

- `hai-api-client`：HTTP 客户端（Token 管理依赖 capacitor 存储）
- `hai-iam`：认证流程（登录获取 Token → 存储到 Capacitor）
- `hai-ui`：移动端 UI 组件（SafeArea、BottomNav 等）

原生交付必须单独执行 Tauri/Gradle/Xcode 打包，并在目标 OS/设备验证安装启动、登录/退出、重启会话、安全 TokenStore、真实 API 域名与覆盖升级。Web 构建/E2E 不代替原生验收。保存提交、包 hash、平台/工具链及逐项结果；缺平台写未验证，禁止静默 skip。hai-framework 仓库参考 `.github/workflows/native.yml` 与 desktop-app / mobile-app README 的「原生交付与验收」章节。

推送仅在实际原生平台调用插件。`push.register({ signal? })` 自调用开始，平台检测、插件加载、权限申请、取得 token 与收尾清理共用 30 秒期限；成功要求 token 和清理均在期限内完成。超时或 AbortSignal 中止会及时返回失败并停止回调，失败返回可以先于原生清理完成。`push.listen(callbacks, { signal? })` 仅设置阶段限时 30 秒，成功后信号仍可停止回调并发起清理，也可调用返回的 cleanup。

cleanup 与 `capacitor.close()` 返回 `Promise<HaiResult<void>>`，不设清理超时，等待已取得句柄的实际移除。尚未返回的 addListener 不阻塞本次关闭，迟到句柄到达后仍发起移除；未完成或移除失败的句柄由模块保留，移除失败返回 `PUSH_CLEANUP_FAILED`（`hai:capacitor:032`），可用同一 cleanup 或后续 close 重试。成功移除的句柄不重复操作，不调用影响其他消费者的 removeAllListeners。模块关闭后立即不可用，重新初始化前先重试遗留清理；失败或中止本身不证明原生资源已释放。自动化验证不代替 Android/iOS 真机 FCM/APNs 权限、注册与反复挂载验收。
