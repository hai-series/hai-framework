# Core data

[简体中文](core.md) · [日本語](core.ja.md) · [Core settings](../configuration/core.en.md) · [Configuration API](../function/core.en.md#config-api)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### Successful result

Structure: `success`.

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

Structure: `failure`.

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

Structure: `loaded configuration`.

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

Structure: `LogRecord`.

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

Order created occurred at the sample start; timestamp is Unix ms and request-42 is the link. The logging backend decides persistence.

### Diagnostic scope for one request

Structure: `RequestContext`.

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

Structure: `ModuleRuntime`.

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

## Field, storage and cleanup reference

Core keeps the data below in the running process. It creates no database tables, Redis keys or disk cache. Each Node process loads the configuration it needs.

| Data                        | Meaning                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration               | Loaded values are stored under a name such as `core` and read using `core.config.get('core')`. The schema determines the defaults used during validation |
| Logs                        | Level, time and structured context. The logging backend controls output and retention                                                                    |
| Module runtime              | Tracks modules started by the application, their dependencies and their current status. A new process must start them again                              |
| Request context and results | Trace information shared within one request and the success value or error returned by an operation                                                      |
