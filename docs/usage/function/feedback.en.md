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

| API | Input and result | Example |
| --- | --- | --- |
| `feedback.submit`, `list`, `get`, `getEvidence`, `setStatus`, `retry` | Accept feedback, inspect authorized reports/evidence and manage processing. | `await feedback.get(id, context)` |
| `feedback.appendEvidence`, `completeCollection`, `uploadAttachment`, `getAttachment` | Collect evidence and manage attachment objects for the report. | `await feedback.completeCollection({ id }, context)` |
| `feedback.export`, `getExport`, `runJobs` | Schedule or retrieve an export and run queued work. | `await feedback.runJobs()` |
| `feedbackClient.init`, `prepare`, `captureScreenshot`, `getDraft`, `getView`, `releasePreviews` | Prepare the client, capture evidence, read the draft and release preview resources. | `feedbackClient.getDraft()` |
| `feedbackClient.addFiles`, `annotate`, `record`, `submit`, `flush`, `exportDraft`, `saveDraft`, `pause`, `close` | Manage draft content and evidence, submit or export it, and control collection. | `feedbackClient.close()` |

Additional options and workflow examples are available in the [Chinese reference](feedback.md).
