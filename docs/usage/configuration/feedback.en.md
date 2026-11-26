# @h-ai/feedback Configuration

[简体中文](feedback.md) · [日本語](feedback.ja.md)

## Configuration entry

The application reads its server-side `_feedback.yml`, initializes RelDB, and passes the result to `feedback.init(config)`. Initialization prepares the feedback tables and buffers recent Core logs with trusted user, scope, and request identifiers locally. See the [key limits](../function/feedback.en.md#feedback-limits) for capture and upload.

<a id="configuration-fields"></a>

## Configuration reference

| Path | Type | Required | Default | Purpose |
| --- | --- | --- | --- | --- |
| `appId` | String with 1–128 characters | Yes | None | Stable ID separating applications in a shared database. |

Each send allows up to five manual attachments and 5 MiB per file. Manual attachments and first-post diagnostics share 10 MiB. With encrypted transport, merge `apiContract.feedbackTransportRoutes(apiPrefix)` into the host’s `routePlaintextBytes` to allow 16 MiB of plaintext on those feedback paths. The host sets capacity for its other routes. [API reference](../function/feedback.en.md)

## Example

Put this in `config/_feedback.yml` for an order app and load it on the server that mounts the feedback API. Submissions for this app use the `orders` application scope.

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
```
