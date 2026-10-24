# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[Framework](../../README.en.md)

## Introduction

Collect user feedback and diagnostic evidence, notify administrators, review reports and export offline bundles. Descriptions are optional. Reports and structured evidence use a relational database; screenshots and binary attachments use private object storage. A separate telemetry service is not required.

## Features

- Bounded browser/server logs, requests, errors, interactions, versions and allowed environment fields; up to 100 log records before and after an error by default.
- Transactional intake, stable submission/evidence identifiers, checksum validation, independent processing/collection/notification state and durable leased jobs.
- Existing Storage S3 and Reach SMTP implementations; this version requires Reach DND disabled so feedback owns the only notification outbox.
- Browser screenshots, irreversible masking, annotations, optional rrweb recording, retries and local fallback export; `FeedbackModal`, `FeedbackList` and `FeedbackDetail` in `@h-ai/ui`.
- Self-contained ZIP files, SHA-256 validation, an offline viewer and paginated evidence queries without production credentials.

## Getting started

Supply `appVersion/buildId/commit` from each actual browser or server artifact. A browser must retain its own identity; one SSR build shares its buildId across client and server output. Admin Console and generated base/API/fullstack projects inline these values. `hai build` creates internal metadata and passes it through Docker build arguments. Each target reads its own package.json version; a missing owning Git commit is `unknown`. Template `build-metadata.json` contains only these three nonsecret fields and matches the inlined values.

Initialize core and check initialization of reldb, storage and reach before feedback. Production requires shared PostgreSQL/MySQL, private S3 and a real SMTP provider. The application owns credentials and connection lifecycles. Local development providers and Console notifications are not proof of actual mail delivery.

The following snippet runs inside an async function after dependencies are initialized. Trusted server authentication and authorization must supply the context:

```ts
import { feedback } from '@h-ai/feedback'

const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  recipients: ['admin@example.test'],
  notificationProvider: 'email',
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

The complete client exposes `init(config)`, `prepare/submit/flush/record/getDraft/annotate/addFiles/exportDraft(input?)/close`. Connect form `onfileschange` to `addFiles` and refresh draft attachment previews so new images can be marked, masked or removed before submission. Use `data-feedback-action` for key interactions, `data-feedback-private` for sensitive content and `data-feedback-ignore` for the feedback UI itself. The first transmitted envelope is frozen; changing input during a retry returns a conflict and preserves the input for local export.

`addFiles` adds each batch atomically: all files must pass validation before merging. Any failure preserves existing attachments and missing markers without saving a partial batch. Successful concurrent batches preserve each other's files, with at most 20 merged attachments. If the draft changes or the first envelope freezes during reading, it returns `CONFLICT` without adding hidden uploads outside that envelope.

`annotate(id, annotation)` uses pixels in the original image after browser decoding. The UI's `FeedbackAnnotation.rect` uses 0–1 coordinates: after `Image.decode()`, multiply x/width by `naturalWidth` and y/height by `naturalHeight` before calling the SDK. Use these intrinsic dimensions rather than CSS dimensions so JPEG orientation matches SDK decoding. The creator releases object URLs when replaced or disposed.

The SDK owns the draft and updates it through methods such as `annotate` and `addFiles`. Svelte hosts should keep this reference in `$state.raw<FeedbackDraft>()` and refresh attachment views from `getDraft()` after successful operations. A deep `$state` proxy can retain cached image bytes after the SDK replaces them on the original draft.

A 5 MiB raw attachment needs about 6.67 MiB of Base64 plus JSON fields. The reference admin and new API/fullstack projects with feedback explicitly set the existing `kit.transport.maxPlaintextBytes` or `serv.transport.maxPlaintextBytes` to `8388608` (8 MiB); the framework default remains 1 MiB. Clients follow the server handshake unless a smaller explicit local budget rejects the request. An 8 MiB plaintext budget derives an encrypted body budget of `16,809,984` bytes; production adapter-node `BODY_SIZE_LIMIT` and outer proxies must match it, or the actual JSON size when transport encryption is disabled. Framework deployment derives these limits automatically without a new feedback setting. `hai add` preserves existing host configuration, so the host must adjust capacity explicitly.

`captureConsole` and `persistDraft` default to false. Persistence requires a host supplied, noncredential user/tenant `persistenceKey`. `keyScreenshots` defaults to true and follows the main `screenshot` switch; `maxKeyScreenshots` defaults to 3 with a hard limit of 5, and `keyScreenshotThrottleMs` defaults to 10000 milliseconds.

Automatic screenshots reconstruct the visible page from a redacted DOM clone through SVG foreignObject. Cross-origin images, iframe/video content and network fonts that are not ready may be missing. Browser or CSP failures are recorded as missing, and users can still attach images manually.

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

`FeedbackConfigSchema` validates appId, recipients, notificationProvider, adminUrl, collectionTimeoutMs, workerIntervalMs, leaseMs, maxAttempts, retentionDays, envAllowlist and attachment/evidence quotas. Explicit YAML environment mappings use `HAI_FEEDBACK_*`. Browser policy must not expose SMTP or S3 secrets.

Check `success` for every domain result. `HaiFeedbackError` covers initialization, configuration, scope, missing records, conflicts, quota and checksum failures. HTTP 200 and SMTP acceptance do not prove final business success or inbox delivery; uncertain sends can be repeated.

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
