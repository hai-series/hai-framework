# @h-ai/feedback Configuration

[简体中文](feedback.md) · [日本語](feedback.ja.md) · [API reference](../function/feedback.en.md) · [Data structures](../data/feedback.en.md)

## Configuration entry point

Place `config/_feedback.yml` in the application's server configuration directory. The admin console loads it through Core and validates it with `FeedbackConfigSchema` at startup. For a standalone integration, connect RelDB first and call `feedback.init(config)`. The API becomes available after initialization succeeds. Restart the Feedback service instances after changing the application ID.

<a id="configuration-fields"></a>

## Configuration reference

| Field | Environment variable | Type and range | Required | Default | Purpose |
| --- | --- | --- | --- | --- | --- |
| `appId` | `HAI_FEEDBACK_APPID` | String, 1 to 128 characters after trimming, with no NUL | Yes | None | Stored as `app_id` on each report. Lists, report details, messages, and attachments are scoped to this application. |

Applications sharing one database should use distinct `appId` values. Instances of the same application sharing a database should use the same value. For example, `orders` and `inventory` can use the same tables with separate feedback lists. After changing `orders` to `orders-v2`, the new instances query the new ID and existing records still belong to `orders`.

<a id="configuration-ownership"></a>

## Why the module has one setting

`_feedback.yml` identifies the application that owns the feedback data, so the deployment only supplies `appId` here. The integration uses the following settings as well.

| Layer | Where to set it | When it applies |
| --- | --- | --- |
| Database | The host's `config/_reldb.yml` or the connection settings passed to `reldb.init`. | At startup, Feedback uses the host's SQLite, PostgreSQL, or MySQL database for its three tables. |
| Identity and business scope | The host supplies `userId`, `scopeId`, and permissions from a trusted session in `resolveContext`. For Core log association, business requests must also set the same scope in their Core context. | Each API request is authorized against its session and scope. The host assigns roles. |
| Browser evidence | The host passes `captureKey` to the signed-in user's `FeedbackModal`. The author can inspect and remove evidence, authorize a recording, or opt into server logs. | Mounting the component starts the in-page buffer. Opening the dialog freezes some evidence. The author's choices apply to that submission. |
| HTTP transport | Kit's `_kit.yml` or Serv's `_serv.yml` manages `transport`. When transport encryption is on, `transport.routePlaintextBytes` declares the capacity for file routes. | The host enforces per-route HTTP request and response capacity. |
| Retention | The host's data retention policy. | Persisted records reside in the relational database and follow the host's cleanup policy. |

[RelDB configuration](reldb.en.md) · [Permissions and evidence](../function/feedback.en.md#permissions) · [Data retention](../data/feedback.en.md#retention)

### Fixed operation and capture limits

The browser and server share the feedback contract's limits. A submission or message allows 5,000 UTF-16 code units of text, five manual attachments, 5 MiB per file, and 10 MiB for all files combined. First-report evidence counts toward 10 MiB and manual attachments count toward the five slots. Logs and replay cover up to five minutes. A recording lasts up to 60 seconds and uses the same per-file byte limit. The module enforces limits per send and has no cumulative per-user allowance or configurable retention period.

[Full limits](../function/feedback.en.md#feedback-limits)

## Configuration examples

### Set a fixed application ID

Put the following in the orders application's `config/_feedback.yml` and start the database connection first.

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
```

After startup, submit a report. Find `orders` in the database column `hai_feedback_reports.app_id`, then open the report in the application's **My feedback** view. The admin console sets `appId: admin-console` the same way.

### Select the ID per deployment

When Core loads the `feedback` configuration, `HAI_FEEDBACK_APPID` takes precedence over the file's `appId`, including the literal in the previous example. Set `HAI_FEEDBACK_APPID=orders-staging` in another deployment and restart it. New reports there belong to `orders-staging`.

The CLI template also includes an environment placeholder with the generated project name as its fallback. The orders application's file would look like this.

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: ${HAI_FEEDBACK_APPID:orders}
```

When the variable is unset, the example uses `orders`. This is a fallback in the file. The module schema itself has no default. [Core environment settings](core.en.md)

<a id="transport-budget"></a>

### Plaintext capacity for file routes

With host transport encryption enabled, merge `apiContract.feedbackTransportRoutes(apiPrefix)` into `transport.routePlaintextBytes`. Pass the actual mount prefix, such as `/api` in Kit or `/console/api` when deployed under `/console`. For `/api`, the helper produces the following rules, each with a limit of 16 MiB (16777216 bytes).

| Path | Traffic |
| --- | --- |
| `/api/feedback/reports` | Submit the report and its evidence. |
| `/api/feedback/reports/*/messages` | Send replies or information requests and their attachments. |
| `/api/feedback/reports/*/attachments/*` | Read one file as Base64. |

10 MiB of raw files expands to about 13.33 MiB in Base64. JSON and the transport envelope add overhead. The 16 MiB plaintext budget covers the serialized content on feedback routes. File limits still use raw bytes. If the reverse proxy or hosting platform has a separate request size limit, allow the encoded request to pass. The admin console loads the feedback route defaults first and then applies explicit route values from the host.

[Kit transport](kit.en.md) · [Serv transport](serv.en.md) · [Feedback operations](../operations/feedback.en.md)
