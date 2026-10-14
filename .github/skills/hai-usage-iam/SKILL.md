---
name: hai-usage-iam
description: "使用 @h-ai/iam 实现登录、注册、会话、OTP/LDAP/API Key 和 RBAC。"
---

# hai-usage-iam

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/iam 实现登录、注册、会话、OTP/LDAP/API Key 和 RBAC |
| 适用场景 | 应用身份认证、会话失效或角色权限管理 |
| 输入 | IamConfigInput、已初始化依赖、凭据、用户/角色/权限 ID |
| 输出 | 认证、会话与授权操作的 HaiResult |
| 限制 | 仅服务端，先初始化 reldb/cache（crypto 未初始化时由 IAM 初始化）；公开认证入口是 iam.auth。客户端经 contract/API 调用，凭证只用于认证和安全存储，不进入日志或公开配置。 |

## 使用路径

- `_iam.yml` 只存 IamConfigSettingsInput，运行时回调单独传给 iam.init；不把 reldb/cache 句柄混入配置。
- 角色资料与 permissionIds 一次保存：未传保持、空数组清空、未知 ID 失败；人数查询失败不能显示为 0。
- IAM 服务端是 iam.auth；typed HTTP client 的路径是 apiClient.iam.auth。
- OTP/API Key 等先核对 login 开关；不把未启用能力的 NOT_INITIALIZED 当认证失败。
- API Key scopes 与主体权限取交集；默认空数组无操作权限，显式 * 仍受主体限制。受限 key 使用 permission 守卫，不能通过角色授权；派生会话读取/刷新重新检查 key，撤销/禁用/到期立即拒绝。

- 认证页面使用 iam.publicConfig + AuthPanel，协议用弹窗，表单通过 header/extraFields/footer 或 AuthPanel 的 login*/register* snippet 扩展；Kit 使用 kit.auth.createApi/publicPaths + kit.client.createAuthActions，HTTP 客户端使用 apiClient.createAuthActions。
- LDAP/Reach 均可选：基础认证无需安装；默认 LDAP 关闭，选用默认客户端才安装 ldapts 并设置 login.ldap + ldap。OTP 邮件/短信由 otp.email/sms 控制，选择 Reach 标准模板或自定义发送回调；具体签名与失败处理见参考中的“可选 LDAP 与通知”。
- 多节点共享 DB + Redis，Memory 只用于单进程。重置的策略失败计入 maxAttempts；OTP 消费不解除 resendInterval。管理员 createUser 不受自助注册开关限制。

- 协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

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
