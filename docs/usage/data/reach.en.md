# @h-ai/reach Data structures

[Chinese source](reach.md) · [Configuration](../configuration/reach.en.md) · [API reference](../function/reach.en.md)

RelDB owns the delivery queue and templates. A terminal unknown outcome requires confirmation before requeueing.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_reach_send_log` | Auto-increment `id` and nullable unique `queue_id`. Provider, recipient, subject/body, template, JSON variables and extras. Status, message ID, processing owner, lease end, last failure, retry safety and timestamps. Defaults: attempts 0, limit 5, base delay 60000 ms, maximum 3600000 ms, next attempt 0. |
| `hai_reach_template` | Auto-increment ID, unique name, provider scope, subject/body and timestamps. |
| `__lock:hai:reach:flush-pending` | Optional Cache lease, 300 seconds. It reduces duplicate polling; the RelDB row owns delivery permission. |
