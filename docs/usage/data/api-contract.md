# api-contract 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/api-contract.md) · [功能说明](../function/api-contract.md)

## 数据库与缓存

业务模块持有数据库表、缓存与会话。此模块只定义请求/响应 schema、错误信封和 endpoint 描述。

## 契约数据

endpoint 描述提供 HTTP 方法、路径、路径参数、查询、请求体和响应的 schema。类型推导、接口文档和客户端绑定读取同一份契约。请求解析默认值由各 schema 决定，SQL 默认值由 [IAM](iam.md) 等业务模块定义。
