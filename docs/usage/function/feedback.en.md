# @h-ai/feedback API reference

<!-- translation: partial -->

[Chinese source](feedback.md) · [Configuration](../configuration/feedback.en.md) · [Data structures](../data/feedback.en.md)

<a id="quick-start"></a>

Use the browser client to collect bounded evidence and submit a draft. The server assigns ownership and enforces quotas. Check results before downloading or exporting any attachment.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `feedback.submit`, `list`, `get`, `getEvidence`, `setStatus`, `retry` | Accept feedback, inspect authorized reports/evidence and manage processing. | `await feedback.get(context, id)` |
| `feedback.appendEvidence`, `completeCollection`, `uploadAttachment`, `getAttachment` | Collect evidence and manage attachment objects for the report. | `await feedback.completeCollection(input)` |
| `feedback.export`, `getExport`, `runJobs` | Schedule or retrieve an export and run queued work. | `await feedback.runJobs()` |
| `feedbackClient.init`, `prepare`, `captureScreenshot`, `getDraft`, `getView`, `releasePreviews` | Prepare the client, capture evidence, read the draft and release preview resources. | `feedbackClient.getDraft()` |
| `feedbackClient.addFiles`, `annotate`, `record`, `submit`, `flush`, `exportDraft`, `saveDraft`, `pause`, `close` | Manage draft content and evidence, submit or export it, and control collection. | `feedbackClient.close()` |

Additional options and workflow examples are available in the [Chinese reference](feedback.md).
