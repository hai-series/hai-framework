# core 数据结构

[English](core.en.md) · [日本語](core.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/core.md) · [功能说明](../function/core.md)

<a id="example-data"></a>

## 这些数据用来做什么

先看用途和例子，再按需查后面的字段与保存规则。例子中的编号和业务内容是虚构的，敏感值已隐藏。时间以 2026-11-17 00:00 UTC 为起点，具体单位在说明中标明。

### 成功结果

对应结构：`success`。

调用方用它知道操作已完成，并读取业务数据。

```json
{
  "success": true,
  "data": {
    "id": "order-42",
    "status": "created"
  }
}
```

示例表示订单 order-42 已创建，成功数据放在 data 中。

### 失败结果

对应结构：`failure`。

操作失败时返回错误信息，让调用方决定显示提示还是中止后续步骤。

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

success 为 false 时只能读取 error；示例 message 是说明文字，实际使用本地化消息。

### 本进程已读入的配置

对应结构：`loaded configuration`。

启动时读入并校验文件后，应用从内存取得这些设置，不必每次访问磁盘。

```json
{
  "name": "Orders",
  "env": "development",
  "defaultLocale": "zh-CN"
}
```

示例是 core 配置的一部分；修改文件后是否重载由应用决定，另一个进程不会自动共享这份内存。

### 一条可追查的日志

对应结构：`LogRecord`。

记录发生了什么，并带请求编号把同一请求的多条日志串起来。

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

Order created 发生在示例起点，timestamp 是 Unix 毫秒，request-42 用于关联；日志是否落盘由日志后端决定。

### 同一次请求共用的排查信息

对应结构：`RequestContext`。

让多个服务步骤沿用同一请求和业务范围，日志不必手工逐层传编号。

```json
{
  "requestId": "request-42",
  "scopeId": "team-1",
  "userId": "user-42"
}
```

请求属于 team-1 的 user-42；这里只传可信关联信息，不包含访问令牌，也不自行授予权限。

### 应用依赖是否已启动

对应结构：`ModuleRuntime`。

运行时按顺序启动依赖，关闭时反序释放；状态用来阻止重复启动或使用未就绪模块。

```json
{
  "isInitialized": true
}
```

只展示 isInitialized:true 这个状态，表示启动已完成；start/close 是函数，没有写进 JSON，也不会持久化到数据库。

### 线程池和退出结果

任务和结果随池留在当前进程内。调用方持有池，关闭后释放等待和运行中的任务。以下是独占浏览器线程由调用方终止后的退出结果。Node 的 `code` 来自线程退出事件，线程错误可通过退出结果中的 `error` 读取。

```json
{
  "code": 0
}
```

## 字段、存储与清理参考

### 数据库与缓存

模块不创建数据库表、Redis 键或磁盘缓存。在 Node.js 应用中，`core.init({ configDir })` 可以读取配置文件和环境变量。读出的配置保存在本进程的内存里，另一进程需要自己加载。

### 进程内数据

| 数据           | 用途                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| 配置加载结果   | 配置按名称保存，例如 `core.config.get("core")` 读 Core 的配置。配置经过校验时，校验规则决定哪些缺省字段要填默认值 |
| 日志记录       | 事件级别、时间及上下文。日志后端决定输出和保留期                                                                  |
| 模块运行时     | 记录应用启动了哪些模块、它们依赖哪些模块以及各自的运行状态。进程重启后重新启动这些模块                            |
| 上下文与结果值 | 一次调用返回的成功数据或错误，以及同一请求中供各步骤使用的追踪信息                                                |
