# @h-ai/feedback API reference

<!-- translation: partial -->

[Chinese source](feedback.md) · [Configuration](../configuration/feedback.en.md) · [Data structures](../data/feedback.en.md)

## Quick start

Initialize Core, RelDB and private Storage before Feedback; initialize Reach too when using Reach notifications. This server example accepts trusted context and an idempotent submission ID. Check feedback.close() before releasing its dependencies.

```ts
import type { FeedbackContext } from '@h-ai/feedback'
import { feedback } from '@h-ai/feedback'

// 为 orders 初始化反馈服务。本地开发通过日志查看受理状态。
// Start orders 1.0.0 with console notifications and the admin URL below. Success has no data; initialization failure stops intake.
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
  // Submit for orders with the trusted context and caller's stable submissionId. Success returns a report ID and number; authorization or budget checks can fail.
  return feedback.submit({ appId: 'orders', submissionId }, context)
}
```

<a id="api-list"></a>

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
| `feedback.init` | Start the service with the selected dependencies | `config, options?` | `void` | `await feedback.init(config)` |
| `feedback.close` | Stop the worker and release service state | None | `void` | `await feedback.close()` |
| `feedback.runJobs` | Run available background jobs | None | `{ processed: number }` | `await feedback.runJobs()` |

#### Scenario: Prepare the service and collection jobs

```ts
// Fragment inside an async application function; return failed results to its caller.
// Process a round of feedback jobs without arguments. data.processed is the count for this round; delivery is tracked separately.
const jobsResult = await feedback.runJobs()
if (!jobsResult.success)
  return jobsResult
const jobs = jobsResult.data // this round's processed count
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
  // Create an independent capture client without arguments. Initialization enables the configured capture.
  const feedbackClient = createFeedbackClient()
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
