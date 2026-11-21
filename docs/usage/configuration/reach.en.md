# @h-ai/reach Configuration

<!-- translation: partial -->

[Chinese source](reach.md) · [Data structures](../data/reach.en.md) · [API reference](../function/reach.en.md)

Configure named providers and templates with `_reach.yml`. Use a durable database for queued delivery and keep provider credentials on the server.

## Configuration examples

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: console
```

### Send order emails through SMTP

Put this in `config/_reach.yml`. Callers select this mail service by the provider name `email`. Port 465 uses TLS. Supply credentials through the private server environment, and use a sender address allowed by your mail service.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: smtp
    host: smtp.example.com
    port: 465
    secure: true
    user: ${SMTP_USER}
    pass: ${SMTP_PASSWORD}
    from: orders@example.com
```

### Send notifications through an HTTP gateway

The backend posts to the gateway and waits at most five seconds. If the gateway needs a custom body, supply `gatewayHooks` during initialization; configuration files do not define JavaScript callbacks. Use a trusted service address rather than one supplied by an end user.

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: company-notify
    type: api
    url: https://notify.example.com/messages
    method: POST
    timeout: 5000
    headers:
      X-Api-Key: ${NOTIFY_API_KEY}
```

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `providers[]` | Required | Specify distinct names and one of `console`, `smtp`, `aliyun-sms` or `api`. |
| `templates[]` | Optional | Optionally associate name and body with a channel and subject. |
| `dnd` | Optional | Configure quiet hours and whether to defer or block delivery. |
| `queue` | Optional | Configure delivery retries. Retry only if the provider contract makes it safe. |

Still untranslated: the full provider fields and queue, retry and quiet-hours settings. Read the [Chinese source section](reach.md#configuration-fields).
