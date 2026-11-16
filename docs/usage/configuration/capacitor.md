# Capacitor 配置

[配置手册](README.md)

## 配置入口

`capacitor.init()` 探测当前是否为原生运行环境，无初始化参数。`capacitor.config.ts` 由原生工程及 Capacitor 工具链读取。插件权限、设备签名和 API 地址分别由平台工程和应用宿主管理。

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

## 配置清单

| 配置项                                             | 默认值/必填    | 说明                                                                                     |
| -------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `appId`                                            | 工程提供       | 应用唯一标识，例如 `com.example.orders`                                                  |
| `appName`                                          | 工程提供       | 应用展示名称                                                                             |
| `webDir`                                           | 与构建输出一致 | 指定复制到原生包的静态资源目录                                                           |
| `CAPACITOR_SERVER_URL`                             | 可省略         | 由生成工程用于真机开发连接服务。发布时使用已同步至原生项目的静态资源                     |
| API 基础地址                                       | 由应用提供     | 原生端从应用公开运行配置取得，再交给 `apiClient.init({ baseUrl })`，填写真机可访问的地址 |
| `camera.takePhoto` 的 `source`                     | `prompt`       | 也可以指定 `camera` 或 `photos`                                                          |
| `camera.takePhoto` 的 `quality`                    | `90`           | 图片质量，范围 0–100                                                                     |
| `camera.takePhoto` 的 `width`、`height`            | 可省略         | 图片最大宽度和高度，单位像素                                                             |
| `camera.takePhoto` 的 `resultType`                 | `uri`          | `uri`、`base64`、`dataUrl` 分别返回路径、Base64 和 Data URL                              |
| `statusBar.configure` 的 `style`                   | 沿用当前样式   | 可用 `dark`、`light`、`default`                                                          |
| `statusBar.configure` 的 `backgroundColor`         | 沿用当前颜色   | 十六进制背景色                                                                           |
| `statusBar.configure` 的 `overlay`                 | 沿用当前状态   | 控制状态栏是否覆盖原生 WebView                                                           |
| `push.register`、`push.listen` 的 `signal`         | 可省略         | 取消本次注册或者释放本次监听                                                             |
| `push.listen` 的 `onReceived`、`onActionPerformed` | 可省略         | 分别接收收件事件和用户点击事件                                                           |

## 生效与核对

SvelteKit 原生页面使用静态 SPA，可在根布局设 `prerender = true`、`ssr = false`。纯 Svelte/Vite 使用工程自身的静态构建。真机上分别确认 API 连接和插件授权，认证状态使用平台安全存储。[原生地址、权限与安全存储](experience.md#原生地址权限与安全存储)
