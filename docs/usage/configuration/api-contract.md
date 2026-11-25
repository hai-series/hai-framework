# @h-ai/api-contract 配置

<a id="h-aiapi-contract-文件配置"></a>

[English](api-contract.en.md) · [日本語](api-contract.ja.md)

<a id="configuration-fields"></a>

## 配置入口

应用在共享 TypeScript 代码中声明操作并组合领域。本模块没有独立的 YAML 文件或环境变量。应用读取自己的功能开关后，可以选择要挂载的领域，客户端同时使用对应的契约。修改共享定义后，重新构建并部署使用它的服务端和客户端。 [声明路由](../function/api-contract.md#declare-routes) · [组合领域](../function/api-contract.md#compose-domains)

## 运行设置由使用方管理

| 要设置的内容 | 在哪里读取与设置 |
| --- | --- |
| Serv 的 API 前缀和文档入口 | `http.apiPrefix` 等设置由 Serv 应用在启动时读取。若前缀为 `/api/v1`，契约路径 `/iam/users/{id}` 会挂载到 `/api/v1/iam/users/{id}`。 [Serv 配置](serv.md) |
| Kit 的路由与请求策略 | SvelteKit 根据项目文件组织路由，应用在服务端配置 Kit 的请求策略。 [Kit 配置](kit.md) |
| typed client 的 API 地址 | 应用把含挂载前缀的地址传给 `client.init({ baseUrl })`。浏览器同源示例为 `/api/v1`。 [API Client 配置](api-client.md) |
| 登录、注册和验证码策略 | IAM 读取服务端配置并生成可公开的策略。 [IAM 配置](iam.md) · [公开响应中的数据](../data/api-contract.md#public-settings) |
