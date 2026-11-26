# @h-ai/feedback API Reference

[简体中文](feedback.md) · [日本語](feedback.ja.md) · [Configuration](../configuration/feedback.en.md) · [Data structures](../data/feedback.en.md)

<a id="feedback-workflow"></a>

## Complete workflow

Signed-in users and authorized staff exchange messages on the same report. Users see replies and outcomes under My Feedback. Staff use a shared list governed by permissions.

![A user submits a report, staff reply or request information, the user responds, and staff record the outcome](../images/function-feedback-collection.en.svg)

<a id="feedback-steps"></a>

## Step by step

1. **Submit.** Enter a description or choose images and files, review them, then submit. The report and its files are saved together as Pending.
2. **View.** Use My Feedback to open your reports and read the original material and conversation. Staff open them from the management list.
3. **Reply or request information.** Both sides can attach images and files to replies. Staff can also attach them to a request for more information. Sending the request moves the status to Awaiting user.
4. **Provide information.** Reply to the same report. A screenshot or file is sufficient. A reply from the author moves a report that is Awaiting user back to Pending.
5. **Record the outcome.** Staff can reply with the outcome and mark the report Handled. Ordinary replies preserve the current status. Authors can reply after handling, and staff can return a report to Pending.

<a id="feedback-limits"></a>

## Key limits

| Topic | Behavior |
| --- | --- |
| Upload timing | The server receives selected files when a user or staff member submits or sends a message. Initialization prepares the feedback tables. Application logs stay in the application's logging system. Screenshots and files in feedback are selected by the people sending them. |
| Per submission or message | Up to 5,000 characters and five files, with a maximum of 5 MiB per file and 10 MiB total. Supply text, a file, or both. |
| File access | Report and message lists carry file metadata. Anyone authorized to view the report can preview supported raster images or download attached files. |
| Permissions | Signed-in users with `feedback:create` can submit. Authors can view and reply to their own reports. `feedback:read` grants in-scope access to others' reports. Staff with read and `feedback:process` can act, reply, and request information. Resolve identity, scope, and permissions from a trusted server-side session. |
| Writes and retries | Each transaction saves text, files, and the status change associated with the action. The caller supplies a UUID for a new report or message. Retry after a lost response with the same ID to retrieve that record. |

<a id="module-dependencies"></a>

## Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| `@h-ai/reldb` | Store reports, messages, and files | Server | Initialize RelDB first |
| `@h-ai/kit` or `@h-ai/serv` | Mount authenticated feedback routes | HTTP service | Initialize Feedback, then give the adapter a trusted session resolver |
| `@h-ai/ui` | Form, list, and conversation views | Svelte UI | Pass authenticated API callbacks to the components |

## Quick start

Connect the database, then initialize Feedback. This example assumes `author` comes from the authenticated server-side session and has `feedback:create`.

```ts
import type { FeedbackContext } from '@h-ai/feedback'
import { feedback } from '@h-ai/feedback'

const started = await feedback.init({ appId: 'orders' })
if (!started.success)
  throw new Error(started.error.message)

export async function submitIssue(author: FeedbackContext, id: string) {
  // The client generates this UUID before submitting. Success returns the saved report.
  return feedback.submit({ id, body: 'The order list will not open' }, author)
}
```

In SvelteKit, mount `kit.createFeedbackHandler({ feedback, resolveContext })` as GET, POST, and PATCH. In Serv, mount `apiContract.feedback` with `serv.createFeedbackProcedures({ feedback, resolveContext })`. Merge `apiContract.feedbackTransportRoutes(apiPrefix)` into the encrypted transport configuration to allow up to 16 MiB of plaintext on submission, message, and attachment paths. Call `await feedback.close()` before closing RelDB. [Kit integration](kit.en.md#protocol-integrations) · [Configuration](../configuration/feedback.en.md)

<a id="api-reference"></a>

## Interface reference

<a id="service"></a>
<a id="reports"></a>

### View, reply to, and handle reports

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `feedback.init(config)` | Prepare database tables | `{ appId }` | `HaiResult<void>` | `await feedback.init({ appId: 'orders' })` |
| `feedback.close()` | Stop accepting calls and wait for in-flight requests | None | `HaiResult<void>` | `await feedback.close()` |
| `feedback.submit(input, context)` | File a report | UUID `id`, `body`, optional `attachments` | Saved report | `await feedback.submit({ id, body }, author)` |
| `feedback.listMine(query, context)` | List the author's reports | `status?`, `page?`, `pageSize?` | Page of reports | `await feedback.listMine({}, author)` |
| `feedback.list(query, context)` | List reports in the staff member's scope | Same as `listMine` | Page of reports | `await feedback.list({ status: 'pending' }, staff)` |
| `feedback.get(id, context)` | Get a report and its original files | Report UUID | Report details | `await feedback.get(id, author)` |
| `feedback.listMessages(query, context)` | Read the conversation, newest first | `id`, `page?`, `pageSize?`. Defaults to page 1 and 20 items | Page of messages and file metadata | `await feedback.listMessages({ id }, staff)` |
| `feedback.addMessage(input, context)` | Reply or request information | Report `id`, UUID `messageId`, `kind: 'reply' \| 'request_info'`, `body`, optional `attachments` | Saved message | `await feedback.addMessage({ id, messageId, kind: 'reply', body }, author)` |
| `feedback.setStatus(input, context)` | Mark Pending or Handled | `id`, `status: 'pending' \| 'handled'` | Updated report | `await feedback.setStatus({ id, status: 'handled' }, staff)` |
| `feedback.getAttachment(input, context)` | Read a single attachment | Report `id`, `attachmentId` | `name`, `contentType`, `dataBase64` | `await feedback.getAttachment({ id, attachmentId }, author)` |

Check `success` before reading the result. Unauthorized callers cannot read the report or its files. Report lists show the most recently active first. Each page holds up to 20 items.

#### Scenario: Ask the author for a screenshot

Within an async application function, use an existing report `id`, a trusted `staff` context with read and process permissions, and a caller-generated `messageId` that stays stable on retry.

```ts
const request = await feedback.addMessage({
  id,
  messageId,
  kind: 'request_info',
  body: 'Please attach a screenshot of the error.',
  attachments: [{ name: 'steps.txt', contentType: 'text/plain', dataBase64: 'U3RlcHM=' }],
}, staff)
if (!request.success)
  return request
return request.data
```

Each file input includes `name`, `contentType`, and its Base64 bytes. The author uses the same structure with `kind: 'reply'` to send images or files. They can read the request from My Feedback. Staff can refresh the report to read the new reply.
