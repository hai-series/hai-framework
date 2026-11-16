# Core data

[简体中文](core.md) · [日本語](core.ja.md) · [Core settings](../configuration/core.en.md) · [Configuration API](../function/core.en.md#config-api)

Core keeps the data below in the running process. It creates no database tables, Redis keys or disk cache. Each Node process loads the configuration it needs.

| Data                        | Meaning                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration               | Loaded values are stored under a name such as `core` and read using `core.config.get('core')`. The schema determines the defaults used during validation |
| Logs                        | Level, time and structured context. The logging backend controls output and retention                                                                    |
| Module runtime              | Tracks modules started by the application, their dependencies and their current status. A new process must start them again                              |
| Request context and results | Trace information shared within one request and the success value or error returned by an operation                                                      |
