# 前后端分离与HTTP接入操作指南

[使用指南](../README.md) · [HTTP配置手册](../configuration/http.md)

先决定由哪个服务接收浏览器或 App 的 HTTP 请求。网页和 API 可以由同一个 SvelteKit 服务提供；如果 App、桌面端也要调用同一套业务接口，可以把 API 作为独立服务部署。配置项和默认值见 [HTTP 手册](../configuration/http.md)。

<a id="选择宿主"></a>

## 选择接收 HTTP 请求的服务

| 场景 | 组合 | 创建方式 |
| --- | --- | --- |
| 网页、App 和桌面端共享 API | API Contract 定义接口，Serv 提供 HTTP 服务，各端调用 API Client | `hai create orders --type fullstack --frontends web --defaults` 生成 API 和网页端，其他客户端可接入同一 API |
| 只提供 API，不生成网页 | API Contract 定义接口，Serv 提供 HTTP 服务 | `hai create orders --type api --defaults` |
| 同一个 SvelteKit 服务提供网页和 API | SvelteKit 的文件路由接收请求，Kit 在 `hooks.server.ts` 中检查请求并传递会话等上下文 | 选 `admin`、`website` 或 `h5` 模板 |

接口定义只规定请求和响应的结构。订单、文件等资源的权限由处理请求的服务端代码检查。独立 API 用 `serv.createApp()` 创建 HTTP 应用，SvelteKit 用 `kit.createHandle()` 创建请求钩子。应用退出时先停止接收请求，再按初始化的反序关闭数据库等依赖。

## 监听、健康检查与文档入口

先按[监听与路由](../configuration/http.md#serv监听和路由)填写配置。生成的独立 API 已将 `http`、`cors` 和 `transport` 传给 `serv.createApp()`，用 `server` 的地址和端口启动监听。启动后从实际部署入口访问健康检查，确认返回就绪状态，且响应里没有连接串或私有配置。

默认健康可用，文档不公开；需要文档时显式开启并核对认证。容器监听和暴露端口按实际网络选择，不用本机成功代替Ingress/防火墙验收。

## 可信代理与跨域 Cookie

按[代理与 CORS](../configuration/http.md#cors与可信代理)填写反向代理的地址和允许访问 API 的网页来源。用网页发起跨域请求，先看浏览器的预检响应，再看实际请求。直接接入 Fetch 时，由接收 TCP 连接的平台提供 `remoteAddress`，供服务端判断谁有权报告客户端 IP。

带Cookie的跨源请求须匹配允许来源、`credentials`和Cookie属性。再从不可信来源/任意X-Forwarded-For请求确认不能绕过权限。CORS不是后端或脚本请求的访问授权。

## 传输加密与容量

按[三端装配](../configuration/http.md#加密传输与容量)先Crypto/共享registry，再服务端`transport`，再客户端`transport`。服务端ring跨节点/重启持久，协商失败不能自动降级。

测试成功请求、缺认证标记、篡改、重放、超限和取消清理。大材料通过单独路由预算，不把所有请求一起放大；同步检查反馈总预算和代理body上限。生产保持HTTPS与时钟同步，不能只凭加密登录通过认定多节点防重放验收完成。

## 客户端与资源授权

以下放已有客户端启动入口，替换真实地址；SSR/Node为每个请求创建隔离客户端与`memory` `storage`，原生使用安全存储。浏览器通常消费同源/明确跨源Cookie流程。

```ts
import { apiClient } from '@h-ai/api-client'

// 配置目标 API 地址、Cookie 认证和 15 秒超时；成功无业务数据，失败时终止使用客户端。
const initialized = await apiClient.init({
  baseUrl: 'https://api.example.invalid/api/v1',
  auth: {},
  timeout: 15000,
})
if (!initialized.success) throw new Error(initialized.error.message)
```

按shared contract创建typed业务客户端，每次先判断success。退出调用服务端logout成功撤销，再清理客户端；清内存不能删除服务端HttpOnly Cookie或撤销会话。期限与刷新策略见[客户端参数](../function/api-client.md#client-integration)，超时不表示服务端副作用取消。

Storage procedures提供authorize，覆盖列表/批删等全部`key`；AI默认当前用户`objectId`，跨主体访问需显式`authorizeObject`。模型输出、工具参数和客户端资源ID不赋予权限。

409/422/429合法HaiResult保留业务原因和`traceId`，5xx隐藏内部原因。用真实请求验证错误提示、失败恢复和重复写入的边界。Kit限流store需共享原子后端，依赖失败明确返回失败，不静默放行。
