# @h-ai/feedback 配置

[English](feedback.en.md) · [日本語](feedback.ja.md) · [功能说明](../function/feedback.md) · [数据结构](../data/feedback.md)

## 配置入口

在应用的服务端配置目录放置 `config/_feedback.yml`。管理台启动时由 Core 读取文件并用 `FeedbackConfigSchema` 校验。独立集成应先连接 RelDB，再调用 `feedback.init(config)`。初始化成功后，API 才能提交和读取反馈。修改应用标识、发送上限、采集或保留期限后需要重启 Feedback 服务实例。

<a id="configuration-fields"></a>

## 配置清单

**`appId`** 必填。首帖保存时写入 `app_id`，反馈列表、详情、消息和附件都在这个应用内查询。

填去掉首尾空白后长度为 1 到 128 的字符串，且不能包含 NUL。环境变量 `HAI_FEEDBACK_APPID`。

共用关系库的多个应用应使用各自的 `appId`。同一应用的多个实例如果共用数据库，应使用相同的值。例：`orders` 和 `inventory` 可共用一套数据库表，两边的反馈列表各自独立。把 `orders` 改成 `orders-v2` 后，新实例查询的是新标识，原记录仍属于 `orders`。

### 发送上限

每次提交首帖、发回复或发送补充请求，都用这组配置单独检查。以下配置均为整数，省略时使用默认值。文件大小按 Base64 编码前的原始字节计算。

- **`limits.maxBodyLength`** 限制每次发送的正文长度，按 UTF-16 代码单元计数。例如「问题😀」计 4 个。只发文件时，表单正文可以留空，直接调用 API 时给 `body` 传空字符串。

  默认 `5000`，可填 `1`–`20000`。环境变量 `HAI_FEEDBACK_LIMITS_MAXBODYLENGTH`。

- **`limits.maxFiles`** 限制一次发送可手动添加的文件数。计数只包含用户选中的文件，包括图片。

  默认 `5` 个，可填 `1`–`20`。环境变量 `HAI_FEEDBACK_LIMITS_MAXFILES`。

- **`limits.maxFileBytes`** 每个文件能有多大。手动附件和每份首帖现场材料分别与此上限比较。

  默认 `5242880` 字节（5 MiB），可填 `1`–`10485760` 字节。环境变量 `HAI_FEEDBACK_LIMITS_MAXFILEBYTES`。

- **`limits.maxTotalFileBytes`** 限制一次发送的文件总大小。首帖合计手动附件与保留的截图、浏览器日志、回放和录屏。回复和补充请求分别合计各自的附件。

  默认 `10485760` 字节（10 MiB），可填 `1`–`25165824` 字节，至少等于单文件上限。环境变量 `HAI_FEEDBACK_LIMITS_MAXTOTALFILEBYTES`。

内置表单限制正文输入的长度，选文件或发送时超限会提示错误。直接调用 API 时，服务端也会拒绝超限的提交。

例如，按默认配置，首帖只带两张手动添加的 4 MiB 图片和一段 3 MiB 的录屏。手动附件数为 2，单个文件都符合 5 MiB 上限。合计 11 MiB 会超过单次的 10 MiB 上限，移除录屏后剩下的 8 MiB 可以发送。

勾选服务端日志时，服务端在首帖的剩余容量内取近期日志。放不下任何一条时省略这份日志。

### 首帖现场

这些字段决定首帖能带上多少现场信息，省略时使用默认值。每份日志和回放的容量上限取各自配置与单文件上限中较小的值，文件同样计入首帖发送的合计容量。

- **`capture.windowSeconds`** 向前回看多久。浏览器日志和操作回放以打开反馈弹窗的时间为基准。勾选的服务端日志以提交首帖的时间为基准。

  默认 `300` 秒（5 分钟），可填 `1`–`1800` 秒。环境变量 `HAI_FEEDBACK_CAPTURE_WINDOWSECONDS`。

- **`capture.maxLogEntries`** 每份日志最多保留多少条。浏览器日志和服务端日志分别计数，优先保留较新的记录。

  默认 `1000` 条，可填 `1`–`5000` 条。环境变量 `HAI_FEEDBACK_CAPTURE_MAXLOGENTRIES`。

- **`capture.maxLogBytes`** 每份日志 JSON 文件能有多大。按整个 JSON 文件的字节数计算，日志条数较少时也可能先达到容量上限。

  默认 `524288` 字节（512 KiB），可填 `1`–`2097152` 字节。环境变量 `HAI_FEEDBACK_CAPTURE_MAXLOGBYTES`。

- **`capture.maxReplayBytes`** 操作回放 JSON 文件能有多大。一次完整页面快照和随后的操作为一个回放片段。超限时，浏览器从最旧的片段开始丢弃。

  默认 `2097152` 字节（2 MiB），可填 `1`–`8388608` 字节。环境变量 `HAI_FEEDBACK_CAPTURE_MAXREPLAYBYTES`。

- **`capture.maxReplayEvents`** 一份操作回放能保留多少事件。完整页面快照、视口信息和点击等操作都计数，超限时也按上述片段丢弃。

  默认 `2000` 个事件，可填 `1`–`10000`。环境变量 `HAI_FEEDBACK_CAPTURE_MAXREPLAYEVENTS`。

- **`capture.maxRecordingSeconds`** 用户授权、录屏开始后能录多久。浏览器到时自动停止，文件接近单文件上限时也会提前停止。服务端对上传的录屏检查大小和格式。

  默认 `60` 秒，可填 `1`–`300` 秒。环境变量 `HAI_FEEDBACK_CAPTURE_MAXRECORDINGSECONDS`。

### 保留期限

- **`retention.days`** 反馈在最后一次活动后还能查看多少天。提交首帖时开始计时，有新消息或状态变更时重新计时。填 `0` 则长期保留。

  默认 `0`，可填 `0`–`3650` 天。环境变量 `HAI_FEEDBACK_RETENTION_DAYS`。

例如设为 `90`，一次回复会把该反馈的到期时间推到这次回复之后 90 天。到期后，任何状态的反馈都会从列表消失，详情也无法再打开。服务启动时及每小时按应用分批删除到期反馈和对应的消息、附件。同一应用的多个实例应使用相同的设置。重启后，新设置会作用于既有记录。 [数据保留](../data/feedback.md#retention)

<a id="configuration-ownership"></a>

## 宿主接入

应用通过以下入口连接数据库、解析权限和业务范围，并配置文件传输。

| 层级 | 在哪里设置 | 何时生效 |
| --- | --- | --- |
| 数据库 | 宿主传给 `reldb.init` 的连接配置，管理台从 `config/_db.yml` 读取 | Feedback 启动后用宿主选定的 SQLite、PostgreSQL 或 MySQL 保存三张表。 |
| 身份与业务范围 | 宿主在 `resolveContext` 中从可信会话提供 `userId`、`scopeId` 和权限。需要关联 Core 日志时，业务请求的 Core 上下文也要写入同一范围。 | 每次 API 请求按当前会话和范围鉴权。角色可由宿主调配。 |
| 浏览器现场 | 宿主给登录后的 `FeedbackModal` 传入 `captureKey`，用 `getLimits` 获取服务端配置。用户在首帖弹窗里查看、删除材料，授权录屏或勾选服务端日志。 | 组件取得限额后开始在本页缓冲，打开弹窗时截取近期浏览器日志和操作回放。用户的选择对本次提交生效。 |
| HTTP 传输 | Kit 的 `_kit.yml` 或 Serv 的 `_serv.yml` 管理 `transport`，在加密传输开启时通过 `transport.routePlaintextBytes` 声明大文件路由容量。 | 宿主处理 HTTP 请求和响应时检查路径容量。 |
| 保留期限 | `_feedback.yml` 的 `retention.days` | 到期后停止显示，并由服务分批清理。 |

[RelDB 配置](reldb.md) · [权限及首帖现场](../function/feedback.md#permissions) · [数据保留](../data/feedback.md#retention)

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

变量未设置时，本例使用 `orders`。这是文件中的回退值，`appId` 本身没有默认值。 [Core 环境配置](core.md)

### 调整容量和保留天数

例如，订单客服希望用户能在一次回复中补传两份各 6 MiB 的文件，并从最后一次活动起保留该反馈 90 天。本例也把首帖的现场回看窗口设为 3 分钟、录屏设为最长 45 秒。省略的字段使用默认值。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
limits:
  maxFileBytes: 6291456
  maxTotalFileBytes: 12582912
capture:
  windowSeconds: 180
  maxRecordingSeconds: 45
retention:
  days: 90
```

修改配置后重启承载 Feedback 的服务并刷新页面。宿主可从已登录的 `GET /feedback/limits` 读取 `limits` 和 `capture`，用于首帖和对话界面。缩小限额后，已有反馈在保留期内仍可查看，新的发送按新限额校验。

<a id="transport-budget"></a>

### 大文件路由的明文容量

当宿主开启加密传输时，将 `apiContract.feedbackTransportRoutes(apiPrefix, maxTotalFileBytes)` 合并进 `transport.routePlaintextBytes`。`apiPrefix` 要传真实挂载路径，例如 Kit 的 `/api`，部署在 `/console` 下则传 `/console/api`。以 `/api` 为例，默认配置生成以下规则，值为 16 MiB。调大单次合计容量会提高提交和消息路径的预算。附件读取路径保留 16 MiB，以支持以往保存的文件。

| 路径 | 涉及的内容 |
| --- | --- |
| `/api/feedback/reports` | 发送首帖及其材料。 |
| `/api/feedback/reports/*/messages` | 发送回复或补充请求及其附件。 |
| `/api/feedback/reports/*/attachments/*` | 读取一个附件的 Base64 内容。 |

10 MiB 原始文件经过 Base64 编码约为 13.33 MiB，另有 JSON 和传输包的开销。调用时传入生效的 `limits.maxTotalFileBytes`，让明文预算覆盖序列化内容。单次文件上限仍按原始字节计算。反向代理或托管平台若有独立请求大小限制，也要允许实际编码后的请求通过。管理台加载配置时先合并反馈路径默认值，接着应用宿主显式配置的路径值。

[Kit 传输配置](kit.md) · [Serv 传输配置](serv.md) · [反馈运维](../operations/feedback.md)
