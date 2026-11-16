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
- `@h-ai/audit` — 可选。应用启动时调用 `audit.init()` 后，IAM 会自动记录安全事件。审计写入失败时可以在错误日志中看到原因。由应用管理的数据库事务需要在这种失败时回滚。

- `@h-ai/reach` — 可选。要使用标准的邮件或短信模板，先安装和初始化 Reach，再参照[用 Reach 发送通知](../../docs/usage/function/iam.md#使用可选-reach-自动发送)连接到 IAM。应用也可以直接提供自己的发送函数。
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

LDAP 默认关闭。只有设置了 `otp` 并提供对应的发送函数，`iam.publicConfig` 才会将该一次性验证码登录方式标为可用。密码重置同样需要可用的通知函数，登录页才能提供重置入口。

`iam.config` 返回的是**脱敏后的配置快照**：LDAP `url` / `bindPassword` 等敏感配置会自动隐藏，便于状态检查但不能代替原始配置源。

## 配置清单

生成的项目在 `config/_iam.yml` 中设置可用的登录方式、密码规则和会话期限。应用启动代码读取该文件，把配置对象传给 `iam.init(config)`。

在[模块配置清单](../../docs/usage/configuration/iam.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/iam.md)中查看调用示例、输入输出、错误处理与使用要点。

- `iam.init` / `iam.close` / `iam.config` / `iam.isInitialized` / `iam.publicConfig` / `iam.getPublicConfig` / `iam.isRegisterEnabled` — 启动或关闭身份服务。前端用公开配置判断登录页应显示哪些登录方式，以及是否显示注册链接
- `iam.auth` / `iam.user` / `iam.session` — 验证身份、管理账号和会话
- `iam.authz` / `iam.apiKey` / `iam.ticket` — 检查角色和权限，管理 API Key，并签发和兑换只能使用一次的票据

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
