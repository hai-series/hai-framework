# Core data

[简体中文](core.md) · [日本語](core.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/core.en.md) · [API reference](../function/core.en.md)

A server request can use loaded configuration, shared trace information, and operation results. Core manages these runtime values in the process. The logging backend controls where records are written.

<a id="runtime-data"></a>

## In-process data

Core keeps the data below in the running process. It creates no database tables, Redis keys or disk cache. Each Node process loads the configuration it needs.

| Data                        | Meaning                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration               | Loaded values are stored under a name such as `core` and read using `core.config.get('core')`. The schema determines the defaults used during validation |
| Logs                        | Level, time and structured context. The logging backend controls output and retention                                                                    |
| Module runtime              | Tracks modules started by the application, their dependencies and their current status. A new process must start them again                              |
| Request context and results | Trace information shared within one request and the success value or error returned by an operation                                                      |

<a id="example-data"></a>

### Successful result

Callers use this result to read a completed operation.

```json
{
  "success": true,
  "data": {
    "id": "order-42",
    "status": "created"
  }
}
```

Order order-42 was created; data contains its business result.

### Failed result

A failure tells callers to stop or show an error.

```json
{
  "success": false,
  "error": {
    "code": "hai:core:001",
    "message": "Example failure",
    "httpStatus": 500
  }
}
```

When success is false, read error; the sample message is illustrative, while real messages are localized.

### Settings loaded in this process

Read validated settings from memory instead of disk on every operation.

```json
{
  "name": "Orders",
  "env": "development",
  "defaultLocale": "zh-CN"
}
```

This is part of core settings. Reloading is application-controlled; another process does not share this memory automatically.

### A traceable log entry

Record an event with a request ID connecting related messages.

```json
{
  "timestamp": 1794873600000,
  "level": "info",
  "message": "Order created",
  "context": {
    "requestId": "request-42"
  }
}
```

This log records the order creation. `timestamp` is Unix milliseconds, corresponding to 2026-11-17 00:00 UTC. Use `request-42` to find other logs from the same request. The logging backend decides whether to write logs to a file.

### Diagnostic scope for one request

Carry the same request and scope through service steps without manually threading log IDs.

```json
{
  "requestId": "request-42",
  "scopeId": "team-1",
  "userId": "user-42"
}
```

This request is for user-42 in team-1. Correlation data contains no token and grants no permission by itself.

### Whether application dependencies started

Start dependencies in order and close in reverse, avoiding duplicate startup or premature use.

```json
{
  "isInitialized": true
}
```

Only isInitialized:true is shown; start/close are functions omitted from JSON. This is not database state.

### Worker pool and exit state

Jobs and replies belong to their in-process pool. The owner closes the pool to release queued and running work. The following result is from a dedicated browser thread stopped by its owner. Node reports its thread exit code in `code`, with the thread error in `error` when available.

```json
{
  "code": 0
}
```
