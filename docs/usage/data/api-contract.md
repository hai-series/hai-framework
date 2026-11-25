# @h-ai/api-contract 数据结构

<a id="api-contract-数据结构"></a>

[English](api-contract.en.md) · [日本語](api-contract.ja.md)

[数据结构索引](README.md) · [配置](../configuration/api-contract.md) · [功能说明](../function/api-contract.md)

API 契约在共享代码中定义每个 HTTP 操作以及它的请求和响应结构。后端据此实现接口，客户端据此确定要传哪些值，以及怎样读取返回数据。例如文件详情页发送对象键，读取文件大小、媒体类型和修改时间。

<a id="data-ownership"></a>

## 数据归属

本模块没有自建数据库表、缓存键或数据文件。契约定义随应用版本构建。每次调用的请求和响应由宿主与调用方处理，持久化记录由领域模块维护。

| 数据 | 所有者与读取入口 |
| --- | --- |
| 领域、操作和 Schema | 应用依赖的契约代码。服务端挂载已实现的操作，客户端从同一份定义推导输入和输出类型。 |
| HTTP 消息 | 服务器接收路径参数、查询参数和正文，客户端读取 HTTP 状态、响应头和正文。日志保留由宿主控制。 |
| 用户、会话和权限 | IAM 管理，应用通过经授权的 API 查询。 [IAM 数据结构](iam.md) |
| 文件内容和对象元数据 | Storage 后端保存，应用通过 Storage API 查询元数据或取得下载地址。 [Storage 数据结构](storage.md) |
| 聊天、支付和反馈 | 分别由配置的 AI 存储、支付服务和反馈服务管理。 [AI](ai.md) · [Payment](payment.md) · [Feedback](feedback.md) |

<a id="contract-metadata"></a>

## 契约元数据

契约按领域和资源分组，每个最末端的节点描述一个操作。以 `apiContract.iam.users.get` 为例。

| 元数据 | 此操作中的值 | 用途 |
| --- | --- | --- |
| HTTP 方法 | `GET` | 查询单个用户。 |
| 路径模板 | `/iam/users/{id}` | `{id}` 是请求时填入的路径参数，例如 `user-42`。宿主另行设置 API 前缀。 |
| 操作标识 | `iam.users.get` | 在生成的 OpenAPI 中定位此操作。 |
| 输入 Schema | `IamUserIdInputSchema` | 接受包含 `id` 的对象。 |
| 输出 Schema | `apiContract.haiResultSchema(IamUserSchema.nullable())` | 查询成功时可能返回用户或 `null`，失败时读取 `error`。 |

声明一个操作、组合领域、读取路径各有独立入口。 [声明路由](../function/api-contract.md#declare-routes) · [组合领域](../function/api-contract.md#compose-domains) · [读取操作路径](../function/api-contract.md#read-route-path)

<a id="response-data"></a>

## 接口数据

<a id="example-data"></a>

### JSON 请求与业务结果

`apiContract.storage.files.getMetadata` 对应 `POST /storage/files/metadata`。请求正文中的 `key` 来自应用可访问的文件记录。服务端验证登录会话及该对象的读取权限。

```json
{
  "key": "reports/summary.txt"
}
```

成功正文的 `data` 提供文件元数据。`size` 以字节为单位，`lastModified` 在 HTTP JSON 中是 ISO 日期时间字符串。示例省略可选的 `etag` 和 `metadata`。

```json
{
  "success": true,
  "data": {
    "key": "reports/summary.txt",
    "size": 1200,
    "contentType": "text/plain",
    "lastModified": "2026-05-20T10:00:00.000Z"
  }
}
```

访问被拒绝时，正文使用 `success: false`。调用方通过 `error.code` 区分错误。响应提供 `traceId` 时，可以用它关联服务端日志。示例中的 `httpStatus` 表示业务错误对应的 HTTP 状态，线路上的状态码由 HTTP 宿主决定。

```json
{
  "success": false,
  "error": {
    "code": "hai:common:101",
    "message": "Forbidden",
    "httpStatus": 403,
    "traceId": "request-42"
  }
}
```

| 结构 | 字段与用途 |
| --- | --- |
| `HaiResult<T>` 成功 | `success: true` 后读取路由声明的 `data`。使用 `voidResultSchema` 的接口成功时没有业务数据，例如删除文件的 JSON 正文为 `{ "success": true }`。 |
| `HaiResult<T>` 失败 | `success: false` 后读取 `error`。 |
| `HaiErrorSchema` | `code` 为字符串或数字，`message` 为字符串。可选字段有 `traceId`（最多 128 字符）、`httpStatus`、`system`、`module`、`cause`、`suggestion` 和 `ext`。具体对外公开哪些诊断由宿主管理。 |
| 其他响应 | 自定义端点可声明裸值或流。渠道回执遵循自身协议，例如支付宝通知成功时返回纯文本 `success`。 [自定义客户端响应](../function/api-client.md#custom-response-results) · [支付宝回执](../function/payment.md#alipay-notification-ack) |

<a id="paginated-data"></a>

### 分页请求与结果

使用 `PaginationQuerySchema` 的请求接受可选的整数 `page`（最小 1）和 `pageSize`（1 至 100）。GET 查询字符串中的数字会转换为数值。省略字段时由处理函数决定默认值。Storage 文件列表等按游标翻页的接口使用自己的输入和返回结构。

例如，具备 `iam.users.read` 权限的管理端请求 `GET /iam/users?page=1&pageSize=1`。成功后 `data` 使用分页结构。

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "user-42",
        "username": "alice",
        "accountStatus": "active",
        "createdAt": "2026-05-20T10:00:00.000Z",
        "updatedAt": "2026-05-20T10:15:00.000Z"
      }
    ],
    "total": 3,
    "page": 1,
    "pageSize": 1
  }
}
```

`items` 是本页记录，`total` 是当前筛选条件下的总数，`page` 和 `pageSize` 是处理函数实际返回的页码和每页数量。示例中还有两条记录可继续翻页读取。对于 IAM 用户、角色和权限的必填 `createdAt`、`updatedAt` 和验证码回执的 `expiresAt`，服务端 Schema 接受有效的 `Date` 或带时区的 ISO 字符串，拒绝 `null`。通过 HTTP JSON 传输后客户端读取字符串。

<a id="public-settings"></a>

### IAM 公开配置响应

登录界面通过 `apiContract.iam.auth.publicConfig` 对应的 `GET /auth/config` 获取可公开的登录、注册、验证码和界面策略。成功正文的 `data` 由 `IamPublicConfigSchema` 定义，也可为 `null`。例如，应用可用 `data.register.enabled` 决定是否显示注册入口，注册请求由 IAM 检查当前策略。 [IAM 配置与默认值](../configuration/iam.md) · [挂载 IAM 接口](../function/api-contract.md#serv-iam-wiring)
