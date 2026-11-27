# @h-ai/reach 数据结构

<a id="reach-数据结构"></a>

[English](reach.en.md) · [日本語](reach.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/reach.md) · [功能说明](../function/reach.md)

Reach 把需要留存的消息和模板放进数据库。应用重启后，已经排队的消息还在，也可以用原来的回执编号查进度。配置了缓存时，Reach 会用一把短期锁减少多个进程重复检查同一批消息。

## 数据库

Reach 使用应用通过 `@h-ai/reldb` 连接的数据库，共有 **2 张表**。使用模板或延迟发送时，应用先连接数据库，再初始化 Reach。

| 表名 | 保存什么 | 什么时候会用到 |
| --- | --- | --- |
| [`hai_reach_send_log`](#send-log) | 即时发送历史和等待发送的消息 | 查一条消息是否还在排队、渠道是否已经受理，或结果是否需要人工核对 |
| [`hai_reach_template`](#template-table) | 可重复使用的主题、正文和默认发送渠道 | 例如用同一份订单通知文案，把其中的订单号换成每次发送的实际值 |

<a id="send-log"></a>

### 发送记录

**一条排队消息只占一行。** `reach.send()` 返回的 `queueId` 对应 `hai_reach_send_log.queue_id`。排队、发送和渠道受理都更新这一行。即时发送的渠道编号是 `messageId`，写入历史时对应 `message_id`。

[短信验证码](#sms-code-record)和[白天直发 API](#direct-api-record)都在渠道受理后尝试写历史。[夜间 API 通知](#example-data)先写队列，发出后更新原行。

`id` 是数据库主键，排队消息的 `queue_id` 唯一。直接发送的 `queue_id` 为空。`template` 对应使用的模板名。表中没有外键。Reach 按状态和处理权截止时间建立 `hai_reach_send_log_status_lock_idx`，按状态和创建顺序建立 `hai_reach_send_log_status_created_idx`。

`created_at`、`updated_at`、`locked_until` 和 `next_attempt_at` 是 Unix 毫秒时间戳。`retry_delay_ms` 和 `max_retry_delay_ms` 是等待时长，也用毫秒表示。

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 否 | 自增 | 数据库内部使用的行号 | `42` |
| `queue_id` | `TEXT` | 是 | `NULL` | 排队消息的查询编号，非空时唯一。返回字段名为 `queueId` | `00000000-0000-4000-8000-000000000042` |
| `provider` | `TEXT` | 否 | — | `_reach.yml` 中渠道的 `name` | `warehouse-webhook` |
| `to_addr` | `TEXT` | 否 | — | 实际收件目标 | `warehouse` |
| `subject` | `TEXT` | 是 | `NULL` | 发送时使用的主题 | `Order received` |
| `body` | `TEXT` | 是 | `NULL` | 替换变量后的实际正文。排队时先存好，稍后发送这一份内容 | `Order order-42 was received.` |
| `template` | `TEXT` | 是 | `NULL` | 发送时使用的模板名 | `order-received` |
| `vars_json` | `TEXT` | 是 | `NULL` | 模板变量序列化后的 JSON 字符串 | `{"orderId":"order-42"}` |
| `extra_json` | `TEXT` | 是 | `NULL` | 渠道附加参数序列化后的 JSON 字符串 | `{"event":"order.received","orderId":"order-42"}` |
| `status` | `TEXT` | 否 | — | 当前进度。下方说明各状态的含义 | `pending` |
| `message_id` | `TEXT` | 是 | `NULL` | 渠道提供的消息编号，例如短信受理编号 | `provider-order-43` |
| `processing_owner` | `TEXT` | 是 | `NULL` | 后台任务领取排队消息后获得的内部标识。写回结果时数据库会核对它 | `reach:<节点编号>:<本轮编号>` |
| `locked_until` | `BIGINT` | 是 | `NULL` | 后台领取排队消息后的处理权截止时间 | `1795479000000` |
| `attempt_count` | `BIGINT` | 否 | `0` | 排队消息已使用的尝试次数。领取会计一次，尚未开始发送就退回时会退还这一次 | `0` |
| `max_attempts` | `BIGINT` | 否 | `5` | 该条排队消息最多允许的尝试次数，含首次尝试 | `5` |
| `retry_delay_ms` | `BIGINT` | 否 | `60000` | 第一次失败后的等待时长 | `60000`（1 分钟） |
| `max_retry_delay_ms` | `BIGINT` | 否 | `3600000` | 重试等待时间的上限 | `120000`（2 分钟） |
| `next_attempt_at` | `BIGINT` | 否 | `0` | 最早可再次尝试的时间。`0` 表示没有额外的重试等待，仍须遵守免打扰时段 | `1795478460000` |
| `last_failure` | `TEXT` | 是 | `NULL` | 最近一次记录的队列失败原因 | `provider_unavailable`（渠道不可用） |
| `retry_safe` | `BOOLEAN` | 否 | `false` | 标记这次外发是否可在结果不明时安全重试。目前只有实际按请求编号去重且配置了 `idempotent: true` 的 API 渠道使用这一能力 | `false` |
| `created_at` | `BIGINT` | 否 | — | 建立发送记录的时间 | `1795446600000` |
| `updated_at` | `BIGINT` | 否 | — | 最近更新时间。恢复死信时也用它核对调用方读到的是不是最新状态 | `1795446600000` |

#### 发送状态怎么读

- `pending` 表示在等发送。
- `processing` 表示后台任务已经领取这条消息。
- `sending` 表示正在向渠道提交或等待渠道返回结果。
- `sent` 表示渠道已受理，或运维人员已核实并登记了结果。确认收件人是否收到，仍要查渠道侧的记录。
- `dead` 表示自动处理已停止，例如用完了尝试次数。排除问题后可以重新排队。
- `unknown` 表示结果不明。运维核实后可登记为 `sent` 或 `discarded`。
- `discarded` 表示运维核对后将这条记录标为停止处理。

查询、核对和恢复通过[队列接口](../function/reach.md#queue)进行。

<a id="sms-code-record"></a>

#### 短信验证码受理后写入发送历史

用户申请登录验证码后，应用按[短信验证码示例](../function/reach.md#reach-sms-code)调用 `reach.send()`。`otp_sms` 模板会把 `{code}` 换成实际验证码，发送时用 `ignoreDnd: true` 跳过免打扰，并以 `sensitive: true` 仅保存投递元数据。验证码的签发和校验由应用或 [IAM](iam.md) 管理。

短信渠道受理并返回 `BizId` 为 `aliyun-42` 时，调用结果的 `data` 是 `{"success":true,"messageId":"aliyun-42"}`。接入数据库时，Reach 会尝试异步写一行。下面是写入成功后的部分字段。

```json
{
  "id": 41,
  "queue_id": null,
  "provider": "sms",
  "to_addr": "",
  "body": null,
  "template": "otp_sms",
  "vars_json": null,
  "status": "sent",
  "message_id": "aliyun-42"
}
```

使用渠道和 `message_id` 核对受理记录。新写入的敏感历史中，`to_addr` 保存空字符串，主题、正文、变量与渠道扩展字段均为空。升级前的历史及备份可能包含敏感内容，应按现有保留策略清理。

```sql
SELECT template, status, message_id, created_at
FROM hai_reach_send_log
WHERE provider = 'sms' AND template = 'otp_sms' AND message_id = 'aliyun-42';
```

<a id="direct-api-record"></a>

#### 白天直接调用仓库 API

`09:00` 在免打扰时段外。应用按[仓库通知示例](../function/reach.md#reach-api-notification)，用 `order-received` 模板通知仓库订单 `order-43` 已创建。仓库受理并返回 `{"messageId":"provider-order-43"}` 后，Reach 返回 `result.data.messageId`，并尝试异步写一行发送历史。

下面列出写入成功后的部分字段。`queue_id` 为空，`message_id` 就是仓库给的编号。这一行保留替换变量后的正文和订单资料。

```json
{
  "id": 43,
  "queue_id": null,
  "provider": "warehouse-webhook",
  "to_addr": "warehouse",
  "subject": "Order received",
  "body": "Order order-43 was received.",
  "template": "order-received",
  "vars_json": "{\"orderId\":\"order-43\"}",
  "extra_json": "{\"event\":\"order.received\",\"orderId\":\"order-43\"}",
  "status": "sent",
  "message_id": "provider-order-43",
  "created_at": 1795482000000
}
```

`data` 是 `{"success":true,"messageId":"provider-order-43"}`。用这个编号向仓库核对，队列查询需要的是 `queue_id`。如果仓库返回空的 `204`，发送同样算受理，表里的 `message_id` 为空。普通直发的成功以渠道受理为准，写入历史失败时仍会返回成功。不使用数据库的普通直发有渠道结果，表里没有新增记录。

<a id="example-data"></a>

#### 23:10 的订单通知先排队

另一个订单 `order-42` 也需要通知仓库。按[仓库通知配置](../configuration/reach.md#reach-example-warehouse)，免打扰从 `22:00` 持续到次日 `08:00`，策略为 `delay`。应用在 `2026-11-23 23:10:00`（UTC+08:00）调用发送时，Reach 先写一行 `pending`，保存正文和变量。此时仓库还没有收到请求，`attempt_count` 是 `0`，`message_id` 为空。下面是入队后的完整记录。

```json
{
  "id": 42,
  "queue_id": "00000000-0000-4000-8000-000000000042",
  "provider": "warehouse-webhook",
  "to_addr": "warehouse",
  "subject": "Order received",
  "body": "Order order-42 was received.",
  "template": "order-received",
  "vars_json": "{\"orderId\":\"order-42\"}",
  "extra_json": "{\"event\":\"order.received\",\"orderId\":\"order-42\"}",
  "status": "pending",
  "message_id": null,
  "processing_owner": null,
  "locked_until": null,
  "attempt_count": 0,
  "max_attempts": 5,
  "retry_delay_ms": 60000,
  "max_retry_delay_ms": 120000,
  "next_attempt_at": 0,
  "last_failure": null,
  "retry_safe": false,
  "created_at": 1795446600000,
  "updated_at": 1795446600000
}
```

入队成功的 `data` 是 `{"success":true,"deferred":true,"queueId":"00000000-0000-4000-8000-000000000042"}`。用 `reach.queue.get(queueId)` 查同一行，应用拿到以下状态和次数。

```json
{
  "queueId": "00000000-0000-4000-8000-000000000042",
  "provider": "warehouse-webhook",
  "status": "pending",
  "updatedAt": 1795446600000,
  "attemptCount": 0,
  "maxAttempts": 5,
  "nextAttemptAt": 0
}
```

次日 `08:00` 起，后台用这行的 `queue_id` 作为 `Idempotency-Key` 发送给仓库。假设第一次就被受理，下面是原行送出后的部分字段。`id` 和 `queue_id` 继续指向同一条记录，`status`、`message_id` 和 `attempt_count` 显示这次发送的结果。用原来的 `queueId` 查询即可看到 `sent`。

```json
{
  "id": 42,
  "queue_id": "00000000-0000-4000-8000-000000000042",
  "status": "sent",
  "message_id": "warehouse-42",
  "attempt_count": 1
}
```

如果处在免打扰时段，且配置 `strategy: discard` 或本次传 `deferPolicy: 'reject'`，普通 API 通知返回 `DND_BLOCKED`。这次调用写入 **0 行**，也不会联系仓库。

Reach 保存发送时的正文和变量。发送历史的保留时间由应用决定。待发送的行保留在数据库中，节点重启后可以继续处理。

<a id="template-table"></a>

### 通知模板

应用可把经常发送的文案放在 `hai_reach_template`。Reach 启动时按 `name` 保存 `_reach.yml` 中的模板。也可通过 `reach.template` 直接管理库里的模板。修改模板只影响之后渲染的消息，已经排队的消息用入队时保存的正文。可以用 `reach.template.remove()` 删除模板。如果 `_reach.yml` 仍包含这项，下次初始化会再次保存。`id` 是主键，`name` 唯一。表中没有外键，`provider` 对应配置里的渠道名。

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 否 | 自增 | 数据库内部使用的行号 | `1` |
| `name` | `TEXT` | 否 | — | 应用发送时选择的模板名，唯一 | `order-received` |
| `provider` | `TEXT` | 否 | — | 默认发送渠道。应用显式传入 `provider` 时使用应用指定的渠道 | `warehouse-webhook` |
| `subject` | `TEXT` | 是 | `NULL` | 主题模板，可以使用 `{变量名}` | `Order received` |
| `body` | `TEXT` | 否 | — | 正文模板。发送时用业务值替换其中的 `{变量名}` | `Order {orderId} was received.` |
| `created_at` | `TIMESTAMP` | 否 | — | Reach 首次保存模板的时间 | `2026-11-23T14:00:00+08:00` |
| `updated_at` | `TIMESTAMP` | 否 | — | Reach 最近一次保存模板的时间 | `2026-11-23T14:00:00+08:00` |

#### 订单通知模板

这条模板的创建时间和最后更新时间相同，因为它只保存过一次。上面的排队示例用 `order-42` 填入 `orderId`，发送记录里的正文就是 `Order order-42 was received.`。

```json
{
  "id": 1,
  "name": "order-received",
  "provider": "warehouse-webhook",
  "subject": "Order received",
  "body": "Order {orderId} was received.",
  "created_at": "2026-11-23T14:00:00+08:00",
  "updated_at": "2026-11-23T14:00:00+08:00"
}
```

## 缓存

Reach 通过 `@h-ai/cache` 使用 **1 类缓存键**。有多个节点检查延迟消息时，先拿到锁的节点开始扫描，发现锁被占用的节点会跳过这一轮。各节点使用同一个 Redis 和相同的 `keyPrefix` 才能共享这把锁。内存缓存的锁只在本进程有效。

| 缓存项 | 逻辑键 | 保存什么 | 什么时候会用到 |
| --- | --- | --- | --- |
| [待发送扫描锁](#queue-scan-lock) | `hai:reach:flush-pending` | 本轮扫描的锁凭据 | 延迟队列启用、可以发送且 Cache 已初始化时，减少多个节点的重复查询 |

<a id="queue-scan-lock"></a>

### 待发送扫描锁

| 项目 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| 逻辑键 | 字符串 | 固定 `hai:reach:flush-pending` | Reach 调用 `cache.lock` 使用的名称 | `hai:reach:flush-pending` |
| 实际存储键 | 字符串 | `__lock:hai:reach:flush-pending` | Cache 会加上 `__lock:`。配置 Redis 的 `keyPrefix` 时，在最前面再拼上该前缀 | `orders:__lock:hai:reach:flush-pending` |
| 值 | 字符串 | 获取锁时生成 UUID | 本轮扫描的凭据。结束后只能用匹配的值释放锁 | `<lock-token:redacted>` |
| 有效期 | 秒 | 固定 `300` | 从获取锁时开始计时。Reach 不续期，扫描任务中断时锁会在 5 分钟后过期 | `300` |

若 Redis 配置了 `keyPrefix: 'orders:'`，某个节点取得锁时，`orders:__lock:hai:reach:flush-pending` 的值如下。示例用占位符隐藏了实际 UUID。Redis 把剩余有效期单独保存在键的元数据里。

```json
"<lock-token:redacted>"
```

扫描结束后，Reach 尝试释放锁。没有 Cache 或获取锁时发生错误，扫描任务仍可依靠数据库继续。每条消息由哪个任务发送，仍以数据库记录的领取标识和截止时间为准。缓存配置见[缓存配置手册](../configuration/cache.md)。
