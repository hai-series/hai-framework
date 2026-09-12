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
| 限制 | 仅服务端，先初始化 reldb/cache（crypto 未初始化时由 IAM 初始化）；公开认证入口是 iam.auth。客户端经 contract/API 调用，不能暴露密码或完整 token。 |

## 使用路径

- `_iam.yml` 只传 IamConfigInput；不把 reldb/cache 句柄混入配置。
- 角色资料与 permissionIds 一次保存：未传保持、空数组清空、未知 ID 失败；人数查询失败不能显示为 0。
- IAM 服务端是 iam.auth；typed HTTP client 的路径是 apiClient.iam.auth。
- OTP/API Key 等先核对 login 开关；不把未启用能力的 NOT_INITIALIZED 当认证失败。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- §1 配置与初始化
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
