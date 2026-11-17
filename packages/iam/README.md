# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/audit](../audit/README.md) · [@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/reldb](../reldb/README.md) · [@h-ai/reach](../reach/README.md)

身份与访问管理模块，提供统一的 `iam` 对象实现认证、会话、授权与用户管理。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/iam @h-ai/reldb @h-ai/cache`。

[跟着最小示例完成接入](../../docs/usage/function/iam.md#quick-start)。

## 配置清单

生成的项目在 `config/_iam.yml` 中设置可用的登录方式、密码规则和会话期限。应用启动代码读取该文件，把配置对象传给 `iam.init(config)`。

在[模块配置清单](../../docs/usage/configuration/iam.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/iam.md#api-reference)，包含调用入口、输入、返回值和用法。

<a id="可选-ldap-与通知接入"></a>

[可选 LDAP 与通知接入](../../docs/usage/function/iam.md#可选-ldap-与通知接入)

<a id="使用可选-reach-自动发送"></a>

[用 Reach 发送通知](../../docs/usage/function/iam.md#使用可选-reach-自动发送)

## 数据结构

查看[数据结构](../../docs/usage/data/iam.md)，了解账号、角色、权限、会话和一次性凭据。

## 开发测试

公开示例从 `@h-ai/iam` 导入，区分可省略默认值的 `IamConfigInput` 与 Schema 解析后的 `IamConfig`。服务端依赖先初始化；`HaiResult` 先检查 `success`，会话修改使用读取到的 `version`，通知复用持久幂等键。内部策略/仓储示例标记为“模块内部上下文”，不作为应用的深层导入入口。检查器只验证示例类型；真实 Redis/数据库、LDAP 和通知投递仍需对应集成测试。见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

```bash
pnpm --filter @h-ai/iam typecheck
pnpm --filter @h-ai/iam lint
pnpm --filter @h-ai/iam build
pnpm --filter @h-ai/iam test
node scripts/check-module-jsdoc.mjs --package iam
```

## 许可证

Apache-2.0
