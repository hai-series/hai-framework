# @h-ai/feedback API reference

<!-- translation: partial -->

[Chinese source](feedback.md) · [Configuration](../configuration/feedback.en.md) · [Data structures](../data/feedback.en.md)

## Quick start

Initialize Core, RelDB and private Storage before Feedback; initialize Reach too when using Reach notifications. This server example accepts trusted context and an idempotent submission ID. Check feedback.close() before releasing its dependencies.

```ts
import type { FeedbackContext } from '@h-ai/feedback'
import { feedback } from '@h-ai/feedback'

// 为 orders 初始化反馈服务。本地开发通过日志查看受理状态。
const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  notificationMode: 'console',
  adminUrl: 'https://app.example.test/admin/feedback',
})
if (!initialized.success)
  throw new Error(initialized.error.message)

export async function submitFeedback(context: FeedbackContext, submissionId: string) {
  // 受理成功返回含编号的报告。遇到失败时，调用方读取 error。
  return feedback.submit({ appId: 'orders', submissionId }, context)
}
```

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. The value helper checks HaiResult.success and preserves the original error. Use isolated test data and explicit cleanup.

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="service"></a>

### Prepare the service and collection jobs: `feedback`

The server accepts reports, collects evidence, notifies and expires records using application-provided shared dependencies and context.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedback.init` | Start the service with the selected dependencies | `config, options?` | `void` | `await feedback.init(config)` |
| `feedback.close` | Stop the worker and release service state | None | `void` | `await feedback.close()` |
| `feedback.runJobs` | Run available background jobs | None | `{ processed: number }` | `await feedback.runJobs()` |

#### Scenario: Prepare the service and collection jobs

```ts
const jobs = value(await feedback.runJobs()) // this round's processed count
```

The quick start provides init input. init has no business data; runJobs takes no input and reports this round; close stops this instance’s workers. Collection and webhook inputs and recovery are detailed below.

The output is successful HaiResult.data. Build context from the authenticated server identity and check success.

Finalization stops the current collection; it does not wait for all notifications to finish. Read attachments and exports through a server endpoint that checks the caller’s access.

[Detailed parameters and workflows](feedback.md#service)

<a id="reports"></a>

### Submit, query and process reports: `feedback`

Save the accepted report ID, then let authorized operators inspect evidence and change status with a version check.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedback.submit` | Accept a report | `input, context` | `FeedbackReport` | `await feedback.submit(reportInput, context)` |
| `feedback.list` | Filter and paginate reports | `input, context` | `PaginatedResult<FeedbackReport>` | `await feedback.list({ page: 1, pageSize: 20 }, context)` |
| `feedback.get` | Read report details | `id, context` | `FeedbackDetail` | `await feedback.get(reportId, context)` |
| `feedback.getEvidence` | Paginate diagnostic evidence | `input, context` | `PaginatedResult<FeedbackEvidence>` | `await feedback.getEvidence({ id: reportId, page: 1, pageSize: 20 }, context)` |
| `feedback.setStatus` | Update status with a version check | `input, context` | `FeedbackReport` | `await feedback.setStatus(statusUpdate, context)` |
| `feedback.retry` | Retry a selected failed job | `input, context` | `void` | `await feedback.retry(retryInput, context)` |

#### Scenario: Submit, query and process reports

Use a server-authenticated context authorized for create/read/process. submit supplies the ID; the freshly read detail supplies expectedVersion. Retry notifications only for a recoverable failure; acceptance does not mean a recipient read them.

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function processReport(context: FeedbackContext, submissionId: string) {
  const report = value(await feedback.submit({ appId: 'orders', submissionId }, context))
  const page = value(await feedback.list({ page: 1, pageSize: 20 }, context)) // authorized report page
  const detail = value(await feedback.get(report.id, context))
  const evidence = value(await feedback.getEvidence({ id: report.id, page: 1, pageSize: 20 }, context))
  const handled = value(await feedback.setStatus({ id: report.id, status: 'handled', expectedVersion: detail.report.version }, context))
  return { report, page, evidence, handled } // same report ID; handled has the new version
}

async function retryNotification(id: string, context: FeedbackContext) {
  return feedback.retry({ id, target: 'notify' }, context) // HaiResult<void>, caller checks success
}
```

<a id="evidence"></a>

### Append evidence and read attachments: `feedback`

Bind late evidence to the original report and principal; check attachment type, bytes and digest.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedback.appendEvidence` | Append diagnostic evidence | `input, context` | `{ acknowledged, evidenceRevision }` | `await feedback.appendEvidence(evidence, context)` |
| `feedback.completeCollection` | Complete an evidence collection | `input, context` | `FeedbackReport` | `await feedback.completeCollection({ id: reportId, revision: 1 }, context)` |
| `feedback.uploadAttachment` | Upload an authorized attachment | `input, context` | `FeedbackAttachment` | `await feedback.uploadAttachment(upload, context)` |
| `feedback.getAttachment` | Read an authorized attachment | `{ id, attachmentId }, context` | `FeedbackAttachmentData` | `await feedback.getAttachment({ id: reportId, attachmentId }, context)` |

#### Scenario: Append evidence and read attachments

Use the accepted report ID and matching trusted context. Evidence carries stable id/source/sequence. Upload input encodes a declared attachment; changing IDs cannot bypass declarations or quotas.

```ts
import type { FeedbackContext, FeedbackUploadInput } from '@h-ai/feedback'

async function appendMaterials(context: FeedbackContext, upload: FeedbackUploadInput) {
  const id = upload.id
  const receipt = value(await feedback.appendEvidence({ id, evidence: [{
    id: 'event-demo-1', source: 'browser', sequence: 1, kind: 'business',
    timestamp: Date.now(), data: { state: 'checkout-failed' },
  }] }, context)) // acknowledged IDs and evidenceRevision
  const attachment = value(await feedback.uploadAttachment(upload, context)) // saved attachment metadata
  const bytes = value(await feedback.getAttachment({ id, attachmentId: upload.attachmentId }, context))
  const completed = value(await feedback.completeCollection({ id, missing: [] }, context)) // updated report
  return { receipt, attachment, bytes, completed }
}
```

<a id="exports"></a>

### Export and inspect offline bundles: `feedback`

Core Workers compress and unpack ZIP bundles. Browser offline export uses a Web Worker. Archive paths, size limits and content digests follow the same validation rules.

Export creates a job at a fixed evidence revision. Retrieve ZIP only when ready; the viewer does not replay business effects.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedback.export` | Request an archive of a fixed evidence revision | `input, context` | `FeedbackJob` | `await feedback.export(exportInput, context)` |
| `feedback.getExport` | Read a completed export | `{ id, jobId }, context` | `FeedbackAttachmentData` | `await feedback.getExport({ id: reportId, jobId }, context)` |

#### Scenario: Export and inspect offline bundles

An authorized administrator supplies the report ID. export returns a job ID. This example checks once: pending generation returns CONFLICT, which may be queried again after a bounded wait. It is not an empty ZIP.

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function requestArchive(id: string, context: FeedbackContext) {
  const job = value(await feedback.export({ id }, context)) // persistent job receipt
  return feedback.getExport({ id, jobId: job.id }, context) // HaiResult<FeedbackAttachmentData>
}
```

<a id="browser-capture"></a>

### Capture browser evidence and drafts: `createFeedbackClient`

Create a client per product session, freeze evidence before opening UI and clean up previews and identity-owned drafts.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedbackClient.init` | Start browser evidence capture | `FeedbackClientConfig` | `Promise<HaiResult<void>>` | `await feedbackClient.init(config)` |
| `feedbackClient.prepare` | Prepare evidence for a report | `—` | `Promise<HaiResult<FeedbackDraft>>` | `await feedbackClient.prepare()` |
| `feedbackClient.captureScreenshot` | Capture a page screenshot | `attachmentId?: string` | `Promise<HaiResult<void>>` | `await feedbackClient.captureScreenshot()` |
| `feedbackClient.getDraft` | Read the current draft | `—` | `FeedbackDraft \| undefined` | `feedbackClient.getDraft()` |
| `feedbackClient.getView` | Read UI view state | `—` | `FeedbackDraftView` | `feedbackClient.getView()` |
| `feedbackClient.releasePreviews` | Release temporary preview resources | `—` | `void` | `feedbackClient.releasePreviews()` |
| `feedbackClient.addFiles` | Add user-selected files | `files: readonly File[], removedAttachmentIds?: readonly string[]` | `Promise<HaiResult<void>>` | `await feedbackClient.addFiles(files, removedAttachmentIds)` |
| `feedbackClient.annotate` | Apply annotations and redaction to an image | `attachmentId: string, FeedbackImageAnnotation` | `Promise<HaiResult<void>>` | `await feedbackClient.annotate(attachmentId, annotation)` |
| `feedbackClient.record` | Record an application fact | `kind, data; requestId?, errorId?` | `void` | `feedbackClient.record({ kind: 'business', data: { state: 'ready' } })` |
| `feedbackClient.submit` | Submit the current draft | `FeedbackClientSubmitInput?` | `Promise<HaiResult<FeedbackReport>>` | `await feedbackClient.submit({ description: 'Checkout failed' })` |
| `feedbackClient.flush` | Flush unacknowledged evidence | `—` | `Promise<HaiResult<void>>` | `await feedbackClient.flush()` |
| `feedbackClient.exportDraft` | Export a local diagnostic archive | `—` | `Promise<HaiResult<Uint8Array>>` | `await feedbackClient.exportDraft()` |
| `feedbackClient.saveDraft` | Save a local draft | `—` | `Promise<HaiResult<FeedbackSaveResult>>` | `await feedbackClient.saveDraft()` |
| `feedbackClient.pause` | Pause capture | `—` | `void` | `feedbackClient.pause()` |
| `feedbackClient.close` | Stop capture and release resources | `{ discard?: boolean }` | `Promise<void>` | `await feedbackClient.close({ discard: true })` |

#### Scenario: Capture browser evidence and drafts

prepare freezes the scene for review; submit durably submits it. Browser uploads and server collection may continue after acceptance.

![Feedback: capture, acceptance and later collection](../images/function-feedback-collection.en.svg)

The first send freezes the envelope; retries retain its ID and contents. Acceptance does not mean every attachment, business-evidence job or notification is complete. Inspect collection status. The independent webhook waits for complete/partial/failed collection and also runs after collection failure. Close releases recording, polling and previews.

```ts
import type { FeedbackClientConfig } from '@h-ai/feedback/client'
import { createFeedbackClient } from '@h-ai/feedback/client'
export async function capture(config: FeedbackClientConfig) {
  const feedbackClient = createFeedbackClient()
  value(await feedbackClient.init(config))
  try {
    feedbackClient.record({ kind: 'business', data: { state: 'ready' } })
    const draft = value(await feedbackClient.prepare())
    const current = feedbackClient.getDraft() // current draft or undefined
    const view = feedbackClient.getView() // preview URLs, evidence and missing materials
    value(await feedbackClient.captureScreenshot()) // refreshes the screenshot attachment
    value(await feedbackClient.addFiles([new File(['demo log'], 'demo.txt', { type: 'text/plain' })]))
    const receipt = value(await feedbackClient.submit({ description: 'Checkout failed' })) // accepted report ID/number
    value(await feedbackClient.flush()) // resumes pending evidence upload
    const archive = value(await feedbackClient.exportDraft()) // Uint8Array ZIP
    const saved = value(await feedbackClient.saveDraft()) // inspect saved.status; cancelled is not a saved file
    feedbackClient.releasePreviews() // releases generated object URLs
    feedbackClient.pause() // pauses active collection while retaining the draft
    return { draft, receipt, archive, saved }
  }
  finally {
    await feedbackClient.close({ discard: true })
  }
}
```

The application supplies config.actions through typed HTTP adapters. Screenshot, file, annotation, submission and saving inputs follow below. A successful save result can still mean user cancellation.

[Detailed parameters and workflows](feedback.md#browser-capture)

annotation comes from a user-selected image region, and attachmentId from that draft. Call before submit freezes the envelope. Success updates the draft; refresh getView afterward.

```ts
import type { FeedbackBrowserClient } from '@h-ai/feedback/client'

async function redactImage(client: FeedbackBrowserClient, attachmentId: string,
  annotation: Parameters<FeedbackBrowserClient['annotate']>[1]) {
  const changed = await client.annotate(attachmentId, annotation)
  if (!changed.success)
    return changed
  return client.getView() // refreshed preview and attachment state
}
```
