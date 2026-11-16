# iam 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/iam.md) · [功能说明](../function/iam.md)

## 数据库

[reldb](reldb.md) 保存账户与授权事实。[cache](cache.md) 保存短期凭据和受版本保护的读取结果。下表注明 SQL 默认值，可空字段省略时为 NULL。

### `hai_iam_users`

| 字段                                                                                  | 含义、默认值和约束                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `id`、`username`                                                                      | 用户主键、唯一用户名                                         |
| `email`、`phone`                                                                      | 可空邮箱、手机号码                                           |
| `display_name`、`avatar_url`                                                          | 可空展示名、头像地址                                         |
| `email_verified`、`phone_verified`                                                    | 邮箱和手机号验证标志，均默认 false                           |
| `password_hash`、`password_updated_at`                                                | 可空密码摘要、密码更新时间                                   |
| `login_failed_count`、`first_login_failed_at`、`last_login_failed_at`、`locked_until` | 失败次数（默认 0）、可空首次和最近失败时间、可空封禁截止     |
| `must_change_password`                                                                | 是否必须改密，默认 false                                     |
| `account_type`、`account_status`                                                      | 账户类型与状态，SQL 默认 `permanent`、`active`               |
| `account_expires_at`、`last_login_at`                                                 | 可空账户到期与最后登录时间                                   |
| `credential_version`、`reset_version`                                                 | 凭据与密码重置代际，SQL 默认空字符串。服务端写入时生成和轮换 |
| `reset_hash`、`reset_expires_at`、`reset_attempts`                                    | 可空重置凭据摘要、可空重置截止、尝试次数（默认 0）           |
| `metadata`、`created_at`、`updated_at`                                                | 可空 JSON 附加资料、创建时间、更新时间                       |

### 角色、权限和 API Key

| 表                         | 字段、默认值和约束                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_iam_roles`            | `id` 主键、`code` 唯一角色码、`name` 展示名、`description` 说明、`is_system` 系统角色标志（默认 false）、`created_at` 创建时间、`updated_at` 更新时间                                                                                                |
| `hai_iam_permissions`      | `id` 主键、`code` 唯一权限码、`name` 展示名、`description` 说明、`resource` 资源、`action` 操作、`type` 权限类型、`sensitive_operations` 敏感操作配置、`created_at` 创建时间、`updated_at` 更新时间                                                  |
| `hai_iam_user_roles`       | `user_id` 用户 ID 与 `role_id` 角色 ID 组成唯一对，并按 `user_id` 建索引                                                                                                                                                                             |
| `hai_iam_role_permissions` | `role_id` 角色 ID 与 `permission_id` 权限 ID 组成唯一对，并按 `role_id` 建索引                                                                                                                                                                       |
| `hai_iam_api_keys`         | API Key 启用时创建。`id` 主键、`user_id` 归属、`name` 展示名、`key_hash` 密钥摘要、`key_prefix` 展示前缀、`enabled` 启用标志（默认 true）、`expires_at` 可空截止、`created_at` 创建时间、`last_used_at` 可空最后使用时间、`scopes` 可空授权范围 JSON |

API Key 原始值只在签发时返回。账户、授权与关联关系通过 IAM 写入，以同步凭据、会话和读取缓存的状态。

## 缓存键

下面是逻辑键。如果 [cache](cache.md) 配置了 `keyPrefix`，Redis 的物理键需要同时带该前缀。

| 逻辑键                                  | 值                                                                                                                                                   | 默认值、有效期和行为                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `hai:iam:sessions:{<scope>}`            | 用户分区文档，含防止同值复用的 `revision` 和按 access token 索引的 `sessions`。每项保存会话快照、可选 `refreshToken` 和 `refreshExpiresAt`           | scope 是用户范围摘要。access 默认 86400 秒，refresh 默认 604800 秒。分区保留到其中最后一个有效凭据截止，轮换与撤销使用单键 CAS |
| `hai:iam:otp:<归一化身份>`              | `version`、当前 `code`、`attempts`、`expiresAt`、`cooldownUntil` 保存代际、验证码、尝试次数、过期与冷却截止                                          | OTP 默认 300 秒、最多 3 次错误尝试、重发冷却 60 秒。TTL 覆盖验证码与冷却窗口；消费后保留仍有效的冷却状态                       |
| `hai:iam:captcha:<id>`                  | `operation`、`challenge` 与服务端校验秘密保存用途及挑战                                                                                              | 默认 120 秒，验证使用缓存原子消费                                                                                              |
| `hai:iam:ticket:<ticket>`               | `subjectId` 主体、`purpose` 用途、`grant` 授权参数（默认空对象）、`expiresAt` 截止                                                                   | 默认 30 秒，按用途核验并原子消费                                                                                               |
| `hai:iam:read_cache:revision`           | `epoch` 代际、`writers` 未结算写入数量                                                                                                               | 首次初始化生成代际、写入数为 0，无 TTL。写入未结算时回源                                                                       |
| `hai:iam:read_cache:<epoch>:<查询标识>` | `{ value }` 包装已成功的读取结果，覆盖 `user:v2:<userId>`、`apikey:<id>`、`verified_apikey:<摘要>`、`authorization:<userId>`、`sensitive:<操作或 *>` | 默认 60 秒。命中后复核代际，授权变化后的旧代记录仅等待过期                                                                     |

会话快照用 `version` 区分内容版本，用 `credentialVersion` 绑定账户凭据代际。`terminalType` 保存登录终端（旧记录缺失时按 web 处理），`apiKeyId`、`apiKeyScopes` 仅用于 API Key 派生会话。`userId`、`username`、`displayName`、`avatarUrl` 标识用户及可选展示资料，`roles`、`permissions` 保存授权码，`source` 记录可选登录来源。`accessToken` 是访问凭据，`createdAt`、`startedAt`、`lastActiveAt`、`expiresAt` 分别记录本次签发、初次签发、最近活动与到期，旧记录没有 `startedAt` 时取 `createdAt`。`maxAge` 保存该会话的有效期秒数，`data` 保存可选扩展数据。

会话、票据、验证码和凭据索引均属于私有认证数据。
