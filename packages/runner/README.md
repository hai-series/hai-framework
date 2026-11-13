# @h-ai/runner

Runner 用于运行受管的 Agent 和工具容器。API 节点提交任务和读取状态，执行节点领取任务，持有实际容器和连接。任务、归属、取消请求和事件保存在共享数据库中。应用负责身份验证和业务授权。

## 启动和提交

先初始化 `@h-ai/reldb`，再启动 runner。单机可以使用 SQLite。多实例使用共享 PostgreSQL 或 MySQL，并为每台执行节点分配稳定的 nodeId。API 节点可以设置 `executor: false`。以下示例使用已启动的数据库，仅运行可信服务器处理器。

```ts
import { core } from '@h-ai/core'
import { runner } from '@h-ai/runner'

const scope = { tenantId: 'studio', userId: 'alice' }
const started = await runner.init({ nodeId: 'worker-east' })
if (!started.success)
  throw new Error(started.error.message)

try {
  const registration = runner.register('report.v1', async (input, context) => {
    const published = await context.emit({ phase: 'ready' })
    if (!published.success)
      throw new Error(published.error.message)
    return { summary: input }
  })
  if (!registration.success)
    throw new Error(registration.error.message)
  const accepted = await runner.submit({
    scope,
    kind: 'report.v1',
    idempotencyKey: 'report-2026-11',
    input: 'Monthly report',
  })
  if (!accepted.success)
    throw new Error(accepted.error.message)

  const task = await runner.get(scope, accepted.data.id)
  if (!task.success)
    throw new Error(task.error.message)
  void task.data.status
}
finally {
  const closed = await runner.close()
  if (!closed.success)
    core.logger.error('Runner shutdown failed', { code: closed.error.code })
}
```

`get` 读取当前状态，`find` 按主体和幂等键恢复回执，`events` 按序号分页，`cancel` 记录取消请求。只有确认容器停止且清理成功后才发布取消终态。处理器的停止信号来自持久控制状态。父任务通过 `parentId` 将子任务路由到持有连接的节点，子任务使用单独的控制并发额度。

## 容器环境与资源

启动时配置 `environments`，每项提供 ID、已预拉取的镜像 digest、CPU 核数、内存 MiB、PID 数和临时盘 MiB。调用方通过 `environmentId` 选环境，并可请求更低的资源限制。执行节点在同一数据库事务内领取任务并预留资源。按主体和节点设置队列与并发上限。

处理器通过 `context.start` 启动容器，取得标准输入、输出、错误流和退出结果。镜像应支持 Linux cgroup v2，使用 `/bin/sh`，并能以 UID/GID 1000 运行。根文件系统只读。`/state`、`/workspace` 和 `/tmp` 按任务分配受限 tmpfs。启动文件复制到 `/state`。节点上已登记的内部网络必须通过引擎的 internal 检查，默认完全禁用容器网络。联网任务应使用按信任域配置的内部网关。

启动环境和原生连接留在执行节点。输入、事件、输出只接受有界 JSON。密钥由可信处理器在启动时解析，调用记录使用业务标识和对象引用。执行节点失联或清理无法确认时保留 `unknown` 状态和预留额度，待运维核实实际容器和外部副作用。

工具处理器可用 `inputs` 将规范 Base64 文件按简单文件名写入只读 `/input`，并在容器仍运行时调用 `artifact(name, maxBytes)` 从 `/output` 读取普通文件。输入总量和输出各最多 50 MiB，同时受环境临时盘限制。用于产物导出的镜像应提供 `/usr/bin/python3`。

## 开发测试

```bash
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

测试包含真实 SQLite、PostgreSQL、MySQL 及 Docker/Podman 容器。通过 `HAI_TEST_CONTAINER_ENGINE` 指定容器引擎。PostgreSQL 与 MySQL 测试通过 Testcontainers 连接同一引擎提供的 Docker 兼容 API。

## 许可证

Apache-2.0
