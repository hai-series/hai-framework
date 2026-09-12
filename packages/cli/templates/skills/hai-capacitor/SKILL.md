---
name: hai-capacitor
description: "使用 @h-ai/capacitor 接入原生设备、相机、推送、状态栏和安全 Token 存储。"
---

# hai-capacitor

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/capacitor 接入原生设备、相机、推送、状态栏和安全 Token 存储 |
| 适用场景 | Android/iOS 原生壳集成与平台差异处理 |
| 输入 | Capacitor 配置、原生插件、设备权限和平台状态 |
| 输出 | 原生操作结果及 TokenStorage 适配器 |
| 限制 | 区分浏览器与 Android/iOS；安全存储需原生插件，Web 不降级到 localStorage。H5 验证不能代替真机验证。 |

## 使用路径

- 先判断平台和插件可用性，复用已有 SPA 入口；原生 UI 变化验证权限拒绝、取消和返回路径。
- TokenStorage 在原生端使用安全插件；Web 下不伪造持久化成功。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- 运行环境
- 适用场景
- 使用步骤
- 核心 API
- 错误码 — `HaiCapacitorError`
- 常见模式
- 插件依赖
- 相关 Skills
