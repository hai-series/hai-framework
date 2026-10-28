---
name: hai-iam
description: "使用 @h-ai/iam 实现登录、注册、会话、OTP/LDAP/API Key 和 RBAC。"
---

# hai-iam

## 能力契约

| 项目     | 契约                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 能力     | 使用 @h-ai/iam 实现登录、注册、会话、OTP/LDAP/API Key 和 RBAC                                                                                                           |
| 适用场景 | 应用身份认证、会话失效或角色权限管理                                                                                                                                    |
| 输入     | IamConfigInput、已初始化依赖、凭据、用户/角色/权限 ID                                                                                                                   |
| 输出     | 认证、会话与授权操作的 HaiResult                                                                                                                                        |
| 限制     | 仅服务端，先初始化 reldb/cache（crypto 未初始化时由 IAM 初始化）；公开认证入口是 iam.auth。客户端经 contract/API 调用，凭证只用于认证和安全存储，不进入日志或公开配置。 |

用户列表列头排序通过公开 IAM HTTP 查询的 sortBy（username/email/displayName/enabled/createdAt）与 sortDirection（asc/desc）提交，服务端在分页前排序；角色等关联列不伪装为当前页排序。

## 使用路径

- 密码登录接收 identifier/password，以及启用时的单用 captcha 证明；AuthPanel 将 LoginForm 的 username 映射为 identifier。会话期限来自服务端 session.maxAge/refreshTokenMaxAge，不增加未实现的登录偏好字段或持久会话选择框。

- `_iam.yml` 只存 IamConfigSettingsInput，运行时回调单独传给 iam.init；不把 reldb/cache 句柄混入配置。
- 角色资料与 permissionIds 一次保存：未传保持、空数组清空、未知 ID 失败；人数查询失败不能显示为 0。
- IAM 服务端是 iam.auth；typed HTTP client 的路径是 apiClient.iam.auth。
- OTP/API Key 等先核对 login 开关；不把未启用能力的 NOT_INITIALIZED 当认证失败。
- API Key 的配置、scope 交集示例表与创建→登录→操作授权→撤销代码见参考中的 API Key 小节。不要以 `checkPermission(userId)` 绕过请求 scope；ID/code/name 分别用于关联、守卫与展示。
- API Key scopes 与主体权限取交集；默认空数组无操作权限，显式 * 仍受主体限制。受限 key 使用 permission 守卫，不能通过角色授权；派生会话读取/刷新重新检查 key，撤销/禁用/到期立即拒绝。

- 认证页面使用 await iam.getPublicConfig() + AuthPanel，先检查 success；同步 iam.publicConfig 仅为文件快照，协议用弹窗，表单通过 header/extraFields/footer 或 AuthPanel 的 login*/register* snippet 扩展；Kit 使用 kit.auth.createApi/publicPaths + kit.client.createAuthActions，HTTP 客户端使用 apiClient.createAuthActions。
- LDAP/Reach 均可选：基础认证无需安装；默认 LDAP 关闭，选用默认客户端才安装 ldapts 并设置 login.ldap + ldap。OTP 邮件/短信由 otp.email/sms 控制，选择 Reach 标准模板或自定义发送回调；具体签名与失败处理见参考中的“可选 LDAP 与通知”。
- 多节点共享 DB + Redis，Memory 只用于单进程。重置的策略失败计入 maxAttempts；OTP 消费不解除 resendInterval。管理员 createUser 不受自助注册开关限制。

- 受保护请求使用 `iam.auth.verifyToken`：会话校验读取共享代际缓存中的当前用户/凭据状态，校验启用状态、期限与 `credentialVersion`，再读取共享缓存中的当前角色/权限；缓存不可信时回源，必要读取失败即拒绝。`iam.session.get/verifyToken` 复用同一当前用户/凭据状态读取，但返回的角色/权限仍是会话快照，不能替代当前授权。serv 内置 IAM 注入默认使用当前授权入口，无需手动补查。
- 用户批量读取用 `iam.user.getUsers(ids, { include: ['roles'] })`（最多 1000，去重保留输入顺序，缺失省略）；角色筛选用 `listUsers({ roleCode })`，在分页前执行，避免 N+1 和分页后过滤。


`captcha.enabled` 默认关闭；开启后共享 Cache 保存自托管 ALTCHA 的签名秘密/用途/相对TTL，iam.auth.createCaptcha({operation}) 只返回 {id,challenge}。标准 AuthPanel/createAuthActions 自动求解并通过 captcha 字段提交；自定义表单用 altcha/lib 求解。login/register/sendOtp/passwordReset/renewPassword 严格用途绑定，验证后原子单用，失败也需新挑战；API Key 机器鉴别和管理员创建/邀请不额外加人机交互。sendOtp(identifier,{captcha})、requestPasswordReset(identifier,{captcha}) 第二参数不能在审计/HTTP包装层丢失。TTL默认120秒、cost5000、maxCounter100，可按设备设置；计算工作量不保证是真人。Cache 故障拒绝，重初始化不延期，证明不持久化在浏览器或进入日志。标准 Kit 须导出 POST /api/auth/captcha，Serv 已提供；公开配置只含 captcha.enabled。错误030/031/032/033分别需验证/无效已用过期/关闭/不可用。

## 按需参考

按任务读取 [reference.md](reference.md) 的对应小节；签名以当前源码或安装版本的公开类型为准，不默认加载全部资料。示例中的业务变量由应用提供。

- §1 配置与初始化
- 可选 LDAP 与通知 — 安装、TLS/AD 配置、标准模板、自定义发送
- §2 认证 — `iam.auth`
- §3 会话管理 — `iam.session`
- §3.5 一次性票据 — `iam.ticket`
- §4 用户管理 — `iam.user`
- §5 RBAC 授权 — `iam.authz`
- §6 HTTP API 契约 — `@h-ai/api-contract`
- §7 与 kit 集成
- §8 API Key 管理 — `iam.apiKey`
- §9 自动会话失效
- §10 错误码 — `HaiIamError`
- §11 常见模式

`create({ maxAge })` 可覆盖配置默认时长（正安全整数秒），该值持久化为 `Session.maxAge`；签发和刷新返回的 `expiresIn` 均使用它。滑动续期按该时长延长 access，返回已成功提交的 `lastActiveAt/expiresAt`；迟到请求只延长时间，不缩短较新续期。显式 `update` 的有效日期补丁完整生效并产生新内容版本。客户端根据本次返回的 `expiresIn` 安排刷新，不能硬编码配置默认值。

未启用额外期限时，access 与 refresh 独立到期：access 过期仍可凭有效 refresh 轮换，刷新不先要求旧 access 认证。`session.idleTimeout`、`absoluteTimeout` 以秒配置，0关闭；启用后 access 与 refresh 均检查，刷新保留首次登录时间。成功的 access 认证请求算活动；自动 refresh 仅换票，不延长闲置期限。后台业务轮询仍需按项目设计。`maxSessions: 0` 不限，否则在用户分区 CAS 原子限制有效会话数；`singleDevice: true` 默认顶旧保新，`singleDeviceMode: 'reject'` 保留旧会话并拒绝新登录。删除 access、logoutAll、单设备替换均撤销对应 refresh；`revokeRefresh` 保留仍有效的 access。

账号默认 `permanent/active`；管理端可配置 `temporary` 与 `accountExpiresAt`，或设 `accountStatus` 为 `dormant/closed`。状态/有效期变化推进持久凭据代际，重新激活不恢复旧会话。`accounts.dormantAfterDays: 0` 关闭自动休眠；启用后按 `scanIntervalSeconds` 扫描最后成功登录/创建时间，也可从可信后台调用 `iam.user.scanInactiveAccounts()`。公开注册不能接受管理字段；`closed` 保留记录，个人数据注销由项目处理。

`password.minCharacterClasses` 支持任意 N 类字符；创建/改密/重置共用服务端强度校验。`expirationDays: 0` 关闭期限；`preventSamePassword` 可独立启用，期限或首次强改时也拒绝旧密码。`requireInitialChange` 只约束管理端初始/重置密码，关闭后不受历史标记约束。首次/过期用户用 `iam.user.renewPassword({identifier,password,newPassword})` 完成原密码验证与换密后重新登录，不能先授予普通会话。AuthPanel 与标准 Kit/Serv 端点提供该流程。

`security.lockoutEnabled` 可关闭失败锁定；`failureWindow` 为首次失败起的固定窗口秒数（默认86400），并用 `maxLoginAttempts/lockoutDuration` 配置阈值/锁定时间。共享 DB 原子计次。`initialCredentials.enabled` 开启 `iam.user.inviteUser()`，只发送现有 passwordReset 短期单次设密邀请，随机初始秘密不外发；需要重置通知就绪。投递未知保留账号/已发布凭据并返回失败，先核对后恢复，不自动重发或删除账号。

`loginAccess.enabled` 配置 `allowIps/denyIps`（IP/CIDR，拒绝优先）、IANA `timezone` 和 `windows[{days,start,end}]`（周一1至周日7，HH:mm，含起不含止，跨午夜）。登录第二参 `AuthRequestContext` 必须来自可信宿主；不能使用任意转发头/JSON IP。地址规则启用但缺少可信地址时拒绝。`reauthentication.enabled/operations/ttlSeconds` 控制敏感操作证明；`reauthenticate` 验证原密码，`checkSensitiveOperation` 在原有权限/资源检查后原子消费短期单次票据，绑定用户/会话/操作。Serv 标准 IAM 写操作和 admin 守卫用 `x-hai-reauthentication`，Kit 业务用 `kit.guard.requireSensitive`；证明不提升权限且只短暂保存在内存。


OTP 发布/消费用单身份 CAS；密码重置最终 SQL 同时核验 resetVersion、credentialVersion、有效期、用户状态并改密/消费令牌。认证与刷新绑定数据库凭据代际；通知第三参数提供 expiresAt/idempotencyKey，接收端持久化幂等，异常是投递未知且不自动重发。

`iam.auth.logout(accessToken)` 直接按完整不透明令牌在用户分区执行一次 CAS，原子撤销 access 与关联 refresh；access 已到期也不能跳过撤销。非法/不存在的令牌幂等成功，缓存读取或提交故障返回失败，恢复后可用同一令牌重试。HTTP 登出只允许撤销所持令牌，不以 userId 定位他人会话，也不要求该 access 仍通过认证。调用方必须检查 `success`；本地 Cookie/安全存储清理不代表服务端撤销已经确认，失败应显示提示。

配置示例用 `IamConfigInput` 表达可省略默认值的输入；需要完整策略快照时用对应 Schema.parse 得到输出类型。应用仅从 `@h-ai/iam` 取公开函数/类型，不深导内部策略与仓储。源码内部示例明确标注上下文，文档示例类型检查不替代真实共享存储和通知集成验证。

- 可选再认证规则为文件 operations 与权限 sensitiveOperations 的并集，主开关仍是 reauthentication.enabled；可信管理端使用 authz.setPermissionSensitiveOperations，异步 iam.getPublicConfig 返回含数据库的有效公开策略，读取失败拒绝放行。session.terminalLimits 按 web/app/desktop/api 限制，非空时未列类型拒绝；全局 maxSessions/singleDevice 同时生效，终端分组不是硬件真实性证明。原地登录使用标准 expectedUserId 限定原用户，凭据/验证码/锁定规则照常执行。

- 自动审计由宿主初始化 audit 后启用；未选用时不采集。启用后的写入失败仍可观察，外部事务收到失败应回滚。

- 高频验签/鉴权/敏感操作和 Key 验证复用 IAM 共享缓存，不能另建长寿命进程授权缓存。IAM 写入口在变更前后推进共享代际，外部事务等完成后再回填；不确定提交/失效保留 dirty 并安全回源。账号与口令/Key期限逐次检查，不缓存长期放行结论。多节点同时升级并通过 IAM API 写安全数据；直接 SQL 修改需停写后整体失效缓存。
