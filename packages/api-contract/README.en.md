# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

## Introduction

Public HTTP API contracts for hai-framework, with oRPC contract + Zod as the single source of truth.

## Core features

- `apiContract.iam`, `apiContract.storage`, `apiContract.ai`, `apiContract.payment`: domain contracts.
- `apiContract.create()`: compose enabled domain contracts for an application.
- `apiContract.route()`: define custom HTTP route metadata for reuse in application contracts.
- `apiContract.pathOf()`: read the authoritative business path from a contract procedure for middleware/client reuse.
- `apiContract.haiResultSchema()` / `apiContract.voidResultSchema` / `apiContract.paginatedSchema()`: shared DTO schema factories.
- Shared DTO schemas: every HTTP output is wrapped in `HaiResult<T>`.
- IAM token DTOs support httpOnly cookies: `refreshToken` may be absent from the response body and managed by the server through `Set-Cookie`.
- IAM `auth.currentUser` returns the user profile and the current server session's `roles` / `permissions`; clients need not persist a permission snapshot to restore a session.

Payment creation inputs and outputs accept WeChat `jsapi`, Alipay `h5`, and Stripe `h5` only; WeChat requires `userId` (openid). App, Native, mini-program, and other combinations fail validation. Alipay returns `{ gateway, fields }` page parameters; creation success does not establish payment. See [Payment](../payment/README.en.md) for client handling.

User listing accepts `sortBy` (username/email/displayName/enabled/createdAt) and `sortDirection` (asc/desc) for header sorting before pagination.

## Getting started

### Quick start

```ts
import { apiContract } from '@h-ai/api-contract'

export const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: false,
})
```

Custom application contracts also define routes through this package, without depending on `@h-ai/serv`:

```ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

export const appContract = {
  ping: apiContract
    .route({ method: 'POST', path: '/app/ping', operationId: 'app.ping', tags: ['app'] })
    .output(apiContract.haiResultSchema(z.object({ pong: z.boolean() }))),
}
```

### API contracts

For standalone contract declaration builds, this package re-exports the upstream public types `ContractProcedureBuilderWithInputOutput`, `ContractProcedureBuilderWithOutput`, and `Schema`, preserving inference for custom routes. Import explicit types from `@h-ai/api-contract` with `import type`; do not reference internal dependency installation paths.

```ts
import { apiContract } from '@h-ai/api-contract'

const myContract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

myContract.iam.auth.login
myContract.storage.presignedUrls.createUpload
myContract.ai.chats.createCompletion
```

`ai.chats.createCompletion` is `POST /ai/chats/completions` and returns a non-streaming `HaiResult<AiChatCompletionData>`. Its strict input rejects undeclared fields, including `stream`. Function tools preserve their complete nested JSON Schema and `strict`; choices support `auto`, `none`, `required`, or a supplied function name. Role-specific messages accept text for system/assistant/tool and images for user; tool results require a nonempty `tool_call_id`, and assistants require content or `tool_calls`. Applications authorize and execute tools and define a separate contract for streaming.

Clients call nested methods directly through `@h-ai/api-client`:

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
await apiClient.close()
```

Servers mount contracts through `@h-ai/serv`:

```ts
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'

const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
})
```

### API overview

- `apiContract.create(options)`: omit domains set to `false` / `undefined` and compose the application contract.
- `apiContract.route(routeConfig)`: define method/path/operationId/tags and other route metadata for a custom endpoint.
- `apiContract.pathOf(procedure)`: read the business path declared in `*-contract.ts`, without maintaining separate route constants.
- `apiContract.haiResultSchema(dataSchema)` / `apiContract.voidResultSchema` / `apiContract.paginatedSchema(itemSchema)`: shared DTO schema factories.
- `Iam*Schema` / `Storage*Schema` / `Ai*Schema` / `Payment*Schema`: inputs and data structures reused across APIs and layers.

Batch deletion via `storage.files.deleteMany` returns `{ deletedKeys, failures: [] }` on success. Failures preserve progress in `error.ext.deleteMany` (`failed / unknown / notAttempted`); HTTP 200 alone does not mean completion. See [Storage batch deletion](../storage/README.en.md#api-overview).

Write each business path directly in its `*-contract.ts` file. Inline output schemas used only once in `.output(...)`; schemas reused within the same contract file may be private constants, but must not be exported from schemas.

### Configuration

This package has no runtime configuration and does not read environment variables.

### Configuration driven authentication

Password login submits only `identifier` and `password`; `AuthPanel` maps the `LoginForm` field `username` to `identifier`. Server settings `session.maxAge` / `session.refreshTokenMaxAge` control session lifetimes. The login form has no per-login persistent-session option.

Agreements support configuration-loaded userAgreementMarkdown/privacyPolicyMarkdown and URLs. Markdown takes priority for the same agreement and is safely rendered in a modal.

IAM adds GET /auth/config and POST /auth/login/ldap, /auth/password-reset/request and /auth/password-reset/confirm. Public config is a schema whitelist; IamLdapLoginInput and IamPublicConfig are exported. Password lengths follow the configured IAM policy.

[完整 IAM 配置 / IAM configuration](../iam/README.en.md)

### Error handling

Contracts describe input and output structures only. Procedures express business errors with `HaiResult<T>`, so clients need not catch business exceptions.

## Input limits and HTTP capabilities

Object keys are limited to 1024 UTF-8 bytes and reject absolute paths, backslashes, control characters and dot segments. Each public HTTP batch delete accepts 1–1000 entries. `@h-ai/storage/schemas` exposes the shared browser-safe rules. Presign expiry is an integer from 1 to 604800 seconds (Node default 3600, HTTP default 900). Upload signing accepts only key/contentType/expiresIn; contentLength/maxSize/metadata/checksum are unsupported. Invalid input returns HTTP 400 and the typed client maps it to VALIDATION_FAILED. FileUpload limits guide file selection; applications must validate actual objects on the server. Node streaming/checksum/conditional-write options have no default HTTP endpoints. See the [capability and authorization matrix (Chinese)](../storage/README.md#存储输入约束与跨端能力).

## Feedback domain contract

`FeedbackJob.type` and `FeedbackRetryInput.target` support independent `webhook` jobs. Details expose status, attempts and safe error codes in jobs. Business collectors and callback settings belong to trusted server initialization, not HTTP input. Read text and ZIP/GZIP through existing APIs; see [feedback](../feedback/README.en.md).

`apiContract.feedback` exposes reports.submit/list/get/getEvidence/setStatus/retry/export/getExport/appendEvidence/completeCollection and attachments.upload/get. A minimal submission needs only submissionId/appId, without a description or exception. Client inputs cannot supply identities, permissions, S3 keys, or email recipients. `@h-ai/api-contract/feedback` provides the same schemas and types through an optional subpath.

Evidence append returns acknowledged/evidenceRevision; clients release only acknowledged blocks. setStatus requires expectedVersion. export pins the evidence revision, and getExport reads the completed bundle. Base64 attachments are limited to 5 MiB of original data; the server must still verify bytes, type, and SHA-256. Report.appVersion is the application version; Report.version is the concurrency counter.

```ts
import { apiContract, FeedbackSubmitInputSchema } from '@h-ai/api-contract'

const input = FeedbackSubmitInputSchema.parse({ submissionId: 'operation-1', appId: 'orders' })
const contract = apiContract.create({ feedback: apiContract.feedback })
const path = apiContract.pathOf(contract.feedback.reports.submit)
```

## Optional interactive challenges

IamCreateCaptchaInputSchema/IamCaptchaChallengeSchema define POST /auth/captcha purposes and public challenges. Interactive inputs accept optional captcha up to4096 characters; public configuration exposes only enabled, defaulting false. Schemas validate structure; IAM enforces expiry, purpose and one-use consumption server-side.

See policy, defaults and recovery boundaries in [IAM](../iam/README.en.md).

## Page exit session policy

`session.endOnPageHide` defaults to `false`. Hosts call `actions.bindPageExit({ enabled: config.session.endOnPageHide })` and invoke its returned cleanup on unmount; standard admin/H5/fullstack templates already bind it. A non-BFCache `pagehide` (including reload and full document navigation) makes a best effort POST to `/auth/session/close`, revoking the held access and related refresh through the existing CSRF/encrypted transport with `keepalive` and no automatic refresh. This response does not clear cookies/local credentials, avoiding a late old response overwriting a new login. Explicit logout still revokes and clears current credentials normally. Browsers may omit page exit requests; configure server `idleTimeout`/`absoluteTimeout` as appropriate. Immediate revocation on browser close is not guaranteed.

## Development and testing

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

Schemas, inferred types and composition helpers include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证). Schema samples use validated local data and do not prove provider execution.

## License

Apache-2.0
