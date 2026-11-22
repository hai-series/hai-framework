# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

统一审计日志模块，通过 `audit` 对象提供审计日志的记录、查询、清理与统计功能，基于 `@h-ai/reldb` 实现持久化。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/audit @h-ai/reldb`。

[跟着最小示例完成接入](../../docs/usage/function/audit.md#quick-start)。

## 配置清单

生成的项目在 `config/_audit.yml` 中设置审计采集、保留期限、备份和告警设置。应用启动代码读取该文件，把配置对象传给 `audit.init(config)`。

在[模块配置清单](../../docs/usage/configuration/audit.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/audit.md#api-reference)，包含调用入口、输入、返回值和用法。

用 `audit.countByOutcome(filters)` 统计当前列表命中的成功、失败、拒绝和未分类事件，仍可独立用 `getStats(7)` 查看最近一周的操作趋势。

## 数据结构

查看[数据结构](../../docs/usage/data/audit.md)，了解审计日志、字段映射、归档对象和告警去重。

## 开发测试

```bash
pnpm --filter @h-ai/audit test
```

审计源码示例明确先初始化 RelDB、检查审计写入结果，再按依赖反序检查关闭结果；参见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
