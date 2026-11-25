# @h-ai/capacitor 配置

<a id="capacitor-配置"></a>

[English](capacitor.en.md) · [日本語](capacitor.ja.md)

[配置手册](README.md)

## 配置入口

启动时调用 `capacitor.init()` 检测应用是否跑在 Android 或 iOS 原生环境中，调用时无需传参。运行 Capacitor 工具时，它会读取项目的 `capacitor.config.ts`，例如根据 `webDir` 复制前端文件。相机和通知权限在 Android 或 iOS 工程中声明，签名在打包时配置。连接 API 的地址由应用启动代码交给 `apiClient.init()`。

## 配置清单

| 配置项                                             | 默认值/必填    | 说明                                                                      |
| -------------------------------------------------- | -------------- | ------------------------------------------------------------------------- |
| `appId`                                            | 工程提供       | 应用唯一标识，例如 `com.example.orders`                                   |
| `appName`                                          | 工程提供       | 应用展示名称                                                              |
| `webDir`                                           | 与构建输出一致 | 指定复制到原生包的静态资源目录                                            |
| `CAPACITOR_SERVER_URL`                             | 可省略         | 由生成工程用于真机开发连接服务。发布时使用已同步至原生项目的静态资源      |

## 配置示例

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.orders',
  appName: 'Orders',
  webDir: 'dist',
}
export default config
```

### 复制 SvelteKit 静态构建产物

此例假定项目使用静态适配器，将产物写到 `build/`。`webDir` 必须与实际构建输出一致，不能填运行中的开发服务地址。构建后同步到原生工程，再在手机上确认页面和插件。

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.orders',
  appName: 'Orders',
  webDir: 'build',
}
export default config
```

### 真机开发时临时连接电脑上的服务

电脑和手机需要网络互通。仅在本机开发环境设置 `CAPACITOR_SERVER_URL`，例如 `http://192.168.1.20:5173`；下面的配置才会读取它。未设置时使用随包静态文件。发布包清除此变量并重新同步，API 地址和允许的来源还需按实际后端配置。

```ts
import type { CapacitorConfig } from '@capacitor/cli'
import process from 'node:process'

const developmentUrl = process.env.CAPACITOR_SERVER_URL
const config: CapacitorConfig = {
  appId: 'com.example.orders',
  appName: 'Orders',
  webDir: 'dist',
  ...(developmentUrl
    ? { server: { url: developmentUrl, cleartext: developmentUrl.startsWith('http:') } }
    : {}),
}
export default config
```

### 生效与核对

SvelteKit 原生页面使用静态 SPA，可在根布局设 `prerender = true`、`ssr = false`。纯 Svelte/Vite 使用工程自身的静态构建。真机上分别确认 API 连接和插件授权，认证状态使用平台安全存储。[原生地址、权限与安全存储](experience.md#原生地址权限与安全存储)
