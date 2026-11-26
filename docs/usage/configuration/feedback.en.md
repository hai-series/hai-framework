# @h-ai/feedback Configuration

[简体中文](feedback.md) · [日本語](feedback.ja.md) · [API reference](../function/feedback.en.md) · [Data structures](../data/feedback.en.md)

## Configuration entry point

Place `config/_feedback.yml` in the application's server configuration directory. The admin console loads it through Core and validates it with `FeedbackConfigSchema` at startup. For a standalone integration, connect RelDB first and call `feedback.init(config)`. The API becomes available after initialization succeeds. Restart the Feedback service instances after changing the application ID, limits, capture, or retention settings.

<a id="configuration-fields"></a>

## Configuration reference

| Field | Environment variable | Type and range | Required | Default | Purpose |
| --- | --- | --- | --- | --- | --- |
| `appId` | `HAI_FEEDBACK_APPID` | String, 1 to 128 characters after trimming, with no NUL | Yes | None | Stored as `app_id` on each report. Lists, report details, messages, and attachments are scoped to this application. |

Applications sharing one database should use distinct `appId` values. Instances of the same application sharing a database should use the same value. For example, `orders` and `inventory` can use the same tables with separate feedback lists. After changing `orders` to `orders-v2`, the new instances query the new ID and existing records still belong to `orders`.

### Submission limits

All fields are optional. Initial reports, replies, and information requests share these limits. File sizes use raw bytes before Base64 encoding.

| Field | Environment variable | Default | Range and purpose |
| --- | --- | --- | --- |
| `limits.maxBodyLength` | `HAI_FEEDBACK_LIMITS_MAXBODYLENGTH` | 5,000 | 1–20,000 UTF-16 code units. |
| `limits.maxFiles` | `HAI_FEEDBACK_LIMITS_MAXFILES` | 5 | 1–20 manually attached files. |
| `limits.maxFileBytes` | `HAI_FEEDBACK_LIMITS_MAXFILEBYTES` | 5242880 (5 MiB) | 1–10485760 bytes per manual file or piece of evidence. |
| `limits.maxTotalFileBytes` | `HAI_FEEDBACK_LIMITS_MAXTOTALFILEBYTES` | 10485760 (10 MiB) | 1–25165824 bytes, at least the per-file limit. Manual files and first-post evidence share this budget. |

### First-post evidence

All fields are optional. Logs and replay also use the per-file limit and remaining submission budget. The browser stops recording at the time limit. The service validates the recording's file size and media type.

| Field | Environment variable | Default | Range and purpose |
| --- | --- | --- | --- |
| `capture.windowSeconds` | `HAI_FEEDBACK_CAPTURE_WINDOWSECONDS` | 300 | 1–1,800 seconds of browser logs, replay, and server logs. |
| `capture.maxLogEntries` | `HAI_FEEDBACK_CAPTURE_MAXLOGENTRIES` | 1,000 | 1–5,000 entries in each browser or server log file. |
| `capture.maxLogBytes` | `HAI_FEEDBACK_CAPTURE_MAXLOGBYTES` | 524288 | 1–2097152 bytes per log file. |
| `capture.maxReplayBytes` | `HAI_FEEDBACK_CAPTURE_MAXREPLAYBYTES` | 2097152 | 1–8388608 bytes of page replay. |
| `capture.maxReplayEvents` | `HAI_FEEDBACK_CAPTURE_MAXREPLAYEVENTS` | 2,000 | 1–10,000 page replay events. |
| `capture.maxRecordingSeconds` | `HAI_FEEDBACK_CAPTURE_MAXRECORDINGSECONDS` | 60 | 1–300 seconds. Recording stops at the time limit or when nearing the file size limit. |

### Retention

| Field | Environment variable | Default | Range and purpose |
| --- | --- | --- | --- |
| `retention.days` | `HAI_FEEDBACK_RETENTION_DAYS` | 0 | An integer from 0 to 3,650. Zero keeps reports indefinitely. A positive number counts days since the latest message or status change, starting at submission for a new report. |

An expired report becomes unavailable in lists and details regardless of status. At startup and hourly, each service cleans up expired reports for its application in batches. Messages and attachments are deleted with the report. Use the same settings across instances of the application. New settings apply to existing reports after restart. [Data retention](../data/feedback.en.md#retention)

<a id="configuration-ownership"></a>

## Host integration

The host connects the database, resolves permissions and business scope, and configures file transport through these entry points.

| Layer | Where to set it | When it applies |
| --- | --- | --- |
| Database | The connection settings passed to `reldb.init`. The admin console reads `config/_db.yml`. | At startup, Feedback uses the host's SQLite, PostgreSQL, or MySQL database for its three tables. |
| Identity and business scope | The host supplies `userId`, `scopeId`, and permissions from a trusted session in `resolveContext`. For Core log association, business requests must also set the same scope in their Core context. | Each API request is authorized against its session and scope. The host assigns roles. |
| Browser evidence | The host passes `captureKey` to the signed-in user's `FeedbackModal`. The author can inspect and remove evidence, authorize a recording, or opt into server logs. | Mounting the component starts the in-page buffer. Opening the dialog freezes some evidence. The author's choices apply to that submission. |
| HTTP transport | Kit's `_kit.yml` or Serv's `_serv.yml` manages `transport`. When transport encryption is on, `transport.routePlaintextBytes` declares the capacity for file routes. | The host enforces per-route HTTP request and response capacity. |
| Retention | `retention.days` in `_feedback.yml`. | Expired reports disappear from views and the service cleans them up in batches. |

[RelDB configuration](reldb.en.md) · [Permissions and evidence](../function/feedback.en.md#permissions) · [Data retention](../data/feedback.en.md#retention)

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

When the variable is unset, the example uses `orders`. This is a fallback in the file. `appId` itself has no default. [Core environment settings](core.en.md)

### Adjust submission capacity and retention

For example, the orders application can accept 12 MiB per submission and retain reports for 90 days after their last activity. Omitted fields use their defaults.

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

Restart the Feedback service and refresh the page after changing settings. The host can read `limits` and `capture` from the authenticated `GET /feedback/limits` for the report and conversation forms. Reduced limits apply to new sends. Existing reports and attachments remain readable until they expire.

<a id="transport-budget"></a>

### Plaintext capacity for file routes

With host transport encryption enabled, merge `apiContract.feedbackTransportRoutes(apiPrefix, maxTotalFileBytes)` into `transport.routePlaintextBytes`. Pass the actual mount prefix, such as `/api` in Kit or `/console/api` when deployed under `/console`. For `/api`, the helper produces the following rules. The defaults use 16 MiB. Increasing the total file limit can raise the report and message budgets. The attachment read path keeps 16 MiB for existing files.

| Path | Traffic |
| --- | --- |
| `/api/feedback/reports` | Submit the report and its evidence. |
| `/api/feedback/reports/*/messages` | Send replies or information requests and their attachments. |
| `/api/feedback/reports/*/attachments/*` | Read one file as Base64. |

10 MiB of raw files expands to about 13.33 MiB in Base64. JSON and the transport envelope add overhead. Pass the effective `limits.maxTotalFileBytes` so the plaintext budget covers the serialized content. File limits still use raw bytes. If the reverse proxy or hosting platform has a separate request size limit, allow the encoded request to pass. The admin console loads the feedback route defaults first and then applies explicit route values from the host.

[Kit transport](kit.en.md) · [Serv transport](serv.en.md) · [Feedback operations](../operations/feedback.en.md)
