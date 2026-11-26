# @h-ai/feedback Configuration

[简体中文](feedback.md) · [日本語](feedback.ja.md)

## Configuration entry

The application reads its server-side `_feedback.yml`, initializes RelDB, and passes the result to `feedback.init(config)`. Restart the service to apply changes. Initialization prepares the feedback tables.

<a id="configuration-fields"></a>

## Configuration reference

| Path | Type | Required | Default | Purpose |
| --- | --- | --- | --- | --- |
| `appId` | String with 1–128 characters | Yes | None | Stable ID separating applications in a shared database. |

The contract allows five files per operation, up to 5 MiB each and 10 MiB combined. With encrypted transport, merge `apiContract.feedbackTransportRoutes(apiPrefix)` into the host’s `routePlaintextBytes` to allow 16 MiB of plaintext on those feedback paths. The host sets capacity for its other routes. [API reference](../function/feedback.en.md)

## Example

Put this in `config/_feedback.yml` for an order app and load it on the server that mounts the feedback API. Submissions for this app use the `orders` application scope.

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
```
