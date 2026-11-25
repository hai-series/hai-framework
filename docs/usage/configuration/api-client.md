# @h-ai/api-client 配置

<a id="h-aiapi-client-文件配置"></a>

[English](api-client.en.md) · [日本語](api-client.ja.md)

<a id="configuration-fields"></a>

## 配置入口

本模块没有独立配置文件。应用启动时将 API 地址、认证方式和传输选项传给 `apiClient.init(config)`。如果地址来自环境变量，由应用先读取，再传给客户端。浏览器使用刷新 Cookie 时，服务端也要启用 `serv.createApp({ iam, refreshCookie: {} })`。配置项和启用条件见 [Serv 应用装配](../function/serv.md#host-options)。

参数、默认值和调用示例见 [调用参数与接入选项](../function/api-client.md#call-options)。
