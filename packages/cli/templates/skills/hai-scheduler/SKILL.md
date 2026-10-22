---
name: hai-scheduler
description: "注册或排查 cron/API/JS/Hook 任务、手工触发、执行日志、重试取消与多节点调度。"
---

# hai-scheduler

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/scheduler 注册 cron/API/JS/Hook 任务、手工触发并查询执行日志 |
| 适用场景 | 服务端任务调度、持久化和手工触发 |
| 输入 | SchedulerConfigInput、任务定义、已初始化依赖与 hooks |
| 输出 | 任务管理、触发和日志查询的 HaiResult |
| 限制 | 仅服务端；vm 不是安全沙箱，JS 任务只执行可信代码。多节点需要共享锁，关闭释放调度资源。 |

## 使用路径

1. 持久化模式先初始化 reldb；多节点需共享数据库与 Redis，Memory 只用于单进程。检查 scheduler.init 的 HaiResult。
2. 动态共享任务通过 register 管理，不与 init.tasks 重复声明；读取失败、禁用、删除或改期时不得继续旧任务。
3. 根据可信逻辑选择 API/JS/Hook。Worker/vm 不是安全沙箱；Hook 监听 signal，业务以 occurrenceId 处理幂等。
4. 明确 timeout、响应大小、重试与执行状态；关闭时 await scheduler.close，再关闭数据库和缓存。
5. 验证手动/定时、并发抢锁、失败重试、取消与定义更新。

## 按需参考

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [运行环境](reference.md#运行环境)
- [依赖](reference.md#依赖)
- [使用步骤](reference.md#使用步骤)
- [核心 API](reference.md#核心-api)
- [常见模式](reference.md#常见模式)
- [错误码 — `HaiSchedulerError`](reference.md#错误码--haischedulererror)
