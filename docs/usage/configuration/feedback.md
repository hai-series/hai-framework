# @h-ai/feedback 配置

[English](feedback.en.md) · [日本語](feedback.ja.md) · [功能说明](../function/feedback.md) · [数据结构](../data/feedback.md)

## 配置入口

在应用的服务端配置目录放置 `config/_feedback.yml`。管理台启动时由 Core 读取文件并用 `FeedbackConfigSchema` 校验。独立集成应先连接 RelDB，再调用 `feedback.init(config)`。初始化成功后，API 才能提交和读取反馈。修改应用标识后需要重启 Feedback 服务实例。

<a id="configuration-fields"></a>

## 配置清单

| 字段 | 环境变量 | 类型和范围 | 必填 | 默认值 | 作用 |
| --- | --- | --- | --- | --- | --- |
| `appId` | `HAI_FEEDBACK_APPID` | 字符串，去掉首尾空白后长度为 1 至 128，不含 NUL | 是 | 无 | 随首帖写入 `app_id`，列表、详情、消息和附件的读取都限定在这个应用。 |

共用关系库的多个应用应使用各自的 `appId`。同一应用的多个实例如果共用数据库，应使用相同的值。例：`orders` 和 `inventory` 可共用一套数据库表，两边的反馈列表各自独立。把 `orders` 改成 `orders-v2` 后，新实例查询的是新标识，原记录仍属于 `orders`。

<a id="configuration-ownership"></a>

## 为什么模块只有一个配置

`_feedback.yml` 负责给反馈数据确定应用归属，因此只要求部署者提供 `appId`。接入时还会用到下面几层设置。

| 层级 | 在哪里设置 | 何时生效 |
| --- | --- | --- |
| 数据库 | 宿主的 `config/_reldb.yml` 或传给 `reldb.init` 的连接配置 | Feedback 启动后用宿主选定的 SQLite、PostgreSQL 或 MySQL 保存三张表。 |
| 身份与业务范围 | 宿主在 `resolveContext` 中从可信会话提供 `userId`、`scopeId` 和权限。需要关联 Core 日志时，业务请求的 Core 上下文也要写入同一范围。 | 每次 API 请求按当前会话和范围鉴权。角色可由宿主调配。 |
| 浏览器现场 | 宿主给登录后的 `FeedbackModal` 传入 `captureKey`。用户在首帖弹窗里查看、删除材料，授权录屏或勾选服务端日志。 | 组件挂载后开始在本页缓冲，打开弹窗时冻结部分材料。用户的选择对本次提交生效。 |
| HTTP 传输 | Kit 的 `_kit.yml` 或 Serv 的 `_serv.yml` 管理 `transport`，在加密传输开启时通过 `transport.routePlaintextBytes` 声明大文件路由容量。 | 宿主处理 HTTP 请求和响应时检查路径容量。 |
| 保留期限 | 宿主的数据保留策略 | 已保存的记录保留在关系库，按宿主策略清理。 |

[RelDB 配置](reldb.md) · [权限及首帖现场](../function/feedback.md#permissions) · [数据保留](../data/feedback.md#retention)

### 固定的业务和采集上限

浏览器与服务端共用反馈契约中的业务上限。单次提交或消息最多 5000 个 UTF-16 代码单元的正文、5 个手动附件，单文件最多 5 MiB，文件合计最多 10 MiB。首帖现场材料计入 10 MiB，手动文件计入 5 个名额。日志和回放最多回看 5 分钟，短录屏最长 60 秒并受同一单文件限制。当前按单次发送校验，模块没有累计用户额度或可配置的保留期限。

[完整限制](../function/feedback.md#feedback-limits)

## 配置示例

### 固定应用标识

把下面内容放在订单应用的 `config/_feedback.yml`，并先启动数据库连接。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
```

启动后提交一条反馈。可以在对应库的 `hai_feedback_reports.app_id` 看到 `orders`，随后在这个应用的「我的反馈」里打开该记录。管理台用同一方式配置 `appId: admin-console`。

### 按部署环境替换标识

Core 加载名为 `feedback` 的配置时，`HAI_FEEDBACK_APPID` 优先于文件里的 `appId`，包括上一例的字面值。给另一套部署设置 `HAI_FEEDBACK_APPID=orders-staging` 后重启，再提交的反馈属于 `orders-staging`。

CLI 模板也会在文件里写出环境变量占位，使用生成项目名作为回退值。订单应用的模板示例如下。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: ${HAI_FEEDBACK_APPID:orders}
```

变量未设置时，本例使用 `orders`。这是文件中的回退值，模块 Schema 本身没有默认值。 [Core 环境配置](core.md)

<a id="transport-budget"></a>

### 大文件路由的明文容量

当宿主开启加密传输时，将 `apiContract.feedbackTransportRoutes(apiPrefix)` 合并进 `transport.routePlaintextBytes`。`apiPrefix` 要传真实挂载路径，例如 Kit 的 `/api`，部署在 `/console` 下则传 `/console/api`。以 `/api` 为例，辅助函数生成以下规则，每条的值都是 16 MiB，即 16777216 字节。

| 路径 | 涉及的内容 |
| --- | --- |
| `/api/feedback/reports` | 发送首帖及其材料。 |
| `/api/feedback/reports/*/messages` | 发送回复或补充请求及其附件。 |
| `/api/feedback/reports/*/attachments/*` | 读取一个附件的 Base64 内容。 |

10 MiB 原始文件经过 Base64 编码约为 13.33 MiB，另有 JSON 和传输包的开销。16 MiB 明文预算覆盖反馈路径的序列化内容，单次文件上限仍按原始字节计算。反向代理或托管平台若有独立请求大小限制，也要允许实际编码后的请求通过。管理台加载配置时先合并反馈路径默认值，接着应用宿主显式配置的路径值。

[Kit 传输配置](kit.md) · [Serv 传输配置](serv.md) · [反馈运维](../operations/feedback.md)
