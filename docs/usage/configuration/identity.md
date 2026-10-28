# 登录、密码、会话与权限策略

[配置手册](README.md) · [认证页面和账号操作](../development/authentication.md)

认证配置同时影响服务端判断和用户看到的步骤。先初始化 RelDB 和 Cache，再初始化 IAM。浏览器只接收 `await iam.getPublicConfig()` 的成功结果，不能下发完整服务端配置；同步 `iam.publicConfig` 是文件快照，不能代替数据库合并后的实际策略。

下文 YAML 均写入 `config/_iam.yml`，是可以合并的功能示例。更改后重启或按宿主生命周期重新初始化；已经存在的会话、账号标记和数据库策略还需按业务核对。

## 登录方式、注册与协议

| 配置 | 框架默认 | 作用和不同取值的影响 |
| --- | --- | --- |
| `login.password` / `otp` | true / true | 启用密码/一次性验证码；OTP 还需配置通道和可用发送回调，可接应用已有服务或可选 Reach，不是打开按钮就能送达 |
| `login.ldap` / `apikey` | false / false | 启用目录/API Key 策略；API Key 不等同于交互网页登录 |
| `register.enabled` | true | false 关闭公开注册；员工应用通常按业务关闭 |
| `register.defaultEnabled` | true | 新注册账号默认启用；false 需后续审核，不能仅靠前端提示执行限制 |
| `agreements.showOnRegister` / `showOnLogin` | true / false | 控制公开认证页协议入口；未提供内容不会自动生成法务文本 |
| `userAgreementMarkdown` / `privacyPolicyMarkdown` | 无默认 | 内嵌内容，须经业务审定；对应 URL 字段也无默认 |
| `userAgreementUrl` / `privacyPolicyUrl` | 无默认 | 可信 HTTP(S) 页面地址，避免任意跳转或含秘密的链接 |

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, otp: false, ldap: false, apikey: false }
register: { enabled: false, defaultEnabled: true }
agreements:
  showOnRegister: true
  showOnLogin: true
  userAgreementUrl: https://app.example.invalid/terms
  privacyPolicyUrl: https://app.example.invalid/privacy
```

用未登录账号打开登录页，确认只有配置的登录方式和协议入口；直接调用被关闭的注册/登录方式也应被服务端拒绝。本例不代替 OTP/LDAP 实际连通验收。

只使用密码与权限管理时，不需要初始化 Reach。需要 OTP 或密码重置时，宿主可注入自己的发送回调，也可显式安装、初始化并注入 Reach；回调与模板的完整装配见[IAM通知接入](../../../packages/iam/README.md#使用可选-reach-自动发送)。Console 日志不代表用户已收到验证码。

## 密码复杂度、初始密码与复用

| 配置（password 下） | 框架默认 | 调整后的影响 |
| --- | --- | --- |
| minLength/maxLength | 8/128 | 范围越严越影响输入体验；最大允许256，示例12不是默认 |
| requireUppercase/requireLowercase/requireNumber | true/true/true | 分别要求大写、小写、数字；关闭一项不代表关闭其他项 |
| requireSpecialChar/minCharacterClasses | false/0 | 可增加特殊字符或最少字符类别；类别计数与显式必含规则一起生效 |
| requireInitialChange | false | true 要求被标记为初始凭据的账号先改密，不会自动把全部老账号标为初始密码 |
| preventSamePassword | false | true 拒绝复用当前密码；不是完整历史密码库 |
| expirationDays | 0 | 0 不启用定期到期策略；正值按天限制，需配套改密和恢复流程 |

```yaml schema=@h-ai/iam:IamConfigSchema
password:
  minLength: 12
  maxLength: 128
  requireUppercase: true
  requireLowercase: true
  requireNumber: true
  requireSpecialChar: false
  minCharacterClasses: 3
  requireInitialChange: true
  preventSamePassword: true
  expirationDays: 0
```

![默认密码策略和显式加强策略的真实解析](../images/config-iam-password.png)

在隔离环境创建受管账号并发初始凭据，登录应进入改密；复用当前密码被拒绝，换不同的新密码后可重新登录。字符串按原始值比较，不裁剪或做 Unicode 归一化。字段提示统一为 Toast，保留错误边框及读屏关联；用户关闭提示后再次提交相同无效内容，仍会重新提示。

![初始凭据场景的实际拒绝与操作入口](../images/auth-initial-password-390.png)

### 邀请和密码重置

`initialCredentials.enabled` 对象内默认 false；true 使用一次性邀请设密，需要联系方式、密码重置入口和真实通知通道。`passwordReset` 可省略，对象内默认 enabled=true、mode=email、tokenExpiresIn=3600秒、maxAttempts=3；resetUrl 无默认，必须是可信 HTTP(S) 地址。mode=phone 使用对应手机号流程，不能沿用邮件接收假设。

```yaml schema=@h-ai/iam:IamConfigSchema
initialCredentials: { enabled: true }
passwordReset:
  enabled: true
  mode: email
  resetUrl: https://app.example.invalid/auth/reset-password
  tokenExpiresIn: 3600
  maxAttempts: 3
```

用专用收件箱检查邀请/重置链接、过期、错误尝试和单次使用。Schema 通过不证明邮件发出；通知结果未知先查接收端和任务回执。

## 会话有效期与终端配额

| 配置（session 下） | 框架默认 | 取值影响 |
| --- | --- | --- |
| maxAge/refreshTokenMaxAge | 86400/604800秒 | 访问凭据与刷新凭据分别计时；访问到期不必然要求用户立即重登 |
| sliding | true | 允许按实现续期；不能绕过绝对/闲置期限 |
| idleTimeout/absoluteTimeout | 0/0秒 | 0 关闭额外限制；正值分别按实际业务闲置、会话总时长限制，自动刷新不延长闲置 |
| endOnPageHide | false | true 尝试在页面隐藏/退出时结束；浏览器送达尽力而为，不能作为唯一撤销保障 |
| singleDevice/singleDeviceMode | false/replace | 开启单设备策略后 replace 替换旧会话，reject 拒绝新登录 |
| maxSessions | 0 | 0 不限额；正数控制总会话数，需用独立上下文确认 |
| terminalLimits/terminalLimitMode | `{}`/reject | 显式列终端后，未列出的 web/app/desktop/api 不能新登录；replace 替换旧配额，终端标识不是硬件证明 |

```yaml schema=@h-ai/iam:IamConfigSchema
session:
  maxAge: 1800
  refreshTokenMaxAge: 604800
  sliding: true
  idleTimeout: 900
  absoluteTimeout: 28800
  maxSessions: 3
  terminalLimits: { web: 2, app: 1 }
  terminalLimitMode: reject
  endOnPageHide: false
```

![默认期限、受限会话和过短期限的校验结果](../images/config-iam-session.png)

操作：重新登录建立新会话，开独立浏览器上下文直到达到配额；确认额外登录被拒绝，退出一个会话后可恢复。再用可控时钟核对闲置/绝对期限。生产验证使用共享 DB/Redis，不用进程内 memory 冒充多节点会话。

## 锁定、验证码与登录来源

| 配置 | 框架默认 | 作用与条件 |
| --- | --- | --- |
| security.lockoutEnabled | true | 账号失败累计锁定，不替代网络/接口限流 |
| failureWindow/maxLoginAttempts/lockoutDuration | 86400秒/5次/900秒 | 分别是累计窗口、阈值、锁定时长，不能把窗口当锁定期 |
| captcha.enabled | false | 开启自托管计算挑战，标准 AuthPanel 自动接入，自定义请求也要传用途对应挑战 |
| captcha.ttlSeconds/cost/maxCounter | 120秒/5000/100 | 提高计算量可能影响低性能设备，按真实设备耗时选择 |
| otp.email/sms | 对象内 true/true | 能否送达仍需通道，不能由配置替代 |
| otp.length/expiresIn/maxAttempts/resendInterval | 6位/300秒/3次/60秒 | 期限、错误次数和重发冷却分别限制，过期/重放仍服务端拒绝 |

```yaml schema=@h-ai/iam:IamConfigSchema
security:
  lockoutEnabled: true
  failureWindow: 300
  maxLoginAttempts: 3
  lockoutDuration: 600
captcha: { enabled: true, ttlSeconds: 120, cost: 5000, maxCounter: 100 }
otp: { email: true, sms: false, length: 6, expiresIn: 300, maxAttempts: 3, resendInterval: 60 }
```

![锁定窗口、挑战与OTP各自的真实默认值](../images/config-iam-lockout.png)

在隔离账号上测试错误尝试、锁定、等待后恢复、挑战过期/错误用途/重复消费；避免对正常用户账号做阈值试验。锁定提示不泄露账号存在性或内部目录错误。

`loginAccess` 可省略，默认 enabled=false、allowIps/denyIps/windows为空、timezone=UTC。启用后按可信地址和时间窗限制新登录；days 使用1–7，时段是 HH:mm，时区必须明确。先在 Serv/Kit 装配可信客户端 IP，再应用下面的示例，文档网段必须替换：

```yaml schema=@h-ai/iam:IamConfigSchema
loginAccess:
  enabled: true
  allowIps: [192.0.2.0/24]
  denyIps: []
  timezone: Asia/Shanghai
  windows:
    - { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
```

![办公时间策略与登录页布局的实际解析](../images/config-iam-access.png)

从允许/拒绝网络分别验证直接和代理请求，不能信任凭据 JSON 或任意 X-Forwarded-For。时间窗结束不自动撤销已有会话。

## 权限、二次认证与账号休眠

| 配置 | 框架默认 | 影响 |
| --- | --- | --- |
| rbac.enabled/superAdminRole/defaultRole | true/super_admin/user | 默认角色按业务最小权限；示例 admin 不应作为公开注册角色 |
| seedDefaultData | true | 初始化框架默认角色/权限，不代替应用资源授权 |
| reauthentication.enabled/operations/ttlSeconds | 对象内 false/[]/300秒 | 指定敏感操作的一次性证明；仅加操作名不会自动保护自定义接口，两端接同名守卫 |
| accounts.dormantAfterDays/scanIntervalSeconds | 对象内0天/3600秒 | 0 不启用休眠；未配置 accounts 不启动扫描 |
| apikey.maxKeysPerUser/defaultExpirationDays/prefix | 对象内10/0天/hai_ | 0 表示无默认到期；scopes 只收敛现有角色授权，不授予额外权限 |

```yaml schema=@h-ai/iam:IamConfigSchema
rbac: { enabled: true, superAdminRole: super_admin, defaultRole: user }
reauthentication:
  enabled: true
  operations: [iam.users.delete]
  ttlSeconds: 300
accounts: { dormantAfterDays: 0, scanIntervalSeconds: 3600 }
apikey: { maxKeysPerUser: 10, defaultExpirationDays: 30, prefix: 'orders_' }
```

UI 使用 createSensitiveActions/ReauthenticationDialog；服务端仍校验用户、会话、操作、资源范围并单次消费证明。取消验证不发送敏感业务请求。通过普通用户/管理员/跨资源 ID 的请求验证边界，不能只看按钮是否隐藏。

LDAP 另需 url、bindDn、bindPassword、searchBase（均无默认）；默认 searchFilter=`(uid={{username}})`、usernameAttribute=uid、emailAttribute=mail、displayNameAttribute=cn、useTls=false、connectTimeout=5000ms。生产选择受信 LDAPS/目录策略并实际验证绑定与证书；不要将 bindPassword 下发浏览器。

## 登录页外观

`ui.variant` 对象内默认 card；split 显示品牌区。title/subtitle/brandTitle/brandText/logoUrl/illustrationUrl 无配置默认，图片接受可信 HTTP(S) 或站内绝对路径。外观不改变认证策略。

```yaml schema=@h-ai/iam:IamConfigSchema
ui:
  variant: split
  brandTitle: IAM flow branding
  illustrationUrl: /iam-illustration.svg
```

![split桌面布局](../images/auth-login-split.png)

![同一配置在390像素下的布局](../images/auth-login-mobile.png)

先把图片放应用静态目录，重启后检查桌面和窄屏；再切换三语，确认表单保持可操作。密码错误、改密和追踪信息流程见[认证操作指南](../development/authentication.md)。
