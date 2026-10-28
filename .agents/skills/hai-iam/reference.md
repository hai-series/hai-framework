# hai-iam — 详细用法

从 [SKILL.md](SKILL.md) 选择主题后读取对应小节。代码片段展示 API 用法；省略的业务变量、schema、依赖与 return 上下文需由应用补齐。

用户的 `checkPermission(userId, code)` / `getUserAuthorization` 仅查询主体授权，不含请求的 API Key scope；受保护请求使用 `iam.auth.verifyToken` 的已收敛会话权限。API Key 的完整配置、交集示例和撤销流程见对应小节。

角色成员数使用 `getRoleUserCounts(roleIds)`，一次聚合返回 `HaiResult<Map<string, number>>`；成功时无关联为 0，失败必须展示错误，不能伪造零值。

角色资料和权限必须通过 `createRole({ ..., permissionIds })` / `updateRole(id, { ..., permissionIds })` 一次事务保存，禁止在应用层并行增删权限模拟替换。空数组清空、未传保持、未知权限失败、重复 ID 去重；并发以最后提交的完整集合为准。自管事务提交后同步会话，外部事务由调用方提交后同步。

管理界面自动创建角色时使用 `role_${core.id.generate()}` 生成 code，显示名称独立保存；不要通过移除中文、表情或折叠大小写生成标识。重命名不重建 code。

> `@h-ai/iam` 是统一的身份与访问管理模块，支持多种认证策略（密码/OTP/LDAP/API Key）、Bearer Token 管理和 RBAC 授权。依赖 `@h-ai/reldb`（持久化）、`@h-ai/cache`（服务端会话 / OTP / 一次性票据）、`@h-ai/crypto`（密码哈希）。

## §1 配置与初始化

### 配置

```yaml
# config/_iam.yml
password:
  minLength: 8
  requireUppercase: true
  requireNumber: true
session:
  maxAge: 86400
  refreshTokenMaxAge: 604800
  sliding: true
  singleDevice: false
login:
  password: true
  otp: false
register:
  enabled: true
security:
  maxLoginAttempts: 5
  lockoutDuration: 900
rbac:
  defaultRole: user
  superAdminRole: super_admin
```

环境变量按 YAML 路径自动映射并优先于文件，例如
`HAI_IAM_PASSWORD_MINLENGTH`、`HAI_IAM_SESSION_MAXAGE` 和
`HAI_IAM_SECURITY_MAXLOGINATTEMPTS`。

### 初始化

```typescript
import type { IamConfigSettingsInput } from '@h-ai/iam'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 位于应用启动函数内；依赖初始化失败时立即返回，不能继续启动 IAM。
core.init({ configDir: './config' })
const db = await reldb.init({ type: 'sqlite', database: './data.db' })
if (!db.success)
  return db
const cached = await cache.init({ type: 'memory' })
if (!cached.success)
  return cached
const initialized = await iam.init(core.config.getOrThrow<IamConfigSettingsInput>('iam'))
if (!initialized.success)
  return initialized
// 关闭时按 iam → cache → reldb 的反向依赖顺序执行。
```

基础初始化创建用户/RBAC 五张表；启用 API Key 登录时另创建 `hai_iam_api_keys`。

服务端会话 token、refresh token 和 OTP 存储在 cache 中（不落库）；浏览器侧认证 token 存储遵循 app-conventions：Web 优先 httpOnly cookie，移动/桌面使用安全 TokenStore，禁止 localStorage。

### 可选 LDAP 与通知

LDAP 默认关闭，Reach 不属于 IAM 的启动前置依赖。`ldapts` 和 `@h-ai/reach` 是可选 peer dependency，基础密码/RBAC 无需安装这两个包。

- 默认 LDAP 客户端：在服务端 workspace 执行 `pnpm add ldapts`，配置 `login.ldap: true` 与 `ldap.url/bindDn/bindPassword/searchBase`。`searchFilter` 默认 `(uid={{username}})`；AD 可使用 `(sAMAccountName={{username}})` 与对应 `usernameAttribute`。`ldaps://` 使用 TLS，`ldap://` + `useTls: true` 使用 StartTLS。`ldapClientFactory` 可注入返回 `bind/search/unbind` 和 HaiResult 的客户端，此时无需安装 ldapts。
- Reach 自动发送：应用安装、初始化 `@h-ai/reach`，在 `iam.init({ ...settings, reach })` 中注入一次。`otp_email/otp_sms` 模板使用 `{code}`；`password_reset/password_reset_sms` 使用 `{token}/{expiresAt}/{resetUrl}`。模板需在 IAM 初始化前配置，Provider 绑定实际邮件/短信通道。`passwordReset.mode` 选择 `email/phone`。
- 自定义发送：直接传 `onOtpSendEmail(email, code, context)`、`onOtpSendSms(phone, code, context)`、`onPasswordResetRequest(user, token, context)`，均返回 `Promise<void>`；context 包含 expiresAt/idempotencyKey，发送服务按该稳定键持久化去重，异常表示结果未知，不自动重发。可以只实现选用通道或与 Reach 混用，显式回调优先。检查发送服务结果，投递失败在回调内抛错；IAM 捕获并返回业务错误，不要吞掉发送失败。
- `otp` 必须有配置并开启所需通道；缺少回调或标准模板时 `iam.publicConfig` 不公布该入口。Reach 由应用管理生命周期，IAM 不负责初始化或关闭。Console 仅记录元数据。

协议以 Modal 显示，关闭后保留输入。URL 方式必须为 HTTP(S) 且页面允许 iframe 嵌入；脚本被隔离禁用。`LoginForm/RegisterForm` 提供 `header/extraFields/footer`；`AuthPanel` 提供 `loginHeader/loginFields/loginFooter`、`registerHeader/registerFields/registerFooter`。额外字段由应用绑定状态，在自己的动作中处理，IAM 不接收未经定义的字段。

密码登录接收 identifier/password，以及启用时的单用 captcha 证明；AuthPanel 将 LoginForm 的 username 映射为 identifier。会话期限来自服务端 session.maxAge/refreshTokenMaxAge，不增加未实现的登录偏好字段或持久会话选择框。

## §2 认证 — `iam.auth`

| 方法               | 签名                                                           | 说明                                             |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------ |
| `login`            | `({ identifier, password }) => Promise<HaiResult<AuthResult>>` | 密码登录                                         |
| `loginWithOtp`     | `({ identifier, code }) => Promise<HaiResult<AuthResult>>`     | OTP 登录                                         |
| `loginWithLdap`    | `({ username, password }) => Promise<HaiResult<AuthResult>>`   | LDAP 登录                                        |
| `loginWithApiKey`  | `({ key }) => Promise<HaiResult<AuthResult>>`                  | API Key 登录（需启用 `login.apikey`）            |
| `sendOtp`          | `(identifier) => Promise<HaiResult<{ expiresAt }>>`            | 发送 OTP                                         |
| `verifyToken`      | `(token) => Promise<HaiResult<Session>>`                       | 验证会话并读取当前用户状态及授权；必要状态读取失败拒绝 |
| `logout`           | `(token) => Promise<HaiResult<void>>`                          | 登出                                             |
| `registerAndLogin` | `(options: RegisterOptions) => Promise<HaiResult<AuthResult>>` | 注册并登录（一站式）                             |

**AuthResult**：

```typescript
interface AuthResult {
  user: User
  tokens: TokenPair
  agreements?: AgreementDisplay
}

interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: 'Bearer'
}
```

## §3 会话管理 — `iam.session`

| 方法                | 签名                                                                                   | 说明                                     |
| ------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| `create`            | `({ userId, username, roles, source? }) => Promise<HaiResult<Session>>`                | 创建会话                                 |
| `get`               | `(token) => Promise<HaiResult<Session \| null>>`                                       | 获取会话（滑动续期）                     |
| `verifyToken`       | `(token) => Promise<HaiResult<Session>>`                                               | 验证令牌                                 |
| `update`            | `(token, data: Partial<Session>, expectedVersion: string) => Promise<HaiResult<void>>` | 更新会话字段                             |
| `delete`            | `(token) => Promise<HaiResult<void>>`                                                  | 删除会话                                 |
| `deleteByUserId`    | `(userId) => Promise<HaiResult<number>>`                                               | 强制下线（返回删除数量）                 |
| `refresh`           | `(refreshToken) => Promise<HaiResult<TokenPair>>`                                      | 刷新 Token（rotation）                   |
| `revokeRefresh`     | `(refreshToken) => Promise<HaiResult<void>>`                                           | 吊销 refreshToken                        |
| `patchUserSessions` | `(userId, updates: SessionFieldUpdates) => Promise<HaiResult<void>>`                   | 批量更新用户活跃会话的 roles/permissions |

**Token 刷新（rotation）**：`refresh()` 删除旧 Token 对，创建新 session，旧 refreshToken 立即失效。

## §3.5 一次性票据 — `iam.ticket`

短期、一次性能力票据，用于无法携带 Bearer Token 的通道（如 WebSocket URL）。密码学安全随机、TTL、原子单次消费、用途绑定。

| 方法      | 签名                                                                                    | 说明                               |
| --------- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| `issue`   | `({ subjectId, purpose, grant?, ttlMs? }) => Promise<HaiResult<{ ticket, expiresAt }>>` | 签发（默认 30s）                   |
| `consume` | `(ticket, { purpose? }?) => Promise<HaiResult<{ subjectId, purpose, grant }>>`          | 原子消费（单次有效，用途不符拒绝） |

```ts
// 已登录 HTTP 请求内签发，绑定操作/模型
const issued = await iam.ticket.issue({ subjectId: session.userId, purpose: 'ai-audio', grant: { operation: 'transcribe', model: 'whisper-1' } })
// 服务端建连时消费（并发消费仅一个成功）
const consumed = await iam.ticket.consume(ticket, { purpose: 'ai-audio' })
```

错误码：`TICKET_INVALID`(iam:110) / `TICKET_EXPIRED`(iam:111) / `TICKET_ISSUE_FAILED`(iam:112)。

## §4 用户管理 — `iam.user`

| 方法                        | 签名                                                                | 说明                                                                     |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `register`                  | `(input) => Promise<HaiResult<RegisterResult>>`                     | 注册                                                                     |
| `getCurrentUser`            | `(token) => Promise<HaiResult<User>>`                               | 通过令牌获取当前用户                                                     |
| `updateCurrentUser`         | `(token, data: UpdateCurrentUserInput) => Promise<HaiResult<User>>` | 更新当前用户（白名单字段）                                               |
| `getUser`                   | `(id, options?) => Promise<HaiResult<User \| null>>`                | 获取用户（可 include roles）                                             |
| `getUsers`                  | `(ids, options?) => Promise<HaiResult<User[]>>`                     | 批量公开用户，上限 1000；去重输入顺序、缺失省略、可 include roles        |
| `listUsers`                 | `(options?) => Promise<HaiResult<PaginatedResult<User>>>`           | 分页列表（search、roleCode、include、白名单排序）；roleCode 在分页前筛选 |
| `updateUser`                | `(id, data) => Promise<HaiResult<User>>`                            | 更新用户                                                                 |
| `deleteUser`                | `(id) => Promise<HaiResult<void>>`                                  | 删除用户（清除会话 + 角色关联）                                          |
| `changePassword`            | `(id, old, new) => Promise<HaiResult<void>>`                        | 修改密码（按用户 ID）                                                    |
| `changeCurrentUserPassword` | `(token, old, new) => Promise<HaiResult<void>>`                     | 当前用户修改密码（按令牌）                                               |
| `requestPasswordReset`      | `(email) => Promise<HaiResult<void>>`                               | 请求重置（防枚举）                                                       |
| `confirmPasswordReset`      | `(token, newPassword) => Promise<HaiResult<void>>`                  | 确认重置                                                                 |
| `adminResetPassword`        | `(userId, newPassword) => Promise<HaiResult<void>>`                 | 管理员重置                                                               |
| `validatePassword`          | `(password) => HaiResult<void>`                                     | 密码强度验证（**同步**）                                                 |

## §5 RBAC 授权 — `iam.authz`

### 权限检查

| 方法                        | 签名                                                                       | 说明                                                         |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `checkPermission`           | `(userId, permission) => Promise<HaiResult<boolean>>`                      | 检查权限（支持通配符）                                       |
| `getUserAuthorization`      | `(userId) => Promise<HaiResult<{roles: string[], permissions: string[]}>>` | 当前角色及权限代码，单条 JOIN 冷读与共享代际缓存；失效不确定时安全回源 |
| `getUserPermissions`        | `(userId) => Promise<HaiResult<Permission[]>>`                             | 获取用户所有权限                                             |
| `getUserRoles`              | `(userId) => Promise<HaiResult<Role[]>>`                                   | 获取用户角色                                                 |
| `getUserRolesForMany`       | `(userIds[]) => Promise<HaiResult<Map<string, Role[]>>>`                   | 批量获取多用户角色                                           |
| `getRolePermissionsForMany` | `(roleIds[]) => Promise<HaiResult<Map<string, Permission[]>>>`             | 批量获取多角色权限                                           |

### 角色管理

| 方法            | 签名                                                              | 说明                   |
| --------------- | ----------------------------------------------------------------- | ---------------------- |
| `createRole`    | `({ code, name, description? }, tx?) => Promise<HaiResult<Role>>` | 创建角色               |
| `getRole`       | `(roleId) => Promise<HaiResult<Role \| null>>`                    | 获取角色               |
| `getRoleByCode` | `(code) => Promise<HaiResult<Role \| null>>`                      | 按 code 获取角色       |
| `getAllRoles`   | `(options?) => Promise<HaiResult<PaginatedResult<Role>>>`         | 分页获取所有角色       |
| `updateRole`    | `(roleId, data, tx?) => Promise<HaiResult<Role>>`                 | 更新角色               |
| `deleteRole`    | `(roleId, tx?) => Promise<HaiResult<void>>`                       | 删除角色（事务清关联） |

### 权限管理

| 方法                  | 签名                                                                                 | 说明                               |
| --------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| `createPermission`    | `({ code, name, type?, resource?, action? }, tx?) => Promise<HaiResult<Permission>>` | 创建权限                           |
| `getPermission`       | `(permissionId) => Promise<HaiResult<Permission \| null>>`                           | 获取权限                           |
| `getPermissionByCode` | `(code) => Promise<HaiResult<Permission \| null>>`                                   | 按 code 获取权限                   |
| `getAllPermissions`   | `(options?) => Promise<HaiResult<PaginatedResult<Permission>>>`                      | 分页获取所有权限（可按 type 筛选） |
| `deletePermission`    | `(permissionId, tx?) => Promise<HaiResult<void>>`                                    | 删除权限（事务清关联）             |

### 分配操作

| 方法                       | 签名                                                   | 说明                     |
| -------------------------- | ------------------------------------------------------ | ------------------------ |
| `assignRole`               | `(userId, roleId, tx?) => Promise<HaiResult<void>>`    | 分配角色给用户           |
| `removeRole`               | `(userId, roleId, tx?) => Promise<HaiResult<void>>`    | 移除用户角色             |
| `syncRoles`                | `(userId, roleIds[], tx?) => Promise<HaiResult<void>>` | 同步用户角色（全量替换） |
| `assignPermissionToRole`   | `(roleId, permId, tx?) => Promise<HaiResult<void>>`    | 分配权限给角色           |
| `removePermissionFromRole` | `(roleId, permId, tx?) => Promise<HaiResult<void>>`    | 移除角色权限             |
| `getRolePermissions`       | `(roleId) => Promise<HaiResult<Permission[]>>`         | 获取角色的权限列表       |

**通配符**：`admin:*` 匹配 `admin:read`、`admin:write`。超管角色自动拥有所有权限。

## §6 HTTP API 契约 — `@h-ai/api-contract`

```typescript
import { apiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { createIamProcedures } from '@h-ai/serv/features/iam'

const procedures = createIamProcedures({ iam })

// apiContract.iam.auth.login             — POST /auth/login
// apiContract.iam.auth.currentUser       — GET  /auth/me
// apiContract.iam.auth.refresh           — POST /auth/refresh
// apiContract.iam.users.list             — GET  /iam/users
// apiContract.iam.roles.create           — POST /iam/roles
// apiContract.iam.permissions.list       — GET  /iam/permissions
```

```typescript
// 客户端
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.iam.auth.login({ identifier: username, password })
```

## §7 与 kit 集成

### hooks.server.ts 模式

```typescript
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

// 应用启动时已成功初始化 IAM。
export const handle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      const result = await iam.auth.verifyToken(token)
      return result.success ? result.data : null
    },
    operations: () => iam.auth,
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
  },
})
```

### API 端点权限检查

```typescript
export const GET = kit.handler(async ({ locals }) => {
  kit.guard.require(locals.session, 'user:list')
  // ...
})
```

### 客户端认证

```typescript
// 登录 → 保存 Token（仅适用于移动/桌面/服务端脚本等非 httpOnly-cookie 客户端）
const login = await apiClient.iam.auth.login({ identifier: username, password })
if (login.success) {
  await apiClient.auth.setTokens(login.data.tokens)
}

// 会话恢复时同时取得服务端最新访问范围，不复用本地权限快照。
const me = await apiClient.iam.auth.currentUser()
if (me.success) {
  const { roles, permissions, ...user } = me.data
}

// Token 过期自动刷新
// 刷新失败清除 Token 并跳转登录页
```

Web 管理后台优先由登录 API 写入 httpOnly cookie，不向页面代码暴露 accessToken。
`currentUser()` 返回 `User & { roles: string[], permissions: string[] }`，供客户端在恢复会话时同步撤权结果。

## §8 API Key 管理 — `iam.apiKey`

先在初始化配置中启用 API Key。它是用户的受限凭据，不能独立授予用户未拥有的权限：**有效权限 = 当前主体权限 ∩ scopes**。scopes 是与权限 code 相同的字符串，不是角色名、菜单名称或资源 ID；不会创建权限，也不会替代租户/记录归属校验。

```yaml
# config/_iam.yml
login:
  apikey: true
apikey:
  maxKeysPerUser: 10
  defaultExpirationDays: 30
```

假设主体拥有 `record:read`、`record:write`、`user:read`，不同 scopes 的结果如下（主体授权改变后重新计算）：

| scopes                         | 有效权限                      | roles        |
| ------------------------------ | ----------------------------- | ------------ |
| 未传或 `[]`                    | 无操作权限，仅可识别身份      | `[]`         |
| `['record:read']`              | `record:read`                 | `[]`         |
| `['record:*']`                 | `record:read`、`record:write` | `[]`         |
| `['record:read', 'user:read']` | 两个指定权限                  | `[]`         |
| `['missing:read']`             | 主体未拥有，因此无权限        | `[]`         |
| `['*']`                        | 主体当前拥有的全部权限        | 保留主体角色 |

`record:*` 匹配冒号后的全部层级，不支持任意正则或 `record:r*` 等中间通配符。主体仅拥有 `record:read` 时，`['record:*']` 仍只得到读取权限；主体持有通配符时，交集保留较窄范围。受限 Key 没有角色入口，使用 permission 守卫；显式 `*` 是宽授权，按实际需要选择。

以下为创建 → Key 登录 → Bearer 会话验证与操作授权 → 列表 → 撤销的服务端示例。先检查所有 HaiResult；每个管理入口还要校验本人归属或管理员权限，IAM 不知道业务的调用者身份。

```ts
import { err, HaiCommonError, ok } from '@h-ai/core'
import { iam } from '@h-ai/iam'

async function createReadKey(userId: string) {
  // 调用前校验管理权限或本人归属；scopes 使用权限 code。
  const created = await iam.apiKey.createApiKey(userId, {
    name: 'Read client',
    expirationDays: 30,
    scopes: ['record:read'],
  })
  if (!created.success)
    return created
  // rawKey 仅本次返回；通过安全渠道展示一次，不写日志。
  return created
}

async function apiKeyLogin(rawKey: string) {
  // 通常由客户端取得 Key 后调用；服务器内部验证并绑定 Key。
  return iam.auth.loginWithApiKey({ key: rawKey })
}

async function requireRecordRead(accessToken: string, deniedMessage: string) {
  // deniedMessage 由应用 i18n 提供；先读取当前且已收敛 scope 的会话。
  const verified = await iam.auth.verifyToken(accessToken)
  if (!verified.success)
    return verified
  const allowed = verified.data.permissions.some(code =>
    code === '*' || code === 'record:read'
    || (code.endsWith(':*') && 'record:read'.startsWith(code.slice(0, -1))),
  )
  if (!allowed)
    return err(HaiCommonError.FORBIDDEN, deniedMessage)
  // 这里只确认操作权限；业务层还须检查具体记录的数据归属。
  return ok({ userId: verified.data.userId })
}

async function listMyKeys(userId: string) {
  return iam.apiKey.listApiKeys(userId, {
    page: 1,
    pageSize: 20,
    search: 'Read',
    enabled: true,
  })
}

async function revokeKey(keyId: string) {
  // 调用前校验本人归属或管理权限。
  return iam.apiKey.revokeApiKey(keyId)
}
```

创建后只有 `rawKey` 能用于 Key 登录；`apiKey.id` 是管理 ID，`keyPrefix` 仅用于显示/检索，均不能代替 rawKey。`verifyApiKey(rawKey)` 仅验证 Key 并返回元数据，不能代替用户状态、scopes 与操作授权。

Key 登录会话绑定 Key ID。刷新使用普通 `iam.session.refresh`，不会丢失该绑定或扩大 scopes。撤销成功后，已有 accessToken 的 get/verify 以及 refreshToken 的 refresh 都会失败；过期、禁用及必要状态读取失败同样拒绝。角色撤权由 `iam.auth.verifyToken` 读取当前授权生效。改 scope 使用创建新 Key 后撤销旧 Key，当前 API 不提供 scope 更新操作。

`expirationDays: 0` 表示不设过期时间，省略时使用 `apikey.defaultExpirationDays`；需要限时访问时显式设置。明文 Key 和 Token 不进入 URL、日志、公开配置或普通 localStorage。

| 方法           | 签名                                                                                     | 说明                                                          |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `createApiKey` | `(userId, { name, expirationDays?, scopes? }) => Promise<HaiResult<CreateApiKeyResult>>` | 创建 API Key（`rawKey` 仅返回一次）                           |
| `listApiKeys`  | `(userId, options?: ListApiKeysOptions) => Promise<HaiResult<PaginatedResult<ApiKey>>>`  | 分页列出用户 API Key（支持 search / enabled / sortBy / 分页） |
| `getApiKey`    | `(keyId) => Promise<HaiResult<ApiKey \| null>>`                                          | 获取 API Key 详情                                             |
| `revokeApiKey` | `(keyId) => Promise<HaiResult<void>>`                                                    | 吊销 API Key                                                  |
| `verifyApiKey` | `(rawKey) => Promise<HaiResult<ApiKey>>`                                                 | 验证 API Key 有效性                                           |

## §9 自动会话失效

以下操作自动清除受影响用户的所有活跃会话：

- `deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset`

以下操作通过 `patchUserSessions` 同步更新活跃会话中的角色/权限列表（best-effort）：

- `assignRole` / `removeRole` / `syncRoles` / `deleteRole`
- `assignPermissionToRole` / `removePermissionFromRole`

## §10 错误码 — `HaiIamError`

| 错误码                                  | code          | 说明             |
| --------------------------------------- | ------------- | ---------------- |
| **认证**                                |               |                  |
| `HaiIamError.AUTH_FAILED`               | `hai:iam:001` | 认证失败         |
| `HaiIamError.INVALID_CREDENTIALS`       | `hai:iam:002` | 凭证无效         |
| `HaiIamError.USER_NOT_FOUND`            | `hai:iam:003` | 用户不存在       |
| `HaiIamError.USER_DISABLED`             | `hai:iam:004` | 用户已禁用       |
| `HaiIamError.USER_LOCKED`               | `hai:iam:005` | 用户已锁定       |
| `HaiIamError.USER_ALREADY_EXISTS`       | `hai:iam:006` | 用户已存在       |
| `HaiIamError.PASSWORD_EXPIRED`          | `hai:iam:007` | 密码已过期       |
| `HaiIamError.PASSWORD_POLICY_VIOLATION` | `hai:iam:008` | 密码不符合策略   |
| `HaiIamError.PASSWORD_REUSE_NOT_ALLOWED` | `hai:iam:034` | 新旧密码相同     |
| `HaiIamError.OTP_INVALID`               | `hai:iam:009` | 验证码无效       |
| `HaiIamError.NOT_INITIALIZED`           | `hai:iam:010` | 未初始化         |
| `HaiIamError.OTP_RESEND_TOO_FAST`       | `hai:iam:011` | 发送过于频繁     |
| `HaiIamError.LOGIN_DISABLED`            | `hai:iam:012` | 登录方式已禁用   |
| `HaiIamError.REGISTER_DISABLED`         | `hai:iam:013` | 注册已禁用       |
| `HaiIamError.STRATEGY_NOT_SUPPORTED`    | `hai:iam:014` | 认证策略不支持   |
| `HaiIamError.APIKEY_INVALID`            | `hai:iam:015` | API Key 无效     |
| `HaiIamError.APIKEY_EXPIRED`            | `hai:iam:016` | API Key 已过期   |
| `HaiIamError.APIKEY_DISABLED`           | `hai:iam:017` | API Key 已禁用   |
| `HaiIamError.APIKEY_NOT_FOUND`          | `hai:iam:018` | API Key 不存在   |
| `HaiIamError.RESET_TOKEN_INVALID`       | `hai:iam:019` | 重置令牌无效     |
| `HaiIamError.RESET_TOKEN_EXPIRED`       | `hai:iam:020` | 重置令牌已过期   |
| `HaiIamError.RESET_TOKEN_MAX_ATTEMPTS`  | `hai:iam:021` | 重置验证次数超限 |
| `HaiIamError.OTP_EXPIRED`               | `hai:iam:022` | 验证码已过期     |
| **会话**                                |               |                  |
| `HaiIamError.SESSION_NOT_FOUND`         | `hai:iam:101` | 会话不存在       |
| `HaiIamError.SESSION_EXPIRED`           | `hai:iam:102` | 会话已过期       |
| `HaiIamError.SESSION_INVALID`           | `hai:iam:103` | 会话无效         |
| `HaiIamError.SESSION_CREATE_FAILED`     | `hai:iam:104` | 会话创建失败     |
| `HaiIamError.TOKEN_EXPIRED`             | `hai:iam:105` | 令牌已过期       |
| `HaiIamError.TOKEN_INVALID`             | `hai:iam:106` | 令牌无效         |
| `HaiIamError.TOKEN_REFRESH_FAILED`      | `hai:iam:107` | 令牌刷新失败     |
| **授权**                                |               |                  |
| `HaiIamError.PERMISSION_DENIED`         | `hai:iam:201` | 权限不足         |
| `HaiIamError.ROLE_NOT_FOUND`            | `hai:iam:202` | 角色不存在       |
| `HaiIamError.PERMISSION_NOT_FOUND`      | `hai:iam:203` | 权限不存在       |
| `HaiIamError.ROLE_ALREADY_EXISTS`       | `hai:iam:204` | 角色已存在       |
| `HaiIamError.PERMISSION_ALREADY_EXISTS` | `hai:iam:205` | 权限已存在       |
| **LDAP**                                |               |                  |
| `HaiIamError.LDAP_CONNECTION_FAILED`    | `hai:iam:301` | LDAP 连接失败    |
| `HaiIamError.LDAP_BIND_FAILED`          | `hai:iam:302` | LDAP 绑定失败    |
| `HaiIamError.LDAP_SEARCH_FAILED`        | `hai:iam:303` | LDAP 搜索失败    |
| **存储层**                              |               |                  |
| `HaiIamError.REPOSITORY_ERROR`          | `hai:iam:401` | 存储层操作错误   |
| `HaiIamError.NOT_FOUND`                 | `hai:iam:402` | 资源不存在       |
| `HaiIamError.CONFLICT`                  | `hai:iam:403` | 资源冲突         |
| **通用**                                |               |                  |
| `HaiIamError.FORBIDDEN`                 | `hai:iam:501` | 禁止访问         |
| `HaiIamError.INVALID_ARGUMENT`          | `hai:iam:502` | 参数无效         |
| `HaiIamError.CONFIG_ERROR`              | `hai:iam:901` | 配置错误         |
| `HaiIamError.INTERNAL_ERROR`            | `hai:iam:999` | 内部错误         |

## §11 常见模式

### 登录 → 操作 → 登出

```ts
import { iam } from '@h-ai/iam'

// 应用已经初始化依赖与 IAM；读取失败也必须执行会话撤销。
async function loginInspectAndLogout() {
  const login = await iam.auth.login({ identifier: 'alice', password: 'ExampleOnly123!' })
  if (!login.success)
    return login
  const verified = await iam.auth.verifyToken(login.data.tokens.accessToken)
  const inspected = verified.success
    ? await iam.authz.checkPermission(login.data.user.id, 'user:update')
    : verified
  const loggedOut = await iam.auth.logout(login.data.tokens.accessToken)
  if (!loggedOut.success)
    return loggedOut
  return inspected
}
```

### 注册 + 分配角色

```typescript
const regResult = await iam.user.register({
  username: 'newuser',
  email: 'new@example.com',
  password: 'SecureP@ssw0rd',
})
if (regResult.success) {
  await iam.authz.assignRole(regResult.data.user.id, editorRoleId)
}
```

### 密码重置流程

```typescript
// 1. 请求重置（防枚举，始终返回成功）
await iam.user.requestPasswordReset('user@example.com')

// 2. 通过邮件链接的 token 重置
const resetResult = await iam.user.confirmPasswordReset(token, 'NewP@ssw0rd')
// 自动清除所有会话
```

## 配置驱动认证页面

### 配置 Markdown 协议

协议支持 `agreements.userAgreementMarkdown` 与 `privacyPolicyMarkdown` 直接从配置加载；YAML 的 `|` 保留 Markdown 段落和换行。弹窗复用安全 MarkdownRenderer，关闭原始 HTML、脚本和代码复制工具。同主题同时提供正文与 URL 时优先正文，URL 可作为额外查看入口；只有 URL 时使用隔离 iframe。

```yaml
agreements:
  showOnRegister: true
  showOnLogin: false
  userAgreementMarkdown: |
    # 用户协议

    **账户使用条款**

    - 请妥善保管账户凭据。
  privacyPolicyMarkdown: |
    # 隐私政策

    注册资料用于账户管理，会话信息用于身份认证。
  # 可选 URL；同主题同时配置 Markdown 和 URL 时，弹窗优先显示 Markdown。
  # userAgreementUrl: https://example.com/terms
  # privacyPolicyUrl: https://example.com/privacy
```

服务端通过 `await iam.getPublicConfig()` 提供包含数据库规则的白名单配置，先检查 `success`；失败不提供伪完整策略，同步 `iam.publicConfig` 只含文件快照，或通过客户端的 `client.iam.auth.publicConfig()` 标准 HTTP contract 获取。只展示已开启且具备依赖的登录方式；LDAP 为可选集成，见上方配置与安装说明。

| 配置                                                                                 | 用途                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `login.password / otp / ldap`                                                        | 独立启用密码、验证码、企业账号                        |
| `otp.email / sms`                                                                    | 独立启用邮件、短信                                    |
| `register.enabled / defaultEnabled`                                                  | 自助注册及新账户状态                                  |
| `passwordReset.enabled / mode / resetUrl`                                            | 启用重置、选择 email/phone 渠道、配置重置页面绝对地址 |
| `agreements.showOnRegister / showOnLogin`                                            | 注册/登录协议弹窗显示；链接只接受 HTTP(S)             |
| `ui.variant / title / subtitle / brandTitle / brandText / logoUrl / illustrationUrl` | 卡片/分栏布局、标题、品牌、Logo 和配图                |

选择 Reach 时，在 reldb/cache/Reach 初始化成功后使用 `iam.init({ ...settings, reach })` 自动接入 Reach 的 `otp_email`、`otp_sms`、`password_reset`、`password_reset_sms` 模板。模板绑定对应邮件/短信 Provider；显式发送回调可覆盖默认行为。Console Provider 只记录元数据，实际收信需配置 SMTP、短信或 HTTP 通知服务。发送失败返回错误，不会伪报已发送。

SvelteKit 使用 `kit.auth.createApi(iam)` 导出标准 handler，匿名端点白名单使用 `kit.auth.publicPaths`。客户端通过 `kit.client.createAuthActions()` 连接 Cookie 端点；独立 HTTP 客户端通过 `apiClient.createAuthActions(client)` 连接 IAM contract 并自动保存 Token 到已配置安全存储。将配置及动作直接传入 `AuthPanel`，完成登录、注册、找回及重置；单独使用 `LoginForm` 可传 `methods`、`onsendotp`、`resendInterval`，密码表单可传完整 `passwordPolicy`。

管理员使用 `iam.user.createUser()` 建用户，调用端必须校验管理员权限；关闭自助注册不影响管理端。注册与密码登录开关独立，`registerAndLogin` 在注册完成后创建会话；默认禁用账户不会创建会话。

### 分布式安全与边界

所有节点共享同一数据库和 Redis；Memory 仅用于单进程测试。OTP 的验证码、尝试次数和冷却期保存在同一身份 key，通过 CAS 发布和消费；冲突拒绝旧代，消费/耗尽保留冷却期。密码重置的摘要、有效期、尝试次数和 resetVersion 保存在用户数据库行，策略失败计次，最终一条条件 SQL 同时改密、消费令牌并推进 credentialVersion；新令牌、后续尝试、停用或到期都会阻止迟到提交。发送重置请求只推进 resetVersion，不撤销现有会话；成功改密才推进 credentialVersion。认证策略保存已验证的凭据代际，建立会话/认证/刷新均校验共享代际缓存或安全回源的当前状态；缓存批量清理失败也不能使旧会话有效。通知只在成功发布后调用，第三参数为 { expiresAt, idempotencyKey }，应用及 Reach Provider 必须用该稳定键持久化去重。异常/超时可能已送达，返回结果未知，不自动重发或回滚已发布凭据；没有接收端幂等保障时不能承诺外部副作用恰好一次。

可选字段（如 `ldap`）若尚未写入 YAML，请先声明该字段，或通过 `HAI_IAM` 的 JSON 值整体覆盖模块配置；已有字段支持 `HAI_IAM_LOGIN_OTP` 等环境变量覆盖。

`create({ maxAge })` 可覆盖配置默认时长（正安全整数秒），该值持久化为 `Session.maxAge`；签发和刷新返回的 `expiresIn` 均使用它。滑动续期按该时长延长 access，返回已成功提交的 `lastActiveAt/expiresAt`；迟到请求只延长时间，不缩短较新续期。显式 `update` 的有效日期补丁完整生效并产生新内容版本。客户端根据本次返回的 `expiresIn` 安排刷新，不能硬编码配置默认值。

未启用额外期限时，access 与 refresh 独立到期：access 过期仍可凭有效 refresh 轮换，刷新不先要求旧 access 认证。`session.idleTimeout`、`absoluteTimeout` 以秒配置，0关闭；启用后 access 与 refresh 均检查，刷新保留首次登录时间。成功的 access 认证请求算活动；自动 refresh 仅换票，不延长闲置期限。后台业务轮询仍需按项目设计。`maxSessions: 0` 不限，否则在用户分区 CAS 原子限制有效会话数；`singleDevice: true` 默认顶旧保新，`singleDeviceMode: 'reject'` 保留旧会话并拒绝新登录。删除 access、logoutAll、单设备替换均撤销对应 refresh；`revokeRefresh` 保留仍有效的 access。

账号默认 `permanent/active`；管理端可配置 `temporary` 与 `accountExpiresAt`，或设 `accountStatus` 为 `dormant/closed`。状态/有效期变化推进持久凭据代际，重新激活不恢复旧会话。`accounts.dormantAfterDays: 0` 关闭自动休眠；启用后按 `scanIntervalSeconds` 扫描最后成功登录/创建时间，也可从可信后台调用 `iam.user.scanInactiveAccounts()`。公开注册不能接受管理字段；`closed` 保留记录，个人数据注销由项目处理。

`password.minCharacterClasses` 支持任意 N 类字符；创建/改密/重置共用服务端强度校验。`expirationDays: 0` 关闭期限；`preventSamePassword` 可独立启用，期限或首次强改时也拒绝旧密码。`requireInitialChange` 只约束管理端初始/重置密码，关闭后不受历史标记约束。首次/过期用户用 `iam.user.renewPassword({identifier,password,newPassword})` 完成原密码验证与换密后重新登录，不能先授予普通会话。AuthPanel 与标准 Kit/Serv 端点提供该流程。

`security.lockoutEnabled` 可关闭失败锁定；`failureWindow` 为首次失败起的固定窗口秒数（默认86400），并用 `maxLoginAttempts/lockoutDuration` 配置阈值/锁定时间。共享 DB 原子计次。`initialCredentials.enabled` 开启 `iam.user.inviteUser()`，只发送现有 passwordReset 短期单次设密邀请，随机初始秘密不外发；需要重置通知就绪。投递未知保留账号/已发布凭据并返回失败，先核对后恢复，不自动重发或删除账号。

`loginAccess.enabled` 配置 `allowIps/denyIps`（IP/CIDR，拒绝优先）、IANA `timezone` 和 `windows[{days,start,end}]`（周一1至周日7，HH:mm，含起不含止，跨午夜）。登录第二参 `AuthRequestContext` 必须来自可信宿主；不能使用任意转发头/JSON IP。地址规则启用但缺少可信地址时拒绝。`reauthentication.enabled/operations/ttlSeconds` 控制敏感操作证明；`reauthenticate` 验证原密码，`checkSensitiveOperation` 在原有权限/资源检查后原子消费短期单次票据，绑定用户/会话/操作。Serv 标准 IAM 写操作和 admin 守卫用 `x-hai-reauthentication`，Kit 业务用 `kit.guard.requireSensitive`；证明不提升权限且只短暂保存在内存。


会话仓库将缓存读取/提交失败返回为失败 HaiResult，不解释为会话不存在或过期，也不执行清理补偿。用户会话及索引共用一个文档，批量授权更新不再逐 token 调用 get/ttl 或维护第二份索引；只按已确认的绝对期限清理。故障恢复后可重新读取并重试更新/退出，logoutAll 仍覆盖原有全部记录。结构损坏同样失败关闭并保留原值，交由运维处理，禁止用空文档覆盖未知授权状态。

LDAP 的 ldapSyncUser: false 要求已有启用的本地用户以绑定数据库 credentialVersion；没有本地记录返回 USER_NOT_FOUND，不再创建虚拟 DN 身份。

Session.credentialVersion 绑定创建时的数据库凭据代际；CreateSessionOptions.expectedCredentialVersion 仅供已验证策略传入，旧代拒绝。省略它的受信低层 create 仍读取真实、启用的本地用户并绑定当前代，不能伪造缺少数据库记录的身份。

`iam.auth.logout(accessToken)` 直接按完整不透明令牌在用户分区执行一次 CAS，原子撤销 access 与关联 refresh；access 已到期也不能跳过撤销。非法/不存在的令牌幂等成功，缓存读取或提交故障返回失败，恢复后可用同一令牌重试。HTTP 登出只允许撤销所持令牌，不以 userId 定位他人会话，也不要求该 access 仍通过认证。调用方必须检查 `success`；本地 Cookie/安全存储清理不代表服务端撤销已经确认，失败应显示提示。

`captcha.enabled` 默认关闭；开启后共享 Cache 保存自托管 ALTCHA 的签名秘密/用途/相对TTL，iam.auth.createCaptcha({operation}) 只返回 {id,challenge}。标准 AuthPanel/createAuthActions 自动求解并通过 captcha 字段提交；自定义表单用 altcha/lib 求解。login/register/sendOtp/passwordReset/renewPassword 严格用途绑定，验证后原子单用，失败也需新挑战；API Key 机器鉴别和管理员创建/邀请不额外加人机交互。sendOtp(identifier,{captcha})、requestPasswordReset(identifier,{captcha}) 第二参数不能在审计/HTTP包装层丢失。TTL默认120秒、cost5000、maxCounter100，可按设备设置；计算工作量不保证是真人。Cache 故障拒绝，重初始化不延期，证明不持久化在浏览器或进入日志。标准 Kit 须导出 POST /api/auth/captcha，Serv 已提供；公开配置只含 captcha.enabled。错误030/031/032/033分别需验证/无效已用过期/关闭/不可用。



### 页面离开会话

`session.endOnPageHide` 默认关闭。Kit/typed client 的 `createAuthActions().bindPageExit({ enabled })` 返回监听清理函数，宿主卸载时调用；typed client.close 也清理本实例监听。请求走现有 CSRF/加密管线，POST `/auth/session/close` 仅撤销所持旧会话，不清 Cookie，避免迟到响应影响新登录。刷新/整页导航也触发，BFCache 跳过；浏览器关闭属于最善努力，需配合服务端闲置/绝对期限，显式 logout 始终可靠撤销。
