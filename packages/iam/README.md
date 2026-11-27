# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/audit](../audit/README.md) · [@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/reldb](../reldb/README.md) · [@h-ai/reach](../reach/README.md)

身份与访问管理模块，提供统一的 `iam` 对象实现认证、会话、授权与用户管理。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/iam @h-ai/reldb @h-ai/cache @h-ai/core`。

[跟着最小示例完成接入](../../docs/usage/function/iam.md#quick-start)。

[依赖与接入顺序](../../docs/usage/function/iam.md#module-dependencies)。

## 配置清单

生成的项目在 `config/_iam.yml` 中设置可用的登录方式、密码规则和会话期限。应用启动代码读取该文件，把配置对象传给 `iam.init(config)`。

在[模块配置清单](../../docs/usage/configuration/iam.md)中查阅配置入口、默认值、取值限制和生效条件。

生产首次启动前，在共享 Redis 初始化权限读缓存代次。写入登记滞留时按维护步骤核对数据库事务并换代。[初始化与恢复](../../docs/usage/data/iam.md#iam-read-cache-recovery)

## 功能说明

IAM 通过 Reach 发内置验证码、密码重置和初始设密邀请时会跳过免打扰。应用可用自定义回调接管发送。[夜间通知](../../docs/usage/function/reach.md#reach-quiet-hours)

密码与 API Key 的 SM3 计算共用 Crypto 的后台线程池，已保存的哈希可继续使用。等待队列满时返回 `SECURITY_BUSY`（HTTP 429），登录不累计密码错误次数。

[查 API 清单](../../docs/usage/function/iam.md#api-reference)，包含调用入口、输入、返回值和用法。

创建账号和分配角色一次提交。`iam.user.createUser` 和 `iam.user.inviteUser` 可由管理端指定角色，邀请在提交后发送。`iam.user.updateUserWithRoles` 一次提交账号资料和角色。一次性票据以摘要作为缓存键，并在核验用途后消费。

<a id="可选-ldap-与通知接入"></a>

[可选 LDAP 与通知接入](../../docs/usage/function/iam.md#可选-ldap-与通知接入)
目录登录升级见[迁移现有身份绑定](../../docs/usage/function/iam.md#ldap-identity-migration)。

<a id="使用可选-reach-自动发送"></a>

[用 Reach 发送通知](../../docs/usage/function/iam.md#使用可选-reach-自动发送)

- 用共享 HTTP 契约管理 API Key 及角色权限。 [扩展 HTTP 契约](../../docs/usage/function/iam.md#http-contract-extensions)
- 服务间调用用 `iam.apiKey.verifyApiKey()` 校验 Key 和所属账户，无需创建会话。按返回的权限和用户 ID 检查业务操作及数据归属。 [程序凭据](../../docs/usage/function/iam.md#api-keys)

## 数据结构

RelDB 保存账号、角色、权限和锁定版本。共享 Redis 保存会话、登录失败计数和一次性凭据。[查看数据结构](../../docs/usage/data/iam.md)

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
