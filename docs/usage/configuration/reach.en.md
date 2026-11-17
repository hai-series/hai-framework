# @h-ai/reach Configuration

<!-- translation: partial -->

[Chinese source](reach.md) · [Data structures](../data/reach.en.md) · [API reference](../function/reach.en.md)

Configure named providers and templates with `_reach.yml`. Use a durable database for queued delivery and keep provider credentials on the server.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: console
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `providers[]` | Required | Specify distinct names and one of `console`, `smtp`, `aliyun-sms` or `api`. |
| `templates[]` | Optional | Optionally associate name and body with a channel and subject. |
| `dnd` | Optional | Configure quiet hours and whether to defer or block delivery. |
| `queue` | Optional | Configure delivery retries. Retry only if the provider contract makes it safe. |

Additional options and workflow examples are available in the [Chinese reference](reach.md).
