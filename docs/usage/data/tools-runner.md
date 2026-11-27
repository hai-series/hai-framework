# @h-ai/tools-runner 数据结构

[English](tools-runner.en.md) · [日本語](tools-runner.ja.md)

[模块 README](../../../packages/tools-runner/README.md) · [配置](../configuration/tools-runner.md) · [功能说明](../function/tools-runner.md)

应用提交后台工具调用后，从服务返回的回执查询状态和结果。Tools Runner 将任务交给 Runner 持久化，文件字节由宿主保存。 [产物契约](tools.md#artifact-access)

<a id="runtime-tasks"></a>

## 任务与回执

`ToolRun` 是服务返回的任务快照。成功提交表示 Runner 接受了任务。要判断工具是否执行成功，还要读取 `status`。重复提交已存在的任务会返回其当前状态和已有输出或失败原因。

| 字段 | 含义 |
| --- | --- |
| `receipt.id` | Runner 生成的执行编号，由 64 个十六进制字符组成 |
| `receipt.key` | 提交时的幂等键。调用方省略时由服务生成 |
| `status` | 当前持久化状态。排队、执行、完成和待核验状态见下表 |
| `output` | 成功执行产生的 JSON 数据。求和返回数字 `5` |
| `failure` | Runner 已记录的可选失败原因，例如 `handler-failed` 或 `queue-timeout` |
| `events`、`next` | 本页事件及下次续读的游标。提交返回空事件列表和游标 `0`。查询可以返回已有事件 |

保存完整的 `receipt`，在同一服务以认证后的 `scope` 查询或取消。服务用键找到任务，再核对执行编号和归属。如果提交响应丢失，可以用原键调用 `find`。未找到时，成功结果的 `data` 为 `undefined`。即使工具已停用，仍可查询同一主体和服务下的已有任务。

| 状态 | 此时可以确认什么 |
| --- | --- |
| `queued` | Runner 已保存任务，等待可执行的节点领取 |
| `running` | 执行节点已领取任务，继续读取状态 |
| `cancelling` | Runner 已记录停止请求，仍在等待实际停止 |
| `succeeded` | 执行已成功，可以从 `output` 读取结果 |
| `failed` | 执行失败，从 `failure` 和已有事件查找原因 |
| `cancelled` | 排队任务已取消，或运行任务已停止。已发生的业务写入仍需按业务规则核对 |
| `unknown` | Runner 无法确认执行结果。先核对实际效果，再决定是否重试。[Runner 核验](../function/runner.md#reconciliation) |

当 `invoke()` 在持久化过程中收到取消信号且 Runner 随后受理任务时，`CANCELLED` 错误的 `ext.receipt` 提供完整回执。服务生成键的任务会尝试取消。调用方提供键时，可以先查同键任务的实际状态，然后调用 `cancel()`。如果 Runner 拒绝提交，`invoke()` 返回 Runner 的错误。关闭 Tools 服务仅注销处理器，已有任务仍由 Runner 管理。[提交与取消](../function/tools-runner.md#services)

<a id="example-data"></a>

### 一次工具任务的进度和结果

以下是同一任务的两个合成快照，展示接口返回的 `data`。应用以 `{ tenantId: 'demo', userId: 'alice' }` 为可信身份，在 `sum-demo` 服务提交 `sum`，参数为 `{ a: 2, b: 3 }`，幂等键为 `sum-2-plus-3`。首次提交拿到排队回执。[可运行的求和服务](../function/tools-runner.md#service-example)

```json
{
  "receipt": {
    "id": "263f23b73db46ef9b8f3c891120f39d541a55d2b9d8b99116ec66def48fff51d",
    "key": "sum-2-plus-3"
  },
  "status": "queued",
  "events": [],
  "next": 0
}
```

稍后以同一回执查询，状态为成功，结果是数字 `5`。求和函数没有发送事件，游标仍为 `0`。

```json
{
  "receipt": {
    "id": "263f23b73db46ef9b8f3c891120f39d541a55d2b9d8b99116ec66def48fff51d",
    "key": "sum-2-plus-3"
  },
  "status": "succeeded",
  "output": 5,
  "events": [],
  "next": 0
}
```

<a id="tool-events"></a>

### 续读事件与识别失败

另一次合成示例沿用求和输入，改用键 `sum-permission-check`。假设任务受理后，执行节点复查权限时拒绝了这次调用。查询本身成功，返回的 `ToolRun.status` 为 `failed`，`failure` 为 `handler-failed`。如果 Runner 保存了工具错误事件，`events` 的一项会像下面这样。事件的 `createdAt` 使用毫秒时间戳。

```json
{
  "sequence": 1,
  "data": {
    "type": "tool-error",
    "error": {
      "code": "hai:tools:024",
      "message": "Tool execution is not authorized (traceId: demo-sum-42)",
      "httpStatus": 403,
      "traceId": "demo-sum-42"
    }
  },
  "createdAt": 1767225600000
}
```

用 `inspect(receipt, context, { after: 0 })` 读到序号 `1` 后，下一次传回 `next` 的值 `1`。每次最多返回 100 条事件。没有更多事件时，返回空列表并保留传入的游标。上例假设首次提交使用 `en-US`，同键重试仍沿用首次语言。没有语言记录的旧任务使用执行节点的默认语言。

<a id="size-and-retention"></a>

## 大小与保留期

| 数据 | 限制和处理方式 |
| --- | --- |
| 提交数据、单条事件、最终输出 | Runner 分别限制为 512 KiB JSON。事件每任务合计最多 16 MiB，条数由 `maxEvents` 限制，默认 10000 条 |
| 容器作业的单个输入文件或产物 | 文件字节上限 50 MiB。容器输入合计还受环境的 `scratchMiB` 限制，使用两者中较小的预算。具体作业可设置更小的限制，文件正文通过授权引用传递。[作业限制](../function/tools-runner.md#job-tools) |
| 任务、事件和幂等记录 | Runner 的 `retentionMs` 默认保留已结算任务七天，待核验的 `unknown` 记录保留至处理完成。清理后 `find` 可能成功但返回 `undefined`。需要更长时间防止业务重复时，由应用保存自己的业务操作记录。[Runner 保留期](../configuration/runner.md#configuration-fields) |
