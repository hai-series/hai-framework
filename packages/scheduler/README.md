# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

用 `scheduler` 按 cron 表达式运行任务。任务可执行 JavaScript 处理函数或调用 HTTP 接口。模块把任务设置和执行日志写入数据库，也可在执行前后调用应用提供的函数。

## 快速开始

[跟着最小示例完成接入](../../docs/usage/function/scheduler.md#最小接入示例)。

## 配置清单

生成的项目在 `config/_scheduler.yml` 中设置任务检查间隔和执行租约时长。应用启动代码读取该文件，把配置对象传给 `scheduler.init(config)`。

在[模块配置清单](../../docs/usage/configuration/scheduler.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/scheduler.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

查看[数据结构](../../docs/usage/data/scheduler.md)，了解任务、执行日志、分布式租约和恢复状态。

## 开发测试

```bash
pnpm --filter @h-ai/scheduler test
```

声明旁的 JSDoc 示例从真实公开入口导入，内部仓库、runner、编译器和 cron 工具则明确标注“模块内部上下文”，不代表可从包根导入。示例区分 HaiResult、显式取消异常和 close 的 Promise<void>，并检查业务 status 与日志 persistence；补写日志不会重做业务。维护时运行 `node scripts/check-module-jsdoc.mjs --package scheduler`，同时校验声明覆盖与真实类型；示例编译不代替共享数据库/独立进程验收。

## 许可证

Apache-2.0
