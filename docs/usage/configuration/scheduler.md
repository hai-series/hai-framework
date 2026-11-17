# Scheduler 配置

[English](scheduler.en.md) · [日本語](scheduler.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目把调度器的设置放在 `config/_scheduler.yml`。应用启动时从 `core.config.get('scheduler')` 读取并交给 `scheduler.init()`。用环境变量覆盖时使用 `HAI_SCHEDULER_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

先用 `reldb.init()` 连接数据库。多个调度器进程需要用同一个数据库，才能协调由谁执行任务。应用通过 `scheduler.register()` 交给调度器具体任务的 Cron 表达式、时区和处理函数，也可以在初始化时用 `tasks` 提供首批任务，用 `hooks` 设置任务开始或结束时的回调。

## 配置示例

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
tickInterval: 1000
leaseMs: 300000
nodeId: orders-scheduler-east
retentionDays: 30
```

## 配置清单

配置示例把 `retentionDays` 显式设为 30 天。省略该字段时，调度器不按记录年龄清理日志。

| 配置项          | 默认值/必填           | 说明                                                                                               |
| --------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `enableDb`      | `true`                | 必须使用共享数据库保存执行状态；false 不再允许，需要先初始化。可填 `true`                          |
| `tickInterval`  | `1000`                | 调度检查间隔，单位毫秒。至少 100 的整数                                                            |
| `leaseMs`       | `300000`              | 执行租约毫秒数（默认 300000，范围 1000–86400000），在途每三分之一周期续期。可填整数，1000–86400000 |
| `nodeId`        | 由调度器进程生成 UUID | 部署中的节点标识，用于租约及问题定位。可填字符串，至少 1 个字符                                    |
| `maxLogs`       | 不按条数清理          | 配置后限制保留的执行日志条数。至少 1 的整数                                                        |
| `retentionDays` | 不按天数清理          | 配置后仅保留该天数内可清理的执行日志。至少 1 的整数                                                |

## 生效与核对

修改租约时核对执行续租和未知状态处理；中断调度器可能使外部副作用结果未知。清理配置只影响可清理的执行记录。多节点示例见[租约、时间与未知执行](operations.md#scheduler租约时间与未知执行)。
