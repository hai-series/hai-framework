# @h-ai/feedback API reference

<!-- translation: partial -->

[Chinese source](feedback.md) · [Configuration](../configuration/feedback.en.md) · [Data structures](../data/feedback.en.md)

<a id="quick-start"></a>

## Quick start

Use the browser client to collect bounded evidence and submit a draft. The server assigns ownership and enforces quotas. Check results before downloading or exporting any attachment.

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

<a id="api-reference"></a>

## API list

The output is successful HaiResult.data. Build context from the authenticated server identity and check success.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `feedback.init` | Start the service with the selected dependencies | `config, options?` | `void` | `await feedback.init(config)` |
| `feedback.close` | Stop the worker and release service state | None | `void` | `await feedback.close()` |
| `feedback.submit` | Accept a scoped report and queue background work | `input, context` | `FeedbackReport` | `await feedback.submit(reportInput, context)` |
| `feedback.list` | Read a filtered page of reports | `input, context` | `PaginatedResult<FeedbackReport>` | `await feedback.list({ page: 1, pageSize: 20 }, context)` |
| `feedback.get` | Read the report with attachments, history and jobs | `id, context` | `FeedbackDetail` | `await feedback.get(reportId, context)` |
| `feedback.getEvidence` | Read a page of evidence for one report | `input, context` | `PaginatedResult<FeedbackEvidence>` | `await feedback.getEvidence({ id: reportId, page: 1, pageSize: 20 }, context)` |
| `feedback.setStatus` | Update report processing state | `input, context` | `FeedbackReport` | `await feedback.setStatus(statusUpdate, context)` |
| `feedback.appendEvidence` | Store evidence and return the acknowledged IDs | `input, context` | `{ acknowledged, evidenceRevision }` | `await feedback.appendEvidence(evidence, context)` |
| `feedback.completeCollection` | Finish collecting the current revision | `input, context` | `FeedbackReport` | `await feedback.completeCollection({ id: reportId, revision: 1 }, context)` |
| `feedback.uploadAttachment` | Save authorized attachment bytes | `input, context` | `FeedbackAttachment` | `await feedback.uploadAttachment(upload, context)` |
| `feedback.getAttachment` | Read a private attachment in scope | `{ id, attachmentId }, context` | `FeedbackAttachmentData` | `await feedback.getAttachment({ id: reportId, attachmentId }, context)` |
| `feedback.retry` | Queue a permitted failed job again | `input, context` | `void` | `await feedback.retry(retryInput, context)` |
| `feedback.export` | Queue or reuse an export for a report revision | `input, context` | `FeedbackJob` | `await feedback.export(exportInput, context)` |
| `feedback.getExport` | Read a finished export before it expires | `{ id, jobId }, context` | `FeedbackAttachmentData` | `await feedback.getExport({ id: reportId, jobId }, context)` |
| `feedback.runJobs` | Run one worker pass on demand | None | `{ processed: number }` | `await feedback.runJobs()` |

Finalization stops the current collection; it does not wait for all notifications to finish. Read attachments and exports through a server endpoint that checks the caller’s access.

Still untranslated: the evidence collection, private attachment, export and retry workflows. Read the [Chinese source section](feedback.md#api-reference).
