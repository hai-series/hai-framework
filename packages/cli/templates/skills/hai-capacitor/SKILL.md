---
name: hai-capacitor
description: 使用 @h-ai/capacitor 桥接 Capacitor 原生能力（Token 安全存储、设备信息、推送通知、相机、状态栏），构建 Android/iOS 原生应用；当需求涉及原生 App 开发、Capacitor 集成、安全存储或原生设备功能时使用。
---

# hai-capacitor

> `@h-ai/capacitor` 是 hai-framework 的 Capacitor 原生桥接模块，封装常用原生能力为统一 API，返回 `Result<T, CapacitorError>`。与 `@h-ai/api-client` 配合实现 App 端 Token 安全存储。

---

## 适用场景

- Android/iOS 原生应用开发
- Token 安全存储（Capacitor Preferences → SharedPreferences/Keychain）
- 设备信息获取（平台、型号、版本）
- 推送通知注册与监听
- 原生相机拍照
- 状态栏配置

---

## 使用步骤

### 1. 初始化

```typescript
import { capacitor } from '@h-ai/capacitor'

// 应用启动时初始化
await capacitor.init()

// 检查是否运行在原生环境
if (capacitor.isNative()) {
  console.log('Running on:', capacitor.getPlatform()) // 'android' | 'ios'
}
```

### 2. Token 安全存储（与 api-client 配合）

```typescript
import { createApiClient } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

const api = createApiClient({
  baseUrl: import.meta.env.PUBLIC_API_BASE,
  tokenStorage: createCapacitorTokenStorage(),
  refreshUrl: '/api/v1/auth/refresh',
})
```

`createCapacitorTokenStorage()` 使用 `@capacitor/preferences` 底层存储：

- Android → SharedPreferences（应用沙盒）
- iOS → UserDefaults / Keychain

### 3. 设备信息

```typescript
import { getAppVersion, getDeviceInfo } from '@h-ai/capacitor'

const info = await getDeviceInfo()
if (info.success) {
  console.log(info.data.platform) // 'android' | 'ios' | 'web'
  console.log(info.data.model) // 'Pixel 7'
  console.log(info.data.osVersion) // '14'
}

const version = await getAppVersion()
if (version.success) {
  console.log(version.data) // '1.0.0'
}
```

### 4. 推送通知

```typescript
import { listenPush, registerPush } from '@h-ai/capacitor'

// 注册推送
const reg = await registerPush()
if (reg.success) {
  console.log(reg.data.token) // FCM / APNs token
}

// 监听推送事件
const cleanup = await listenPush({
  onReceived: (notification) => {
    console.log('Received:', notification.title)
  },
  onActionPerformed: (notification) => {
    console.log('Tapped:', notification.data)
  },
})

// 清理监听器
cleanup()
```

### 5. 相机

```typescript
import { takePhoto } from '@h-ai/capacitor'

const photo = await takePhoto({
  quality: 80,
  source: 'CAMERA',
  resultType: 'base64',
})

if (photo.success) {
  const imgSrc = `data:image/${photo.data.format};base64,${photo.data.data}`
}
```

### 6. 状态栏

```typescript
import { configureStatusBar, hideStatusBar, showStatusBar } from '@h-ai/capacitor'

await configureStatusBar({
  backgroundColor: '#ffffff',
  style: 'LIGHT', // 'DARK' | 'LIGHT' | 'DEFAULT'
  overlay: false,
})

await hideStatusBar()
await showStatusBar()
```

---

## 核心 API

| API                                | 用途               | 返回值                            |
| ---------------------------------- | ------------------ | --------------------------------- |
| `capacitor.init()`                 | 初始化模块         | `Result<void>`                    |
| `capacitor.getPlatform()`          | 获取当前平台       | `'android' \| 'ios' \| 'web'`     |
| `capacitor.isNative()`             | 是否为原生环境     | `boolean`                         |
| `capacitor.isCapacitorAvailable()` | Capacitor 是否可用 | `boolean`                         |
| `createCapacitorTokenStorage()`    | 创建 Token 存储    | `TokenStorage`（兼容 api-client） |
| `getDeviceInfo()`                  | 设备信息           | `Result<DeviceInfo>`              |
| `getAppVersion()`                  | 应用版本           | `Result<string>`                  |
| `registerPush()`                   | 注册推送           | `Result<PushRegistration>`        |
| `listenPush(handlers)`             | 监听推送事件       | `() => void`（清理函数）          |
| `takePhoto(options?)`              | 拍照               | `Result<PhotoResult>`             |
| `configureStatusBar(config)`       | 配置状态栏         | `Result<void>`                    |
| `showStatusBar()`                  | 显示状态栏         | `Result<void>`                    |
| `hideStatusBar()`                  | 隐藏状态栏         | `Result<void>`                    |

---

## 错误码 — `CapacitorErrorCode`

| 错误码 | 常量                   | 说明             |
| ------ | ---------------------- | ---------------- |
| 8000   | `NOT_AVAILABLE`        | Capacitor 不可用 |
| 8001   | `PLUGIN_NOT_INSTALLED` | 插件未安装       |
| 8010   | `PERMISSION_DENIED`    | 权限被拒绝       |
| 8020   | `DEVICE_INFO_FAILED`   | 获取设备信息失败 |
| 8030   | `PUSH_REGISTER_FAILED` | 推送注册失败     |
| 8040   | `CAMERA_FAILED`        | 拍照/相册失败    |
| 8050   | `STATUS_BAR_FAILED`    | 状态栏配置失败   |
| 8060   | `STORAGE_FAILED`       | 安全存储读写失败 |

---

## 常见模式

### Android 应用标准初始化

```typescript
// src/lib/capacitor.ts
import { capacitor, configureStatusBar } from '@h-ai/capacitor'

export async function initCapacitor() {
  await capacitor.init()

  if (capacitor.isNative()) {
    await configureStatusBar({
      backgroundColor: '#ffffff',
      style: 'LIGHT',
      overlay: false,
    })
  }
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { initCapacitor } from '$lib/capacitor'

  onMount(() => { initCapacitor() })
</script>
```

### SPA 模式配置

Capacitor 应用必须使用 SPA 模式：

```typescript
// src/routes/+layout.ts
export const prerender = true
export const ssr = false
```

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static'

const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
    }),
  },
}
```

---

## 相关 Skills

- `hai-api-client`：HTTP 客户端（Token 管理依赖 capacitor 存储）
- `hai-iam`：认证流程（登录获取 Token → 存储到 Capacitor）
- `hai-ui`：移动端 UI 组件（SafeArea、BottomNav 等）
- `hai-build`：多端构建差异（SPA vs SSR）
