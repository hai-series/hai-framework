# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[Framework](../../README.en.md)

## Introduction

Collect user feedback and diagnostic evidence, notify administrators, review reports and export offline bundles. Descriptions are optional. Reports and structured evidence use a relational database; screenshots and binary attachments use private object storage. A separate telemetry service is not required.

## Features

- Bounded browser/server logs, requests, errors, interactions, versions and allowed environment fields; up to 100 log records before and after an error by default.
- Transactional intake, stable submission/evidence identifiers, checksum validation, independent processing/collection/notification state and durable leased jobs.
- `notificationMode` independently selects `disabled` (no notification jobs), `console` (metadata only by default, including production, without Reach/email; consoleContent: summary explicitly enables sanitized summaries), or `reach` (any configured provider and destinations; only this mode requires recipients). The default remains `reach` for existing configurations; generated projects explicitly select `console`. During Reach DND, the feedback outbox waits without adding a second delayed queue or changing other notification policy. Production Reach Console restrictions remain enforced. Sent means channel acceptance, not inbox delivery.
- Browser screenshots, irreversible masking, annotations, optional rrweb recording, retries and local fallback export; `FeedbackModal`, `FeedbackList` and `FeedbackDetail` in `@h-ai/ui`.
- Self-contained ZIP files, SHA-256 validation, an offline viewer and paginated evidence queries without production credentials.

## Getting started

Supply `appVersion/buildId/commit` from each actual browser or server artifact. A browser must retain its own identity; one SSR build shares its buildId across client and server output. Admin Console and generated base/API/fullstack projects inline these values. `hai build` creates internal metadata and passes it through Docker build arguments. Each target reads its own package.json version; a missing owning Git commit is `unknown`. Template `build-metadata.json` contains only these three nonsecret fields and matches the inlined values.

Initialize core, reldb and private storage before feedback; initialize Reach only for reach notifications. Production uses shared databases and private object storage. The host owns connection credentials.

The following snippet runs inside an async function after dependencies are initialized. Trusted server authentication and authorization must supply the context:

```ts
import { feedback } from '@h-ai/feedback'

const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  notificationMode: 'console',
  adminUrl: 'https://app.example.test/admin/feedback',
})
if (!initialized.success)
  return initialized
const context = { scopeId: 'tenant-1', userId: 'user-1', permissions: ['feedback:create'] }
const submitted = await feedback.submit({ appId: 'orders', submissionId: 'stable-client-operation' }, context)
if (!submitted.success)
  return submitted
return submitted
```

Check `await feedback.close()` before closing reach/storage/reldb. Retries retain the original submission ID. The report number confirms durable intake; evidence collection and mail have separate states.

Mount `createFeedbackProcedures({ feedback, resolveContext })` from `@h-ai/serv/features/feedback` with `apiContract.feedback`. The host resolves scope, user and permissions from trusted server state. Users can append only their own material; administrative read/process/reopen/export permissions and report scope are enforced for evidence and attachment access too.

Scope, user, application and evidence identifiers use exact string matching, including on MySQL with case/accent insensitive or trailing-space collations. Attachment IDs retain their original case and accept 1–128 characters of valid Unicode. ZIP paths use generated digests; consumers must read the manifest instead of deriving paths from IDs or display names. Unpaired surrogates are rejected before intake.

Use `createFeedbackClient()` from `/client`, then `init({ appId, actions })` with typed submit, appendEvidence, completeCollection and upload actions. Call `prepare()` before displaying the modal, submit for a receipt, and allow background flush to upload material. Close releases listeners and recorders. Cookie allowlists, persisted drafts and replay require explicit product policy; credential values are excluded.

Browser and server text redaction share rules for common credential keys, JSON/escaped JSON and Bearer/Basic authorization values. Stored evidence, API results and offline bundles retain the same redaction. The host should configure allowlists and sensitive DOM markers for application specific data.

`text/plain` attachments are redacted in full within the 5 MiB file limit, preserving safe content and trailing log entries without structured evidence's per-field truncation. Oversized original files are rejected before reading, and redacted output remains subject to the same attachment byte limit. JSON attachments and structured evidence retain field length, depth and count limits and may be trimmed; use plain text for complete logs. The same rules apply to pending attachments and files added to a local export after the first submission envelope is frozen.

The complete client exposes `init(config)`, `prepare/captureScreenshot(attachmentId?)/submit/flush/record/getDraft/getView/annotate/addFiles/exportDraft/saveDraft/close`. Connect form `onfileschange` to `addFiles` and refresh draft attachment previews so new images can be marked, masked or removed before submission. Use `data-feedback-action` for key interactions, `data-feedback-private` for sensitive content and `data-feedback-ignore` for the feedback UI itself. The first transmitted envelope is frozen; changing input during a retry returns a conflict and preserves the input for local export.

`addFiles` adds each batch atomically: all files must pass validation before merging. Any failure preserves existing attachments and missing markers without saving a partial batch. Successful concurrent batches preserve each other's files, with at most 20 merged attachments. If the draft changes or the first envelope freezes during reading, it returns `CONFLICT` without adding hidden uploads outside that envelope.

Local attachments support PNG/JPEG/WebP, WebM/MP4, TXT/LOG, JSON, PDF and ZIP/GZIP. Missing MIME types and `application/octet-stream` are inferred from supported extensions; common MIME aliases are normalized. The server still validates file bytes and checksums. Unsupported formats show a specific message. Screenshots preserve ordinary controls' backgrounds and borders while replacing their values with fixed mask characters. Passwords, `data-feedback-private`, `.rr-block` and `.rr-mask` remain fully covered. Only the capture clone changes; the original page and values remain intact.

`annotate(id, { ...rect, mode, coordinateSpace: 'ratio' })` accepts UI 0–1 coordinates directly. The SDK converts decoded intrinsic dimensions, including fractional/tiny selections, reverse dragging, edges and CSS scaling. Omitting coordinateSpace retains pixel coordinates. `getView()` owns and reuses preview URLs, releasing them on replacement, removal and close. Hosts need no image decoding or object URL bookkeeping.

Concurrent `init` returns `INIT_IN_PROGRESS`; `close` drains bounded screenshots before clearing the session. Closing during capture makes `prepare` fail without resurrecting a draft. An annotation that finishes after submission, close, image removal or another annotation returns `CONFLICT`, preserving submitted bytes and checksums.

The SDK owns the draft and updates it through methods such as `annotate` and `addFiles`. Svelte hosts should keep this reference in `$state.raw<FeedbackDraft>()` and refresh attachment views from `getDraft()` after successful operations. A deep `$state` proxy can retain cached image bytes after the SDK replaces them on the original draft.

`maxTotalBytes` defaults to 32 MiB (4–40 MiB). `feedback.budget` derives individual/total attachment, duplicate evidence and Base64/encrypted transport budgets from it. Defaults are 5 MiB per file, 22 MiB for attachments, 4 MiB/2000 evidence records, plus 2 MiB for history, metadata and the viewer. Submission validates declared totals; evidence updates enforce quotas atomically; processing history is limited to 256 KiB. The authenticated `reports.policy({})` supplies effective limits to the client and form. The reference admin, API/fullstack templates and deployment combine explicit host limits and feedback requirements with `resolveTransportBodyLimits(explicitLimit, { requiredPlaintextBytes: feedback.budget.maxTransportBytes })`, using the derived budget for transport, adapter-node and proxies. Insufficient explicit limits fail; only omitted/auto values derive capacity. Custom hosts combine limits during initialization; `hai add` preserves existing configuration.

`captureConsole` and `persistDraft` default to false. Persistence requires a host supplied, noncredential user/tenant `persistenceKey`. `keyScreenshots` defaults to true and follows the main `screenshot` switch; `maxKeyScreenshots` defaults to 3 with a hard limit of 5, and `keyScreenshotThrottleMs` defaults to 10000 milliseconds.

Automatic screenshots reconstruct the visible page from a redacted DOM clone through SVG foreignObject. Cross-origin images, iframe/video content and network fonts that are not ready may be missing. Browser or CSP failures are recorded as missing, and users can still attach images manually.

### Feedback capture and delivery checks

The current screenshot is shown first. `captureScreenshot(attachmentId?)` adds the visible page or replaces that attachment. Connect `FeedbackModal.oncapture` to it: the modal hides while the user navigates and chooses “Capture this page”, retaining form input. `FeedbackForm.evidence` exposes sanitized logs, requests, environment facts and replay events; use `evidenceSummary` for missing-material notes. Browser facts come from the actual URL (without query/hash), viewport, language and compiled build. Server environment variables include only non-credential `envAllowlist` keys; absent values are null.

Supported browsers offer “Record screen → Start recording”: users select a tab/window and record silent video for up to 60 seconds / 5 MiB at a low frame rate and bitrate. Stopping sharing, cancellation, timeout and component destruction release the stream. Video contains the selected raw screen without automatic masking; users can preview or remove it before sending. WebM/MP4 use the same private storage, checksum and 5 MiB attachment limit. Browsers without capture support can attach video files.

The reference admin console and feedback-enabled fullstack templates explicitly enable `replay: true`; the SDK default remains false. Administrators use the detail “Page replay” tab to play or seek captured interactions. The host `onreplay` must load every page of `kind: replay` events. An empty recording has an explicit message; videos play under activity and attachments. After saving feedback locally, `hai feedback view <zip>` opens screenshots, video and replay. Local bundles mark server evidence that has not been obtained.

`saveDraft(input?)` exports and saves through Web download, the Tauri save dialog or Capacitor cache/native sharing. Cancellation returns `status: 'cancelled'`; failures remain failures. Native plugins are optional peers and are configured by generated App/Desktop projects. Custom hosts install the corresponding plugins. `createFeedbackReview(typedClient.feedback.reports)` provides `loadReplay(id)` and cancellable `exportReport(id)`. On logout call `review.close()` and `client.close({ discard: true })` to stop collection/polling and clear previews and persisted drafts.

Build identities share a 128-character limit. Invalid explicit HAI_BUILD_ID/HAI_BUILD_COMMIT fail the build without echoing values. Default redaction covers verificationCode, otpCode and common verification fields without hiding every business code.

When server policy is unavailable, bounded local capture/export remain available with server-policy-unavailable. Online submission revalidates policy first. addFiles(files, removedAttachmentIds?) atomically removes deleted files while staging new ones so displayed and effective capacity agree.

Console/disabled do not require the Reach package. Reach mode explicitly installs and initializes the @h-ai/reach optional peer. Credential sends expose generated receiptId only; provider messageId is neither persisted nor returned.

Web clients never resolve or install native plugins. Custom hosts import saveTauriFeedbackFile from @h-ai/feedback/tauri or saveCapacitorFeedbackFile from @h-ai/feedback/capacitor and call configureFeedbackSaving(saver) at startup. Generated hosts already configure this; business code does not handle native file lifecycles.

### Business evidence extension

Register a server callback with `feedback.init(config, { collectEvidence })`. A durable `collect` job invokes it after intake commits and awaits synchronous or asynchronous results without holding up submission. All instances handling the same appId must register the same callback so jobs can recover after restart or takeover.

This example runs after dependencies initialize. The host supplies `FeedbackConfigInput` and prepares a sanitized `diagnostics/sanitized-logs.zip`; the callback can instead await the application's own diagnostic service:

```ts
import type { FeedbackConfigInput } from '@h-ai/feedback'
import { readFile } from 'node:fs/promises'
import { feedback } from '@h-ai/feedback'

async function startFeedback(config: FeedbackConfigInput) {
  const result = await feedback.init(config, {
    collectEvidence: async ({ report, signal }) => ({
      text: `Diagnostics for ${report.number}`,
      data: { businessSystem: 'orders', scopeId: report.scopeId },
      attachments: [{
        id: 'business-logs',
        name: 'business-logs.zip',
        contentType: 'application/zip',
        bytes: await readFile('diagnostics/sanitized-logs.zip', { signal }),
      }],
    }),
  })
  if (!result.success)
    return result
  return result
}
```

Text and structured data become `source: server:business`, `kind: business` evidence, paginated in the Business evidence tab. Associated files are downloadable and included in offline exports. Existing sanitization, field truncation and evidence budgets apply; use `text/plain` attachments for complete logs with full-text redaction. ZIP/GZIP bytes are stored unchanged after signature, size and SHA-256 checks; archives are never unpacked, executed or internally redacted. The application must sanitize their contents before compression. Browser `addFiles` also accepts ZIP, GZ and TGZ.

`businessCollectionTimeoutMs` defaults to 30000ms (1–300000). Timeout and shutdown abort the supplied signal and stop waiting; pass it into asynchronous work. Throws, invalid files, capacity limits and storage failures retry the collect job up to `maxAttempts`, then expose `collectionStatus: failed`; administrators can call `retry({ id, target: 'collect' }, context)`. Callbacks may run again, so use report.id for external idempotency. Files are stored first; evidence and attachment metadata publish in one leased transaction, and a committed success marker prevents recollection. Stable attachment IDs contain 1–100 characters and receive a `server:business:` prefix. All files share the existing 20-item, per-file and total byte budgets.

### Webhook callback

A trusted `webhookUrl` creates a separate durable webhook job in the intake transaction. It waits for collection to reach complete/partial/failed, then sends `POST application/json` with `feedback.created`, including when collection failed. It is independent of Reach, notificationMode and DND.

```yaml
businessCollectionTimeoutMs: 30000
webhookUrl: ${HAI_FEEDBACK_WEBHOOKURL:}
webhookSecret: ${HAI_FEEDBACK_WEBHOOKSECRET:}
webhookTimeoutMs: ${HAI_FEEDBACK_WEBHOOKTIMEOUTMS:10000}
```

An empty URL disables delivery. Only HTTP(S) URLs without user credentials or fragments are accepted, and redirects are not followed. Configure destinations through trusted server deployment settings; internal URLs support internal integrations. Keep secrets in private server environment settings, never PUBLIC_ variables. The request timeout defaults to 10000ms (1–60000). Non-2xx responses, redirects, network errors and timeouts retry with exponential backoff from 1s to 60s, up to maxAttempts (default 5).

`FeedbackWebhookEvent` contains `event/eventId/createdAt/report/evidence/detailUrl?`. Evidence contains its revision, business collection success and attachment metadata, without file bytes, storage keys, configuration secrets or full logs. Read contents through authenticated APIs or an offline bundle. The first delivery freezes the payload; retries and restarts reuse its body and `Idempotency-Key: eventId`. Receivers should persist and deduplicate eventId before returning 2xx. Delivery is at least once: lost acknowledgements can cause duplicates. Changing the configured URL causes older jobs to fail rather than redirect to a different destination; drain them before switching.

Requests include `X-Hai-Feedback-Event` and `X-Hai-Feedback-Timestamp` (Unix seconds). With a secret, `X-Hai-Feedback-Signature: sha256=<hex>` is HMAC-SHA256 of `timestamp + '.' + raw request body`. Verify raw bytes, compare in constant time and enforce timestamp tolerance plus eventId deduplication. `get().jobs` exposes status, attempts and safe lastError codes. Admin Console and Fullstack details show Webhook status and administrator retry; programmatic retry uses `retry({ id, target: 'webhook' }, context)`. It is tracked separately from notificationStatus; success means the endpoint returned 2xx.

### Reviewing and exporting

`list/get/getEvidence` return scoped reports, details and paginated evidence. `setStatus({ id, status, expectedVersion }, context)` protects processing/reopening against concurrent overwrites. `retry` queues recoverable operations. `export` fixes an evidence revision; `getExport` downloads the completed ZIP. Missing/truncated evidence is explicit. Replay displays recorded state and does not reexecute business behavior.

`getExport` first checks scope and `feedback:export` permission. A `pending/running` job with a valid snapshot returns `CONFLICT` (409, generating); clients should poll only this status with a bounded wait. A `failed` job returns `OPERATION_FAILED` (500); show the failure and let an administrator decide whether to `retry`. Missing jobs, jobs belonging to another report and expired unfinished snapshots return `NOT_FOUND` (404); missing export permission returns `FORBIDDEN` (403). Call `export` again for the current revision after its generation snapshot expires. Completed ZIP downloads retain storage-read and checksum checks.

An `errorId` query uses the anchor's source, request and sequence to select up to 100 log records before and after it. Overlapping errors keep separate anchors regardless of a record's first error assignment. Retention deletes reports, evidence, attachments, history and jobs containing snapshots, and removes orphan upload attempts by object prefix. Only a prefix/24-hour cutoff tombstone remains temporarily to sweep late objects before deletion; cleanup failures continue retrying.

### Offline commands

```sh
hai feedback summary feedback-FB-1.zip
hai feedback inspect feedback-FB-1.zip
hai feedback evidence feedback-FB-1.zip --request-id req-1 --page 1 --page-size 20
hai feedback view feedback-FB-1.zip
```

The viewer binds only to loopback, uses a random URL and trusted built-in viewer resources, and closes on Ctrl+C. `/bundle` also exports create/read/summarize/query functions without server initialization or production connectivity.

### Configuration and errors

`FeedbackConfigSchema` validates appId, notificationMode, recipients, maxTotalBytes, notificationProvider, adminUrl, collectionTimeoutMs, workerIntervalMs, leaseMs, maxAttempts, retentionDays, envAllowlist and attachment/evidence quotas. Explicit YAML environment mappings use `HAI_FEEDBACK_*`. Browser policy must not expose SMTP or S3 secrets.

Check `success` for every domain result. `HaiFeedbackError` covers initialization, configuration, scope, missing records, conflicts, quota and checksum failures. HTTP 200 and SMTP acceptance do not prove final business success or inbox delivery; uncertain sends can be repeated.

### Privacy boundary of console notifications

`consoleContent` defaults to `metadata`: report number, application/version/build identity and collection status only. Descriptions, summaries, attachments, evidence, notification bodies and destinations are excluded. Explicit `summary` enables a generically sanitized summary; generic redaction cannot identify every business secret. Reach is not required and disabled/reach channel semantics are unchanged. Existing console configurations become metadata-only by default on upgrade.

Combine transport requirements with the host limit through `resolveTransportBodyLimits(configuredLimit, { requiredPlaintextBytes: feedback.budget.maxTransportBytes })`, instead of overwriting it. An insufficient explicit limit is a configuration conflict; omitted values or Serv/Kit auto derive capacity. Attachment and evidence limits remain independent.

## Development and testing

```sh
pnpm --filter @h-ai/feedback typecheck
pnpm --filter @h-ai/feedback lint
pnpm --filter @h-ai/feedback build
pnpm --filter @h-ai/feedback test
pnpm --filter @h-ai/cli test:scaffold-gates
# After the builds above, verify the built viewer and replay in real Chromium without rebuilding dist.
node packages/cli/tests/feedback-offline-browser.mjs
```

Validate browser flows, SQLite/PG/MySQL, real S3 and SMTP, multi-instance recovery and disconnected bundle viewing separately. Build/mock success cannot replace those checks. See the [usage guide](../../docs/usage/README.en.md) for application integration and deployment.

## License

Apache-2.0
