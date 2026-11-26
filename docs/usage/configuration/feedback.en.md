# @h-ai/feedback Configuration

[简体中文](feedback.md) · [日本語](feedback.ja.md) · [API reference](../function/feedback.en.md) · [Data structures](../data/feedback.en.md)

## Configuration entry point

Place `config/_feedback.yml` in the application's server configuration directory. The admin console loads it through Core and validates it with `FeedbackConfigSchema` at startup. For a standalone integration, connect RelDB first and call `feedback.init(config)`. The API becomes available after initialization succeeds. Restart the Feedback service instances after changing the application ID, limits, capture, or retention settings.

<a id="configuration-fields"></a>

## Configuration reference

**`appId`** is required. The service writes it to `app_id` on each new report and uses it to scope report lists, details, messages, and attachments to the application.

Use a string of 1 to 128 characters after trimming, with no NUL. Environment variable `HAI_FEEDBACK_APPID`.

Applications sharing one database should use distinct `appId` values. Instances of the same application sharing a database should use the same value. For example, `orders` and `inventory` can use the same tables with separate feedback lists. After changing `orders` to `orders-v2`, the new instances query the new ID and existing records still belong to `orders`.

### Submission limits

Each initial report, reply, and information request is checked separately against these limits. Use integers for these settings. Omitted fields use their defaults. File sizes use raw bytes before Base64 encoding.

- **`limits.maxBodyLength`** Caps the body text in one submission. Length is measured in UTF-16 code units, so “Hi😀” uses four. When sending files only, leave the form's body blank or pass an empty string for `body` when calling the API.

  Defaults to `5000`. Accepts `1`–`20000`. Environment variable `HAI_FEEDBACK_LIMITS_MAXBODYLENGTH`.

- **`limits.maxFiles`** Caps the number of files in one submission. Only files the author selects manually count, including images.

  Defaults to `5` files. Accepts `1`–`20`. Environment variable `HAI_FEEDBACK_LIMITS_MAXFILES`.

- **`limits.maxFileBytes`** Caps the size of each file. The limit applies separately to every manual attachment and every piece of first-post evidence.

  Defaults to `5242880` bytes (5 MiB). Accepts `1`–`10485760` bytes. Environment variable `HAI_FEEDBACK_LIMITS_MAXFILEBYTES`.

- **`limits.maxTotalFileBytes`** Caps the combined file size in one submission. For an initial report, add manual attachments and any retained screenshot, browser logs, replay, and recording. For a reply or information request, add its own attachments.

  Defaults to `10485760` bytes (10 MiB). Accepts `1`–`25165824` bytes. The value must be at least the per-file limit. Environment variable `HAI_FEEDBACK_LIMITS_MAXTOTALFILEBYTES`.

The built-in form limits text entry and reports an error if the selection or submission exceeds the file limits. The service also rejects submissions that exceed the limits when called directly through the API.

For example, consider an initial report containing just two manually attached images of 4 MiB each and a 3 MiB recording. With the defaults, it has two manual attachments and each file fits within 5 MiB. The combined 11 MiB exceeds the 10 MiB limit. Removing the recording leaves 8 MiB, which can be sent.

If the author opts into server logs, the service uses the remaining space in the report for recent entries. It omits the log file if none fit.

### First-post evidence

These fields control how much evidence an initial report can include. Omitted fields use their defaults. Each log and replay file uses the smaller of its own size limit and the per-file limit. These files also count toward the combined submission size.

- **`capture.windowSeconds`** Sets how far back to look. Opening the feedback dialog freezes recent browser logs and replay. If server logs are requested, their window ends when the author submits the report.

  Defaults to `300` seconds (5 minutes). Accepts `1`–`1800` seconds. Environment variable `HAI_FEEDBACK_CAPTURE_WINDOWSECONDS`.

- **`capture.maxLogEntries`** Caps the number of entries in each log file. Browser and server logs are counted separately, and the newest entries take priority.

  Defaults to `1000` entries. Accepts `1`–`5000` entries. Environment variable `HAI_FEEDBACK_CAPTURE_MAXLOGENTRIES`.

- **`capture.maxLogBytes`** Caps the size of each entire JSON log file, including JSON formatting. A few long entries can reach this limit first.

  Defaults to `524288` bytes (512 KiB). Accepts `1`–`2097152` bytes. Environment variable `HAI_FEEDBACK_CAPTURE_MAXLOGBYTES`.

- **`capture.maxReplayBytes`** Caps the size of the interaction replay JSON file. Each segment includes a full page snapshot and the actions that follow. When the capture exceeds the limit, the browser discards the oldest segments first.

  Defaults to `2097152` bytes (2 MiB). Accepts `1`–`8388608` bytes. Environment variable `HAI_FEEDBACK_CAPTURE_MAXREPLAYBYTES`.

- **`capture.maxReplayEvents`** Caps the number of events in one replay. Full page snapshots, viewport metadata, and actions such as clicks all count. The browser again discards whole segments when this limit is exceeded.

  Defaults to `2000` events. Accepts `1`–`10000`. Environment variable `HAI_FEEDBACK_CAPTURE_MAXREPLAYEVENTS`.

- **`capture.maxRecordingSeconds`** Sets how long the browser can record after the author grants permission and recording begins. The browser stops at this limit or sooner if it nears the per-file size limit. The service checks the uploaded recording's size and format.

  Defaults to `60` seconds. Accepts `1`–`300` seconds. Environment variable `HAI_FEEDBACK_CAPTURE_MAXRECORDINGSECONDS`.

### Retention

- **`retention.days`** Sets how many days a report remains accessible after its last activity. The clock starts at submission and resets with each new message or status change. Set `0` to keep reports indefinitely.

  Defaults to `0`. Accepts `0`–`3650` days. Environment variable `HAI_FEEDBACK_RETENTION_DAYS`.

For example, with `90`, a reply moves the report's expiry to 90 days after that reply. At expiry, the report immediately becomes unavailable in lists and detail views, regardless of status. At startup and hourly, the service deletes expired reports and their messages and attachments in batches for its application. Use the same settings across instances of the application. New settings apply to existing reports after restart. [Data retention](../data/feedback.en.md#retention)

<a id="configuration-ownership"></a>

## Host integration

The host connects the database, resolves permissions and business scope, and configures file transport through these entry points.

| Layer | Where to set it | When it applies |
| --- | --- | --- |
| Database | The connection settings passed to `reldb.init`. The admin console reads `config/_db.yml`. | At startup, Feedback uses the host's SQLite, PostgreSQL, or MySQL database for its three tables. |
| Identity and business scope | The host supplies `userId`, `scopeId`, and permissions from a trusted session in `resolveContext`. For Core log association, business requests must also set the same scope in their Core context. | Each API request is authorized against its session and scope. The host assigns roles. |
| Browser evidence | The host passes `captureKey` to the signed-in user's `FeedbackModal` and uses `getLimits` to load the service configuration. The author can inspect and remove evidence, authorize a recording, or opt into server logs. | The component starts buffering on the page after it has the limits. Opening the dialog freezes recent browser logs and replay. The author's choices apply to that submission. |
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

Suppose the orders support team wants users to send two 6 MiB files in a single reply and keep the report for 90 days after its last activity. This example also sets the lookback window to 3 minutes and caps screen recordings at 45 seconds. Omitted fields use their defaults.

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
