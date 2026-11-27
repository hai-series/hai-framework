# @h-ai/iam 配置

<a id="iam-配置"></a>

[English](iam.en.md) · [日本語](iam.ja.md) · [配置手册](README.md) · [功能说明](../function/iam.md) · [数据结构](../data/iam.md)

## 配置入口

启用 IAM 的生成项目在服务端工作区的 `config/_iam.yml` 保存设置。启动代码用 `core.init({ configDir: './config', configSchemas: { iam: IamConfigSchema } })` 加载配置，读取 `core.config.getOrThrow('iam')`，再把设置和运行时依赖传给 `iam.init()`。先初始化 RelDB 和 Cache。IAM 复用已初始化的 Crypto，必要时自动初始化。生成项目修改配置后重启服务，待初始化成功再开放认证请求。[依赖和启动顺序](../function/iam.md#module-dependencies)

生产环境首次启动 IAM 前，先初始化共享 Redis 中的权限读取缓存代次。[初始化和恢复步骤](../data/iam.md#iam-read-cache-recovery)

Core 在 YAML 基础上应用 `HAI_IAM` 整体 JSON 或 `HAI_IAM_*` 字段覆盖。同一来源先应用整块，再应用单项。例如 `HAI_IAM_SESSION_MAXAGE=1800` 把 `session.maxAge` 设为 1800 秒。Core 随后展开尚存的 `${VAR}` 占位符并校验类型。进程环境优先于环境文件。把 LDAP 绑定密码留在服务端私有环境。[环境变量来源与优先级](runtime.md#配置从哪里来)

如果 `iam.init()` 的 Schema 校验失败，返回 `CONFIG_ERROR`，可从 `error.ext.fields` 查看字段路径，服务端日志的 `issues` 列出对应错误。浏览器通过已初始化客户端的 `client.iam.auth.publicConfig()` 读取服务端白名单，包含可用登录方式和页面所需字段。宿主仍需对受保护路由校验会话与权限。[公开配置和认证操作](../function/iam.md#authentication)

<a id="configuration-fields"></a>

## 配置清单

下表是框架默认值。标有默认值的字段均可省略。省略 `password` 或 `session` 整组时仍使用表列策略。CLI 输出可能显式覆盖这些值。例如生成器默认关闭 OTP 登录和账号锁定，并放宽密码字符类别要求。以目标服务的文件和环境覆盖为准。

<a id="配置示例"></a>

把对应片段合并到服务端的 `config/_iam.yml`，并在服务重启后核对该场景。

### `login`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `login.password` | 布尔值 | `true` | 启用普通密码登录。 |
| `login.otp` | 布尔值 | `true` | 启用验证码登录开关。还需提供 `otp` 对象及至少一个可用发送渠道。 |
| `login.ldap` | 布尔值 | `false` | 启用目录登录。同时需要完整的 `ldap` 配置和目录客户端。 |
| `login.apikey` | 布尔值 | `false` | 启用 API Key 验证、登录及密钥管理。应用负责为管理操作授权。 |

### `register`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `register.enabled` | 布尔值 | `true` | 允许访客自助注册及 OTP 首次注册。已有用户仍可使用启用的登录方式，管理员可独立创建账号。 |
| `register.defaultAccountStatus` | `active` 或 `dormant` | `active` | 自助注册、OTP 首次注册和 LDAP 同步新账号的初始状态。休眠账号由管理员激活后登录。 |

<a id="password"></a>

### 密码策略

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `password.minLength` | 整数，1 至 `password.maxLength` | `8` | 新设密码的最短长度，按 JavaScript 字符串长度计算。 |
| `password.maxLength` | 整数，`password.minLength` 至 256 | `128` | 新设密码的最长长度。 |
| `password.requireUppercase` | 布尔值 | `true` | 新密码须包含 ASCII 大写字母。 |
| `password.requireLowercase` | 布尔值 | `true` | 新密码须包含 ASCII 小写字母。 |
| `password.requireNumber` | 布尔值 | `true` | 新密码须包含数字 0–9。 |
| `password.requireSpecialChar` | 布尔值 | `false` | 新密码须包含策略识别的标点符号，例如 `!` 或 `#`。 |
| `password.minCharacterClasses` | 整数，0–4 | `0` | 在大写、小写、数字、特殊字符四类中至少命中几类。与各类别开关同时执行。 |
| `password.expirationDays` | 非负整数，天 | `0` | 从最近设密起计算有效期，0 关闭。口令到期须经续期入口改密后重新登录。 |
| `password.preventSamePassword` | 布尔值 | `false` | 启用时拒绝复用当前密码。开启有效期或首次强改规则时也拒绝复用。 |
| `password.requireInitialChange` | 布尔值 | `false` | 管理员创建或重置口令时标记首次强改。用户通过改密后才能建立会话。 |

### `otp`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `otp` | 对象 | 启用 OTP 登录时必填，可用 `{}` | IAM 据此装配验证码策略。 |
| `otp.email` | 布尔值 | `true` | 允许邮件渠道，需要 `onOtpSendEmail` 或 Reach 的 `otp_email` 模板。 |
| `otp.sms` | 布尔值 | `true` | 允许短信渠道，需要 `onOtpSendSms` 或 Reach 的 `otp_sms` 模板。 |
| `otp.length` | 整数，4–8 位 | `6` | 数字验证码的位数。 |
| `otp.expiresIn` | 整数，至少 60 秒 | `300` | 从签发到验证码失效的时间。 |
| `otp.maxAttempts` | 正整数 | `3` | 单次签发允许的校验次数，用尽后需申请新码。 |
| `otp.resendInterval` | 整数，至少 30 秒 | `60` | 同一规范化联系方式两次发码的最短间隔，已使用的验证码也保留冷却。 |

邮件验证码与初始设密的联合配置见[邮件验证码和邀请示例](#example-email-otp-invite)。

### `ldap`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `ldap` | 对象 | `login.ldap: true` 时必填 | 连接组织目录并从稳定目录身份解析本地用户。 |
| `ldap.url` | `ldap://` 或 `ldaps://` URL | 提供 `ldap` 时必填 | 目录地址，LDAPS 自带 TLS。 |
| `ldap.bindDn` | 字符串 | 提供 `ldap` 时必填 | 查询目录的服务账号 DN。 |
| `ldap.bindPassword` | 字符串 | 提供 `ldap` 时必填 | 服务账号密码。默认 LDAP 客户端拒绝空密码。 |
| `ldap.searchBase` | 字符串 | 提供 `ldap` 时必填 | 用户查询的基础 DN。 |
| `ldap.directoryId` | 字符串，1–96 个小写字母、数字、`.`、`_` 或 `-`，首字符为字母或数字 | 启用 LDAP 时必填 | 同一目录在所有节点使用相同的稳定标识。 |
| `ldap.identityAttribute` | `entryUUID` 或 `objectGUID` | `entryUUID` | 目录条目的不可变标识，Active Directory 使用 `objectGUID`。 |
| `ldap.searchFilter` | 字符串 | `(uid={{username}})` | 查询过滤器，IAM 用转义后的用户名替换占位符。 |
| `ldap.usernameAttribute` | 字符串 | `uid` | 创建本地账号时读取的用户名属性。 |
| `ldap.emailAttribute` | 字符串 | `mail` | 同步邮箱时读取的属性。 |
| `ldap.displayNameAttribute` | 字符串 | `cn` | 同步显示名称时读取的属性。 |
| `ldap.useTls` | 布尔值 | `false` | 默认客户端对 `ldap://` 连接启用 StartTLS。 |
| `ldap.connectTimeout` | 整数，至少 1000 毫秒 | `5000` | 默认客户端的连接和 LDAP 操作超时。 |

<a id="example-ldap"></a>

#### 连接公司的 LDAP 目录

在 IAM 服务端工作区安装 `ldapts`，或在启动代码中注入自定义客户端。将示例地址、DN 和目录 ID 换成实际值，所有节点使用同一个目录 ID。把 `HAI_IAM_LDAP_BINDPASSWORD` 放在服务端私有环境。未使用 LDAP 的部署应省略整个 `ldap` 节及相关环境覆盖。仅保留绑定密码覆盖会形成不完整的对象。

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, ldap: true }
ldap:
  url: ldaps://directory.example.invalid:636
  bindDn: cn=app-reader,ou=services,dc=example,dc=invalid
  bindPassword: ${HAI_IAM_LDAP_BINDPASSWORD}
  searchBase: ou=people,dc=example,dc=invalid
  directoryId: company-directory
  identityAttribute: entryUUID
```

在目标环境核对证书信任、目录账号的查询权限和可用登录路由。用专用目录账号验证成功登录、错误密码拒绝和初次登录的本地角色。已有目录账号执行身份绑定核对后迁移。[LDAP 身份绑定迁移](../function/iam.md#ldap-identity-migration)

### `apikey`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `apikey.maxKeysPerUser` | 正整数 | `10` | 每个用户可保存的密钥数量上限。 |
| `apikey.defaultExpirationDays` | 非负整数，天 | `0` | 创建密钥时的默认有效期，0 表示无期限。 |
| `apikey.prefix` | 字符串 | `hai_` | 新密钥的明文前缀，用应用标识即可。 |

### `passwordReset` 与 `initialCredentials`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `passwordReset.enabled` | 布尔值 | `true` | 启用密码重置。还需要自定义发送回调或对应的 Reach 模板。 |
| `passwordReset.mode` | `email` 或 `phone` | `email` | 默认通知读取账号的邮箱或手机号，分别使用 `password_reset`、`password_reset_sms`。 |
| `passwordReset.resetUrl` | HTTP(S) 绝对 URL | 可省略 | 默认发送回调把重置令牌作为 `token` 查询参数加入该 URL。省略时模板变量 `resetUrl` 是令牌本身。 |
| `passwordReset.tokenExpiresIn` | 整数，至少 300 秒 | `3600` | 重置与初始设密邀请的令牌有效期。 |
| `passwordReset.maxAttempts` | 正整数 | `3` | 有效重置令牌可提交的次数，密码策略校验失败也计次。 |
| `initialCredentials.enabled` | 布尔值 | `false` | 允许管理员通过一次性邀请让用户设密。需启用重置并准备目标账号的接收渠道。 |

<a id="example-email-otp-invite"></a>

#### 用邮箱验证码登录并发送设密邀请

先为服务启用 Reach 邮件提供方，配置 `otp_email` 和 `password_reset` 模板并在启动时传入已初始化的 Reach。已有邮件服务也可由应用注入两个对应发送回调。

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, otp: true }
register: { enabled: false }
otp: { email: true, sms: false, expiresIn: 300, resendInterval: 60 }
initialCredentials: { enabled: true }
passwordReset: { enabled: true, mode: email, resetUrl: https://app.example.invalid/auth/reset-password }
```

将重置地址换成应用的实际页面。公开配置应启用邮件 OTP、重置和邀请。用已登记且唯一的测试邮箱申请验证码并登录，再用获授权的管理入口邀请一个新用户，确认收件人进入设密页面并只消费一次令牌。[OTP 与通知接入](../function/iam.md#可选-ldap-与通知接入)

### `captcha` 与 `security`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `captcha.enabled` | 布尔值 | `false` | 为密码、OTP 和 LDAP 登录、自助注册、发码、重置请求及口令续期启用 ALTCHA 计算挑战。 |
| `captcha.ttlSeconds` | 整数，1–600 秒 | `120` | 单次挑战的有效期。 |
| `captcha.cost` | 整数，100–50000 | `5000` | ALTCHA 单次计算的工作量参数。 |
| `captcha.maxCounter` | 整数，1–2000 | `100` | ALTCHA 求解的随机计数上限。 |
| `security.lockoutEnabled` | 布尔值 | `true` | 启用账号级失败计数和临时锁定。关闭时忽略历史锁定。 |
| `security.failureWindow` | 整数，1–31536000 秒 | `86400` | 从首次失败开始的固定计数窗口。 |
| `security.maxLoginAttempts` | 正整数 | `5` | 窗口内达到此次数时锁定账号。密码、LDAP 和已发布 OTP 的错误尝试使用账号失败策略。 |
| `security.lockoutDuration` | 整数，至少 60 秒 | `900` | 账号达到阈值后的锁定时间。 |

账号锁定状态由所有节点共享 Redis。Redis 无法读取或写入时，受锁定策略保护的鉴别失败。生产节点必须使用同一 Redis，启用可靠持久化并使用 `noeviction`。[查看计数、锁定和密码重置示例](../data/iam.md#cache-iam-login-failures)

### `loginAccess`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `loginAccess.enabled` | 布尔值 | `false` | 限制新建登录会话。已登录请求的访问策略由 Serv 或 Kit 宿主配置。 |
| `loginAccess.allowIps` | IPv4、IPv6 或 CIDR 字符串数组，最多 1000 项 | `[]` | 非空时只允许命中列表的可信地址。 |
| `loginAccess.denyIps` | IPv4、IPv6 或 CIDR 字符串数组，最多 1000 项 | `[]` | 拒绝命中列表的地址，优先于允许列表。配置任一地址列表后，缺少可信来源地址也会拒绝。 |
| `loginAccess.timezone` | IANA 时区字符串 | `UTC` | 用于解释服务器时钟下的登录窗口。 |
| `loginAccess.windows` | 对象数组，最多 100 项 | `[]` | 允许登录的时段。空数组允许任意时间。 |
| `loginAccess.windows[].days` | 整数数组，1–7 项，各项 1–7 | 有窗口时必填 | 开始日，周一为 1，周日为 7。 |
| `loginAccess.windows[].start` | `HH:mm`，00:00–23:59 | 有窗口时必填 | 包含开始时刻。 |
| `loginAccess.windows[].end` | `HH:mm`，00:00–23:59，异于 `start` | 有窗口时必填 | 排除结束时刻。早于开始时表示跨午夜。 |

<a id="example-login-access"></a>

#### 限制企业网络与工作时间内的新登录

把文档示例网段换成实际入口网段，并在宿主验证可信代理的配置。已有会话的每次访问可独立按宿主策略限制。

```yaml schema=@h-ai/iam:IamConfigSchema
loginAccess:
  enabled: true
  allowIps: [192.0.2.0/24]
  denyIps: [192.0.2.20]
  timezone: Asia/Shanghai
  windows:
    - { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
```

在工作日上午从允许的来源登录。再用被拒绝的来源或窗口外的时间尝试，应用应收到 `LOGIN_ACCESS_DENIED`。使用相同账号核对边界，09:00 包含在内，18:00 不包含。[登录与宿主访问策略](identity.md)

### `reauthentication`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `reauthentication.enabled` | 布尔值 | `false` | 启用指定敏感操作的再认证。当前会话用户验证原密码后获得单次票据。 |
| `reauthentication.operations` | 字符串数组，最多 1000 项，每项去首尾空白后 1–128 字符 | `[]` | 文件指定的操作 ID。有效清单还包含 RBAC 数据库关联的敏感操作。 |
| `reauthentication.ttlSeconds` | 整数，1–900 秒 | `300` | 票据有效期，限当前会话、用户和操作。 |

<a id="example-sensitive-operation"></a>

#### 管理员删除用户前验证原密码

使用已接入 `iam.users.delete` 守卫的应用。把操作 ID 同时用于服务端守卫和客户端再认证流程。

```yaml schema=@h-ai/iam:IamConfigSchema
reauthentication:
  enabled: true
  operations: [iam.users.delete]
  ttlSeconds: 120
```

用拥有删除权限的测试管理员操作测试用户。缺少票据时请求应被拒绝，输入管理员自己的密码取得票据后，指定操作可在两分钟内消费一次。没有业务权限的请求仍由宿主拒绝。[再认证接口](../function/iam.md#authentication)

<a id="session"></a>

### 会话

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `session.maxAge` | 整数，至少 60 秒 | `86400` | 新会话的 access 有效时长。可信服务端创建时可指定单次时长，滑动和刷新沿用会话自身的时长。 |
| `session.refreshTokenMaxAge` | 整数，至少 3600 秒 | `604800` | 每次签发的 refresh 自有有效期，access 到期后仍可在其他期限允许时刷新。 |
| `session.sliding` | 布尔值 | `true` | 启用按活动延长 access 期限。 |
| `session.touchMinInterval` | 非负整数，秒 | `5` | 滑动续期写入的最小间隔，仅在 `sliding: true` 且 `idleTimeout: 0` 时生效。设为 0 时，活动时间有变化就写入。 |
| `session.singleDevice` | 布尔值 | `false` | 启用每账号一条有效会话的策略。 |
| `session.singleDeviceMode` | `replace` 或 `reject` | `replace` | 单会话模式中替换旧会话，或保留旧会话并拒绝新登录。 |
| `session.maxSessions` | 整数，0–10000 | `0` | 每用户的有效会话全局上限，0 不限。仍可刷新的会话计入。 |
| `session.terminalLimits` | 对象，键为 `web`、`app`、`desktop`、`api`，每项整数 1–10000 | `{}` | 各终端会话上限。空对象关闭分类限制，非空时未列类型无法新建会话。普通登录省略终端标记时视为 `web`，API Key 登录默认归为 `api`。 |
| `session.terminalLimitMode` | `reject` 或 `replace` | `reject` | 多会话模式中到达终端上限时拒绝新登录，或用新会话替换同类最早会话。全局上限仍生效。 |
| `session.idleTimeout` | 整数，0–31536000 秒 | `0` | 闲置期限，0 关闭。验证 access 记录活动，自动刷新不会延长闲置期。 |
| `session.absoluteTimeout` | 整数，0–31536000 秒 | `0` | 从首次登录起的绝对期限，0 关闭。刷新沿用原起点。 |
| `session.endOnPageHide` | 布尔值 | `false` | 向认证浏览器应用发布尽力退出设置。应用接入页面离开处理后才生效，服务端超时仍是兜底。 |

写入间隔取 `touchMinInterval` 和会话自身 `maxAge` 的十分之一中较小的值。例如，服务端创建了 10 秒的会话并使用默认配置，间隔便是 1 秒。间隔内仍校验共享会话状态，成功时返回最近已写入的活动时间和过期时间。有效的 access 临近到期时可立即续期。

<a id="session-deadlines"></a>

#### 会话的三种期限如何叠加

- `refreshTokenMaxAge` 是每张刷新令牌能用多久。成功换票后，新刷新令牌从本次签发重新计时。
- `idleTimeout` 是会话允许多久没有活动，从上次活动起算。登录和成功验证 access 都算活动，包括验证 access 的后台请求。只换票或同步角色权限不会延长闲置期限。
- `absoluteTimeout` 是一次登录最多能持续多久。从首次登录计时，后续访问和换票都不会延长它。

每个令牌一到自身期限、闲置期限或绝对期限中最早的时刻就失效。Access 自身过期时，仍可用有效的 refresh 换票。Refresh 自身先过期时，还可以继续使用未到期的 access。闲置和绝对期限设为 `0` 时分别关闭。即使关闭 `sliding`，成功验证 access 仍会推迟已启用的闲置期限。`TokenPair.expiresIn` 报告 access 的签发时长，闲置或绝对上限可让它更早失效。

<a id="example-password-session"></a>

#### 只允许密码登录，并在闲置 30 分钟后结束会话

将下面的配置写入应用的 `config/_iam.yml`。用管理员开通的测试账号登录。登录页只提供密码登录，自助注册应失败。

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, otp: false, ldap: false, apikey: false }
register: { enabled: false }
password: { minLength: 12 }
session:
  maxAge: 7200
  sliding: false
  refreshTokenMaxAge: 3600
  idleTimeout: 1800
  absoluteTimeout: 28800
```

假设每种情况都从 09:00 重新登录开始。Access 自身有效 2 小时，refresh 自身有效 1 小时。下面三种情况分别观察哪条期限先到。

| 先到的期限 | 操作与结果 |
| --- | --- |
| Refresh 自身到期 | 09:20 和 09:40 各访问一次，中间不换票。10:00 时旧 refresh 已用满 1 小时，换票失败。此时 access 仍可访问，它自身的期限是 11:00，下一次访问前的闲置期限是 10:10。 |
| 闲置到期 | 09:20 访问一次，09:35 只换票，之后没有用 access 访问。新 refresh 自身能用到 10:35，但闲置期限仍是 09:50。到 09:50 时两张令牌都不能用，需要重新登录。 |
| 绝对上限到期 | 登录后每 20 分钟访问一次、每 40 分钟换票一次。最后一次换票是 16:20，16:40 的访问使闲置期限延到 17:10。新 refresh 自身能用到 17:20。17:00 时已登录满 8 小时，两张令牌都失效。 |

[会话验证与刷新](../function/iam.md#sessions)

<a id="example-terminal-session-limit"></a>

#### 按终端限制并发会话

适用于允许浏览器和移动端同时登录的应用。宿主在发布会话时提供终端类型，配置允许最多两个 Web 会话和一个 App 会话。

```yaml schema=@h-ai/iam:IamConfigSchema
session:
  maxSessions: 3
  terminalLimits: { web: 2, app: 1 }
  terminalLimitMode: reject
```

同一个测试账号建立两个 Web 和一个 App 会话。下一次 Web 登录及 `desktop` 登录均应返回 `SESSION_LIMIT_EXCEEDED`，已有会话仍能访问。如果业务需要同终端换设备，把 `terminalLimitMode` 改为 `replace` 后验证第三个 Web 登录替换最早的 Web 会话。[会话配置](#session)

### `accounts`、`rbac` 与种子数据

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `accounts.dormantAfterDays` | 整数，0–36500 天 | `0` | 从上次成功登录或创建起计算未使用时长，到期的活跃账号由扫描任务设为休眠。0 关闭。 |
| `accounts.scanIntervalSeconds` | 整数，60–86400 秒 | `3600` | 启用自动休眠时的扫描间隔。 |
| `rbac.enabled` | 布尔值 | `true` | 启用 IAM 角色权限检查。关闭时 `iam.authz.checkPermission()` 返回允许。宿主仍执行其 HTTP 与会话守卫。 |
| `rbac.superAdminRole` | 字符串 | `super_admin` | 用于超级管理员判断的角色代码。应用应在需要时创建并分配该角色。 |
| `rbac.defaultRole` | 字符串 | `user` | 新账号未显式指定角色时使用的已有角色代码。设置为空字符串时跳过默认角色分配。 |
| `seedDefaultData` | 布尔值 | `true` | 启动时初始化 `admin`、`user`、`guest` 及基础权限。使用自有种子时先准备引用到的默认角色。 |

### `agreements` 与 `ui`

| 路径 | 类型与约束 | 缺省或必填条件 | 作用 |
| --- | --- | --- | --- |
| `agreements.userAgreementMarkdown` | 非空字符串 | 可省略 | 用户协议正文，优先于同主题的 URL。 |
| `agreements.privacyPolicyMarkdown` | 非空字符串 | 可省略 | 隐私政策正文，优先于同主题的 URL。 |
| `agreements.userAgreementUrl` | HTTP(S) 绝对 URL | 可省略 | 用户协议链接。 |
| `agreements.privacyPolicyUrl` | HTTP(S) 绝对 URL | 可省略 | 隐私政策链接。 |
| `agreements.showOnRegister` | 布尔值 | `true` | 在注册场景展示已配置的协议。 |
| `agreements.showOnLogin` | 布尔值 | `false` | 在登录场景展示已配置的协议。 |
| `ui.variant` | `card` 或 `split` | `card` | 认证页用单卡片或分栏布局。 |
| `ui.title` | 字符串 | 可省略 | 认证面板标题。 |
| `ui.subtitle` | 字符串 | 可省略 | 认证面板副标题。 |
| `ui.brandTitle` | 字符串 | 可省略 | 品牌区标题。 |
| `ui.brandText` | 字符串 | 可省略 | 品牌区说明文字。 |
| `ui.logoUrl` | HTTP(S) 地址或以单个 `/` 开头的站内路径 | 可省略 | 品牌标志。 |
| `ui.illustrationUrl` | HTTP(S) 地址或以单个 `/` 开头的站内路径 | 可省略 | 认证页插图。 |

### 启动代码注入的依赖

服务端可在 `iam.init()` 时注入已初始化的 Reach、通知回调或自定义 LDAP 客户端。启用 LDAP 且使用默认客户端时，服务端工作区须安装 `ldapts`。默认会同步 LDAP 新账号和资料。应用传入 `ldapSyncUser: false` 时，仅允许已有有效绑定登录。[LDAP 与通知接入](../function/iam.md#可选-ldap-与通知接入)
