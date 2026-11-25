# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

用户触达模块，支持同时注册多个 Provider（邮件、短信、API 回调等），通过模板绑定 Provider 实现按场景路由发送。内置免打扰（DND）机制，支持通过配置文件定义模板。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/reach`。

[跟着最小示例完成接入](../../docs/usage/function/reach.md#quick-start)。

[依赖与接入顺序](../../docs/usage/function/reach.md#module-dependencies)。

## 配置清单

生成的项目在 `config/_reach.yml` 中设置发送渠道、模板、免打扰时段和重试规则。应用启动代码读取该文件，把配置对象传给 `reach.init(config)`。

在[模块配置清单](../../docs/usage/configuration/reach.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

用 `reach.send()` 发送验证码时传 `ignoreDnd: true` 可立即尝试发送。渠道受理后，接入数据库的应用可在发送历史中查到写入成功的记录。[发送示例](../../docs/usage/function/reach.md#reach-sms-code) · [发送记录](../../docs/usage/data/reach.md#sms-code-record)

[查 API 清单](../../docs/usage/function/reach.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

查看[数据结构](../../docs/usage/data/reach.md)，了解通知任务、结果、死信、幂等记录和共享锁。

## 开发测试

```bash
pnpm --filter @h-ai/reach test
```

跨库时间回归用例 `tests/reach-repository-send-log-databases.test.ts` 通过 Testcontainers 启动隔离 PostgreSQL 16.15 / MySQL 8.4.11，并在结束时清理容器；须提供可用的 Docker API。使用 Podman 时，将 `DOCKER_HOST` 指向其兼容 socket；rootless 环境可按 Testcontainers 要求设置 `TESTCONTAINERS_RYUK_DISABLED=true`。

## 许可证

Apache-2.0
