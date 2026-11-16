# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/audit](../audit/README.md) · [@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/reldb](../reldb/README.md) · [@h-ai/reach](../reach/README.md)

身份与访问管理模块，提供统一的 `iam` 对象实现认证、会话、授权与用户管理。

## 快速开始

### 安装

```bash
pnpm add @h-ai/iam
```

### 依赖

- `@h-ai/reldb` — 数据库（用户/角色/权限持久化），**需在 iam.init() 前初始化**
- `@h-ai/cache` — 缓存（会话/OTP/一次性票据），**需在 iam.init() 前初始化**
- `@h-ai/crypto` — 密码哈希（内部使用，自动初始化）
- `@h-ai/audit` — 宿主初始化后自动记录 IAM 安全事件；未选用时不调用采集器。启用后的审计写失败仍记录错误，外部事务应回滚。

- `@h-ai/reach` — **可选**，应用安装、初始化并注入后可使用标准邮件/短信模板；自定义发送回调无需 Reach。
- `ldapts` — **可选**，仅在显式启用 LDAP 且没有注入 `ldapClientFactory` 时加载。

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 基础密码认证不需要安装 Reach 或 ldapts。
async function example() {
  try {
    const db = await reldb.init({ type: 'sqlite', database: './data.db' })
    if (!db.success)
      return db
    const cached = await cache.init({ type: 'memory' })
    if (!cached.success)
      return cached
    const initialized = await iam.init({})
    if (!initialized.success)
      return initialized
    const registered = await iam.user.register({ username: 'demo', password: 'Password123' })
    if (!registered.success)
      return registered
    const login = await iam.auth.login({ identifier: 'demo', password: 'Password123' })
    if (!login.success)
      return login
    return await iam.auth.verifyToken(login.data.tokens.accessToken)
  }
  finally {
    // 应用关闭时按依赖的反向顺序释放。
    await iam.close()
    await cache.close()
    await reldb.close()
  }
}

const result = await example()
if (!result.success)
  core.logger.error('Authentication example failed', { code: result.error.code })
```

默认 LDAP 关闭；OTP 需要 `otp` 配置和可用发送回调，重置需要可用通知回调，才能在 `iam.publicConfig` 中启用。

`iam.config` 返回的是**脱敏后的配置快照**：LDAP `url` / `bindPassword` 等敏感配置会自动隐藏，便于状态检查但不能代替原始配置源。

## 配置清单

生成项目使用 `config/_iam.yml`。应用可以通过 `iam.init(config)` 接入配置。

在[模块配置清单](../../docs/usage/configuration/iam.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/iam.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `close` / `config` / `isInitialized` / `publicConfig` / `getPublicConfig` / `isRegisterEnabled` — 装配身份服务并向前端提供安全的注册和配置视图
- `auth` / `user` / `session` — 验证身份、管理账号和会话
- `authz` / `apiKey` / `ticket` — 评估权限并处理 API Key 与一次性票据

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
