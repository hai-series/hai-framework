# @h-ai/capacitor

Capacitor 原生桥接模块，为 hai Framework 应用提供安全的 Token 存储、设备信息、推送通知、相机和状态栏等原生能力。

## 快速开始

```ts
import { createApiClient } from '@h-ai/api-client'
import { capacitor, createCapacitorTokenStorage } from '@h-ai/capacitor'

// 初始化
const result = await capacitor.init()

// 创建使用 Capacitor Preferences 的 API 客户端
const api = createApiClient({
  baseUrl: 'https://api.example.com/v1',
  auth: {
    storage: createCapacitorTokenStorage(),
    refreshUrl: '/auth/refresh',
  },
})
```

## 功能

| 能力       | 说明                                               |
| ---------- | -------------------------------------------------- |
| Token 存储 | 基于 Capacitor Preferences，比 localStorage 更安全 |
| 设备信息   | 平台、版本、型号检测                               |
| 推送通知   | 注册、监听推送事件                                 |
| 相机/相册  | 拍照、选取相册图片                                 |
| 状态栏     | 沉浸式、背景色、样式配置                           |
