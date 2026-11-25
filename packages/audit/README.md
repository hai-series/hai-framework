# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

统一审计日志模块，在 Node.js 服务端记录、查询、清理与统计审计事件。Audit 使用 `@h-ai/reldb` 持久化数据，可按需接入私有归档与告警。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/audit @h-ai/reldb`。

[跟着最小示例完成接入](../../docs/usage/function/audit.md#quick-start)。

## 配置清单

生成的项目在 `config/_audit.yml` 中设置审计采集、保留期限、备份和告警。应用启动时把配置传给 `audit.init(config)`。共享数据库的实例使用相同的留存配置，修改后协调重启。

在[模块配置清单](../../docs/usage/configuration/audit.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/audit.md#api-reference)，包含调用入口、输入、返回值和用法。

用 `audit.countByOutcome(filters)` 统计当前列表命中的成功、失败和拒绝事件，仍可独立用 `getStats(7)` 查看最近一周的操作趋势。

## 数据结构

RelDB 保存事件和告警领取，私有 Storage 保存归档。数据库触发器根据配置保护未到期的记录。数据库以 Unix 毫秒存储事件时间，接口返回 `Date`。参见[数据结构](../../docs/usage/data/audit.md)。

## 开发测试

```bash
pnpm --filter @h-ai/audit test
```

审计源码示例明确先初始化 RelDB、检查审计写入结果，再按依赖反序检查关闭结果；参见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
