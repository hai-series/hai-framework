# @h-ai/capacitor

Capacitor 原生桥接模块，为 hai Framework 移动应用提供安全 Token 存储、设备信息、推送通知、相机与状态栏等原生能力的统一封装。

## 支持的能力

| 能力       | 依赖插件                                | 说明                                                          |
| ---------- | --------------------------------------- | ------------------------------------------------------------- |
| Token 存储 | `@capacitor/preferences`（必需）        | 基于 SharedPreferences / UserDefaults，比 localStorage 更安全 |
| 设备信息   | `@capacitor/device`（可选）             | 平台、版本、型号检测                                          |
| 应用版本   | `@capacitor/app`（可选）                | 读取 appVersion / appBuild                                    |
| 推送通知   | `@capacitor/push-notifications`（可选） | 注册 FCM/APNs Token、监听推送事件                             |
| 相机/相册  | `@capacitor/camera`（可选）             | 拍照、选取相册图片                                            |
| 状态栏     | `@capacitor/status-bar`（可选）         | 沉浸式、背景色、样式配置                                      |

## 快速开始

```ts
import { capacitor } from '@h-ai/capacitor'

// 应用启动时初始化（检测 Capacitor 环境）
const result = await capacitor.init()
if (!result.success) {
  // 非 Capacitor 环境（纯 Web）
}
```

### 与 api-client 配合的 Token 安全存储

```ts
import { api } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

await api.init({
  baseUrl: 'https://api.example.com/v1',
  auth: {
    storage: createCapacitorTokenStorage(),
    refreshUrl: '/auth/refresh',
  },
})
```

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

## 配置

本模块无配置文件。`capacitor.init()` 仅检测 Capacitor 运行环境是否可用。

Capacitor 应用必须使用 SPA 模式：

```ts
// src/routes/+layout.ts
export const prerender = true
export const ssr = false
```

## 错误处理

所有异步 API 返回 `Result<T, CapacitorError>`，不会直接 throw：

```ts
import { capacitor, CapacitorErrorCode } from '@h-ai/capacitor'

const result = await capacitor.camera.takePhoto({ source: 'camera' })
if (!result.success) {
  if (result.error.code === CapacitorErrorCode.CAMERA_FAILED) {
    // 相机权限被拒绝或插件未安装
  }
}
```

常用错误码：

- `INIT_FAILED` / `NOT_AVAILABLE` — 初始化相关
- `NOT_INITIALIZED` — 模块未初始化（调用子操作前须先 `capacitor.init()`）
- `DEVICE_INFO_FAILED` / `PUSH_REGISTER_FAILED` / `CAMERA_FAILED` / `STATUS_BAR_FAILED` — 各功能失败
- `PREFERENCES_GET_FAILED` / `PREFERENCES_SET_FAILED` / `PREFERENCES_REMOVE_FAILED` — Preferences 操作失败

## 测试

```bash
pnpm --filter @h-ai/capacitor test
```

> 由于原生插件依赖，测试中需 mock `@capacitor/*` 模块。

## License

Apache-2.0
