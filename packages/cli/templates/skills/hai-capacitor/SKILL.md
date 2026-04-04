---
name: hai-capacitor
description: 使用 @h-ai/capacitor 桥接 Capacitor 原生能力（Token 安全存储、设备信息、推送通知、相机、状态栏），构建 Android/iOS 原生应用；当需求涉及原生 App 开发、Capacitor 集成、安全存储或原生设备功能时使用。
---

# hai-capacitor

> `@h-ai/capacitor` 是 hai-framework 的 Capacitor 原生桥接模块，封装常用原生能力为统一 API，返回 `HaiResult<T>`。与 `@h-ai/api-client` 配合实现 App 端 Token 安全存储。

---

## 适用场景

- Android/iOS 原生应用开发（SvelteKit + Capacitor）
- Token 安全存储（Capacitor Preferences → SharedPreferences / UserDefaults）
- 设备信息获取（平台、型号、版本）
- 推送通知注册与监听（FCM / APNs）
- 原生相机拍照 / 相册选取
- 状态栏配置（沉浸式、颜色、样式）

---

## 模块结构

```
packages/capacitor/src/
  index.ts                    # export * 聚合
  capacitor-main.ts           # 服务对象（export const capacitor）
  capacitor-types.ts           # 公共类型（CapacitorFunctions / CapacitorError / 业务类型）
  capacitor-config.ts          # 错误码（HaiCapacitorError as const）
  capacitor-i18n.ts            # i18n 消息获取器
  capacitor-token-storage.ts   # Token 存储（TokenStorage 实现 + safe* 工具）
  capacitor-device.ts          # 设备信息
  capacitor-camera.ts          # 相机/相册
  capacitor-push.ts            # 推送通知
  capacitor-status-bar.ts      # 状态栏
```

---

## 使用步骤

### 1. 初始化与关闭

```typescript
import { capacitor } from '@h-ai/capacitor'

// 应用启动时初始化（检测 Capacitor 环境可用性）
const result = await capacitor.init()
if (!result.success) {
  // result.error.code === HaiCapacitorError.NOT_AVAILABLE.code
  // 非 Capacitor 环境（纯 Web）
}

// 检查状态
capacitor.isInitialized // boolean
capacitor.getPlatform() // 'android' | 'ios' | 'web'
capacitor.isNative()    // true = 原生 App

// 关闭模块（重置状态）
await capacitor.close()
```

### 2. Token 安全存储（与 api-client 配合）

```typescript
import { api } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

await api.init({
  baseUrl: import.meta.env.PUBLIC_API_BASE,
  auth: {
    storage: createCapacitorTokenStorage(),
    refreshUrl: '/api/v1/auth/refresh',
  },
})
```

`createCapacitorTokenStorage()` 返回 `TokenStorage` 实例（兼容 `@h-ai/api-client`），底层使用 `@capacitor/preferences`：

- Android → SharedPreferences（应用沙盒）
- iOS → UserDefaults
- Web → localStorage（退化，建议仅原生端使用）

所有方法内置 try-catch，Preferences 异常时 get 返回 `null`、set/clear 静默失败并记录日志。

#### Preferences 子操作

```typescript
import { capacitor } from '@h-ai/capacitor'

// 返回 HaiResult<string | null>
const result = await capacitor.preferences.get('my_key')
if (result.success) {
  // result.data — 值或 null
}

await capacitor.preferences.set('my_key', 'value')
await capacitor.preferences.remove('my_key')
```

### 3. 设备信息

```typescript
import { capacitor } from '@h-ai/capacitor'

const info = await capacitor.device.getInfo()
if (info.success) {
  info.data.platform    // 'android' | 'ios' | 'web'
  info.data.model       // 'Pixel 7'
  info.data.osVersion   // '14'
  info.data.manufacturer // 'Google'
  info.data.isVirtual   // false
}

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
const reg = await capacitor.push.register()
if (reg.success) {
  // 将 reg.data.token 上报给后端
  await api.post('/push/register', { token: reg.data.token })
}

// 监听推送事件（返回 HaiResult 包裹的 async 清理函数）
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
  await listenResult.data()
}
```

### 5. 相机

```typescript
import { capacitor } from '@h-ai/capacitor'

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

```typescript
import { capacitor } from '@h-ai/capacitor'

await capacitor.statusBar.configure({
  backgroundColor: '#ffffff',
  style: 'dark',    // 'dark' | 'light' | 'default'（文字颜色）
  overlay: true,     // 沉浸式
})

await capacitor.statusBar.hide()
await capacitor.statusBar.show()
```

---

## 核心 API

| API | 用途 | 返回值 |
| --- | --- | --- |
| `capacitor.init()` | 初始化模块（检测环境） | `HaiResult<void>` |
| `capacitor.close()` | 关闭模块，重置状态 | `Promise<void>` |
| `capacitor.getPlatform()` | 获取当前平台 | `'android' \| 'ios' \| 'web'` |
| `capacitor.isNative()` | 是否为原生环境 | `boolean` |
| `capacitor.isInitialized` | 是否已初始化 | `boolean` |
| `createCapacitorTokenStorage()` | 创建 Token 存储 | `TokenStorage`（兼容 api-client） |
| `capacitor.preferences.get(key)` | 安全读取 Preference | `HaiResult<string \| null>` |
| `capacitor.preferences.set(key, value)` | 安全写入 Preference | `HaiResult<void>` |
| `capacitor.preferences.remove(key)` | 安全删除 Preference | `HaiResult<void>` |
| `capacitor.device.getInfo()` | 设备信息 | `HaiResult<DeviceInfo>` |
| `capacitor.device.getAppVersion()` | 应用版本 | `HaiResult<{ version, build }>` |
| `capacitor.push.register()` | 注册推送 | `HaiResult<PushRegistration>` |
| `capacitor.push.listen(callbacks)` | 监听推送事件 | `HaiResult<() => Promise<void>>`（async 清理函数） |
| `capacitor.camera.takePhoto(options?)` | 拍照 / 选取图片 | `HaiResult<PhotoResult>` |
| `capacitor.statusBar.configure(config)` | 配置状态栏 | `HaiResult<void>` |
| `capacitor.statusBar.show()` | 显示状态栏 | `HaiResult<void>` |
| `capacitor.statusBar.hide()` | 隐藏状态栏 | `HaiResult<void>` |

---

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
| `HaiCapacitorError.PUSH_REGISTER_FAILED`     | `hai:capacitor:030`    | 推送注册失败         |
| `HaiCapacitorError.PUSH_LISTEN_FAILED`       | `hai:capacitor:031`    | 推送监听失败         |
| `HaiCapacitorError.CAMERA_FAILED`            | `hai:capacitor:040`    | 拍照/相册失败        |
| `HaiCapacitorError.STATUS_BAR_FAILED`        | `hai:capacitor:050`    | 状态栏配置失败       |

---

## 常见模式

### Android 应用标准初始化

```typescript
// src/lib/capacitor.ts
import { capacitor } from '@h-ai/capacitor'

export async function initCapacitor() {
  const result = await capacitor.init()
  if (!result.success) {
    return
  }

  if (capacitor.isNative()) {
    await capacitor.statusBar.configure({
      backgroundColor: '#ffffff',
      style: 'light',
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

### SPA 模式配置（必需）

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

### Token 存储 + 认证流程

```typescript
// src/lib/api.ts
import { api } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

export async function initApi() {
  return api.init({
    baseUrl: `${import.meta.env.PUBLIC_API_BASE}/api/v1`,
    auth: {
      storage: createCapacitorTokenStorage(),
      refreshUrl: '/auth/refresh',
    },
  })
}

export { api }
```

### 推送通知完整流程

```typescript
import { capacitor } from '@h-ai/capacitor'

export async function setupPush() {
  if (!capacitor.isNative()) {
    return
  }

  const reg = await capacitor.push.register()
  if (!reg.success) {
    return
  }

  // 上报 Token 给后端
  await api.post('/push/register', {
    token: reg.data.token,
    platform: capacitor.getPlatform(),
  })

  // 监听推送
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
  await api.post('/files/upload', {
    data: photo.data.data,
    format: photo.data.format,
  })
}
```

---

## 插件依赖

| 插件 | 类型 | 用于 |
| --- | --- | --- |
| `@capacitor/core` | peerDependency（必需） | 核心运行时 |
| `@capacitor/preferences` | peerDependency（必需） | Token 存储 |
| `@capacitor/device` | 可选 | `getDeviceInfo()` |
| `@capacitor/app` | 可选 | `getAppVersion()` |
| `@capacitor/push-notifications` | 可选 | `registerPush()` / `listenPush()` |
| `@capacitor/camera` | 可选 | `takePhoto()` |
| `@capacitor/status-bar` | 可选 | `configureStatusBar()` / `show/hide` |

可选插件未安装时，对应 API 调用会返回 `err`（动态 import 失败被 catch）。

---

## 相关 Skills

- `hai-api-client`：HTTP 客户端（Token 管理依赖 capacitor 存储）
- `hai-iam`：认证流程（登录获取 Token → 存储到 Capacitor）
- `hai-ui`：移动端 UI 组件（SafeArea、BottomNav 等）
