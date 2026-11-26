# @h-ai/feedback API Reference

<!-- translation: partial -->

[Chinese source](feedback.md) · [Configuration](../configuration/feedback.en.md) · [Data structures](../data/feedback.en.md)

<a id="feedback-workflow"></a>

## Complete workflow

This flow assumes a signed-in web user. The browser prepares and uploads evidence. The service accepts reports, collects additional evidence, handles reports, and cleans up expired data. Notifications and Webhooks are optional.

![Feedback workflow from startup and draft preparation through acceptance, collection, handling, export, and expiry](../images/function-feedback-collection.en.svg)

Suppose an order page fails. After the user submits a report, the page displays `FB-20261117-3A8D91C2`. An administrator can open and handle it immediately while the browser is still uploading the screenshot. The detail view shows handling, collection, and notification status separately. Webhook delivery appears in the job list.

<a id="feedback-steps"></a>

## Step by step

### 1. Start the service and mount the routes

Initialize RelDB and private Storage, then call server-side `feedback.init()`. Initialize the notification provider first in Reach mode. Mount the routes with `kit.createFeedbackHandler()` or `serv.createFeedbackProcedures()` and resolve `scopeId`, `userId`, and permissions from an authenticated session. Create the browser client from `@h-ai/feedback/client` and use `client.init({ appId, actions })` to connect those routes. [Quick start](#quick-start) · [Kit routes](kit.en.md#protocol-integrations) · [Serv routes](#reports) · [Client settings](#feedback-client-config)

### 2. Prepare a draft and let the user review it

When the user opens feedback, call `client.prepare()`. On success, use `client.getView()` to show evidence, screenshot previews, and missing material. Use `addFiles()` to add files and `annotate()` to mark or redact images. Use `client.saveDraft()` to save a local ZIP when the user wants to keep the material first. [Draft workflow and examples](#browser-capture)

### 3. Submit and display the report number

On submit, call `client.submit({ description, category, contact })`. The description can be omitted. Display `report.number` and keep `report.id` for queries. The first send fixes the submission ID and contents. Retry with the same data if the response is lost. To change a report already sent, save the existing draft and let the user confirm a new submission. [Submit and query](#reports)

### 4. Send remaining material and view background progress

After acceptance, the browser uploads attachments and remaining evidence for the same report, then acknowledges completion. Use `client.flush()` to retry pending items when the connection or current account session recovers. Check `get()` for `available` attachments, collection status, and failed jobs. The server worker collects extra evidence and runs enabled notifications and Webhooks independently. With `worker.intervalMs: 0`, schedule `feedback.runJobs()` from the application. [Evidence API](#evidence) · [How jobs are claimed](#feedback-job-execution)

### 5. Let authors view reports and administrators handle them

Authors use their own reports view or `listMine()`. Administrators look up the report by number, read its current `version`, and call `setStatus({ id, status: 'handled', expectedVersion }, context)`. Set `pending` to reopen it. Reload the detail before acting again after a version conflict. The status change also writes a history entry. [History storage](../data/feedback.en.md#table-hai-feedback-history) · [Query and handling examples](#reports)

### 6. Export on demand and clean up at expiry

An authorized administrator calls `feedback.export({ id }, context)`, keeps the job ID, and fetches the ZIP with `getExport()`. The request freezes the report version and evidence revision. If you need the most complete evidence, check collection status before requesting a ZIP. A pending `409` means to check again later. Handle failure and expiry according to the result. Access stops for all expired reports and their ZIPs, and workers remove the data. Call `client.close({ discard: true })` on logout and `feedback.close()` before server shutdown. [Diagnostic ZIP operations](#exports)

<a id="feedback-limits"></a>

## Key limits

| What to check | Default behavior |
| --- | --- |
| Which server logs are collected? | The app supplies `scopeId`. Only Core entries with `scopeId`, `userId`, and `requestId` enter the feedback buffer. An `error` or `fatal` entry can save itself and up to 100 entries on each side from the same request in the shared database for five minutes, including before submission. |
| Does the browser keep uploading? | Initialization can fetch the server policy. Recent Core logs, uncaught errors, and request summaries supplied by the app stay on the device, up to five minutes, 1,000 records, and 2 MiB by default. Submission sends evidence the SDK selected for that draft, then uploads remaining evidence and retained attachments. Native console capture is opt-in through `captureConsole: true` and covers `debug/info/warn/error`. |
| Screenshots, replay and privacy | Preparing a draft attempts a current-page screenshot by default. Background screenshots and DOM replay are opt-in. Request bodies, all cookies, and the full environment are excluded by default. Mark app-specific sensitive areas with `data-feedback-private` and let the user review and remove files before submission. Redact ZIP/GZIP contents before compression. |
| Size and count | By default, each report can include up to 20 attachments totaling 22 MiB, with at most 5 MiB per file, and up to 2,000 evidence items totaling 4 MiB. The first submission can include up to 1,000 client items. The server reserves capacity for its own evidence. Use `reports.policy({})` for the effective limits. |
| Submission quota | Defaults per user and UTC day are 20 accepted reports and 2 GiB of reserved space for reports and exports. Each scope in an app can reserve up to 10 GiB by default. A retry of the same submission counts once. |
| Waiting and retries | After acceptance, the server waits for the client's completion acknowledgement, up to 60 seconds by default, before collecting with the evidence then available. Accepted reports can be handled with partial material. Ordinary jobs get five attempts by default. Failed cleanup jobs keep retrying. |
| Retention and access | Reports are retained for 30 days by default. Completed ZIPs can be downloaded for up to 24 hours from the export request, within the report's lifetime. Access stops at expiry and background cleanup removes the data. Authors can work with their own in-scope reports. Administration actions check permissions individually. |

[How the service associates logs with a report](#server-log-collection) · [Configuration and effective limits](../configuration/feedback.en.md#configuration-fields)

<a id="module-dependencies"></a>

## Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| `@h-ai/core`, `@h-ai/api-contract` | Supply logging, result types, and feedback route contracts | Installed with Feedback | Load Core configuration first if the app uses it to configure the service. Use contracts directly |
| `@h-ai/reldb` and a database | Store reports, status, and background jobs | Required on the server. RelDB is installed with Feedback | Connect to the database and initialize RelDB before `feedback.init()` |
| `@h-ai/storage` and private storage | Store attachments and evidence | Required on the server. Storage is installed with Feedback | Initialize Storage before `feedback.init()`. Share the database and private object storage across instances |
| `@h-ai/reach` and a notification provider | Deliver feedback notifications | When `notification.mode: 'reach'` | Initialize Reach with the provider named by `notification.provider` before initializing Feedback |
| `@h-ai/kit` or `@h-ai/serv` | Mount feedback routes in SvelteKit or a standalone HTTP service | When using a framework adapter | Initialize Feedback, then pass it and a trusted context resolver to the adapter |
| `@capacitor/filesystem`, `@capacitor/share` | Save and share offline diagnostic bundles in Capacitor | When using the Capacitor export entry point | Install and sync both plugins before calling the export adapter |
| `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs` | Choose a destination and save offline diagnostic bundles in Tauri | When using the Tauri export entry point | Install and register the plugins, grant file permissions, and call the export adapter |

Browser code can use `@h-ai/feedback/client` directly, and offline tools can use `@h-ai/feedback/bundle` directly. The database and storage initialization applies to the server.

## Quick start

### Example

This server example accepts trusted context and an idempotent submission ID. Read storage credentials from private server configuration. Call `feedback.close()` before releasing the other services.

```ts
import { type FeedbackContext, feedback } from '@h-ai/feedback'

// Start orders 1.0.0 with console notifications and the admin URL below. Success has no data; initialization failure stops intake.
const initialized = await feedback.init({
  appId: 'orders',
  build: { appVersion: '1.0.0' },
  notification: { mode: 'console', adminUrl: 'https://app.example.test/admin/feedback' },
})
if (!initialized.success)
  throw new Error(initialized.error.message)

export async function submitFeedback(context: FeedbackContext, submissionId: string) {
  // Submit for orders with trusted context and a stable submissionId. Success returns a report ID and number. Authorization and quota checks can fail.
  return feedback.submit({ appId: 'orders', submissionId }, context)
}
```

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. Each call checks HaiResult.success before reading data and returns the original failed result to its caller. Scenarios without a function declaration are fragments inside an async application function. Use isolated test data and explicit cleanup.

<a id="service"></a>

### Prepare the service and collection jobs: `feedback`

The server accepts reports, collects evidence, notifies and expires records using application-provided shared dependencies and context.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedback.init(config, options?)` | Start the service with the selected dependencies | `config: FeedbackConfigInput`, `options?: FeedbackInitOptions` · [initialization arguments](#feedback-init-options) | `Promise<HaiResult<void>>` | `await feedback.init(config)` |
| `feedback.close()` | Stop the worker and release service state | None | `Promise<HaiResult<void>>` | `await feedback.close()` |
| `feedback.runJobs()` | Run one round of due background jobs | None | `Promise<HaiResult<{ processed: number }>>` | `await feedback.runJobs()` |

<a id="feedback-init-options"></a>

##### Initialization arguments

Pass the required `config: FeedbackConfigInput`. See the [configuration file reference](../configuration/feedback.en.md) for its fields. Omit `options: FeedbackInitOptions` to skip application-defined evidence collection.

The optional `collectEvidence({ report, signal })` runs after a report is stored. It receives the read-only report and a signal that the application can pass to work that must stop on timeout or shutdown. Return `FeedbackCollectedEvidence` directly or as a promise, with optional `text: string`, structured `data`, and `attachments`. Each attachment has a stable string `id`, file `name`, media type `contentType`, and `bytes: Uint8Array`. For example, a report numbered `FB-42` can yield `{ text: "Diagnostics for FB-42", data: { businessSystem: "orders" } }`.

#### Scenario: Schedule background jobs from the application

Feedback schedules its worker by default. If the deployment has its own process scheduler, set `worker.intervalMs: 0` and schedule the following call after initialization.

```ts
// Fragment inside an async application function; return failed results to its caller.
// Process a round of feedback jobs without arguments. data.processed is the count for this round; delivery is tracked separately.
const jobsResult = await feedback.runJobs()
if (!jobsResult.success)
  return jobsResult
const { processed } = jobsResult.data
```

Reach API receivers can deduplicate feedback notifications by `extra.notificationId` in the JSON payload. Retries reuse the same notification job ID from `feedback.get()`.

The output is successful HaiResult.data. Build context from the authenticated server identity and check success.

Finalization stops the current collection; it does not wait for all notifications to finish. Read attachments and exports through a server endpoint that checks the caller’s access.

<a id="server-log-collection"></a>

#### How server logs reach a report

`scopeId` is optional business context supplied by the app. A single app can use a fixed value. A multi-tenant app takes the tenant ID from trusted context. Kit carries the request ID and the authenticated user ID. The admin console adds its scope using `core.context.run({ scopeId: 'admin-console' }, next)` in app middleware. In Serv, the app returns `scopeId` from `createContext`, and Serv carries it into logs emitted within procedures. A scope supplied only through the feedback adapter's `resolveContext` does not reach logs from other routes. [Kit request context example](kit.en.md#protocol-integrations)

1. **Observation starts on initialization.** `feedback.init()` registers the Core log observer even without an application evidence callback. Only entries with all three fields, `scopeId`, `userId`, and `requestId`, enter the feedback buffer. Log files, stdout, and logs emitted before initialization are outside this observer.
2. **Error evidence can be stored before submission.** Ordinary entries stay in the local instance's latest five minutes of memory, up to 10,000 entries or 16 MiB. An `error` or `fatal` entry can preserve itself and up to 100 entries before and after it from the same request in the shared database. The following window lasts at most 30 seconds. Temporary records are retained for five minutes before they expire.
3. **Collection attaches only relevant evidence.** After acceptance, the worker filters by app, scope, and author. It reads available entries from five minutes before to 30 seconds after the report anchor. The browser uses a recent error or the time the draft opened. Direct API calls that omit the anchor use acceptance time. Up to 1,000 entries fit within this step, subject to the report budget. Instances can read shared error evidence. Ordinary in-memory logs stay with the instance that captured them. Missing matches, truncation, and read failures can appear as missing evidence.
4. **The app supplies any business evidence for the report.** The background job runs the app's registered `collectEvidence({ report, signal })` callback. Use the report to query relevant entries from your own service, then return text, structured data, or attachments.

<a id="feedback-job-execution"></a>

#### How background jobs are claimed and recovered

Submission saves the report and registers collection, expiry cleanup, and enabled notification jobs in the same transaction. A configured Webhook waits for collection to finish, including failure. A ZIP job is registered on export request. The browser captures screenshots and initiates file uploads.

**The worker claims jobs automatically.** Application processes poll the shared database by default, with one active lease per job at any time. When instance A starts generating a ZIP, it atomically records its token and lease, and renews the lease while running. If A exits, instance B can take over after the lease expires. Only the current lease holder can record the outcome. A notification may still be delivered twice after a retry. The receiver can deduplicate on the job's idempotency ID. [Job fields](../data/feedback.en.md#table-hai-feedback-jobs)

#### Scenario: Collect application evidence after submission

```ts

import { type FeedbackConfigInput, feedback } from '@h-ai/feedback'

function startFeedback(config: FeedbackConfigInput) {
  // Pass application config after its dependencies are ready. The callback uses the report number and stops if the task is cancelled.
  return feedback.init(config, {
    collectEvidence: ({ report, signal }) => {
      signal.throwIfAborted()
      return { text: `Diagnostics for ${report.number}`, data: { businessSystem: 'orders' } }
    },
  })
}
```

[Detailed parameters and workflows](feedback.md#service)

<a id="reports"></a>

### Submit, query and process reports: `feedback`

Save the accepted report ID, then let authorized operators inspect evidence and change status with a version check.

To mount the HTTP routes, import `serv` from `@h-ai/serv` and use `serv.createFeedbackProcedures({ feedback, resolveContext })` with `apiContract.feedback`. Resolve `scopeId`, `userId` and `permissions` on the server.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedback.submit(input, context)` | Accept a report | Required `input: FeedbackSubmitInput` and `context: FeedbackContext`. See [submission fields](#feedback-submission-fields). | `FeedbackReport` | `await feedback.submit(reportInput, context)` |
| `feedback.list(input, context)` | Filter and paginate reports | `input: FeedbackListInput` Required filter object with optional fields. See [report filters](#feedback-report-options). `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `PaginatedResult<FeedbackReport>` | `await feedback.list({ page: 1, pageSize: 20 }, context)` |
| `feedback.listMine` | Paginate the author’s reports by category | `input, context` | `PaginatedResult<FeedbackReport>` | `await feedback.listMine({ category: 'bug', page: 1 }, context)` |
| `feedback.get(id, context)` | Read report details | `id: string` Required report ID. `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `FeedbackDetail` | `await feedback.get(reportId, context)` |
| `feedback.getEvidence(input, context)` | Paginate diagnostic evidence | `input: FeedbackEvidenceQuery` Requires id. Optional source, kind, requestId, errorId, Unix milliseconds from/to, and page/pageSize. See [evidence fields](#feedback-evidence-fields). `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `PaginatedResult<FeedbackEvidence>` | `await feedback.getEvidence({ id: reportId, page: 1, pageSize: 20 }, context)` |
| `feedback.setStatus(input, context)` | Update status with a version check | `input: FeedbackSetStatusInput` Report, target status, version, and note. See [processing fields](#feedback-report-options). `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `FeedbackReport` | `await feedback.setStatus(statusUpdate, context)` |
| `feedback.retry(input, context)` | Retry a selected failed job | `input: FeedbackRetryInput` Requires report id plus target and applicable targetId. See [retry fields](#feedback-report-options). `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `void` | `await feedback.retry(retryInput, context)` |

<a id="feedback-report-options"></a>

**Report filters, status and retries**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `list.input.page / pageSize` | `number` | Defaults 1 and 20 | Positive integer page and page size. pageSize is capped at 100. |
| `list.input.sortDirection` | `'asc' \| 'desc'` | `desc` | Order by creation time. |
| `list.input.status` | `'pending' \| 'handled'` | Optional | Filter by processing status. |
| `list.input.collectionStatus` | `'collecting' \| 'complete' \| 'partial' \| 'failed'` | Optional | Filter by evidence collection status. |
| `list.input.notificationStatus` | `'disabled' \| 'pending' \| 'sending' \| 'sent' \| 'deferred' \| 'failed'` | Optional | Filter by notification status. |
| `list.input.appId / appVersion` | `string` | Optional | Narrow to app and version within the authorized scope. appVersion is at most 128 characters. |
| `list.input.search` | `string` | Optional | Literal substring of the report number or summary, up to 200 characters. |
| `list.input.from / to` | `number` | Optional | Inclusive creation-time bounds as nonnegative safe integer Unix milliseconds. |
| `setStatus.input.id / status` | `string / FeedbackStatus` | Required | Report ID and target status, pending or handled. |
| `setStatus.input.expectedVersion` | `number` | Required | Positive integer version from the last read. A concurrent change returns CONFLICT. |
| `setStatus.input.note` | `string` | Optional | Processing note, up to 10000 characters. |
| `retry.input.target` | `'collect' \| 'notify' \| 'webhook' \| 'export' \| 'attachment'` | Required | Failed operation category to reschedule. |
| `retry.input.targetId` | `string` | Supply for attachment retries | ID of the failed attachment within the report. |

For example, `{ status: "pending", page: 1, pageSize: 5 }` returns up to five pending reports within the authorized scope on the first page. A concurrent change after reading a report’s `version` makes its status update return `CONFLICT`.

<a id="feedback-submission-fields"></a>

**Report submission and caller context**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `input.submissionId / appId` | `string` | Required | Stable submission and app IDs. Reuse the submission ID when retrying the same operation. |
| `input.description / category / contact` | `string` | Optional | Reporter description, app category, and contact details. Length limits are 10000, 64, and 320. |
| `input.url` | `string` | Optional | Incident page URL, up to 2048 characters. |
| `input.appVersion / buildId / commit` | `string` | Optional | Identify the affected build. Up to 128 characters each. |
| `input.anchor` | `{ kind, timestamp, errorId? }` | Optional | Incident anchor. kind is error or feedback, timestamp is Unix milliseconds, and errorId can identify the error. |
| `input.evidence / attachments` | `FeedbackEvidenceInput[] / FeedbackAttachmentInput[]` | Optional | Diagnostic events and attachment declarations, limited to 1000 and 20 items respectively. Upload file bytes separately. |
| `context.scopeId / userId` | `string` | Required | Trusted tenant and user identities from the authorized session. |
| `context.permissions` | `readonly string[]` | Optional | Permissions granted by the trusted session. The service still checks the access scope. |

#### Scenario: list your own reports

The server builds the context from an authenticated user and a verified scope. The list filters by application, scope, author, and expiry. Category matches are case-sensitive and read the existing report payload. The administration list still requires `feedback:read`.

Authenticated authors can use the Kit and Serv route `GET /api/feedback/my-reports?category=bug&page=1` to find active reports in the current application and scope. This example assumes the application mounts the API at `/api`.

```ts

import { type FeedbackContext, feedback } from '@h-ai/feedback'

async function listOwnReports(context: FeedbackContext) {
  // Read up to 20 of the author’s bug reports in this application and scope. An empty page is a valid result.
  const result = await feedback.listMine({ category: 'bug', page: 1, pageSize: 20 }, context)
  if (!result.success)
    return result
  return result.data
}
```

#### Scenario: Submit, query and process reports

Use a server-authenticated context authorized for create/read/process. submit supplies the ID; the freshly read detail supplies expectedVersion. Retry notifications only for a recoverable failure; acceptance does not mean a recipient read them.

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function processReport(context: FeedbackContext, submissionId: string) {
  // Submit an orders report with the trusted actor and durable submission ID. The result contains the report ID and number; return the failed result on authorization or storage failure.
  const reportResult = await feedback.submit({ appId: 'orders', submissionId }, context)
  if (!reportResult.success)
    return reportResult
  const report = reportResult.data
  // Read page 1 with up to 20 reports visible to this actor. The page has empty items when none are visible.
  const pageResult = await feedback.list({ page: 1, pageSize: 20 }, context)
  if (!pageResult.success)
    return pageResult
  const page = pageResult.data // authorized report page
  // Read details and version using the new report ID and current actor. Return the failed result on denied access or a read error.
  const detailResult = await feedback.get(report.id, context)
  if (!detailResult.success)
    return detailResult
  const detail = detailResult.data
  // Read the first 20 evidence items for the same report and actor. With no evidence, the returned page has empty items.
  const evidenceResult = await feedback.getEvidence({ id: report.id, page: 1, pageSize: 20 }, context)
  if (!evidenceResult.success)
    return evidenceResult
  const evidence = evidenceResult.data
  // Mark the report handled using the observed version. Success returns the new report version; a version conflict or lack of permission fails.
  const handledResult = await feedback.setStatus({ id: report.id, status: 'handled', expectedVersion: detail.report.version }, context)
  if (!handledResult.success)
    return handledResult
  const handled = handledResult.data
  return { report, page, evidence, handled } // same report ID; handled has the new version
}

async function retryNotification(id: string, context: FeedbackContext) {
  // Schedule a notification retry for the supplied authorized report. Success has no data; delivery completion is reported separately.
  return feedback.retry({ id, target: 'notify' }, context) // HaiResult<void>, caller checks success
}
```

Lists, report details, evidence, attachments and exports use database time to check expiry. Expired reports are omitted from lists and individual operations return `NOT_FOUND`. A background job handles physical deletion from the database and object storage.

Both online and offline queries can use an `errorId` from a failed request or an error. The anchor determines the source, request and sequence, with up to 100 surrounding log records on each side.

<a id="evidence"></a>

### Append evidence and read attachments: `feedback`

Bind late evidence to the original report and principal; check attachment type, bytes and digest.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedback.appendEvidence(input, context)` | Append diagnostic evidence | `input: FeedbackAppendEvidenceInput` Required report id and evidence array (up to 1000 items). See [evidence fields](#feedback-evidence-fields). `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `{ acknowledged, evidenceRevision }` | `await feedback.appendEvidence(evidence, context)` |
| `feedback.completeCollection(input, context)` | Complete an evidence collection | `input: FeedbackCompleteInput` Required report id and optional missing list. See [missing-data fields](#feedback-evidence-fields). `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `FeedbackReport` | `await feedback.completeCollection({ id: reportId, revision: 1 }, context)` |
| `feedback.uploadAttachment(input, context)` | Upload an authorized attachment | `input: FeedbackUploadInput` Required report id, declared attachmentId, and matching bytes in dataBase64. See [upload fields](#feedback-evidence-fields). `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `FeedbackAttachment` | `await feedback.uploadAttachment(upload, context)` |
| `feedback.getAttachment(input, context)` | Read an authorized attachment | `input: { id: string, attachmentId: string }` Requires report and attachment IDs. `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `FeedbackAttachmentData` | `await feedback.getAttachment({ id: reportId, attachmentId }, context)` |

<a id="feedback-evidence-fields"></a>

**Evidence and attachment inputs**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `evidence[].id / source / sequence` | `string / string / number` | Required | Stable evidence ID, source (1–128 characters), and nonnegative safe integer sequence within that source. |
| `evidence[].kind` | `'log' \| 'error' \| 'request' \| 'interaction' \| 'environment' \| 'snapshot' \| 'replay' \| 'business' \| 'missing'` | Required | Evidence category. |
| `evidence[].timestamp` | `number` | Required | Event time in Unix milliseconds. |
| `evidence[].data` | `Record<string, unknown>` | Required | JSON object for the given evidence category. |
| `evidence[].requestId / errorId / missingReason` | `string` | Optional | Relate a request or error, or give a missing-data reason of up to 2000 characters. |
| `attachments[].id / name / contentType` | `string` | Required | Stable attachment ID, filename, and media type declared on submission. |
| `attachments[].size / checksum` | `number / string` | Required | Declare byte size (0 to 5 MiB) and 64-character lowercase hexadecimal SHA-256. |
| `uploadAttachment.input.dataBase64` | `string` | Required | Standard Base64 of the declared file bytes without a data URL prefix. |
| `completeCollection.input.missing` | `string[]` | Optional | Descriptions of diagnostic items still missing, up to 100 items and 2000 characters each. |

#### Scenario: Append evidence and read attachments

Repeated confirmations of the same missing evidence write it once. Attachment removals and additions are validated together. If a selected file fails validation, the previous attachments and missing evidence marks remain available.

Use the accepted report ID and matching trusted context. Evidence carries stable id/source/sequence. Upload input encodes a declared attachment; changing IDs cannot bypass declarations or quotas.

```ts
import type { FeedbackContext, FeedbackUploadInput } from '@h-ai/feedback'

async function appendMaterials(context: FeedbackContext, upload: FeedbackUploadInput) {
  const id = upload.id
  // Append browser event event-demo-1 to the report named by upload.id. Its stable ID supports deduplication. Success returns acknowledged IDs and the evidence revision.
  const receiptResult = await feedback.appendEvidence({ id, evidence: [{
    id: 'event-demo-1', source: 'browser', sequence: 1, kind: 'business',
    timestamp: Date.now(), data: { state: 'checkout-failed' },
  }] }, context)
  if (!receiptResult.success)
    return receiptResult
  const receipt = receiptResult.data // acknowledged IDs and evidenceRevision
  // Write the supplied attachment content and IDs to the report. Success returns metadata; return the failed result on validation, budget, or write failure.
  const attachmentResult = await feedback.uploadAttachment(upload, context)
  if (!attachmentResult.success)
    return attachmentResult
  const attachment = attachmentResult.data // saved attachment metadata
  // Read the authorized attachment using the report and original attachment IDs. The DTO contains Base64 content; return the failed result on read failure.
  const bytesResult = await feedback.getAttachment({ id, attachmentId: upload.attachmentId }, context)
  if (!bytesResult.success)
    return bytesResult
  const bytes = bytesResult.data
  // Mark collection complete for this report with no known missing material. Success returns the updated report; unmet conditions fail.
  const completedResult = await feedback.completeCollection({ id, missing: [] }, context)
  if (!completedResult.success)
    return completedResult
  const completed = completedResult.data // updated report
  return { receipt, attachment, bytes, completed }
}
```

<a id="exports"></a>

### Export and inspect offline bundles: `feedback`

Core Workers compress and unpack ZIP bundles. Browser offline export uses a Web Worker. Archive paths, size limits and content digests follow the same validation rules.

Export creates a job at a fixed evidence revision. Retrieve ZIP only when ready; the viewer does not replay business effects.

The viewer reads the single-disk ZIP format produced by Feedback, using stored or DEFLATE entries. It checks paths, entry ranges, file count and expanded size before reading the contents.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedback.export(input, context)` | Request an archive of a fixed evidence revision | `input: FeedbackExportInput` Required report id and optional positive integer evidenceRevision, defaulting to the report’s current evidence revision. `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `FeedbackJob` | `await feedback.export(exportInput, context)` |
| `feedback.getExport(input, context)` | Read a completed export | `input: { id: string, jobId: string }` Requires report ID and the export job ID from its receipt. `context: FeedbackContext` Required trusted session identity. See [caller context](#feedback-submission-fields) | `FeedbackAttachmentData` | `await feedback.getExport({ id: reportId, jobId }, context)` |

#### Scenario: Export and inspect offline bundles

An authorized administrator supplies the report ID. export returns a job ID. This example checks once: pending generation returns CONFLICT, which may be queried again after a bounded wait. It is not an empty ZIP.

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function requestArchive(id: string, context: FeedbackContext) {
  // Request an export for the authorized report and receive the durable job receipt. Archive generation may still be pending.
  const jobResult = await feedback.export({ id }, context)
  if (!jobResult.success)
    return jobResult
  const job = jobResult.data // persistent job receipt
  // Fetch the archive for this report and the newly returned job ID. A pending archive or denied access fails.
  return feedback.getExport({ id, jobId: job.id }, context) // HaiResult<FeedbackAttachmentData>
}
```

<a id="browser-capture"></a>

### Capture browser evidence and drafts: `feedback.createClient`

Create a client per product session, freeze evidence before opening UI and clean up previews and identity-owned drafts.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedbackClient.init(config)` | Start browser evidence capture | Required `config: FeedbackClientConfig`. See [application and capture fields](#feedback-client-config). | `Promise<HaiResult<void>>` | `await feedbackClient.init(config)` |
| `feedbackClient.prepare(options?)` | Prepare evidence for a report | Returns the previous accepted draft if uploading its files fails. Pass `{ startNew: true }` once the user confirms replacing it | `Promise<HaiResult<FeedbackDraft>>` | `await feedbackClient.prepare()` |
| `feedbackClient.captureScreenshot(attachmentId?)` | Capture a page screenshot | `attachmentId?: string` Add a screenshot when omitted or replace the given draft attachment | `Promise<HaiResult<void>>` | `await feedbackClient.captureScreenshot()` |
| `feedbackClient.getDraft()` | Read the current draft | `—` | `FeedbackDraft \| undefined` | `feedbackClient.getDraft()` |
| `feedbackClient.getView()` | Read UI view state | `—` | `FeedbackDraftView` | `feedbackClient.getView()` |
| `feedbackClient.releasePreviews()` | Release temporary preview resources | `—` | `void` | `feedbackClient.releasePreviews()` |
| `feedbackClient.addFiles(files, removedAttachmentIds?)` | Add user-selected files | `files: readonly File[], removedAttachmentIds?: readonly string[]` Newly selected files and optional draft attachment IDs to remove in the same batch | `Promise<HaiResult<void>>` | `await feedbackClient.addFiles(files, removedAttachmentIds)` |
| `feedbackClient.annotate(id, annotation)` | Apply annotations and redaction to an image | Required `id: string` (draft attachment ID) and `annotation: FeedbackImageAnnotation` (annotation and redaction data) | `Promise<HaiResult<void>>` | `await feedbackClient.annotate(attachmentId, annotation)` |
| `feedbackClient.record(event)` | Record an application fact | Required `event` object with an evidence category `kind` and field object `data`. Optional `requestId` and `errorId` correlate an existing request or error | `void` | `feedbackClient.record({ kind: 'business', data: { state: 'ready' } })` |
| `feedbackClient.submit(input?)` | Submit the current draft | Optional `input: FeedbackClientSubmitInput`. See [browser submission fields](#feedback-client-submit-input). | `Promise<HaiResult<FeedbackReport>>` | `await feedbackClient.submit({ description: 'Checkout failed' })` |
| `feedbackClient.flush()` | Flush unacknowledged evidence | `—` | `Promise<HaiResult<void>>` | `await feedbackClient.flush()` |
| `feedbackClient.exportDraft(input?)` | Export a local diagnostic archive | `input?: FeedbackClientSubmitInput` supplies text and attachment changes for the archive. Omit to export the current draft | `Promise<HaiResult<Uint8Array>>` | `await feedbackClient.exportDraft()` |
| `feedbackClient.saveDraft(input?)` | Save a local draft | `input?: FeedbackClientSubmitInput` follows `exportDraft` before the host save action | `Promise<HaiResult<FeedbackSaveResult>>` | `await feedbackClient.saveDraft()` |
| `feedbackClient.pause()` | Pause capture | `—` | `void` | `feedbackClient.pause()` |
| `feedbackClient.close(options?)` | Stop capture and release resources | `options?: { discard?: boolean }` Defaults to false for bounded finalization and cleanup. Set discard to true to discard the local draft | `Promise<void>` | `await feedbackClient.close({ discard: true })` |

<a id="feedback-client-config"></a>

**FeedbackClientConfig**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `appId` | `string` | Required | Application identifier matching the server feedback configuration. |
| `appVersion / buildId / commit` | `string` | Optional | Build identifiers sent with reports. Up to 128 characters each. |
| `actions` | `FeedbackClientActions` | Required | Host async callbacks submit, appendEvidence, completeCollection, and upload accept the report, append evidence, complete collection, and upload files. Optional policy returns server limits. |
| `budget` | `FeedbackBudget` | Optional | Used offline or when server policy is unavailable. Online, actions.policy takes precedence. |
| `cookieAllowlist` | `readonly string[]` | Optional | Cookie names allowed in diagnostics. |
| `screenshot / keyScreenshots` | `boolean` | `true / false` | Controls screenshots at preparation and additional automatic key screenshots. |
| `captureScreenshot` | `(options?: { signal: AbortSignal }) => Promise<Uint8Array>` | Optional | Override screenshot capture, returning image bytes and honoring cancellation. |
| `screenshotTimeoutMs / maxKeyScreenshots / keyScreenshotThrottleMs` | `number` | `3000 / 3 / 10000` | Screenshot timeout ms, retained key shots, and minimum interval ms between automatic shots. Key shots are capped at five and zero disables them. |
| `replay / replayStart` | `boolean / 'init' \| 'prepare'` | `false / prepare` | Enable DOM replay and choose whether capture starts at initialization or preparation. |
| `captureConsole / persistDraft` | `boolean` | `false / false` | Explicitly enable console capture or local persistence. |
| `persistenceKey` | `string` | Required for persistDraft=true | Scope local drafts to the user and tenant. Do not use credentials. |
| `maxEvents / maxBytes / maxAgeMs` | `number` | `1000 / 2097152 / 300000` | Evidence count, bytes, and retention milliseconds. Server limits further cap count and bytes. |
| `beforeCount / afterCount / afterTimeoutMs` | `number` | `100 / 100 / 30000` | Events before and after the anchor and maximum collection milliseconds after it. Numeric options require nonnegative safe integers. |

For example, `{ screenshot: false, replay: true, replayStart: "prepare" }` disables screenshots and starts replay only when the user prepares feedback.

<a id="feedback-client-submit-input"></a>

**FeedbackClientSubmitInput**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `description / category / contact` | `string` | Optional | Issue description, application category, and reporter contact. Supply any independently. |
| `files` | `readonly File[]` | No new files | Files selected for this action. |
| `removedAttachmentIds` | `readonly string[]` | Keep existing attachments | Remove these IDs from the submission, or exclude them from the offline archive. |

For example, exporting with `{ description: "Checkout failed", removedAttachmentIds: ["draft-image"] }` yields a ZIP with the supplemental description and excludes that attachment.

`submit`, `exportDraft`, and `saveDraft` share an optional `FeedbackClientSubmitInput`. The optional strings `description`, `category`, and `contact` describe the issue, the application-defined category, and how to contact the reporter. `files?: readonly File[]` supplies newly selected files. `removedAttachmentIds?: readonly string[]` supplies IDs to exclude from the draft material. Omit these fields to add no files and keep existing attachments.

#### Scenario: Capture browser evidence and drafts

prepare freezes the scene for review; submit durably submits it. Browser uploads and server collection may continue after acceptance.

This SDK example shows preparation, confirmation, and submission together. In the UI, show the form after `prepare()` succeeds and let the user review the material before calling `submit()`.

```ts

import { type FeedbackClientConfig, feedback } from '@h-ai/feedback/client'
export async function capture(config: FeedbackClientConfig) {
  // Create an independent capture client without arguments. Initialization enables the configured capture.
  const feedbackClient = feedback.createClient()
  // Initialize this session with the host's client config. Success has no data; return the failed result on invalid config or conflicting initialization.
  const initResult = await feedbackClient.init(config)
  if (!initResult.success)
    return initResult
  try {
    // Record state: ready as a business event in this capture session. No data is returned.
    feedbackClient.record({ kind: 'business', data: { state: 'ready' } })
    // Prepare an editable draft with no arguments. Success returns the draft; return the failed result if the session is unavailable.
    const draftResult = await feedbackClient.prepare()
    if (!draftResult.success)
      return draftResult
    const draft = draftResult.data
    // Read the current draft with no arguments. The result is undefined when no draft exists.
    const current = feedbackClient.getDraft() // current draft or undefined
    // Read the current UI projection without arguments, including evidence, missing material, and available previews.
    const view = feedbackClient.getView() // preview URLs, evidence and missing materials
    // Capture the visible page into the draft without a replacement ID. Capture failure or a concurrent draft freeze returns a failed result.
    const captureScreenshotResult = await feedbackClient.captureScreenshot()
    if (!captureScreenshotResult.success)
      return captureScreenshotResult
    // refreshes the screenshot attachment
    // Add the in-memory demo.txt file to the draft. Success has no data; limits, validation, or conflicts leave existing files intact.
    const addFilesResult = await feedbackClient.addFiles([new File(['demo log'], 'demo.txt', { type: 'text/plain' })])
    if (!addFilesResult.success)
      return addFilesResult
    // Submit the draft with description Checkout failed. Success yields the report ID and number; material uploads may still be pending.
    const receiptResult = await feedbackClient.submit({ description: 'Checkout failed' })
    if (!receiptResult.success)
      return receiptResult
    const receipt = receiptResult.data // accepted report ID/number
    // Resume pending evidence and attachments for the current report without arguments. Success has no data; unfinished material remains pending.
    const flushResult = await feedbackClient.flush()
    if (!flushResult.success)
      return flushResult
    // resumes pending evidence upload
    // Export the local draft to ZIP bytes without arguments or upload. Return the failed result if archive generation fails.
    const archiveResult = await feedbackClient.exportDraft()
    if (!archiveResult.success)
      return archiveResult
    const archive = archiveResult.data // Uint8Array ZIP
    // Send the current draft archive to the platform saver. Check status for saved or cancelled; return the failed result on a platform error.
    const savedResult = await feedbackClient.saveDraft()
    if (!savedResult.success)
      return savedResult
    const saved = savedResult.data // inspect saved.status; cancelled is not a saved file
    // Revoke the session's attachment preview URLs without arguments. No data is returned.
    feedbackClient.releasePreviews() // releases generated object URLs
    // Pause active collection with no arguments, retaining the draft and accepted uploads.
    feedbackClient.pause() // pauses active collection while retaining the draft
    return { draft, receipt, archive, saved }
  }
  finally {
    // Close collection and discard the local draft, awaiting listener and observer cleanup. The promise has no business data.
    await feedbackClient.close({ discard: true })
  }
}
```

The application supplies config.actions through typed HTTP adapters. Screenshot, file, annotation, submission and saving inputs follow below. A successful save result can still mean user cancellation.

#### Scenario: Save pending evidence and start a new report

If a successful `prepare()` result includes `report`, display its original receipt and offer to save feedback locally or start a new report. Saving without arguments keeps the description, category and contact details already accepted or frozen in the draft. Use the following call after the user confirms replacement. The server retains the accepted report and evidence already uploaded.

```ts
import type { FeedbackBrowserClient } from '@h-ai/feedback/client'

async function startNewFeedback(client: FeedbackBrowserClient) {
  // The user confirmed replacing the local draft. Check success, then display the returned draft.
  const prepared = await client.prepare({ startNew: true })
  if (!prepared.success)
    return prepared
  return prepared.data
}
```

The initial submission includes at most 1,000 client evidence records. Other evidence within budget uploads after acceptance. The server reserves evidence capacity for its environment and follow-up collection. A minimal budget still permits report intake. When the environment exceeds its reserved space, the environment record contains `data.truncated: true`. The report retains the app ID.

Online replay reconstructs snapshots and incremental events in an isolated document. Replay never loads application or external network resources. Switching reports clears the previous evidence and previews, and late responses can only update their own report.

[Detailed parameters and workflows](feedback.md#browser-capture)

annotation comes from a user-selected image region, and attachmentId from that draft. Call before submit freezes the envelope. Success updates the draft; refresh getView afterward.

```ts
import type { FeedbackBrowserClient } from '@h-ai/feedback/client'

async function redactImage(client: FeedbackBrowserClient, attachmentId: string,
  annotation: Parameters<FeedbackBrowserClient['annotate']>[1]) {
  // Apply the supplied annotation to the selected attachment ID. Success updates it with no data; a frozen draft or conflict preserves the prior attachment.
  const changed = await client.annotate(attachmentId, annotation)
  if (!changed.success)
    return changed
  // Read the refreshed UI projection with no arguments to obtain the updated attachment and preview.
  return client.getView() // refreshed preview and attachment state
}
```
