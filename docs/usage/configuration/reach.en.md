# Reach configuration

[简体中文](reach.md) · [日本語](reach.ja.md)

[Configuration index](README.en.md) · [Data structures](../data/reach.en.md) · [API reference](../function/reach.en.md)

## Configuration entry

Generated projects keep delivery channels, templates, and quiet hours in `config/_reach.yml`. The application reads this file at startup and passes the settings to `reach.init()`. Restart the application after changing the file. Connect the database first if you use templates, deferred delivery, or credential notifications.

Give each channel a unique `name`, such as `email` or `warehouse-webhook`. The application uses that name to select a channel. Values such as `${HAI_REACH_...}` come from the server's private environment. See [configuration sources and precedence (Chinese)](runtime.md#配置从哪里来).

<a id="configuration-fields"></a>

## Configuration reference

### Shared channel fields

| Field | Type | Required or default | Purpose |
| --- | --- | --- | --- |
| `providers` | List | Required, at least one entry | Delivery channels available to this service |
| `providers[].name` | Nonempty string | Required, unique per entry | Name an application or template uses to select a channel |
| `providers[].type` | String | Required | `console` (local logs), `smtp`, `aliyun-sms`, or `api` |

### SMTP

These fields go inside a `providers[]` entry with `type: smtp`.

| Field | Type | Required or default | Purpose |
| --- | --- | --- | --- |
| `host` | Nonempty string | Required | SMTP server hostname |
| `port` | Integer, 1–65535 | `465` | Server port |
| `secure` | Boolean | `true` | Start the connection using TLS |
| `user` | String | Optional | Username used when SMTP authentication is enabled |
| `pass` | String | Optional | SMTP password from the server's private environment |
| `from` | Nonempty string | Required | Sender address the email service allows |

### Alibaba Cloud SMS

These fields go inside a `providers[]` entry with `type: aliyun-sms`.

| Field | Type | Required or default | Purpose |
| --- | --- | --- | --- |
| `accessKeyId` | Nonempty string | Required | Alibaba Cloud AccessKey ID used for signing |
| `accessKeySecret` | Nonempty string | Required | Signing secret from the server's private environment |
| `signName` | Nonempty string | Required | Approved SMS signature |
| `endpoint` | String | `dysmsapi.aliyuncs.com` | Hostname for direct delivery |
| `templateCodes` | Map of nonempty strings to nonempty strings | Optional | Look up approved codes by Reach template name. Direct sends need a mapped code or an explicit `extra.templateCode` |
| `gateway` | Object | Optional | Forward the signed request through a gateway |
| `gateway.url` | HTTP(S) URL | Required with `gateway` | Full path. Omit credentials, query strings, and fragments |
| `gateway.allowInsecureHttp` | Boolean | `false` | Allow plain HTTP on a trusted private network |
| `gateway.headers` | Map of strings to strings | Optional | Additional gateway headers. The HTTP client manages headers such as `Host` and `Content-Length` |
| `gateway.body` | String, array, or object | Optional | Strings are sent as supplied. Arrays and objects are serialized as JSON |

### HTTP API

These fields go inside a `providers[]` entry with `type: api`.

| Field | Type | Required or default | Purpose |
| --- | --- | --- | --- |
| `url` | HTTP(S) URL | Required | Address that accepts notifications |
| `method` | `POST` or `PUT` | `POST` | HTTP method used for the notification |
| `headers` | Map of strings to strings | Optional | Additional headers such as `X-Api-Key`. Reach sets `Idempotency-Key` |
| `timeout` | Nonnegative integer, milliseconds | `10000` | Time allowed for a request. `0` cancels the request when the timer fires |
| `redirect` | `error` or `follow` | `error` | Rejects redirects by default. `follow` is available with HTTPS enforcement off |
| `requireHttps` | Boolean | Optional | `true` requires an HTTPS URL and `redirect: error` |
| `idempotent` | Boolean | `false` | Tells Reach that the receiver saves request IDs and uses them to deduplicate. Reach uses this setting when deciding whether to retry a queued request with an uncertain outcome. See the [warehouse example](#reach-example-warehouse) |

### Templates

| Field | Type | Required or default | Purpose |
| --- | --- | --- | --- |
| `templates` | List | Optional | Templates saved by name to the database at initialization |
| `templates[].name` | Nonempty string | Required | Name an application selects when sending |
| `templates[].provider` | Nonempty string | Required | Default channel for the template |
| `templates[].subject` | String | Optional | Email subject template. Supports `{variable}` |
| `templates[].body` | Nonempty string | Required | Body template. Supports `{variable}` |

### Quiet hours and retries

| Field | Type | Required or default | Purpose |
| --- | --- | --- | --- |
| `dnd` | Object | Optional | Quiet-hours settings for all channels |
| `dnd.enabled` | Boolean | `false` | Apply quiet hours and the chosen strategy |
| `dnd.strategy` | `discard` or `delay` | `discard` | `discard` blocks the send. `delay` saves ordinary messages in the database for later |
| `dnd.start` | `HH:mm` string | `'00:00'` | Start time, included in quiet hours |
| `dnd.end` | `HH:mm` string | `'00:00'` | End time, when sends are allowed again |
| `queue` | Object | Uses the defaults below when omitted | Attempts and retry delays for queued messages |
| `queue.maxAttempts` | Integer, 1–100 | `5` | Total attempts, including the first |
| `queue.retryDelayMs` | Integer, 1000–86400000 milliseconds | `60000` | Wait after the first retryable failure |
| `queue.maxRetryDelayMs` | Integer, 1000–86400000 milliseconds | `3600000` | Cap on doubling delays. Must be at least `retryDelayMs` |

To try sending immediately during quiet hours, pass `ignoreDnd: true` to `reach.send()`. It applies to that send. IAM does this for its built-in verification codes, password resets and initial password setup invitations. See [the quiet-hours scenario](../function/reach.en.md#reach-quiet-hours).

## Configuration examples

Each example is a complete `_reach.yml` for one scenario. Replace example addresses, SMS template codes, and credentials with your actual values.

<a id="reach-example-local"></a>

### Check the send path locally

Start with a console channel. When the application sends through `local`, look at the local logs to confirm it reached Reach. This configuration is for development and testing. Production rejects `console` channels.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: local
    type: console
```

<a id="reach-example-email-code"></a>

### Send verification codes and orders through SMTP

Use port `465` with TLS and set `from` to an address your SMTP service allows. Supply the username and password in the server's private environment. Send with the `order-received` template and `orderId: order-42`. The subject becomes `Order order-42 received`, and the default channel is `email`.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: smtp
    host: smtp.example.com
    port: 465
    secure: true
    user: ${HAI_REACH_PROVIDERS_0_USER}
    pass: ${HAI_REACH_PROVIDERS_0_PASS}
    from: orders@example.com
templates:
  - name: otp_email
    provider: email
    subject: Your sign-in code
    body: '<p>Your sign-in code is {code}.</p>'
  - name: order-received
    provider: email
    subject: 'Order {orderId} received'
    body: 'Order {orderId} was received.'
```

For sign-in codes, use the `otp_email` template. With the test input `vars: { code: '123456' }`, the subject is `Your sign-in code` and `123456` replaces `{code}` in the body. For a real send, pass the application's issued code. See [Email a verification code](../function/reach.en.md#reach-email-code).

### Send notifications through an HTTP gateway

When the application selects `company-notify`, Reach sends the recipient and body in a JSON POST to `url`. This example waits up to five seconds, requires HTTPS, and rejects redirects. An empty HTTP `204` response means the channel accepted the message. `idempotent: false` suits receivers that have yet to implement request deduplication.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: company-notify
    type: api
    url: https://notify.example.com/messages
    method: POST
    timeout: 5000
    requireHttps: true
    redirect: error
    idempotent: false
    headers:
      X-Api-Key: ${HAI_REACH_PROVIDERS_0_HEADERS_X_API_KEY}
```

<a id="reach-example-sms-code"></a>

### Send verification codes directly through Alibaba Cloud SMS

Name the Reach template `otp_sms` and select the `sms` channel with `provider: sms`. In that channel's `templateCodes`, map `otp_sms` to the approved Alibaba Cloud template code. Use `code` as the variable name in the Alibaba Cloud template.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: sms
    type: aliyun-sms
    accessKeyId: ${HAI_REACH_PROVIDERS_0_ACCESSKEYID}
    accessKeySecret: ${HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET}
    signName: ${HAI_REACH_PROVIDERS_0_SIGNNAME}
    endpoint: dysmsapi.aliyuncs.com
    templateCodes:
      otp_sms: SMS_100000001
      password_reset_sms: SMS_100000002
templates:
  - name: otp_sms
    provider: sms
    body: 'Your verification code is {code}.'
  - name: password_reset_sms
    provider: sms
    body: 'Reset your password: {resetUrl}. Expires at {expiresAt}.'
```

When an application passes `template: 'otp_sms'` and `vars: { code: '123456' }`, Reach substitutes `{code}` in its local template and sends `TemplateCode=SMS_100000001` and `TemplateParam={"code":"123456"}` to Alibaba Cloud. Alibaba Cloud fills `code` in its approved text and sends it to the user. `123456` is a test value. Use the actual issued code when sending. See [Text a verification code](../function/reach.en.md#reach-sms-code).

Set `endpoint` to the direct hostname. It defaults to `dysmsapi.aliyuncs.com`. Reach adds `https://`, the `/` path and signed parameters. `extra.templateCode` can override the mapped code for one send.

Phone-based password reset uses `password_reset_sms` with `token`, `expiresAt` and `resetUrl`. Replace both example template codes with approved codes.

<a id="reach-example-sms-gateway"></a>

### Forward Alibaba Cloud SMS through your own gateway

Adding `gateway` to an `aliyun-sms` channel sends the POST to `gateway.url`. `endpoint` applies to direct connections. Give `gateway.url` the full path. Reach appends the signed query parameters. In this example, Reach sends gateway credentials in the `Authorization` header and serializes `body` as JSON. The gateway forwards the signed parameters to Alibaba Cloud and returns an HTTP `2xx` receipt such as `{"Code":"OK","BizId":"<message-id>"}`. Redact the query string from gateway and proxy logs, since it contains phone numbers and template variables.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: sms
    type: aliyun-sms
    accessKeyId: ${HAI_REACH_PROVIDERS_0_ACCESSKEYID}
    accessKeySecret: ${HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET}
    signName: ${HAI_REACH_PROVIDERS_0_SIGNNAME}
    templateCodes:
      otp_sms: SMS_100000001
    gateway:
      url: https://sms-gateway.example.com/dx
      allowInsecureHttp: false
      headers:
        Authorization: ${HAI_REACH_PROVIDERS_0_GATEWAY_HEADERS_AUTHORIZATION}
      body:
        app: orders
templates:
  - name: otp_sms
    provider: sms
    body: 'Your verification code is {code}.'
```

Use `body: {}` to send an empty JSON object. Omitting `body` sends no request body. If a trusted private network requires plain HTTP, set `url: http://sms-gateway.internal/dx` and `allowInsecureHttp: true` in the same `gateway` block. For per-request headers or bodies, pass a [gateway hook](../function/reach.en.md#reach-init-options) for this channel.

### Skip reminders overnight

Use `dnd.strategy: discard` for reminders that do not need to be made up later. At `23:10` in this configuration, an ordinary send returns `DND_BLOCKED` and leaves no queued message. New sends can go through from `08:00` the next morning.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: status-hook
    type: api
    url: https://notify.example.com/status
dnd:
  enabled: true
  strategy: discard
  start: '22:00'
  end: '08:00'
```

Set times in 24-hour format in the server process's local time zone. `22:00` is inside the quiet period. `08:00` is outside it. Use the same time zone on every node in a deployment. Matching start and end times leave quiet hours inactive.

<a id="reach-example-warehouse"></a>

### Queue order notifications overnight and send them with retries

For a daytime send, Reach fills `{orderId}` in the `order-received` template from `vars: { orderId: 'order-42' }`. The `warehouse-webhook` channel sends the rendered text and order details to the warehouse. See [Notify a warehouse over HTTP](../function/reach.en.md#reach-api-notification).

Use `dnd.strategy: delay` to keep ordinary messages for later delivery. Connect the database first. If the application sends `order-received` with `orderId: order-42` at `23:10`, it gets `deferred: true` and a `queueId` once the database has stored the message. Reach attempts to send it when it scans the queue after quiet hours end at `08:00`.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: warehouse-webhook
    type: api
    url: https://warehouse.example.com/orders
    timeout: 5000
    requireHttps: true
    idempotent: true
templates:
  - name: order-received
    provider: warehouse-webhook
    subject: Order received
    body: 'Order {orderId} was received.'
dnd:
  enabled: true
  strategy: delay
  start: '22:00'
  end: '08:00'
queue:
  maxAttempts: 5
  retryDelayMs: 60000
  maxRetryDelayMs: 120000
```

Suppose the `queueId` for `order-42` is `00000000-0000-4000-8000-000000000042`. On the first attempt after 08:00, Reach puts that ID in the `Idempotency-Key` header and the JSON `idempotencyKey` field. If the warehouse creates the pick list but its response is lost, Reach sees a timeout. The next retry of that entry sends the same ID.

The warehouse reads the ID from the `Idempotency-Key` header, puts a unique constraint on it and saves it with the pick list in the same database transaction. Both writes commit or roll back together. When the same ID arrives again, the warehouse retrieves the existing list and returns its original response, such as `{"messageId":"warehouse-42"}`. Keep the ID while a retry or a late request can still arrive.

Set `idempotent: true` once the receiver handles requests this way. Reach can then retry ambiguous results with the same ID. With `false`, the receiver still receives the ID, and a timeout like the one above marks the entry `unknown` for manual review. See [HTTP request IDs for direct and queued sends](../function/reach.en.md#reach-idempotency-key).

After the first retryable failure, the next attempt can start after one minute. The next failure adds a two-minute wait, which is also the maximum for later retries. `maxAttempts: 5` includes the first attempt. Reach saves these settings with each queued message. Changing `queue` affects future entries. See the [send records](../data/reach.en.md#send-log).

### Check that the configuration works

Send an ordinary test notification and check whether the selected channel accepts it. If you enabled `delay`, send again during quiet hours and use the returned `queueId` to check for `pending`. Look up the outcome after quiet hours end. See the [queue operations](../function/reach.en.md#queue).
