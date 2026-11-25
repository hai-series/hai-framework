# @h-ai/iam 功能说明

[English](iam.en.md) · [日本語](iam.ja.md)

在 Node.js 服务端用 `iam` 验证身份、管理会话，并为用户分配角色和权限。浏览器通过应用的 HTTP 接口登录和管理账号，也可以导入浏览器入口公开的类型、错误定义和权限标识。

[模块 README](../../../packages/iam/README.md) · [配置清单](../configuration/iam.md) · [数据结构](../data/iam.md) · [身份认证接入](../development/authentication.md)

<a id="quick-start"></a>

## 最小接入示例

<a id="module-dependencies"></a>

### 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| Node.js | 运行认证和授权服务。 | 服务端 IAM 功能。 | 在接收认证请求前启动 IAM。 |
| `@h-ai/reldb` | 保存账号、角色和权限。 | 必需。 | 在 `iam.init()` 前初始化。 |
| `@h-ai/cache` | 管理会话、一次性验证码和票据。 | 必需。 | 在 `iam.init()` 前初始化。 |
| `@h-ai/core` | 提供日志、错误和请求上下文。 | 随 IAM 安装。 | 应用使用自定义日志或共享配置时先配置 Core。 |
| `@h-ai/crypto` | 提供密码哈希等加密能力。 | 随 IAM 安装。 | `iam.init()` 复用已就绪的 Crypto，并在需要时自行初始化。 |
| `@h-ai/audit` | 采集 IAM 安全事件。 | 随 IAM 安装。应用启用审计采集时使用。 | 先启动 Audit 并启用 `capture`，再启动 IAM。关闭时先停 IAM。 |
| `@h-ai/reach` | 通过标准模板发送验证码、密码重置及初始设密邀请。 | 使用 Reach 发送时安装。应用也可以提供自己的发送回调。 | 先初始化 Reach，再传给 `iam.init({ ...config, reach })`。 |
| LDAP 目录与 `ldapts` | 连接目录执行 LDAP 登录。 | 启用 LDAP 需要可访问的目录。使用默认客户端时安装 `ldapts`。 | 初始化 IAM 时传目录配置。使用自定义客户端时传 `ldapClientFactory`。 |
| `altcha`、`zod` | 生成与验证验证码挑战，校验配置与输入。 | 随 IAM 安装。ALTCHA 用于开启人机验证的场景。 | IAM 按配置调用。 |

### 安装

```bash
pnpm add @h-ai/iam @h-ai/reldb @h-ai/cache @h-ai/core
```

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 基础密码认证不需要安装 Reach 或 ldapts。
async function example() {
  try {
    // 用项目中的 data.db 打开 SQLite，成功无数据；失败时不开始 IAM。
    const db = await reldb.init({ type: 'sqlite', database: './data.db' })
    if (!db.success)
      return db
    // 为开发登录建立本进程缓存，成功无数据；生产要求共享后端时会失败。
    const cached = await cache.init({ type: 'memory' })
    if (!cached.success)
      return cached
    // 在已启动的数据库和缓存上应用默认身份配置，成功无数据；初始化失败时不注册用户。
    const initialized = await iam.init({})
    if (!initialized.success)
      return initialized
    // 用示例用户名 demo 和密码注册，成功返回注册结果；占用的用户名或密码策略不符会失败。
    const registered = await iam.user.register({ username: 'demo', password: 'Password123' })
    if (!registered.success)
      return registered
    // 以刚注册的 demo 和相同密码登录，成功返回用户和令牌；凭据不符会失败。
    const login = await iam.auth.login({ identifier: 'demo', password: 'Password123' })
    if (!login.success)
      return login
    // 验证登录刚返回的 access token，成功返回当前授权下的会话；无效或过期令牌失败。
    return await iam.auth.verifyToken(login.data.tokens.accessToken)
  }
  finally {
    // 应用关闭时按依赖的反向顺序释放。
    // 无参关闭 IAM 并停止继续使用当前运行期状态；不会替宿主关闭数据库和缓存。
    await iam.close()
    // 无参释放例中的 Memory 后端与进程内数据，关闭结果由缓存模块独立返回。
    await cache.close()
    // 最后无参释放 data.db 的数据库连接，结果独立于登录结果。
    await reldb.close()
  }
}

const result = await example()
if (!result.success)
  // 写 ERROR 日志并带失败码，不输出示例密码和令牌。
  core.logger.error('Authentication example failed', { code: result.error.code })
```

默认 LDAP 关闭；OTP 需要 `otp` 配置和可用发送回调，重置需要可用通知回调，才能在 `iam.publicConfig` 中启用。

`iam.config` 返回的是**脱敏后的配置快照**：LDAP `url` / `bindPassword` 等敏感配置会自动隐藏，便于状态检查但不能代替原始配置源。

<a id="api-reference"></a>

## 功能说明

下面示例在 IAM 成功初始化后运行。每次调用后检查 `success`，失败时返回原结果，成功后读取 `data`；未给出函数声明的片段位于应用的异步业务函数内。管理操作须先在应用入口授权。


<a id="lifecycle"></a>

### 准备认证服务与公开策略：`iam`

先准备数据库和缓存，再启动 IAM；公开配置供界面决定显示哪些认证入口，不包含密钥。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `iam.init(config)` | 先连接 RelDB 和 Cache，再等待身份服务可用 | `config: IamConfigInput` 必填，可传空对象。字段见[配置参考](../configuration/iam.md)。 | `Promise<HaiResult<void>>` | `await iam.init({})` |
| `iam.close()` | 释放 IAM 运行时状态；缓存和数据库仍由应用关闭 | 无参数 | `Promise<void>` | `await iam.close()` |
| `iam.getPublicConfig()` | 读取包含持久敏感操作规则的公开策略 | 无参数 | `Promise<HaiResult<IamPublicConfig>>` | `await iam.getPublicConfig()` |
| `iam.config` | 读取当前脱敏配置 | 只读属性，无参数 | `IamConfig \| null` | `iam.config` |
| `iam.publicConfig` | 读取最近一次公开策略快照 | 只读属性，无参数 | `IamPublicConfig \| null` | `iam.publicConfig` |
| `iam.isInitialized` | 检查身份服务是否就绪 | 只读属性，无参数 | `boolean` | `iam.isInitialized` |

##### 公开策略与认证界面

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

服务端通过 `iam.publicConfig` 提供白名单配置，或通过客户端的 `client.iam.auth.publicConfig()` 标准 HTTP contract 获取。只展示已开启且具备依赖的登录方式；LDAP 接入见上方可选配置，默认关闭；只有选用默认客户端时才安装 ldapts。

| 配置                                                                                 | 用途                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `login.password / otp / ldap`                                                        | 独立启用密码、验证码、企业账号                        |
| `otp.email / sms`                                                                    | 独立启用邮件、短信                                    |
| `register.enabled / defaultAccountStatus`                                            | 自助注册及新账户状态                                  |
| `passwordReset.enabled / mode / resetUrl`                                            | 启用重置、选择 email/phone 渠道、配置重置页面绝对地址 |
| `agreements.showOnRegister / showOnLogin`                                            | 注册/登录协议弹窗显示；链接只接受 HTTP(S)             |
| `ui.variant / title / subtitle / brandTitle / brandText / logoUrl / illustrationUrl` | 卡片/分栏布局、标题、品牌、Logo 和配图                |

选用 Reach 时，在 reldb/cache/Reach 初始化成功后使用 `iam.init({ ...settings, reach })` 自动接入 Reach 的 `otp_email`、`otp_sms`、`password_reset`、`password_reset_sms` 模板。模板绑定对应邮件/短信 Provider；显式发送回调可覆盖默认行为。Console Provider 只记录元数据，实际收信需配置 SMTP、短信或 HTTP 通知服务。发送失败返回错误，不会伪报已发送。

SvelteKit 使用 `kit.auth.createApi(iam)` 导出标准 handler，匿名端点白名单使用 `kit.auth.publicPaths`。客户端通过 `kit.client.createAuthActions()` 连接 Cookie 端点；独立 HTTP 客户端通过 `apiClient.createAuthActions(client)` 连接 IAM contract 并自动保存 Token 到已配置安全存储。将配置及动作直接传入 `AuthPanel`，完成登录、注册、找回及重置；单独使用 `LoginForm` 可传 `methods`、`onsendotp`、`resendInterval`，密码表单可传完整 `passwordPolicy`。

管理员使用 `iam.user.createUser()` 建用户，调用端必须校验管理员权限；关闭自助注册不影响管理端。注册与密码登录开关独立，`registerAndLogin` 在注册完成后创建会话；默认休眠账号不会创建会话；`defaultAccountStatus` 默认 active，可设为 dormant 等待管理员激活。

协议在 Modal 中打开，关闭后保留表单输入。使用 URL 时，协议页面须允许 iframe 嵌入；禁止脚本执行，并提供新窗口查看入口。`LoginForm/RegisterForm` 提供 `header/extraFields/footer` snippet，`AuthPanel` 透传 `loginHeader/loginFields/loginFooter` 和 `registerHeader/registerFields/registerFooter`；自定义字段由应用绑定状态并在动作中处理。示例见 [UI 用法](./ui.md#配置驱动认证页面).

#### 场景：准备认证服务与公开策略

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 无参读取合并后的公开认证策略；成功不含私密设置，失败时返回原失败结果。
const publicSettingsResult = await iam.getPublicConfig()
if (!publicSettingsResult.success)
  return publicSettingsResult
const publicSettings = publicSettingsResult.data // merged public IAM settings
// Read only the returned public policy; never return iam.config as a public response.
```

初始化与反序关闭见最小接入；公开配置按当前设置返回，不能用于绕过服务端策略。输入配置的实际文件字段仍在配置页。

| 功能           | 说明                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- |
| **认证**       | 密码、OTP（邮箱/短信验证码）、LDAP、API Key 多策略认证                                 |
| **会话**       | 有状态会话（随机访问令牌 + 缓存，滑动续期可选）                                        |
| **授权**       | RBAC 角色与权限管理（DB 批量读取，通配符权限匹配）                                     |
| **用户管理**   | 注册、查询、更新、密码重置、管理员重置密码                                             |
| **API Key**    | API Key 创建、吊销、验证，支持 scope 与过期时间                                        |
| **一次性票据** | 短期、一次性能力票据（签发 / 原子消费），用于 WebSocket 等无法携带 Bearer Token 的通道 |
| **前端客户端** | HTTP API 契约定义，支持独立前端使用                                                    |

初始化成功后才能调用业务方法。应用代码在调用前准备实际的业务参数，校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

应用先检查当前用户是否有权操作这个用户 ID 或权限编号，再调用 IAM 管理方法。用户 ID、访问令牌、刷新令牌和一次性操作票据分别按参数传入。`expectedVersion` 取自最近一次读取的版本，`tx` 是应用已打开的同一个事务。

config/publicConfig 未初始化时为 null；publicConfig 是内存中的最近快照，需要刷新持久规则时调用上表的 getPublicConfig 并检查结果。isInitialized 只表示本模块就绪，不代替业务授权。

<a id="detailed-workflow"></a>

#### 场景：在浏览器读取公开策略

浏览器使用 [API Client](api-client.md#auth-actions) 调用标准 HTTP 接口。浏览器入口只有类型、Schema 和错误定义，不包含服务端 iam 实例；不要把 iam.config 发到浏览器。

#### 场景：提供可安全显示的协议内容

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

#### 公开配置与服务端策略边界

所有节点连接同一数据库和 Redis。Memory 仅用于单进程测试。对同一邮箱或手机号，Redis 在一个键里保存验证码、剩余尝试次数和重发冷却时间。发出新码、尝试验证码或使用验证码时，核对记录仍是本次读取的版本。验证码已使用或次数耗尽后，冷却时间仍生效。

密码重置在用户的数据库记录里保存令牌摘要、截止时间、尝试次数和 `resetVersion`。密码不符合规则时也会计一次尝试。一条有条件的 SQL 同时核对令牌、更新密码并更改 `credentialVersion`。如果另一条请求发出了新令牌、消耗了此次尝试、停用了账号，或者令牌已过期，较早的请求就不能改密码。发送重置请求只改变 `resetVersion`，用户实际改密后才改变 `credentialVersion`，使旧会话失效。建立、验证和刷新会话都会核对当前凭据版本。缓存清理失败也不会恢复旧会话。

验证码或重置令牌保存成功后才调用通知回调。第三个参数包含 `expiresAt` 和 `idempotencyKey`，应用和 Reach 通知渠道都应使用同一个键避免重发。回调超时或出错时，外部通知可能已经发出，先核对渠道记录再决定是否补发。

可选字段（如 `ldap`）若尚未写入 YAML，请先声明该字段，或通过 `HAI_IAM` 的 JSON 值整体覆盖模块配置；已有字段支持 `HAI_IAM_LOGIN_OTP` 等环境变量覆盖。

标准 HTTP 入口：`GET /auth/config`、`POST /auth/login/ldap`、`POST /auth/password-reset/request`、`POST /auth/password-reset/confirm`；验证码继续使用 `/auth/otp/send` 与 `/auth/login/otp`。安全错误：`SECURITY_BUSY (hai:iam:023)`、`PASSWORD_RESET_DISABLED (hai:iam:024)`。

<a id="authentication"></a>

### 登录、注册与再次验证：`iam.auth`

按服务器启用的方式登录，挑战、密码到期和敏感操作凭据都跟随对应认证流程，不在前端自行判定身份。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `iam.auth.login(credentials, context?)` | 用密码验证身份并创建会话 | `credentials: PasswordCredentials`、`context?: AuthRequestContext` · 前者提供密码凭据，上下文由宿主用于登录策略和追踪 · [对象参数](#authentication-arguments) | `AuthResult` | `await iam.auth.login({ identifier, password })` |
| `iam.auth.loginWithOtp(credentials, context?)` | 用验证码验证身份并创建会话 | `credentials: OtpCredentials`、`context?: AuthRequestContext` · 前者提供账号标识和验证码，上下文用于策略和追踪 · [对象参数](#authentication-arguments) | `AuthResult` | `await iam.auth.loginWithOtp({ identifier, code })` |
| `iam.auth.loginWithLdap(credentials, context?)` | 用目录账号验证身份 | `credentials: LdapCredentials`、`context?: AuthRequestContext` · 前者提供目录账号密码，上下文用于策略和追踪 · [对象参数](#authentication-arguments) | `AuthResult` | `await iam.auth.loginWithLdap({ username, password })` |
| `iam.auth.loginWithApiKey(credentials, context?)` | 用程序凭据建立受限会话 | `credentials: ApiKeyCredentials`、`context?: AuthRequestContext` · 前者提供已签发密钥，上下文用于策略和追踪 · [对象参数](#authentication-arguments) | `AuthResult` | `await iam.auth.loginWithApiKey({ key: rawKey })` |
| `iam.auth.registerAndLogin(options, context?)` | 注册并在允许时创建会话 | `options: RegisterOptions` 提供注册账号、密码和资料；`context` 补充本次登录会话的终端与请求信息 · [对象参数](#users-arguments) · `context?: AuthRequestContext` · [对象参数](#authentication-arguments) | `AuthResult` | `await iam.auth.registerAndLogin({ username, password })` |
| `iam.auth.createCaptcha(input)` | 为指定操作创建交互挑战 | `input: { operation: CaptchaOperation }` 必填，指定 `login`、`register`、`sendOtp`、`passwordReset` 或 `renewPassword` | `IamCaptchaChallenge` | `await iam.auth.createCaptcha({ operation: 'login' })` |
| `iam.auth.sendOtp(identifier, options?)` | 向已启用通道发送验证码 | `identifier: string` 按启用渠道识别的账号标识，例如邮箱或手机号 · `options?: { captcha?: string }` 为当前操作提供交互挑战证明 | `{ expiresAt: Date; }` | `await iam.auth.sendOtp(identifier)` |
| `iam.auth.verifyToken(accessToken)` | 校验访问令牌和当前身份状态 | `accessToken: string` 当前会话的访问令牌 | `Session` | `await iam.auth.verifyToken(accessToken)` |
| `iam.auth.logout(accessToken)` | 撤销所持访问及关联刷新令牌 | `accessToken: string` 当前会话的访问令牌 | `void` | `await iam.auth.logout(accessToken)` |
| `iam.auth.reauthenticate(accessToken, password, operation)` | 再次验密并签发用途票据 | `accessToken: string` 当前会话的访问令牌 · `password: string` 按密码策略校验的密码 · `operation: string` 服务端登记的敏感操作名 | `IssuedTicket` | `await iam.auth.reauthenticate(accessToken, password, 'users:delete')` |
| `iam.auth.checkSensitiveOperation(accessToken, operation, ticket?)` | 检查并消费当前操作的证明 | `accessToken: string` 当前会话的访问令牌 · `operation: string` 服务端登记的敏感操作名 · `ticket?: string` 服务端签发的一次性票据 | `void` | `await iam.auth.checkSensitiveOperation(accessToken, 'users:delete', operationTicket)` |

<a id="authentication-arguments"></a>

##### 对象参数

| 类型或调用 | 字段与取值 |
| --- | --- |
| `PasswordCredentials` | 必填 `identifier`（用户名、邮箱或手机号）、`password`。 |
| `OtpCredentials` | 必填 `identifier`（邮箱或手机号）、验证码 `code`。 |
| `LdapCredentials` | 必填目录用户名 `username` 和 `password`。 |
| `PasswordCredentials / OtpCredentials / LdapCredentials` | 启用交互挑战时提供 `captcha`。会话恢复时可传 `expectedUserId`，只接受原账号。 |
| `ApiKeyCredentials` | 必填 `key: string`，传签发时拿到的明文 API Key。 |
| `AuthRequestContext` | 可选 `terminalType`（`web`、`app`、`desktop`、`api`，普通登录默认 `web`）、`ip`、`userAgent`、`requestId`。由可信宿主读取和解析。 |

<a id="可选-ldap-与通知接入"></a>

##### 可选依赖的启动前提

只使用密码、用户管理和 RBAC 时，无需安装或初始化 LDAP/Reach。两者均为可选 peer dependency，应用只安装选用的集成。下列发送、LDAP 片段位于应用启动/认证函数中，reldb/cache 必须先成功初始化；`username/password` 来自已校验输入。

##### 认证输入与成功数据

- **`AuthnOperations`** — 认证操作接口，包含 `login` / `loginWithOtp` / `loginWithLdap` / `loginWithApiKey` / `logout` / `verifyToken` / `sendOtp` / `registerAndLogin`
- **`AuthStrategy`** — 认证策略接口（`type` + `authenticate` + `challenge?`），4 种实现：密码、OTP、LDAP、API Key
- **`AuthResult`** — 登录结果，含用户信息、`TokenPair`（accessToken + refreshToken）、角色/权限列表
- **`Credentials`** — 统一凭证联合类型（`{ type: 'password' | 'otp' | 'ldap' | 'apikey' } & 具体凭证`）

#### 场景：登录、注册与再次验证

登录成功必须同时满足输入、挑战、账号状态和会话策略。下面用密码登录串起这些步骤；其它策略沿用自己的凭据校验。

![登录：凭据通过后还要检查什么](../images/function-iam-login.svg)

启用交互挑战时，挑战按操作一次性消费，密码错误也不能复用。凭据与账号检查通过后，才读取有效授权并在共享存储中应用终端及会话数量策略。返回 token 和用户信息不意味着所有资源都有权限，业务路由仍需授权。

下文按注册→登录→挑战与 OTP/LDAP→会话验证→敏感操作再次验证介绍。输入标识和密码来自表单，用户/角色/票据只能使用成功返回的数据；未启用的认证方式返回相应失败。

#### 场景：用企业目录登录

使用默认客户端时执行 `pnpm add ldapts`，再显式设置 `login.ldap: true` 和 `ldap` 连接配置。只提供连接配置不会启用 LDAP。启用默认客户端却缺少 SDK 时，`iam.init()` 返回配置错误。

```yaml
# config/_iam.yml（启动前设置 HAI_IAM_LDAP_BINDPASSWORD）
login:
  ldap: true
ldap:
  url: ldaps://ldap.example.com:636
  bindDn: cn=service,dc=example,dc=com
  bindPassword: '${HAI_IAM_LDAP_BINDPASSWORD}'
  searchBase: ou=users,dc=example,dc=com
  directoryId: company-directory
  identityAttribute: entryUUID
  searchFilter: '(uid={{username}})'
  usernameAttribute: uid
  emailAttribute: mail
  displayNameAttribute: cn
  connectTimeout: 5000
```

`ldaps://` 使用 TLS。`ldap://` 可通过 `useTls: true` 启用 StartTLS。Active Directory 可用 `searchFilter: "(sAMAccountName={{username}})"`、`usernameAttribute: sAMAccountName` 和 `identityAttribute: objectGUID`。服务账号应能读取单一的稳定条目标识。自定义 LDAP 客户端返回 `entryUUID` 的标准文本，或 `objectGUID` 的 16 字节按 LDAP 返回顺序编码成 32 位十六进制字符串。

IAM 以目录标识和不可变条目标识确定本地用户。已绑定的条目重命名后仍使用原本地用户 ID。默认允许首次登录创建本地用户并分配默认角色，遇到已占用的本地用户名或不唯一的目录条目会拒绝。`ldapSyncUser: false` 仅接受已有且可登录的绑定用户。已有目录账号升级见[迁移身份绑定](#ldap-identity-migration)。

```ts

import { core } from '@h-ai/core'
import { type IamConfigSettingsInput, iam } from '@h-ai/iam'

// 启动时调用一次。Core 已读取 config/，数据库和缓存已成功初始化。
export function startDirectoryLogin() {
  // 从 Core 已加载配置读 iam 节点；缺少配置则抛错，类型参数描述预期字段。
  const config = core.config.getOrThrow<IamConfigSettingsInput>('iam')
  // 用读取的 LDAP/IAM 设置与已就绪依赖初始化。成功 data 为 undefined，配置或依赖失败返回 err。
  return iam.init(config)
}

// 启动成功后，在登录处理函数中传入已经校验的表单输入。
export function loginWithDirectory(username: string, password: string) {
  // 把已校验的表单凭据交给 LDAP 登录，成功返回绑定的本地用户和令牌；LDAP 或凭据失败返回 error。
  return iam.auth.loginWithLdap({ username, password })
}
```

应用启动时检查 `startDirectoryLogin()` 的 `success`。登录处理函数检查 `loginWithDirectory()` 返回的结果：成功时才能读取用户和令牌，目录不可用或凭据无效时按失败处理。服务退出时关闭 IAM，再关闭其依赖。

<a id="使用可选-reach-自动发送"></a>

<a id="ldap-identity-migration"></a>

#### 迁移现有 LDAP 身份绑定

在 LDAP 登录入口停止接收请求后升级所有服务节点。让目录管理员独立核验不可变条目标识与 IAM 用户 ID 的对应关系。下面的清单将一个经过核验的 OpenLDAP 条目绑定到已有的 `user-42`，该用户的 ID、角色和业务数据保持有效。用户名、DN 和旧 `metadata` 可作为核验线索。

```json
{
  "directoryId": "company-directory",
  "identityAttribute": "entryUUID",
  "bindings": [{ "entryId": "3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76", "userId": "user-42" }]
}
```

```sh
node ./node_modules/@h-ai/iam/dist/ldap-bindings.js --database private-db.json --manifest approved-bindings.json
node ./node_modules/@h-ai/iam/dist/ldap-bindings.js --database private-db.json --manifest approved-bindings.json --apply
```

`private-db.json` 是目标数据库的私有 RelDB JSON 配置，第一个命令只预检并报告新增和已存在的数量。核对后用 `--apply` 在同一事务中导入。重复导入相同绑定安全，冲突会停止整批。清单和数据库配置保留在受控环境。确认真实目录账号可用后再开放 LDAP 登录。`ldapSyncUser: false` 可用于只允许预绑定的部署。

#### 场景：让 Reach 发送验证码与重置链接

执行 `pnpm add @h-ai/reach`，应用负责 Reach 的配置、初始化和关闭，IAM 只使用传入的实例。以下 SMTP/HTTP Provider 为示例，SMS 网关按 [Reach 接口](../../../packages/reach/README.md) 接收通知。Console 只记录元数据，不能用于实际收信。

```yaml
# config/_reach.yml；环境变量仅在服务端设置。
providers:
  - name: email
    type: smtp
    host: '${SMTP_HOST}'
    port: 465
    secure: true
    user: '${SMTP_USER}'
    pass: '${SMTP_PASSWORD}'
    from: '${MAIL_FROM}'
  - name: sms
    type: api
    url: '${SMS_GATEWAY_URL}'
templates:
  - name: otp_email
    provider: email
    subject: Verification code
    body: 'Your code is {code}.'
  - name: otp_sms
    provider: sms
    body: 'Your code is {code}.'
  - name: password_reset
    provider: email
    subject: Password reset
    body: 'Reset: {resetUrl}. Expires: {expiresAt}.'
  - name: password_reset_sms
    provider: sms
    body: 'Reset: {resetUrl}. Expires: {expiresAt}.'
```

`otp_email` 和 `otp_sms` 把验证码填入 `{code}`。`password_reset` 和 `password_reset_sms` 使用 `{token}`、`{expiresAt}`、`{resetUrl}`，也用于初始设密邀请。`passwordReset.mode: phone` 选择短信渠道。IAM 发送这几类通知时都传 `ignoreDnd: true`。请在 `iam.init()` 前准备所用模板。缺少发送渠道时，公开配置会隐藏对应入口。[夜间发送示例](reach.md#reach-quiet-hours)

```ts

import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { type ReachConfigInput, reach } from '@h-ai/reach'

// 服务启动时调用。Core、RelDB 与 Cache 已就绪。
export async function startNotifications() {
  // 先从 Core 读取已加载的 reach 配置（缺失会抛错），再启动通知模块。成功无数据，初始化失败不启动 IAM。
  const notification = await reach.init(core.config.getOrThrow<ReachConfigInput>('reach'))
  if (!notification.success)
    return notification
  // 用下方 OTP 与密码重置策略初始化 IAM，通知由已启动的 Reach 或宿主回调负责。成功无业务数据，依赖或配置失败返回错误。
  return iam.init({
    reach,
    login: { otp: true },
    otp: { email: true, sms: true },
    passwordReset: { mode: 'email', resetUrl: 'https://app.example.com/auth/reset-password' },
  })
}
```

确认 `startNotifications()` 成功后，再处理请求里的 `iam.auth.sendOtp(identifier)`。邮件地址或手机号来自应用已校验的输入；成功数据给出 `expiresAt`，不返回验证码。启动失败或应用退出时由启动流程关闭 IAM 和 Reach，再关闭数据库和缓存。

#### 场景：注入自己的发送回调

注入 `onOtpSendEmail`、`onOtpSendSms` 和 `onPasswordResetRequest` 即可接入现有发送服务；可只实现需要的回调，也可与 Reach 混用，显式回调优先。以下服务为应用实现，示例假定其 Promise 仅在投递成功时完成；若服务返回 HaiResult，须检查 `success`，失败时在回调内抛错。IAM 捕获回调异常并返回业务错误，不将验证码、令牌或内部投递详情写入用户提示。回调收到的 `context.idempotencyKey` 可交给应用的发件系统用于去重。密码重置回调使用收到的 token 生成面向该用户的链接，避免记录 token。

```ts

import { type IamConfigInput, iam } from '@h-ai/iam'

type Delivery = Pick<IamConfigInput, 'onOtpSendEmail' | 'onOtpSendSms' | 'onPasswordResetRequest'>

export function startWithOwnDelivery(delivery: Delivery) {
  // 把应用已有的邮件/短信发送函数放进相应回调。
  // 用下方 OTP 与密码重置策略初始化 IAM，通知由已启动的 Reach 或宿主回调负责。成功无业务数据，依赖或配置失败返回错误。
  return iam.init({
    login: { otp: true },
    otp: { email: Boolean(delivery.onOtpSendEmail), sms: Boolean(delivery.onOtpSendSms) },
    passwordReset: { mode: 'email' },
    ...delivery,
  })
}
```

例如，应用可在 `onOtpSendEmail(email, code, context)` 中把收件地址、验证码和 `context.idempotencyKey` 交给邮件服务。只有邮件服务确认受理才让回调完成；受理失败时拒绝 Promise。检查 `startWithOwnDelivery()` 成功后再开放登录。

#### 认证的校验顺序

#### 场景：校验密码并签发会话

```
login(credentials)
  → 检查密码登录已启用
  → 按 identifier 查找用户（username / email / phone 三字段匹配）
  → 用户不存在时执行 dummy hash（防 timing attack，固定耗时）
  → 检查账户是否锁定（lockoutDuration 内 loginFailedCount >= maxLoginAttempts）
  → 密码哈希验证（@h-ai/crypto）
  → 验证失败：记录失败次数，达上限则锁定账户
  → 验证成功：重置失败计数
  → 检查密码是否过期（expirationDays > 0 时检查 passwordUpdatedAt）
  → 查询用户角色 + 权限
  → 创建会话（session.create → 生成 TokenPair）
  → 返回 AuthResult { user, tokens, roles, permissions, agreements? }
```

#### 场景：验证当前请求的身份

```
verifyToken(accessToken)
  → session.get(accessToken) → 缓存查询
  → 读取共享缓存中的当前用户/凭据状态，检查启用状态、期限与会话绑定的 credentialVersion；不可信时回源 DB
  → 滑动续期模式下自动延长 TTL
  → 复用上述用户资料，在 Redis 缓存里读取当前角色和权限。缓存不可用或结果过期时，通过一条数据库 JOIN 查询读取
  → 必要状态读取失败、用户缺失/停用/到期或凭据代不匹配时拒绝；API Key 会话再次收敛 scope
  → 返回当前 Session 对象（含 userId、roles、permissions）
```

#### 场景：用密码登录后读取并撤销会话

以下示例运行于服务端，reldb/cache/IAM 已成功初始化，参数来自校验后的请求。密码登录默认可用；OTP 需 `login.otp: true`、`otp` 通道和发送回调/Reach 模板；LDAP 需 `login.ldap: true`（配置见前文）；API Key 需 `login.apikey: true`（完整流程见下文）。登录返回 `AuthResult`，注册并登录返回相同认证结构；`register.enabled` 与密码登录开关分别控制。

OTP 是两次交互：先发送，用户取得验证码后再登录；发送/登录失败均返回 HaiResult。LDAP 使用 `iam.auth.loginWithLdap({ username, password })`，API Key 使用 `loginWithApiKey({ key })`，不要用密码登录替代。所有示例先检查 `success` 再访问 `data`。

```ts
import { iam } from '@h-ai/iam'

async function passwordLogin(identifier: string, password: string) {
  // 使用表单标识和密码登录，成功含用户、令牌及授权；无效凭据等失败保留 error。
  const result = await iam.auth.login({ identifier, password })
  if (!result.success)
    return result
  // 成功后返回 user、tokens、roles、permissions；令牌只交给安全存储。
  return result
}

async function requestLoginCode(identifier: string) {
  // identifier 为启用通道对应的邮箱/手机号，返回 expiresAt。
  // 发验证码到表单标识对应的已启用通道；成功返回 expiresAt，频繁重发失败。
  return iam.auth.sendOtp(identifier)
}

async function otpLogin(identifier: string, code: string) {
  // 用户收到验证码并输入后调用；发送失败时不能伪报成功。
  // 提交原标识和用户收到的验证码；成功返回用户及令牌，错误或过期验证码不建立会话。
  return iam.auth.loginWithOtp({ identifier, code })
}

async function registerWithSession(username: string, password: string) {
  // 用申请者的用户名和密码注册后登录；成功返回令牌与用户，任一步失败保留错误。
  return iam.auth.registerAndLogin({ username, password })
}
```

#### 认证失败与日志边界

- **Timing attack 防护**：用户不存在时执行 dummy password hash，保持响应时间一致
- **账户锁定**：连续登录失败 `maxLoginAttempts` 次后锁定 `lockoutDuration` 秒
- **认证策略可独立启用/禁用**：通过 `login.password` / `login.otp` / `login.ldap` / `login.apikey` 控制
- **OTP 安全**：rejection sampling 消除模偏差，常量时间比较防 timing attack，频率限制（`resendInterval`）

`iam.auth.logout(accessToken)` 直接按完整不透明令牌在用户分区执行一次 CAS，原子撤销 access 与关联 refresh；access 已到期也不能跳过撤销。非法/不存在的令牌幂等成功，缓存读取或提交故障返回失败，恢复后可用同一令牌重试。HTTP 登出只允许撤销所持令牌，不以 userId 定位他人会话，也不要求该 access 仍通过认证。调用方必须检查 `success`；本地 Cookie/安全存储清理不代表服务端撤销已经确认，失败应显示提示。

---

#### 场景：启用交互挑战

`captcha.enabled` 默认关闭。开启后使用 ALTCHA 自托管计算挑战，配置 `ttlSeconds`（默认120，1–600秒）、`cost`（默认5000，100–50000）和 `maxCounter`（默认100，1–2000）控制期限与工作量。不需要外部验证码账号，HMAC 秘密与单次消费状态只保存在既有共享 Cache；生产仍须使用共享后端。计算挑战增加自动化尝试成本，不保证请求来自真人。

`iam.auth.createCaptcha({ operation })` 为登录、注册、发送验证码、重置密码或续期返回 `{ id, challenge }`。页面用 `altcha/lib` 的 `solveChallenge` 和 `pbkdf2` 解题，将 `JSON.stringify({ id, solution })` 作为 `captcha` 字段提交。发送验证码和请求重置密码时，作为第二个参数 `{ captcha }` 传入。服务端检查挑战是否对应当前操作、是否过期或已使用。即使密码错误，这次挑战也会失效。Cache 故障时会拒绝需要挑战的请求。管理员创建或邀请账号、已登录改密等服务端操作继续按各自权限规则检查。

标准 Kit/Serv 暴露 POST /auth/captcha（Kit 同源前缀为 /api），并保留 captcha 字段。`iam.publicConfig.captcha` 只公开 enabled。框架 AuthPanel 与 createAuthActions 在启用后提交时自动生成、异步求解并提交新证明，关闭时不加载求解器；自定义表单可复用同一协议。UI 配置启用但缺少 createCaptcha 动作时拒绝提交，取消/卸载会停止尚未提交的鉴别请求。captcha 证明按凭据规则始终脱敏，不写浏览器持久存储。030/031/032/033 分别表示需要验证、证明无效/已用/过期、未启用、服务不可用。

#### 密码与失败次数保护

公开登录与 `renewPassword` 对不存在、无本地口令、休眠、注销、到期及锁定账号统一返回 `INVALID_CREDENTIALS`（“用户名或密码不正确”）。受限账号不继续校验猜测的密码，正确与错误密码得到相同反馈且不改变原有锁定计数；已认证管理入口仍可查看具体状态。密码计算或存储故障保留为基础设施错误，不能计为用户输错密码。

当前密码复用返回 `HaiIamError.PASSWORD_REUSE_NOT_ALLOWED`（`hai:iam:034`），复杂度不符仍为 `PASSWORD_POLICY_VIOLATION`（`008`）；前端应按错误码映射友好提示，不能直接显示未知异常。首次改密失败不签发普通会话，成功后使用新密码重新登录。

`password.minLength/maxLength` 控制长度，各 `require*` 指定必需类别；`minCharacterClasses` 支持大小写、数字、特殊字符中任意 N 类，0不额外限制。CLI/admin 示例默认8–128位、不额外要求字符类别；需要任意3类时显式设置 `minCharacterClasses: 3`。所有服务端创建、改密和重置入口共用校验。

`expirationDays: 0` 关闭定期改密，正数为天数；`preventSamePassword` 可独立开启。启用期限或首次强改时，新旧密码必须不同。`requireInitialChange` 作用于管理端创建/重置的密码，自助注册设密不重复强改。首次/过期密码不能授权普通会话或刷新旧会话；用户通过 `iam.user.renewPassword({ identifier, password, newPassword })` 验证原密码并更换后重新登录，Kit/Serv 与 AuthPanel 提供完成流程。

`security.lockoutEnabled` 的框架 Schema 默认开启，CLI/admin 简化示例显式关闭，按需启用；`failureWindow` 默认86400秒，从首次失败起按固定窗口计数，`maxLoginAttempts` 为阈值，`lockoutDuration` 为锁定秒数。示例锁定1200秒。关闭时忽略历史锁；计数与阈值在共享数据库中原子处理。

`initialCredentials.enabled` 开启管理端 `iam.user.inviteUser()`：内部生成独立随机秘密，仅发送短期单次设密邀请，不返回/发送初始秘密。沿用 `passwordReset` 的模式、期限、尝试次数和敏感通知通道，接收人通过重置页面设密。关闭重置或缺少通道时不创建账号。投递未知返回失败并保留已创建账号及邀请，核对后再请求重置通知，不自动回滚或重发。

`loginAccess.enabled` 开启登录限制；`allowIps/denyIps` 支持 IPv4/IPv6/CIDR，拒绝优先，空列表不限制对应维度。`windows` 用 `days`（周一1至周日7）、`start/end`（HH:mm，含起点不含终点，支持跨午夜）和 IANA `timezone`。登录方法第二参为可信 `AuthRequestContext`：Kit 使用平台 `getClientAddress()`，Serv 使用可信代理策略解析的 `context.ip`。不得复制任意转发头或凭据 JSON 的 IP；地址限制启用但无可信地址时拒绝。注册后自动登录、API Key 登录同样执行。

`reauthentication.enabled/operations` 选择敏感操作，`ttlSeconds` 为证明期限。`iam.auth.reauthenticate(token, password, operation)` 验证原密码并签发单次票据；操作入口完成权限/资源检查后用 `checkSensitiveOperation(token, operation, ticket)` 消费。证明绑定主体、当前会话和操作，不提升权限。Serv 标准 IAM 写操作与 admin 守卫读取 `x-hai-reauthentication`；Kit 业务入口用 `kit.guard.requireSensitive(iam, event, operation)`，业务操作 ID 由项目定义。票据只短暂保存在内存，公开配置仅暴露开关/操作清单。admin/fullstack 标准界面在已登录用户点击敏感动作时弹出当前账号密码验证窗口；取消不提交、密码错误不继续，正确后才执行原操作，不创建另一个登录会话。

RBAC 权限支持 `sensitiveOperations: string[]`（持久字段 `sensitive_operations`）。可信管理端可调用 `iam.authz.setPermissionSensitiveOperations(permissionId, operations)`；检查结果的 `success`，空列表仅移除该权限的附加规则。开启 `reauthentication.enabled` 后，所有权限记录的规则与文件 `operations` 取并集，服务端实时执行。规则 ID 必须对应实际业务守卫，不能替代原权限检查。异步 `iam.getPublicConfig()` 返回合并后的公开策略，DB 读取失败返回失败；同步 `iam.publicConfig` 只保留文件快照。RBAC 关闭时忽略数据库规则。

<a id="users"></a>

### 维护用户资料与密码：`iam.user`

先校验操作者的管理权限，再以用户 ID 查询或修改；用户自助修改与管理员重置分别使用相应接口。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `iam.user.createUser(options)` | 由管理端创建用户 | `options: RegisterOptions` · 管理员指定新账号资料与初始凭据 · [对象参数](#users-arguments) | `RegisterResult` | `await iam.user.createUser({ username, password })` |
| `iam.user.register(options)` | 按公共注册策略创建用户 | `options: RegisterOptions` · 待公开注册的账号资料与密码 · [对象参数](#users-arguments) | `RegisterResult` | `await iam.user.register({ username, password })` |
| `iam.user.inviteUser(options)` | 创建用户并发送单次设密邀请 | `options: Omit<RegisterOptions, "password">` · 填写新账号资料及接收邀请的联系方式 · [对象参数](#users-arguments) | `RegisterResult` | `await iam.user.inviteUser({ username, email })` |
| `iam.user.getUser(userId, options?)` | 按 ID 查询用户 | `userId: string` 目标用户 ID · `options?: { include?: 'roles'[] }` 决定是否同时读取角色 · [对象参数](#users-arguments) | `User \| null` | `await iam.user.getUser(userId)` |
| `iam.user.getUsers(userIds, options?)` | 批量查询用户及关联资料 | `userIds: readonly string[]` 要批量读取的用户 ID · `options?: { include?: 'roles'[] }` 决定是否同时读取角色 · [对象参数](#users-arguments) | `User[]` | `await iam.user.getUsers([userId], { include: ['roles'] })` |
| `iam.user.listUsers(options?)` | 筛选并分页查询用户 | `options?: ListUsersOptions` · 选择账号范围并设置排序、分页和关联资料 · [对象参数](#users-arguments) | `PaginatedResult<User>` | `await iam.user.listUsers({ page: 1, pageSize: 20 })` |
| `iam.user.getCurrentUser(accessToken)` | 按当前令牌读取本人资料 | `accessToken: string` 当前会话的访问令牌 | `User` | `await iam.user.getCurrentUser(accessToken)` |
| `iam.user.updateCurrentUser(accessToken, data)` | 按当前令牌更新本人资料 | `accessToken: string` 当前会话的访问令牌 · `data: UpdateCurrentUserInput` · [对象参数](#users-arguments) | `User` | `await iam.user.updateCurrentUser(accessToken, { displayName: 'Alice' })` |
| `iam.user.updateUser(userId, data)` | 按 ID 修改用户资料 | `userId: string` 目标用户 ID · `data: Partial<User>` 由管理员传入要修改的字段，参见本节可写字段说明 | `User` | `await iam.user.updateUser(userId, { displayName: 'Alice' })` |
| `iam.user.updateUserWithRoles` | 在一次事务中保存用户资料和角色 | userId, { profile?, roleIds? } | `User` 或回滚后的错误 | `await iam.user.updateUserWithRoles(userId, { profile: { displayName: 'Alice' }, roleIds: [reviewerRoleId] })` |
| `iam.user.deleteUser(userId)` | 删除指定用户 | `userId: string` 目标用户 ID | `void` | `await iam.user.deleteUser(userId)` |
| `iam.user.adminResetPassword(userId, newPassword)` | 由管理端重设用户密码 | `userId: string` 目标用户 ID · `newPassword: string` 要按当前策略设置的新密码 | `void` | `await iam.user.adminResetPassword(userId, newPassword)` |
| `iam.user.renewPassword(input)` | 用原凭据完成到期或首次改密 | `input` 必填，含 `identifier`、当前 `password`、`newPassword` 和可选 `captcha` | `void` | `await iam.user.renewPassword({ identifier, password, newPassword })` |
| `iam.user.changePassword(userId, oldPassword, newPassword)` | 验证旧密码后修改密码 | `userId: string` 目标用户 ID · `oldPassword: string` 当前密码 · `newPassword: string` 要按当前策略设置的新密码 | `void` | `await iam.user.changePassword(userId, oldPassword, newPassword)` |
| `iam.user.changeCurrentUserPassword(accessToken, oldPassword, newPassword)` | 为当前令牌持有者修改密码 | `accessToken: string` 当前会话的访问令牌 · `oldPassword: string` 当前密码 · `newPassword: string` 要按当前策略设置的新密码 | `void` | `await iam.user.changeCurrentUserPassword(accessToken, oldPassword, newPassword)` |
| `iam.user.requestPasswordReset(identifier, options?)` | 请求发送重置链接或验证码 | `identifier: string` 按启用渠道识别的账号标识，例如邮箱或手机号 · `options?: { captcha?: string }` 为当前操作提供交互挑战证明 | `void` | `await iam.user.requestPasswordReset(identifier)` |
| `iam.user.confirmPasswordReset(token, newPassword)` | 消费重置凭据并更新密码 | `token: string` 发送给用户的一次性重置凭据 · `newPassword: string` 要按当前策略设置的新密码 | `void` | `await iam.user.confirmPasswordReset(resetToken, newPassword)` |
| `iam.user.validatePassword(password)` | 同步检查密码策略 | `password: string` 按密码策略校验的密码 | `void` | `iam.user.validatePassword(newPassword)` |
| `iam.user.scanInactiveAccounts()` | 按策略停用长期未活动账号 | 无参数 | `number` | `await iam.user.scanInactiveAccounts()` |

<a id="users-arguments"></a>

##### 对象参数

| 类型或调用 | 字段与取值 |
| --- | --- |
| `RegisterOptions` | 必填 `username`，直接创建或注册还要 `password`。可填 `email`、`phone`、`displayName`、`metadata`；邀请由收件人设置密码，公开注册按策略传 `captcha`。管理端可设置 `accountType`、`accountStatus`、`accountExpiresAt`，临时账号需到期时间。 |
| `getUser / getUsers 的 include` | 省略时不扩展角色。传 `{ include: ['roles'] }` 会附带角色数据。 |
| `ListUsersOptions` | 可填 `page`、`pageSize` 分页；`search` 模糊匹配用户名、邮箱、手机或显示名，`roleCode` 精确匹配角色。可用 `accountStatus`（`active`、`dormant`、`closed`）和 `include`。省略排序按创建时间倒序；`sortBy` 指定列后 `sortDirection` 默认 `desc`。 |
| `UpdateCurrentUserInput` | 只传要修改的 `username`、`email`、`phone`、`displayName`、`avatarUrl` 或 `metadata`。 |

##### 用户列表选项

| 字段 | 默认或必填 | 作用与生效条件 |
| --- | --- | --- |
| `page: number` | `1` | 页码从 1 开始 |
| `pageSize: number` | `20` | 每页最大用户数，上限 200 |
| `search: string` | 可省略 | 部分匹配用户名、邮箱、手机号或显示名 |
| `roleCode: string` | 可省略 | 在分页前按角色代码精确筛选 |
| `accountStatus` | 可省略 | 只列出 active、dormant 或 closed 状态，省略时列出全部 |
| `sortBy / sortDirection` | `createdAt / desc` | 排序字段可为 username、email、displayName、accountStatus 或 createdAt。方向只在显式指定字段时生效 |
| `include: 'roles'[]` | `[]` | 传入 roles 时附带该页用户的角色 |

假设已初始化的用户库中只有一名休眠用户 Ada，角色代码为 reader。结果只展示相关字段。

```ts
import { iam } from '@h-ai/iam'

// 查休眠用户的第一页，每页最多两条，附带角色；失败时读取 error.code。
const result = await iam.user.listUsers({ accountStatus: 'dormant', page: 1, pageSize: 2, include: ['roles'] })
if (result.success) {
  const items = result.data.items.map(user => ({ displayName: user.displayName, roles: user.roles?.map(role => role.code) }))
  void items // [{ displayName: 'Ada', roles: ['reader'] }]
}
else result.error.code
```

##### 用户数据与可写字段

- **`UserOperations`** — 用户操作接口：注册、查询、更新、删除、密码修改与重置、密码强度验证
- **`User`** — 用户实体（公开字段）：`{ id, username, email, phone, displayName, avatarUrl, accountType?, accountStatus, accountExpiresAt?, roles? }`
- **`StoredUser`** — 内部存储用户（含 `passwordHash`、`loginFailedCount`、`lockedUntil` 等敏感字段）
- **`RegisterOptions`** / **`RegisterResult`** — 注册输入与输出
- **`UpdateCurrentUserInput`** — 当前用户可修改的白名单字段（`username` / `email` / `displayName` / `avatarUrl` / `phone` / `metadata`）

#### 场景：维护用户资料与密码

用户场景展示创建→按 ID/用户名/邮箱查找→分页→修改→删除；密码场景说明重置票据、到期续密与账号停用。成功 null 与失败错误分别处理，不能把查不到用户当数据库故障。

#### 场景：同时更新账号资料和角色

管理端先核验操作者可管理目标账号和指定角色。这里已取得有效的用户 ID 和审核角色 ID。省略 `roleIds` 则保留现有角色，传 `[]` 则清空角色。角色变更后，现有会话使用当前授权，账号生命周期变化时旧会话失效。

```ts
// 用已核验的用户和角色 ID 保存显示名，并将角色集合替换为审核角色。
// 成功 data 是提交时的用户资料。角色不合法时，本次资料和角色写入一并回滚。
const updated = await iam.user.updateUserWithRoles(userId, {
  profile: { displayName: 'Alice' },
  roleIds: [reviewerRoleId],
})
if (!updated.success) throw new Error(updated.error.message)
```

#### 注册与重置的提交规则

#### 场景：注册用户并分配默认角色

```
register(options)
  → 检查注册是否启用
  → 密码强度验证（Zod schema + 自定义规则）
  → 密码哈希（@h-ai/crypto）
  → DB 事务：创建用户 + 查询创建结果
  → 分配默认角色（rbac.defaultRole；失败则撤销新账号并返回失败）
  → 返回 RegisterResult { user, agreements? }
```

#### 场景：消费一次性重置凭据

```
requestPasswordReset(email)
  → 按邮箱查找用户（不存在时静默返回 ok → 防枚举攻击）
  → 生成 256-bit 随机令牌
  → 用户数据库行保存令牌摘要、期限、尝试次数和 resetVersion
  → 调用 onPasswordResetRequest 回调（业务层负责发送邮件/短信）

confirmPasswordReset(token, newPassword)
  → 读取数据库令牌摘要 → 校验有效期、尝试次数和 resetVersion
  → 密码强度验证 → 哈希 → 更新 DB
  → 清除该用户所有活跃会话（强制重新登录）
  → 条件 SQL 同时消费令牌、更新密码并推进凭据代际
```

#### 场景：管理用户与修改本人资料

`register` 返回用户但不登录；需要同时登录时使用 `auth.registerAndLogin`。`createUser` 是管理端入口，关闭自助注册不阻止管理员建用户。当前用户资料用 `getCurrentUser/updateCurrentUser`，允许 username/email/displayName/avatarUrl/phone/metadata，安全字段和角色使用经授权的管理入口。

分页返回统一 `PaginatedResult<User>`；角色过滤使用 `roleCode`，角色关联按需 `include: ['roles']`。批量查询保留去重后的输入顺序，缺失项省略，不能假定第 n 个结果必对应第 n 个输入；按 id 映射关联。各方法返回公开用户结构，管理查询仍需数据范围和字段披露控制。

`getUser(id)` 成功但不存在时返回 `null`；`getCurrentUser(token)` 缺失/会话无效时失败。不要把 DB 读取失败解释成空列表。`validatePassword` 为同步 HaiResult 检查；`deleteUser`、停用、密码修改/重置会清除受影响会话。

```ts
import { iam } from '@h-ai/iam'

async function registerUser(username: string, email: string, password: string) {
  // 返回 RegisterResult，不自动建立会话。
  // 用申请者表单中的用户名、邮箱和密码创建账号；成功返回注册结果，字段冲突或策略失败不建立会话。
  return iam.user.register({ username, email, password })
}

async function createManagedUser(username: string, password: string) {
  // 先验证调用者管理权限；不受 register.enabled 开关限制。
  // 已授权管理员用提供的用户名和密码创建账号。成功返回创建结果，重复用户名或密码策略失败。
  return iam.user.createUser({ username, password })
}

async function updateMyProfile(accessToken: string, displayName: string) {
  // 用请求中的 access token 更新自己的显示名并返回更新后的用户；会话无效或资料不合法时失败。
  return iam.user.updateCurrentUser(accessToken, { displayName })
}

async function changeMyPassword(accessToken: string, oldPassword: string, newPassword: string) {
  // 成功后撤销该用户全部会话，客户端回到登录入口。
  // 用当前访问令牌和表单中的旧、新密码改密。成功无数据并撤销会话；旧密码验证或新密码策略不符时失败。
  return iam.user.changeCurrentUserPassword(accessToken, oldPassword, newPassword)
}

async function listReaders(page: number) {
  // 按调用方页码读取名称匹配 alice 的 active 记录读取者，每页最多 20 条并含角色。返回分页结果，查询失败保留 error。
  const result = await iam.user.listUsers({
    page,
    pageSize: 20,
    roleCode: 'record_reader',
    search: 'alice',
    accountStatus: 'active',
    include: ['roles'],
    sortBy: 'createdAt',
    sortDirection: 'desc',
  })
  if (!result.success)
    return result
  // 直接使用 items/total/page/pageSize，不对当前页再次过滤。
  return result
}

async function loadUsers(userIds: readonly string[]) {
  // 最多 1000 个输入 ID；去重保留输入顺序，缺失 ID 省略。
  // 用调用方已授权的用户 ID 批量读取并包含角色；成功按输入顺序返回去重后的命中项，存储失败保留 error。
  return iam.user.getUsers(userIds, {
    include: ['roles']
  })
}

async function makeUserDormant(userId: string) {
  // 调用前已验证管理权限；成功后自动清除该用户会话。
  // 把管理员指定账号置为 dormant。成功返回更新记录并使旧会话失效；账号不存在或更新失败时返回错误。
  return iam.user.updateUser(userId, { accountStatus: 'dormant' })
}
```

#### 查询、失效与密码策略边界

- **`toUser()` 字段脱敏**：所有对外返回的用户对象均剥离 `passwordHash`、`loginFailedCount` 等敏感字段
- **会话联动**：`deleteUser` / `updateUser({ accountStatus: 'dormant' })` / `changePassword` / `confirmPasswordReset` 自动清除受影响用户的所有活跃会话
- **防枚举攻击**：`requestPasswordReset` 对不存在的邮箱返回 `core.ok(undefined)` 而非错误
- **validatePassword 是同步方法**：这是 `UserOperations` 中唯一的同步方法，其余均为异步
- **搜索模糊匹配**：`listUsers` 支持按用户名、邮箱、手机号、显示名称模糊搜索，LIKE 通配符已转义
- **服务端排序**：`listUsers` 仅允许 `username`、`email`、`displayName`、`accountStatus`、`createdAt` 排序；字段经白名单映射，未指定时默认按创建时间倒序

---

#### 场景：申请重置、完成重置或管理员重设

重置需要启用 `passwordReset.enabled` 和可用的通知回调/Reach 模板。申请成功仅表示请求已处理，不证明账户存在或用户已收信；发送或内部处理失败仍须处理失败 HaiResult。令牌只允许一次成功消费且有有效期/尝试限制，成功后撤销旧会话。管理员重置无需旧密码，但须由应用验证管理权限。

```ts
import { iam } from '@h-ai/iam'

async function requestReset(identifier: string) {
  // 缺失用户与有效用户使用相同成功响应，避免枚举账户。
  // 为用户输入的邮箱请求重置。已登记或不存在都可成功且无数据；存储故障或投递未知返回失败。
  return iam.user.requestPasswordReset(identifier)
}

async function confirmReset(token: string, newPassword: string) {
  // token 来自通知中的重置链接；成功后重新登录。
  // 消费通知链接的令牌并保存表单里的新密码；成功无数据，过期/无效令牌或策略失败返回错误。
  return iam.user.confirmPasswordReset(token, newPassword)
}

async function resetByAdministrator(userId: string, newPassword: string) {
  // 管理权限校验在服务端入口完成；不接受未经校验的 userId。
  // 管理入口用已核对的用户 ID 重置密码，成功无数据并撤销旧会话；找不到用户或策略失败返回错误。
  return iam.user.adminResetPassword(userId, newPassword)
}
```

缓存清理失败可能返回失败，但已提交的新密码与凭据代际不会回滚；重新登录，不用旧凭据自动重试。

#### 场景：到期、休眠与恢复账号

用户默认是 `accountType: 'permanent'`、`accountStatus: 'active'`。管理入口可创建 `temporary` 账号并提供 `accountExpiresAt`，或通过 `updateUser` 将账号转为 `dormant`、`closed`。状态与凭据代际在同一事务更新；账号到期或非激活时，所有登录方式、旧 access 和 refresh 均被拒绝。管理员明确恢复为 `active` 时仍需重新登录，原 token 不会复活；账号仅使用 `accountStatus` 表达生命周期，不再提供独立的启用/停用字段。`closed` 保留账号记录，物理删除仍由 `deleteUser` 完成，项目决定个人数据的保留与注销流程。

管理员可重置任何 accountStatus 的账号密码，但重置不会把 dormant/closed 改成 active，也不会恢复此前失效的凭据；是否要求后续首次改密由 `password.requireInitialChange` 决定。账号列表的筛选与排序使用同一 `accountStatus` 字段。

`accounts.dormantAfterDays` 默认 `0`，关闭自动休眠。设为 `90` 时，IAM 每隔 `accounts.scanIntervalSeconds`（默认3600秒）扫描最近90天没有成功登录的激活账号，未登录账号从创建时间起算。`lastLoginAt` 只在成功鉴别时更新。扫描是数据库条件更新，多节点重复执行不会重复变更；`iam.user.scanInactiveAccounts()` 也可由可信后台或既有调度器调用。`close()` 停止定时器并等待本轮扫描完成。公开注册接口不应允许用户自行设置这些管理字段。

#### 账号、通知与审计的提交边界

先初始化 RelDB，再调用 `iam.init()`。IAM 校验所需表，结构不符时返回初始化失败。会话必须匹配当前凭据代次。IAM 校验验证码和令牌原来的有效期。Reach 按普通即时通知处理，发送历史包含实际收件人、正文和变量。

审计模块已初始化且 capture.enabled 开启时，IAM 自动记录关键账号、鉴别、密码、授权、API Key 和会话事件，包含失败/拒绝与安全原因码。先初始化 audit 再初始化 IAM，关闭时反序。不会记录密码、一次性票据或令牌；成功登录才确认主体，可信服务/CLI 调用应以 audit.withContext 提供操作者和关联信息。外部授权事务的事件随该事务提交或回滚，回滚失败尝试由调用入口在事务结束后记录。审计写失败输出诊断，不把已生效业务改成可盲目重试的失败。

`session.terminalLimits: { web: 2, app: 1 }` 设置分终端会话数，默认 `{}` 关闭。非空时未列出的 `desktop/api` 等类型不能新登录。`terminalLimitMode: reject` 为默认，`replace` 仅替换同类最早会话。全局 `maxSessions` 和 `singleDevice` 继续约束所有终端，配额同一 CAS 原子提交。服务端登录上下文的 `terminalType` 和标准客户端 `auth.terminalType` 选择分组；类型不是硬件身份或授权凭据。

Web 原地恢复使用 `ui.createSessionRecovery`、`SessionRecoveryDialog` 与 SDK 的 `recoverSession`，复用正常登录策略。`expectedUserId` 在密码、OTP、LDAP 登录签发会话前限制原主体。验证失败不签发恢复会话。仅重发明确未认证拒绝的一笔请求，网络结果不明时不重发。页面刷新或关闭后的内存草稿不在恢复范围内。

<a id="authorization"></a>

### 分配角色与检查权限：`iam.authz`

角色与权限关系由服务端保存；每次敏感操作都按当前主体和用途检查授权。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `iam.authz.getUserAuthorization(userId)` | 一起读取用户角色与权限 | `userId: string` 目标用户 ID | `Pick<Session, "roles" \| "permissions">` | `await iam.authz.getUserAuthorization(userId)` |
| `iam.authz.checkPermission(userId, permission)` | 检查用户是否具备所需权限 | `userId: string` 目标用户 ID · `permission: string` 要检查的权限代码 | `boolean` | `await iam.authz.checkPermission(userId, 'orders:read')` |
| `iam.authz.getUserPermissions(userId)` | 读取用户权限 | `userId: string` 目标用户 ID | `Permission[]` | `await iam.authz.getUserPermissions(userId)` |
| `iam.authz.getUserRoles(userId)` | 读取用户角色 | `userId: string` 目标用户 ID | `Role[]` | `await iam.authz.getUserRoles(userId)` |
| `iam.authz.getUserRolesForMany(userIds)` | 批量读取用户角色 | `userIds: string[]` 要批量读取的用户 ID | `Map<string, Role[]>` | `await iam.authz.getUserRolesForMany([userId])` |
| `iam.authz.getRolePermissionsForMany(roleIds)` | 批量读取角色权限 | `roleIds: string[]` 目标角色 ID 列表 | `Map<string, Permission[]>` | `await iam.authz.getRolePermissionsForMany([roleId])` |
| `iam.authz.assignRole(userId, roleId, tx?)` | 给用户添加角色 | `userId: string` 目标用户 ID · `roleId: string` 角色 ID · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `void` | `await iam.authz.assignRole(userId, roleId)` |
| `iam.authz.removeRole(userId, roleId, tx?)` | 移除用户角色 | `userId: string` 目标用户 ID · `roleId: string` 角色 ID · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `void` | `await iam.authz.removeRole(userId, roleId)` |
| `iam.authz.syncRoles(userId, roleIds, tx?)` | 替换用户的角色集合 | `userId: string` 目标用户 ID · `roleIds: string[]` 目标角色 ID 列表 · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `void` | `await iam.authz.syncRoles(userId, [roleId])` |
| `iam.authz.assignPermissionToRole(roleId, permissionId, tx?)` | 给角色添加权限 | `roleId: string` 角色 ID · `permissionId: string` 权限 ID · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `void` | `await iam.authz.assignPermissionToRole(roleId, permissionId)` |
| `iam.authz.removePermissionFromRole(roleId, permissionId, tx?)` | 移除角色权限 | `roleId: string` 角色 ID · `permissionId: string` 权限 ID · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `void` | `await iam.authz.removePermissionFromRole(roleId, permissionId)` |
| `iam.authz.createRole(role, tx?)` | 创建角色 | `role` 定义新角色的业务代码、名称、说明及系统角色标记 · [对象参数](#authorization-arguments) · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `Role` | `await iam.authz.createRole({ code: 'editor', name: 'Editor', description: null, isSystem: false })` |
| `iam.authz.getRole(roleId)` | 按 ID 查询角色 | `roleId: string` 角色 ID | `Role \| null` | `await iam.authz.getRole(roleId)` |
| `iam.authz.getRoleByCode(code)` | 按编码查询角色 | `code: string` 角色或权限的业务代码 | `Role \| null` | `await iam.authz.getRoleByCode('editor')` |
| `iam.authz.getAllRoles(options?)` | 读取全部角色 | `options?: PaginationOptionsInput` 选择页码、每页条数和排序 · [对象参数](#authorization-arguments) | `PaginatedResult<Role>` | `await iam.authz.getAllRoles({ page: 1, pageSize: 20 })` |
| `iam.authz.getRoleUserCounts(roleIds)` | 批量统计角色用户数 | `roleIds: string[]` 目标角色 ID 列表 | `Map<string, number>` | `await iam.authz.getRoleUserCounts([roleId])` |
| `iam.authz.updateRole(roleId, data, tx?)` | 修改角色资料 | `roleId: string` 角色 ID · `data` 提供要修改的角色字段，未传的字段保持原值 · [对象参数](#authorization-arguments) · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `Role` | `await iam.authz.updateRole(roleId, { name: 'Editor' })` |
| `iam.authz.deleteRole(roleId, tx?)` | 删除角色 | `roleId: string` 角色 ID · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `void` | `await iam.authz.deleteRole(roleId)` |
| `iam.authz.createPermission(permission, tx?)` | 创建权限记录 | `permission` 提供要创建的权限代码、显示名称和分类 · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `Permission` | `await iam.authz.createPermission({ code: 'orders:read', name: 'Read orders', type: 'api' })` |
| `iam.authz.getPermission(permissionId)` | 按 ID 查询权限 | `permissionId: string` 权限 ID | `Permission \| null` | `await iam.authz.getPermission(permissionId)` |
| `iam.authz.getPermissionByCode(code)` | 按编码查询权限 | `code: string` 角色或权限的业务代码 | `Permission \| null` | `await iam.authz.getPermissionByCode('orders:read')` |
| `iam.authz.getAllPermissions(options?)` | 读取全部权限 | `options?: PermissionQueryOptions` 选择页码、每页条数和排序，可按权限分类筛选 · [对象参数](#authorization-arguments) | `PaginatedResult<Permission>` | `await iam.authz.getAllPermissions({ page: 1, pageSize: 20 })` |
| `iam.authz.deletePermission(permissionId, tx?)` | 删除权限 | `permissionId: string` 权限 ID · `tx?: DmlWithTxOperations` 由调用方提供的 RelDB 事务操作。省略时使用常规入口 | `void` | `await iam.authz.deletePermission(permissionId)` |
| `iam.authz.getRolePermissions(roleId)` | 读取角色权限 | `roleId: string` 角色 ID | `Permission[]` | `await iam.authz.getRolePermissions(roleId)` |
| `iam.authz.getSensitiveOperations(operation?)` | 读取生效的敏感操作规则 | `operation?: string` 服务端登记的敏感操作名 | `string[]` | `await iam.authz.getSensitiveOperations('users:delete')` |
| `iam.authz.setPermissionSensitiveOperations(permissionId, operations)` | 设置权限附带的敏感操作规则 | `permissionId: string` 权限 ID · `operations: string[]` 要绑定的敏感操作名称列表 | `void` | `await iam.authz.setPermissionSensitiveOperations(permissionId, ['users:delete'])` |

<a id="authorization-arguments"></a>

##### 对象参数

| 类型或调用 | 字段与取值 |
| --- | --- |
| `PaginationOptionsInput / PermissionQueryOptions` | `page`、`pageSize` 分页。权限列表还可传 `type` 与 `search`。 |
| `role / data` | 创建角色时 `code` 和 `name` 必填，可传 `description`、`isSystem` 和 `permissionIds`。更新时仅传要变更的字段。 |
| `permission` | `code`、`name` 必填。可传 `description`、`type`、`resource`、`action`、`sensitiveOperations`。 |

##### 授权数据与成员统计

角色列表通过 `iam.authz.getRoleUserCounts(roleIds)` 一次聚合当前页角色的真实成员数，返回 `HaiResult<Map<string, number>>`。无关联为 0；查询失败显示加载错误，不生成零统计。

##### 角色与权限标识

- **`AuthzOperations`** — 授权操作接口，覆盖角色 CRUD、权限 CRUD、角色-权限/用户-角色分配、权限检查
- **`Role`** — 角色实体：`{ id, code, name, description, isSystem }`
- **`Permission`** — 权限实体：`{ id, code, name, type, resource, action }`，type 可为 `menu` / `api` / `button`
- **`PermissionType`** — 权限类型枚举

#### 场景：分配角色与检查权限

示例仅在隔离开发数据上运行，RBAC 已启用，userId 是本次测试创建的用户且没有其他角色。syncRoles 替换完整集合，不应用于真实用户试验。记录页和 Map 的具体内容取决于当前库；任何失败都中止后续写入。

```ts
async function reviewReader(userId: string) {
  // 登记 docs:read API 权限并取得含 id 的权限对象；重复代码或写入失败时返回原失败结果。
  const permissionResult = await iam.authz.createPermission({ code: 'docs:read', name: 'Read docs', type: 'api' })
  if (!permissionResult.success)
    return permissionResult
  const permission = permissionResult.data
  // 建立代码 docs_reader 的空权限角色，返回含 id 的角色；同名代码冲突失败。
  const roleResult = await iam.authz.createRole({ code: 'docs_reader', name: 'Docs reader', permissionIds: [] })
  if (!roleResult.success)
    return roleResult
  const role = roleResult.data
  // 用刚创建的两个 ID 关联 docs:read 到 docs_reader；成功无数据。
  const assignPermissionToRoleResult = await iam.authz.assignPermissionToRole(role.id, permission.id)
  if (!assignPermissionToRoleResult.success)
    return assignPermissionToRoleResult
  // 成功无业务数据。
  // 将新角色授给调用方指定的用户，成功无数据；关系写入失败时返回原失败结果。
  const assignRoleResult = await iam.authz.assignRole(userId, role.id)
  if (!assignRoleResult.success)
    return assignRoleResult
  // 成功无业务数据。
  // 把同一用户全部角色替换为刚创建的单一角色；成功无数据。
  const syncRolesResult = await iam.authz.syncRoles(userId, [role.id])
  if (!syncRolesResult.success)
    return syncRolesResult
  // replaces the complete role set
  // 检查该用户的 docs:read；此例为 true，false 表示拒绝，查询失败时返回原失败结果。
  const checkPermissionResult = await iam.authz.checkPermission(userId, 'docs:read')
  if (!checkPermissionResult.success)
    return checkPermissionResult
  checkPermissionResult.data // true (RBAC enabled)
  // 按用户 ID 读取生效角色和权限 code，包括 docs_reader 与 docs:read。
  const getUserAuthorizationResult = await iam.authz.getUserAuthorization(userId)
  if (!getUserAuthorizationResult.success)
    return getUserAuthorizationResult
  getUserAuthorizationResult.data // role and permission codes
  // 按同一用户 ID 读取角色记录，包含刚分配的 docs_reader。
  const getUserRolesResult = await iam.authz.getUserRoles(userId)
  if (!getUserRolesResult.success)
    return getUserRolesResult
  getUserRolesResult.data // Role[]
  // 按用户 ID 读取生效权限对象，本例包含 docs:read。
  const getUserPermissionsResult = await iam.authz.getUserPermissions(userId)
  if (!getUserPermissionsResult.success)
    return getUserPermissionsResult
  getUserPermissionsResult.data // Permission[]
  // 传只有该用户的一批 ID，返回以用户 ID 为键、角色数组为值的 Map。
  const getUserRolesForManyResult = await iam.authz.getUserRolesForMany([userId])
  if (!getUserRolesForManyResult.success)
    return getUserRolesForManyResult
  getUserRolesForManyResult.data // Map keyed by user ID
  // 传刚创建的角色 ID 数组，返回角色 ID 到权限数组的 Map。
  const getRolePermissionsForManyResult = await iam.authz.getRolePermissionsForMany([role.id])
  if (!getRolePermissionsForManyResult.success)
    return getRolePermissionsForManyResult
  getRolePermissionsForManyResult.data // Map keyed by role ID
  // 批量读角色成员数并按当前角色 ID 取值，隔离示例中为 1。
  const getRoleUserCountsResult = await iam.authz.getRoleUserCounts([role.id])
  if (!getRoleUserCountsResult.success)
    return getRoleUserCountsResult
  getRoleUserCountsResult.data.get(role.id) // 1 in this isolated example
  // 按刚创建的 ID 查询角色对象，未命中为 null。
  const getRoleResult = await iam.authz.getRole(role.id)
  if (!getRoleResult.success)
    return getRoleResult
  getRoleResult.data // the created Role
  // 按稳定代码 docs_reader 读取相同角色，未命中为 null。
  const getRoleByCodeResult = await iam.authz.getRoleByCode('docs_reader')
  if (!getRoleByCodeResult.success)
    return getRoleByCodeResult
  getRoleByCodeResult.data // same Role
  // 读取角色第一页最多 20 条，返回 items 和分页信息。
  const getAllRolesResult = await iam.authz.getAllRoles({ page: 1, pageSize: 20 })
  if (!getAllRolesResult.success)
    return getAllRolesResult
  getAllRolesResult.data // role page
  // 按该角色 ID 更新显示名为 Document readers，成功返回更新记录。
  const updateRoleResult = await iam.authz.updateRole(role.id, { name: 'Document readers' })
  if (!updateRoleResult.success)
    return updateRoleResult
  updateRoleResult.data // updated Role
  // 用创建时的权限 ID 查询权限，没有此项时返回 null。
  const getPermissionResult = await iam.authz.getPermission(permission.id)
  if (!getPermissionResult.success)
    return getPermissionResult
  getPermissionResult.data // the created Permission
  // 按稳定代码 docs:read 找相同权限，未命中为 null。
  const getPermissionByCodeResult = await iam.authz.getPermissionByCode('docs:read')
  if (!getPermissionByCodeResult.success)
    return getPermissionByCodeResult
  getPermissionByCodeResult.data // same Permission
  // 读取权限第一页最多 20 条，结果含 items 和分页信息。
  const getAllPermissionsResult = await iam.authz.getAllPermissions({ page: 1, pageSize: 20 })
  if (!getAllPermissionsResult.success)
    return getAllPermissionsResult
  getAllPermissionsResult.data // permission page
  // 按角色 ID 读取已关联的权限数组，仍包含 docs:read。
  const getRolePermissionsResult = await iam.authz.getRolePermissions(role.id)
  if (!getRolePermissionsResult.success)
    return getRolePermissionsResult
  getRolePermissionsResult.data // includes docs:read
  // 把 docs:export 作为该权限的敏感操作规则保存，成功无业务数据。
  const setPermissionSensitiveOperationsResult = await iam.authz.setPermissionSensitiveOperations(permission.id, ['docs:export'])
  if (!setPermissionSensitiveOperationsResult.success)
    return setPermissionSensitiveOperationsResult
  // 成功无业务数据。
  // 按 docs:export 筛选生效的敏感操作；重认证策略启用时包含该规则，没有匹配则为空数组。
  const getSensitiveOperationsResult = await iam.authz.getSensitiveOperations('docs:export')
  if (!getSensitiveOperationsResult.success)
    return getSensitiveOperationsResult
  getSensitiveOperationsResult.data // configured rule when reauthentication is enabled
  // 解除新角色和权限的关联，成功无数据，不删除两者的定义。
  const removePermissionFromRoleResult = await iam.authz.removePermissionFromRole(role.id, permission.id)
  if (!removePermissionFromRoleResult.success)
    return removePermissionFromRoleResult
  // 成功无业务数据。
  // 从指定用户撤销本例的角色分配，成功无数据。
  const removeRoleResult = await iam.authz.removeRole(userId, role.id)
  if (!removeRoleResult.success)
    return removeRoleResult
  // 成功无业务数据。
  // 按 ID 删除本例创建的角色定义，成功无数据；删除失败时返回原失败结果。
  const deleteRoleResult = await iam.authz.deleteRole(role.id)
  if (!deleteRoleResult.success)
    return deleteRoleResult
  // 成功无业务数据。
  // 按 ID 删除本例创建的权限定义，成功无数据；删除失败时返回原失败结果。
  const deletePermissionResult = await iam.authz.deletePermission(permission.id)
  if (!deletePermissionResult.success)
    return deletePermissionResult
  // 成功无业务数据。
}
```

下面按创建权限/角色→关联→分配给用户→检查→撤销介绍，并列出敏感操作策略读写。布尔值 false 表示权限不满足，失败 HaiResult 表示检查未完成；不能把两者合并。

#### 权限检查顺序

#### 场景：按当前主体检查权限

```
checkPermission(userId, permission)
  → RBAC 未启用 → 直接返回 true
  → 从 Redis 读取当前的角色和权限，缓存里没有时通过一条数据库 JOIN 查询读取
  → 包含超管角色则返回 true；必要状态读取失败返回错误
  → 逐权限匹配：精确匹配 或 通配符匹配（`admin:*` 匹配 `admin:read`）
  → 返回 true / false
```

#### 场景：创建读取者角色并分配

先创建权限，使用权限 **ID** 保存角色的 `permissionIds`，再使用角色 **ID** 分配用户。会话中的 `roles`/`permissions` 和守卫使用稳定 **code**；显示 `name` 可独立修改，不能代替 ID/code。示例默认 RBAC 已启用，管理操作须由应用先校验调用者权限和资源范围。

`createRole/updateRole` 将角色资料与完整 `permissionIds` 放在同一事务：省略保持、空数组清空、重复去重、未知权限失败；并发以最后提交的完整集合为准。使用自管事务时提交后同步会话；使用外部事务时调用方须在提交后完成同步。

`checkPermission(userId, code)` 查询主体的 RBAC 权限，不识别请求所属 API Key 的 scopes；`getUserAuthorization` 也是主体授权读取。API Key 请求必须使用 `iam.auth.verifyToken` 返回的已收敛权限（下文完整示例），不能只拿 userId 重查并据此放行。serv 可用 `.permission('record:read')` 声明精确权限守卫；菜单/按钮隐藏只是体验控制，业务 API 仍须授权。

```ts
import { iam } from '@h-ai/iam'

async function provisionReader(userId: string) {
  // 示例初始化权限/角色；生产种子应先按 code 查询，保证幂等。
  // 创建 record:read API 权限；成功取得权限 ID，代码冲突或写入失败不继续建角色。
  const permission = await iam.authz.createPermission({
    code: 'record:read',
    name: '读取记录',
    type: 'api',
    resource: 'record',
    action: 'read',
  })
  if (!permission.success)
    return permission
  // 用前一步的权限 ID 创建 record_reader 角色；成功得到角色 ID，定义无效或写入失败直接返回。
  const role = await iam.authz.createRole({
    code: 'record_reader',
    name: '记录读取者',
    permissionIds: [permission.data.id],
  })
  if (!role.success)
    return role
  // 把新角色授给调用方指定用户，成功无数据，绑定失败返回错误。
  return iam.authz.assignRole(userId, role.data.id)
}

async function replaceRolePermissions(roleId: string, permissionIds: string[]) {
  // 完整替换：[] 清空；省略 permissionIds 则保持已有权限。
  // 用已授权的角色 ID 和可替换权限 ID 数组更新角色；成功返回更新对象，写失败返回错误。
  return iam.authz.updateRole(roleId, { permissionIds })
}

async function replaceUserRoles(userId: string, roleIds: string[]) {
  // 完整替换用户的角色集合；[] 移除全部角色。
  // 将指定用户的角色完整替换为传入 ID 集合，成功无数据，写入错误返回失败。
  return iam.authz.syncRoles(userId, roleIds)
}

async function currentAuthorization(userId: string) {
  // 返回 roles/permissions 的 code 数组，不接受 ID 或显示名称代替 code。
  // 按已核对的用户 ID 读当前授权快照；返回角色与权限 code，读取失败保留 error。
  return iam.authz.getUserAuthorization(userId)
}
```

#### 授权变更与缓存失效

- **通配符匹配**：`admin:*` 匹配 `admin:read`、`admin:write:detail` 等（单层 `*` 匹配冒号后全部）
- **超管角色**：配置的 `rbac.superAdminRole`（默认 `super_admin`）自动拥有所有权限
- **事务保护**：`deleteRole` / `deletePermission` 使用 DB 事务，先清关联再删实体
- **会话和权限检查**：更新会话缓存失败时，受保护请求仍由 `iam.auth.verifyToken()` 核对账号是否有效、凭据版本是否已改变、当前能做哪些操作。Redis 缓存不能作为依据时，改查数据库。无法取得必要的信息就拒绝请求。`iam.session.get()` 和 `iam.session.verifyToken()` 也核对账号状态和凭据版本，但角色和权限仍是会话最初保存的值。要查用户的当前授权，也可以用 `iam.authz.getUserAuthorization(userId)`。
- **种子数据**：`seedDefaultData: true` 时自动创建 admin/user/guest 三个默认角色及基础权限，幂等执行

---

#### 多节点鉴权缓存的恢复边界

Redis 缓存账号状态、凭据版本、角色权限、敏感操作清单和已经验证的 API Key，默认保留 60 秒。它不保存密码或 API Key 的验证哈希、明文密钥或重置令牌。API Key 的缓存索引由明文 Key 做 SHA-256 得到。即使缓存还有效，读取时也会重新检查账号、密码和 Key 的到期时间。没有权限缓存时通过一条 JOIN 查询读取数据库。

IAM 在数据库变更前标记这一批缓存暂时不可用。在事务提交或回滚后更换缓存版本，避免另一个节点把旧版本的查询结果重新写入 Redis。使用应用自行开启的事务时，同样要等事务结束后才恢复缓存。变更中、无法确认缓存状态或读取缓存失败时，授权信息改查数据库。保存会话的 Redis 本身无法访问时，令牌校验仍会失败。

写前无法登记失效时拒绝变更；已提交后失效失败不会伪装回滚，持久脏标记使后续授权继续读数据库。进程崩溃或提交结果未知时不通过 TTL 擅自清除此标记；应告警并在确认没有 IAM 写事务的维护窗口修复缓存状态。多节点必须同时升级并通过 IAM API 写权限/账号；直接 SQL、旧版本写节点或独立系统改表不触发缓存失效，需停写并使 IAM 缓存整体失效后再恢复，不能与在线缓存写入混用。API Key 明文验证命中缓存后避免重复昂贵哈希，lastUsedAt 在冷验证时采样更新（最多约一分钟延迟）。

<a id="sessions"></a>

### 续期与撤销会话：`iam.session`

会话令牌只在可信服务端验证；续期、列表与撤销使用同一会话体系，页面离开只是尽力请求撤销。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `iam.session.create(options)` | 创建令牌对与会话 | `options: CreateSessionOptions` · 为可信主体设置会话资料和期限 · [对象参数](#sessions-arguments) | `Session` | `await iam.session.create(trustedSessionInput)` |
| `iam.session.get(accessToken)` | 按访问令牌查会话 | `accessToken: string` 当前会话的访问令牌 | `Session \| null` | `await iam.session.get(accessToken)` |
| `iam.session.verifyToken(accessToken)` | 校验会话令牌 | `accessToken: string` 当前会话的访问令牌 | `Session` | `await iam.session.verifyToken(accessToken)` |
| `iam.session.update(accessToken, data, expectedVersion)` | 修改会话数据 | `accessToken: string` 当前会话的访问令牌 · `data: Partial<Session>` 可更新的会话字段，参见下方低层会话示例 · `expectedVersion: string` 最近读取的会话版本，用来阻止覆盖更新后的会话 | `void` | `await iam.session.update(accessToken, sessionPatch, expectedVersion)` |
| `iam.session.delete(accessToken)` | 删除令牌对应会话 | `accessToken: string` 当前会话的访问令牌 | `void` | `await iam.session.delete(accessToken)` |
| `iam.session.deleteByUserId(userId)` | 撤销指定用户全部会话 | `userId: string` 目标用户 ID | `number` | `await iam.session.deleteByUserId(userId)` |
| `iam.session.refresh(refreshToken)` | 轮换刷新凭据并续期 | `refreshToken: string` 要轮换或撤销的刷新令牌 | `TokenPair` | `await iam.session.refresh(refreshToken)` |
| `iam.session.revokeRefresh(refreshToken)` | 撤销指定刷新凭据 | `refreshToken: string` 要轮换或撤销的刷新令牌 | `void` | `await iam.session.revokeRefresh(refreshToken)` |
| `iam.session.patchUserSessions(userId, updates)` | 更新用户会话中的资料快照 | `userId: string` 目标用户 ID · `updates: SessionFieldUpdates` · [对象参数](#sessions-arguments) | `void` | `await iam.session.patchUserSessions(userId, sessionFieldUpdates)` |

<a id="sessions-arguments"></a>

##### 对象参数

| 类型或调用 | 字段与取值 |
| --- | --- |
| `CreateSessionOptions` | 必填 `userId`。可信宿主可提供 `terminalType`、`expectedCredentialVersion`、已验证的 `apiKeyId`／`apiKeyScopes`。可传 `username`、`displayName`、`avatarUrl`、`roles`、`permissions`、`source`、`maxAge`（秒）和业务 `data`。 |
| `SessionFieldUpdates` | 只接收可选的 `roles: string[]` 和 `permissions: string[]`，按用户更新现有会话。 |

##### 会话与令牌对

- **`SessionOperations`** — 会话操作接口：`create` / `get` / `verifyToken` / `update` / `delete` / `deleteByUserId` / `refresh` / `revokeRefresh` / `patchUserSessions`
- **`Session`** — 会话实体，含 userId、roles、permissions、accessToken、过期时间等
- **`TokenPair`** — 令牌对：`{ accessToken, refreshToken, expiresIn, tokenType: 'Bearer' }`

#### 场景：续期与撤销会话

刷新不是延长同一 token 字符串。IAM 创建候选会话，再把消费旧刷新令牌和发布新会话放在同一次共享存储操作中。

![refresh：旧令牌只能换出一个后继](../images/function-iam-refresh.svg)

两个节点同时拿同一旧刷新令牌，只有取得原子更新资格的一方能发布后继；不能先删旧记录再分别创建新记录。账号、API Key 或凭据版本失效时拒绝。成功后客户端替换保存整对凭据，存储和网络失败必须保留实际失败，不能假定刷新已经完成。

会话场景说明 create 返回的 Session、verify 的会话结果、refresh 的新令牌，以及 delete/deleteByUserId 的撤销效果。令牌只演示来源和类型，不记录真实内容；可选安全策略仍由服务端执行。

#### 轮换与单设备提交规则

#### 场景：用刷新令牌取得唯一后继

```
refresh(refreshToken)
  → 读取用户分区中的旧会话和版本，验证授权
  → 构造新令牌候选（尚未生效）
  → 单键 CAS 再核验版本和 refresh，原子撤销旧会话并发布唯一后继
  → 仅提交成功后返回 TokenPair
```

#### 场景：按单设备策略创建会话

```
create(options) [singleDevice=true]
  → 构造新 accessToken + refreshToken
  → 单键 CAS 同时替换该用户全部旧会话与索引
  → 提交失败不踢出原会话
```

#### 场景：认证请求、刷新与强制退出

登录成功后通过 `tokens.accessToken` 认证请求，通过 `tokens.refreshToken` 换取新令牌；`expiresIn` 单位为秒。独立 API 使用 `Authorization: Bearer <accessToken>`；SvelteKit Cookie 入口使用 kit 的标准认证集成，详见下方前端调用。

每个受保护接口使用 `iam.auth.verifyToken()` 读取当前用户资料、角色和权限。`iam.session.get()` 和 `iam.session.verifyToken()` 返回的是会话中保存的角色和权限。管理员后来撤销权限时，这份会话记录可能仍保留旧值，因此应用做权限判断时用 `iam.auth.verifyToken()`。只有服务端能调用 `iam.session.create()` 并决定角色、权限或 API Key，不能使用客户端自报的值。

```ts
import { iam } from '@h-ai/iam'

async function authenticateRequest(accessToken: string) {
  // 受保护请求读取当前用户状态及角色/权限，失败时停止业务操作。
  // 验证请求携带的访问令牌并重读当前授权；成功返回会话，令牌无效、过期或依赖不可用时失败。
  const verified = await iam.auth.verifyToken(accessToken)
  if (!verified.success)
    return verified
  return verified
}

async function rotateTokens(refreshToken: string) {
  // 以客户端刷新令牌原子换取新的 TokenPair；过期或已轮换时失败。
  const refreshed = await iam.session.refresh(refreshToken)
  if (!refreshed.success)
    return refreshed
  // 安全存储替换两个令牌；下一次请求仍走 auth.verifyToken。
  return refreshed
}

async function signOut(accessToken: string) {
  // 以完整访问令牌撤销会话及相关刷新令牌，成功无数据；共享存储提交失败返回错误。
  return iam.auth.logout(accessToken)
}

async function forceSignOut(userId: string) {
  // 调用前已验证管理员权限，返回撤销的会话数。
  // 撤销经授权管理的用户的所有会话，成功返回撤销数量；提交失败返回错误。
  return iam.session.deleteByUserId(userId)
}
```

#### 会话到期与存储故障

- **纯缓存存储**：不落库；Memory 重启后丢失，共享 Redis 可跨 IAM 服务重启保留会话直至 TTL 或撤销
- **滑动续期**：`sliding: true` 时每次 `get()` 单调延长 access 期限；分区保留期限另由 access/refresh 最大期限确定
- **Refresh Rotation**：旧 refresh 仅能成功消费一次；重复请求也可能来自合法并发或响应丢失，不能仅据此断言凭据泄露。
- **Token 强度**：256-bit crypto random（`crypto.getRandomValues(new Uint8Array(32))`），base64url 编码

`create({ maxAge })` 可覆盖配置默认时长（正安全整数秒），该值持久化为 `Session.maxAge`；签发和刷新返回的 `expiresIn` 均使用它。滑动续期按该时长延长 access，返回已成功提交的 `lastActiveAt/expiresAt`；迟到请求只延长时间，不缩短较新续期。显式 `update` 的有效日期补丁完整生效并产生新内容版本。客户端根据本次返回的 `expiresIn` 安排刷新，不能硬编码配置默认值。

未启用额外闲置/绝对期限时，access 与 refresh 独立到期：用户分区保留至所有 access/refresh 的最晚有效期，但 access 认证检查自己的 `expiresAt`。启用额外会话策略时，access/refresh 还必须满足相同的闲置与绝对期限。access 过期仍可凭未过期、未撤销的 refresh 轮换；每次轮换从新签发时刻重新计算 `refreshTokenMaxAge`，旧 access/refresh 同时失效。删除 access、logoutAll、单设备替换均撤销待刷新记录；仅 revokeRefresh 保留仍有效的 access。刷新路由只校验 refresh，不能先要求旧 access 认证成功。

会话仓库将缓存读取/提交失败返回为失败 HaiResult，不解释为会话不存在或过期，也不执行清理补偿。用户会话及索引共用一个文档，批量授权更新不再逐 token 调用 get/ttl 或维护第二份索引；只按已确认的绝对期限清理。故障恢复后可重新读取并重试更新/退出，logoutAll 仍覆盖原有全部记录。结构损坏同样失败关闭并保留原值，交由运维处理，禁止用空文档覆盖未知授权状态。

`Session.credentialVersion` 记录创建会话时的凭据版本。认证方式已经验证过凭据时，可把当时读取到的版本作为 `CreateSessionOptions.expectedCredentialVersion` 传入，版本已变更则拒绝创建会话。服务端直接调用 `iam.session.create()` 即使省略这个参数，也会读取数据库中的账号，确认它仍为激活状态、未过期，再使用当前凭据版本。

---

#### 场景：限制闲置、绝对期限与会话数

在 `session` 中设置 `idleTimeout: 1800` 可要求30分钟没有成功认证请求后重新登录；`0` 关闭。该策略在 access 读取、活动提交和 refresh 轮换时检查，不能通过长期 refresh 恢复已闲置的会话。自动 refresh 只换票，不延长闲置期限；后台业务轮询仍会产生认证活动，应用应按实际用户操作设计轮询行为。

`absoluteTimeout` 是从首次登录起的秒数上限，刷新不重置起点，`0` 关闭。`maxSessions` 限制每个用户的有效会话数，包含 access 已过期但仍可刷新的记录，`0` 不限制；并发登录在同一共享状态 CAS 中检查配额。`singleDevice: true` 默认顶旧保新；配合 `singleDeviceMode: 'reject'` 可保留旧会话并拒绝重复登录。显式退出撤销 access 和 refresh，关闭浏览器不能替代服务端期限。

未启用上述期限时，保留 access 与 refresh 独立到期的行为。每次成功登录始终生成新随机凭据，不复用客户端会话ID。`SESSION_LIMIT_EXCEEDED` 表示登录达到已配置的会话上限。

#### 场景：页面离开时尽力请求撤销

`session.endOnPageHide` 默认关闭。开启后，在浏览器页面加载时调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })`，卸载时执行它返回的函数，移除监听器。标准 admin、H5 和 fullstack 模板已接好此步骤。这里的 `actions` 来自 `apiClient.createAuthActions(...)` 或 SvelteKit 的 `kit.client.createAuthActions(...)`。配置从登录页使用的公开认证接口读取。

浏览器触发 `pagehide` 时会尝试调用 `POST /auth/session/close`。这包括刷新或整页导航，但页面进入往返缓存（BFCache）时会跳过。请求沿用 CSRF 防护和已启用的传输加密，并使用 `keepalive` 争取在页面关闭后完成。该请求不会刷新会话，响应也不会清除 Cookie 或本地凭据，以免较早的请求清掉新的登录状态。

浏览器可能根本没有发出请求。服务端仍需用 `idleTimeout` 或 `absoluteTimeout` 限制会话寿命。用户主动退出时，应正常调用应用的 logout 接口，让服务端撤销凭据，并清除客户端保存的登录状态。

标准 `/auth/me` 也检查 `iam.profile.update` / `iam.profile.avatar`；混合修改优先选取已启用的资料用途，否则使用头像用途。`authz.getSensitiveOperations(operation?)` 可只查询一个操作；未传则列出全部有效数据库规则。超管身份每次从共享角色读取，默认种子允许并发创建冲突后重读，并传播权限分配失败。

#### 场景：低层会话读写与令牌轮换

options 只能由可信服务端在验证用户后构造；这些低层接口不替应用做业务授权。第一个函数影响该测试用户的全部会话，只在隔离数据上运行。第二个函数使用一次真实登录得到的 refreshToken，独立演示轮换与撤销。

```ts
import type { CreateSessionOptions } from '@h-ai/iam'

async function manageTrustedSession(options: CreateSessionOptions, refreshToken: string) {
  // 用宿主提供的用户与可信会话选项直接创建 Session；存储失败时返回原失败结果。
  const createdResult = await iam.session.create(options)
  if (!createdResult.success)
    return createdResult
  const created = createdResult.data // Session, not TokenPair
  const token = created.accessToken
  // 用刚创建的 access token 读取会话快照；找不到时返回 null。
  const foundResult = await iam.session.get(token)
  if (!foundResult.success)
    return foundResult
  const found = foundResult.data // Session or null
  // 用同一 access token 做底层会话验证，成功得到现存 Session；缺失、过期等失败。
  const verifiedResult = await iam.session.verifyToken(token)
  if (!verifiedResult.success)
    return verifiedResult
  const verified = verifiedResult.data // Session; missing/expired fails
  // 按刚验证的版本把该会话的 theme 设为 dark，成功无数据；版本冲突失败。
  const updateResult = await iam.session.update(token, { data: { theme: 'dark' } }, verified.version)
  if (!updateResult.success)
    return updateResult
  // 成功无业务数据。
  // 为创建选项中的用户同步已验证的角色和权限快照，成功无数据；写入失败时返回原失败结果。
  const patchUserSessionsResult = await iam.session.patchUserSessions(options.userId, { roles: verified.roles, permissions: verified.permissions })
  if (!patchUserSessionsResult.success)
    return patchUserSessionsResult
  // 成功无业务数据。
  // 用初始 access token 撤销该会话，成功无数据；存储失败时返回原失败结果。
  const deleteResult2 = await iam.session.delete(token)
  if (!deleteResult2.success)
    return deleteResult2
  // undefined; revokes this session
  // 用创建选项的用户 ID 撤销剩余会话并返回数量。
  const deleteByUserIdResult = await iam.session.deleteByUserId(options.userId)
  if (!deleteByUserIdResult.success)
    return deleteByUserIdResult
  deleteByUserIdResult.data // remaining revoked count
}

async function rotateThenRevoke(refreshToken: string) {
  // 使用调用方的旧刷新令牌换取新的一对令牌；过期或已用过的令牌失败。
  const pairResult = await iam.session.refresh(refreshToken)
  if (!pairResult.success)
    return pairResult
  const pair = pairResult.data // new TokenPair
  // 撤销刚换出的刷新令牌，解除再次续期能力，成功无数据；当前访问令牌仍需独立撤销。
  const revokeRefreshResult = await iam.session.revokeRefresh(pair.refreshToken)
  if (!revokeRefreshResult.success)
    return revokeRefreshResult
  // undefined; access remains valid until expiry/revocation
  // 撤销同一轮新发的 access token 会话，成功无数据。
  const deleteResult = await iam.session.delete(pair.accessToken)
  if (!deleteResult.success)
    return deleteResult
  // 成功无业务数据。
}
```

<a id="api-keys"></a>

### 签发与撤销程序凭据：`iam.apiKey`

程序接入使用有归属和权限范围的 API Key；原始密钥只在签发时交给持有者保存。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `iam.apiKey.createApiKey(userId, options)` | 签发只返回一次明文的程序凭据 | `userId: string` 目标用户 ID · `options: CreateApiKeyOptions` · 设置密钥的名称、期限和权限范围 · [对象参数](#api-keys-arguments) | `CreateApiKeyResult` | `await iam.apiKey.createApiKey(userId, { name: 'reporting', scopes: ['orders:read'] })` |
| `iam.apiKey.listApiKeys(userId, options?)` | 分页列出用户程序凭据 | `userId: string` 目标用户 ID · `options?: ListApiKeysOptions` · 筛选、排序和分页列出该用户的密钥 · [对象参数](#api-keys-arguments) | `PaginatedResult<ApiKey>` | `await iam.apiKey.listApiKeys(userId, { page: 1, pageSize: 20 })` |
| `iam.apiKey.getApiKey(keyId)` | 按 ID 查询安全凭据信息 | `keyId: string` API Key 元数据 ID | `ApiKey \| null` | `await iam.apiKey.getApiKey(keyId)` |
| `iam.apiKey.revokeApiKey(keyId)` | 撤销程序凭据 | `keyId: string` API Key 元数据 ID | `void` | `await iam.apiKey.revokeApiKey(keyId)` |
| `iam.apiKey.verifyApiKey(rawKey)` | 校验程序凭据 | `rawKey: string` 签发时一次性返回的原始 API Key | `ApiKey` | `await iam.apiKey.verifyApiKey(rawKey)` |

<a id="api-keys-arguments"></a>

##### 对象参数

| 类型或调用 | 字段与取值 |
| --- | --- |
| `CreateApiKeyOptions` | 名称 `name` 必填。`expirationDays` 以天计，省略时由配置决定，显式 `0` 表示不设到期。`scopes` 是权限代码列表，可省略。 |
| `ListApiKeysOptions` | 可填 `page`、`pageSize`、匹配名称或前缀的 `search` 和 `enabled`。可按 `name`、`createdAt`、`lastUsedAt`、`expiresAt` 排序，方向为 `asc` 或 `desc`。省略排序时按创建时间倒序。 |

##### 密钥签发与列表选项

| 字段 | 默认或必填 | 作用与生效条件 |
| --- | --- | --- |
| `create.options.name: string` | 必填 | 用来识别密钥的显示名称 |
| `create.options.expirationDays: number` | `config.apikey.defaultExpirationDays` | 单位为天。框架配置默认 0，显式传 0 表示不设到期时间 |
| `create.options.scopes: string[]` | `[]` | 用权限代码限制可用的操作 |
| `list.options.page / list.options.pageSize` | `1 / 20` | 页码和每页密钥数 |
| `list.options.search: string` | 可省略 | 部分匹配密钥名称或前缀 |
| `list.options.enabled: boolean` | 可省略 | 筛选启用或停用，省略时包含两种 |
| `list.options.sortBy / list.options.sortDirection` | `createdAt / desc` | 可按 name、createdAt、lastUsedAt 或 expiresAt 排序 |

##### 密钥元数据与一次性明文

- **`ApiKeyOperations`** — API Key 操作接口：`createApiKey` / `listApiKeys` / `getApiKey` / `revokeApiKey` / `verifyApiKey`
- **`ApiKey`** — API Key 实体（公开字段）：`{ id, userId, name, keyPrefix, enabled, expiresAt, scopes }`
- **`CreateApiKeyResult`** — 创建结果：`{ apiKey, rawKey }`（明文密钥仅返回一次）

#### 场景：签发与撤销程序凭据

下文用创建结果继续验证、列出、更新与撤销；列表和数据库保存脱敏信息，不可从摘要还原原始密钥。各接口输入使用同一 keyId 或原始签发值，按实际签名区分。

#### API Key 与主体权限的关系

`scopes` 与主体权限取交集，支持 `*` 和命名空间 `:*`；默认空数组只保留身份，不授予操作权限。受限 key 的会话 `roles` 为空，通过 permission 守卫访问，显式 `*` 也不能超出主体授权。API Key 登录绑定 key ID，派生会话的 get/verifyToken/refresh 每次检查持久化 key，撤销、禁用、过期或 DB 读取失败即拒绝。单独 verifyApiKey 仅返回验证后的 key 元数据，仍需主体与操作授权。

#### 密钥验证顺序

#### 场景：验证程序凭据

```
verifyApiKey(rawKey)
  → 以 SHA-256(rawKey) 指纹读取共享代际缓存，命中时校验有效期并返回
  → 冷读从 rawKey 提取前缀（prefix + 前 8 字符）
  → 按前缀从 DB 检索候选 API Key 列表（缩小范围）
  → 逐候选项进行 hash 验证（同步操作）
  → 验证通过 → 检查是否过期/禁用
  → 异步更新 lastUsedAt（不阻塞返回）
  → 返回 ApiKey 实体
```

#### 场景：签发受限 Key、登录与撤销

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
import { HaiCommonError, core } from '@h-ai/core'
import { iam } from '@h-ai/iam'

async function createReadKey(userId: string) {
  // 调用前校验管理权限或本人归属；scopes 使用权限 code。
  // 为已授权用户创建名为 Read client、有效期 30 天、限 record:read 的密钥；成功仅本次返回明文。
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
  // 用安全接收的明文 API Key 登录，返回受 scopes 收敛的会话令牌；无效、已停用或过期的密钥失败。
  return iam.auth.loginWithApiKey({ key: rawKey })
}

async function requireRecordRead(accessToken: string, deniedMessage: string) {
  // deniedMessage 由应用 i18n 提供；先读取当前且已收敛 scope 的会话。
  // 验证请求携带的访问令牌并重读当前授权；成功返回会话，令牌无效、过期或依赖不可用时失败。
  const verified = await iam.auth.verifyToken(accessToken)
  if (!verified.success)
    return verified
  const allowed = verified.data.permissions.some(code =>
    code === '*' || code === 'record:read'
    || (code.endsWith(':*') && 'record:read'.startsWith(code.slice(0, -1))),
  )
  if (!allowed)
    // 用统一拒绝码和应用本地化文案构造失败 HaiResult，当前请求不继续。
    return core.err(HaiCommonError.FORBIDDEN, deniedMessage)
  // 这里只确认操作权限；业务层还须检查具体记录的数据归属。
  // 把已验证会话中的用户 ID 包为成功数据，供后续检查具体资源归属。
  return core.ok({ userId: verified.data.userId })
}

async function listMyKeys(userId: string) {
  // 为已核对的用户拉取第一页启用的 Read 系列密钥元数据，每页最多 20 条，不返回明文密钥。
  return iam.apiKey.listApiKeys(userId, {
    page: 1,
    pageSize: 20,
    search: 'Read',
    enabled: true,
  })
}

async function revokeKey(keyId: string) {
  // 调用前校验本人归属或管理权限。
  // 按已核对的密钥 ID 撤销 API Key，成功无数据；存储失败保留错误。
  return iam.apiKey.revokeApiKey(keyId)
}
```

创建后只有 `rawKey` 能用于 Key 登录；`apiKey.id` 是管理 ID，`keyPrefix` 仅用于显示/检索，均不能代替 rawKey。`verifyApiKey(rawKey)` 仅验证 Key 并返回元数据，不能代替用户状态、scopes 与操作授权。

Key 登录会话绑定 Key ID。刷新使用普通 `iam.session.refresh`，不会丢失该绑定或扩大 scopes。撤销成功后，已有 accessToken 的 get/verify 以及 refreshToken 的 refresh 都会失败；过期、禁用及持久化读取失败同样拒绝。角色撤权由 `iam.auth.verifyToken` 读取当前授权生效。改 scope 使用创建新 Key 后撤销旧 Key，当前 API 不提供 scope 更新操作。

`expirationDays: 0` 表示不设过期时间，省略时使用 `apikey.defaultExpirationDays`；需要限时访问时显式设置。明文 Key 和 Token 不进入 URL、日志、公开配置或普通 localStorage。

#### 密钥保留与数量限制

- **明文不落库**：数据库仅存储 hash，创建时返回的 `rawKey` 是唯一获取机会
- **前缀检索**：使用 `keyPrefix` 缩小候选集，避免全表扫描
- **数量限制**：单用户最多 `maxKeysPerUser`（默认 10）个 API Key
- **需显式启用**：`login.apikey: true` 才会初始化 API Key 子功能

---

<a id="tickets"></a>

### 签发与消费一次性票据：`iam.ticket`

让某个已验证主体在短期内完成指定用途；消费成功后不能再次使用同一票据。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `iam.ticket.issue(options)` | 签发有用途和期限的单次票据 | `options: IssueTicketOptions` · 绑定主体、用途和到期时间 · [对象参数](#tickets-arguments) | `IssuedTicket` | `await iam.ticket.issue(ticketInput)` |
| `iam.ticket.consume(ticket, options?)` | 校验用途并原子消费票据 | `ticket: string` 服务端签发的一次性票据 · `options?: ConsumeTicketOptions` · 可限定期望用途后再消费 · [对象参数](#tickets-arguments) | `ConsumedTicket` | `await iam.ticket.consume(operationTicket, ticketBinding)` |

<a id="tickets-arguments"></a>

##### 对象参数

| 类型或调用 | 字段与取值 |
| --- | --- |
| `IssueTicketOptions` | `subjectId: string` 和 `purpose: string` 必填。可传 `grant` 绑定授权信息、`ttlMs` 设置有效期，默认 30000 毫秒。 |
| `ConsumeTicketOptions` | 可传 `purpose: string` 来核对签发用途，填错会返回 `TICKET_INVALID`。 |

##### 票据签发与消费字段

| 字段 | 默认或必填 | 作用与生效条件 |
| --- | --- | --- |
| `subjectId: string` | 必填 | 票据绑定的用户或主体，消费成功时返回该值 |
| `purpose: string` | 必填 | 签发时标记用途，可在消费时要求匹配 |
| `grant: TicketGrant` | 可省略 | 绑定 operation、model、sessionId 或应用字段，成功消费后交给服务端核对 |
| `ttlMs: number` | `30000 ms` | 从签发到过期的时长 |
| `consume.options.purpose: string` | 可省略 | 指定时核对签发用途，不匹配返回 TICKET_INVALID |

#### 场景：签发与消费一次性票据

下文 issue 输入用途与绑定信息，输出随机票据；consume 输入票据和预期用途，输出绑定数据或失败。用途不符时请求失败，票据仍可由正确用途兑换。过期或已使用的票据不能继续业务操作。

#### 场景：为语音连接签发并消费短期票据

短期、一次性能力票据。用于无法携带 Bearer Token 的通道（如 WebSocket URL）：由已认证的 HTTP 请求签发一个绑定主体、用途与操作的票据，服务端在首次校验时**原子消费**（单次有效）。

```ts

import { type Session, iam } from '@h-ai/iam'

async function issueAudioTicket(session: Session) {
  // session 已通过当前授权校验，签发前还须验证该操作及资源范围。
  // 把已验证会话的用户 ID 绑定到 ai-audio 转录 grant，签发 30 秒一次性票据；签发失败不下发票据。
  const issued = await iam.ticket.issue({
    subjectId: session.userId,
    purpose: 'ai-audio',
    grant: { operation: 'transcribe', model: 'whisper-1' },
    ttlMs: 30_000,
  })
  if (!issued.success)
    return issued
  // 仅将短期票据交给客户端，不把长期 accessToken 放进 URL。
  return issued
}

async function consumeAudioTicket(ticket: string) {
  // 按 ai-audio 用途原子消费客户端票据，成功返回已绑定授权；用途不符、过期或已消费会失败。
  const consumed = await iam.ticket.consume(ticket, { purpose: 'ai-audio' })
  if (!consumed.success)
    return consumed
  // 按 grant 校验本次建连操作/资源；票据本身不自动读取当前 RBAC。
  return consumed
}
```

特性：密码学安全随机值、TTL、原子单次消费（并发消费仅一个成功）、用途绑定（防跨用途重放）。

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

登录、续期和管理操作返回 `HaiResult<T>`。模块状态和配置等属性可直接读取。需要区分多个失败原因时，用 `HaiIamError` 中的错误码判断。

```ts
import { HaiIamError, iam } from '@h-ai/iam'

// 故意使用 admin 的错误密码示范。凭据错误返回 INVALID_CREDENTIALS 并且不建立会话。
const result = await iam.auth.login({ identifier: 'admin', password: 'wrong' })
if (!result.success) {
  if (result.error.code === HaiIamError.INVALID_CREDENTIALS.code) {
    // 用户名或密码错误
  }
}
```

会话与 refresh 消费记录统一保存在 `hai:iam:sessions:{SHA256(userId)}` 版本化文档，不再使用独立 token 映射/索引。Bearer token 携带不可作为凭据的分区提示和 256 位随机值；客户端必须视为不透明字符串。`Session.version` 用于轮换提交校验。Memory 仅用于单进程测试，生产所有节点共享 Redis（含 Cluster）。并发冲突从最新文档重试，耗尽返回 CONFLICT；旧 refresh 不会产生第二个后继。若响应丢失后结果不明，调用方按失败关闭并重新登录，不假定旧凭据仍有效；全部会话仍受同一用户状态索引管理。

`iam.session.update(token, patch, expectedVersion)` 必须传入读取到的 Session.version。旧版本返回 CONFLICT，已撤销 token 返回 SESSION_NOT_FOUND；不会将旧内容重新写回或覆盖新会话。仅滑动时间戳更新不改变内容版本，允许正常并行请求。批量权限更新绑定首次读取的 token/版本集合，不将迟到数据应用到后续登录；遇到较新内容版本失败，调用方重新查询授权后再提交。
