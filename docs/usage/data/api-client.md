# api-client 数据结构

[English](api-client.en.md) · [日本語](api-client.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/api-client.md) · [功能说明](../function/api-client.md)

<a id="example-data"></a>

## 这些数据用来做什么

### 客户端当前持有的登录凭据

对应结构：`TokenStorage`。

客户端发送 access token 访问已登录接口，必要时用 refresh token 取得新凭据。

```json
{
  "accessToken": "<access-token:redacted>",
  "refreshToken": "<refresh-token:redacted>"
}
```

这里是凭据的查看示意，值已脱敏。默认浏览器模式的 refresh token 在 HttpOnly Cookie 中，页面代码不能读取，也不应把它写进 localStorage。

### 一次接口调用的结果

对应结构：`HaiResult<T>`。

接口结果把业务成功或失败交给客户端；客户端先检查 success，再读取数据或显示错误。

```json
{
  "success": true,
  "data": {
    "id": "order-42",
    "status": "created"
  }
}
```

示例表示服务端已经创建 order-42。它不是缓存记录，重新刷新页面不会自动保留这份结果。

## 字段、存储与清理参考

### 数据库与缓存

客户端没有 SQL 表或 Redis 键。会话的持久状态由 [IAM](iam.md) 管理。

### 客户端存储

| 存储方式                                          | 数据                                                                                                                 | 生命周期                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apiClient.tokenStorage.httpOnlyCookie()`（默认） | 访问令牌在当前客户端的内存里。刷新时浏览器发送由服务端设置的 HttpOnly Cookie，页面 JavaScript 读不到 Cookie 中的令牌 | 访问令牌初始为空，重新加载页面后会丢失。[serv](serv.md) 管理刷新 Cookie                      |
| `apiClient.tokenStorage.memory()`                 | 同一个存储对象在内存中保存访问令牌和刷新令牌                                                                         | 初始为空。清除凭据或销毁该对象后无法继续读取。服务端可按请求或会话创建独立对象               |
| 自定义 `TokenStorage`                             | 应用实现两个令牌的读、写和删除                                                                                       | 原生设备可用 [capacitor](capacitor.md) 的安全存储。默认浏览器模式不会将令牌写入 localStorage |
