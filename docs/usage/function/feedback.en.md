# @h-ai/feedback API Reference

[简体中文](feedback.md) · [日本語](feedback.ja.md) · [Configuration](../configuration/feedback.en.md) · [Data structures](../data/feedback.en.md)

<a id="feedback-workflow"></a>

## Complete workflow

Signed-in users and authorized staff exchange messages on the same report. Users see replies and outcomes under My Feedback. Staff use a shared list governed by permissions.

![A user submits a report, staff reply or request information, the user responds, and staff record the outcome](../images/function-feedback-collection.en.svg)

<a id="feedback-steps"></a>

## Step by step

1. **Review diagnostics and submit.** Open Feedback on a signed-in page to review the current screenshot and the preceding browser logs and operation replay. Retake the screenshot, remove material, or start a silent recording. Add a description and any files, choose the report diagnostics, and optionally include server logs. The report and its material are saved together as Pending.
2. **View.** Open your report under My Feedback. The first post offers a screenshot preview, logs, replay, and video playback. Staff open the same report from the shared list.
3. **Reply or request information.** Both sides can attach images and files to replies. Staff can also attach them to a request for more information. Sending the request moves the status to Awaiting user.
4. **Provide information.** Reply to the same report. A screenshot or file is sufficient. A reply from the author moves a report that is Awaiting user back to Pending.
5. **Record the outcome.** Staff can reply with the outcome and mark the report Handled. Ordinary replies preserve the current status. Authors can reply after handling, and staff can return a report to Pending.

<a id="feedback-limits"></a>

## Key limits

| Topic | Behavior |
| --- | --- |
| Collection and upload | After sign-in, the browser keeps recent logs and replay in memory for the current page. Opening Feedback freezes the preceding material and tries to capture the visible page. The browser sends the retained material with the first post. Replies and information requests send the text, images, and files selected for that message. |
| Browser logs and replay | The lookback is up to 5 minutes. Browser logs include bounded Core logs and uncaught error summaries, up to 1,000 entries and 512 KiB. Replay is capped at 2 MiB. It masks page text and input values and excludes frames and marked private areas. Reloading the page starts a new browser buffer. |
| Server logs | When opted in, the submit request reads up to 5 minutes of the same user's Core request logs in the current scope and service instance, up to 1,000 entries and 512 KiB. The host supplies trusted `scopeId`, `userId`, and `requestId` context. A restart or different instance can leave those logs unavailable. |
| Screenshot and recording | A screenshot masks form values and `data-feedback-private` areas. To record, the user grants screen sharing and selects a surface. Video is recorded without audio for up to 60 seconds and 5 MiB. Review the visible content before submitting. |
| Per submission | Up to 5,000 characters and five manually selected files. Each file is capped at 5 MiB. First-post diagnostics and manual files share 10 MiB. Reply and request attachments also share 10 MiB. Supply text, a file, or material that can be saved. |
| File access | Lists carry metadata. Users authorized to view a report can retrieve its files, logs, and replay on demand. |
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

<a id="feedback-capture"></a>

### First-post diagnostics

Mount `FeedbackModal` on the signed-in page. Pass a stable session or user identifier as `captureKey`, change it when the account changes, and unmount after sign-out. The component prepares diagnostics when the author opens the form and sends them through the host's existing `onsubmit` callback. Custom clients can pass these fields to `reports.submit` as `capture`.

| Field | Purpose |
| --- | --- |
| `screenshot?` | Automatic or retaken screenshot of the current page. |
| `browserLogs?` | Recent browser logs as JSON. |
| `replay?` | Masked operation replay with a full snapshot, as JSON. |
| `recording?` | WebM or MP4 video recorded with user permission. |
| `includeServerLogs?` | Set to `true` to include available Core logs matching the authenticated submitter. |

The first four fields use the normal `name`, `contentType`, and `dataBase64` file format. First-post attachment metadata distinguishes them by `kind`. The host supplies `scopeId` in its trusted business request context, using the same value for feedback authorization. For example, Kit can run `core.context.run({ scopeId: 'orders' }, next)`, and Serv can return the scope from `createContext`.

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
| `feedback.submit(input, context)` | File a report | UUID `id`, `body`, optional `attachments` and `capture` | Saved report | `await feedback.submit({ id, body }, author)` |
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
