# iam 数据结构

[English](iam.en.md) · [日本語](iam.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/iam.md) · [功能说明](../function/iam.md)

<a id="example-data"></a>

## 这些数据用来做什么

### 账号本身

对应结构：`hai_iam_users`。

保存登录身份和账号是否允许使用，登录或授权时都要检查。

```json
{
  "id": "user-42",
  "username": "example-user",
  "email": null,
  "password_hash": null,
  "account_type": "permanent",
  "account_status": "active",
  "must_change_password": false,
  "login_failed_count": 0
}
```

user-42 是启用中的长期账号；email 和 password_hash 为 null 表示本例没有这两项，不能据此用空密码登录。

### 可以分配给用户的角色

对应结构：`hai_iam_roles`。

把一组职责起成角色，便于给多个用户分配相同权限。

```json
{
  "id": "role-reader",
  "code": "reader",
  "name": "Reader",
  "is_system": false
}
```

role-reader 的业务代码是 reader，显示名称为 Reader；is_system:false 表示不是系统角色。

### 应用能够检查的具体权限

对应结构：`hai_iam_permissions`。

给每一种受保护的操作一个稳定权限码，服务端检查用户是否拥有它。

```json
{
  "id": "permission-read",
  "code": "orders.read",
  "name": "Read orders",
  "resource": "orders",
  "action": "read"
}
```

orders.read 表示读取订单，resource/action 分别是 orders/read。仅创建这行不会自动给任何用户授权。

### 哪个用户拥有哪个角色

对应结构：`hai_iam_user_roles`。

连接账号与角色，不把所有角色重复写进每个账号行。

```json
{
  "user_id": "user-42",
  "role_id": "role-reader"
}
```

user-42 被分配了 role-reader；同一用户和角色的组合只保存一次。

### 哪个角色包含哪个权限

对应结构：`hai_iam_role_permissions`。

连接角色与具体权限，用于计算用户最终可以做什么。

```json
{
  "role_id": "role-reader",
  "permission_id": "permission-read"
}
```

role-reader 包含 permission-read，与前两条关联后，user-42 才获得 orders.read。

### 供程序调用的 API 凭据登记

对应结构：`hai_iam_api_keys`。

让脚本或其他系统代表指定用户调用受限接口，只存密钥摘要以便验证。

```json
{
  "id": "apikey-42",
  "user_id": "user-42",
  "name": "Example API",
  "key_hash": "<hash:redacted>",
  "key_prefix": "<prefix:redacted>",
  "enabled": true,
  "expires_at": null,
  "scopes": [
    "orders.read"
  ]
}
```

apikey-42 属于 user-42，只允许 orders.read。key_hash/key_prefix 已脱敏；原始密钥仅签发时返回，不能从这行还原。

### 记录目录条目与本地用户的归属

`hai_iam_ldap_identities` 保存 LDAP 登录和离线导入共用的身份绑定。`directory_id` 与 `entry_id` 组成目录侧唯一标识，`user_id` 引用本地用户，同一目录内也唯一。删除本地用户会级联清理绑定。示例表示公司目录条目已经核验并绑定到 `user-42`，目录条目重命名时仍是同一用户。

```json
{
  "directory_id": "company-directory",
  "entry_id": "3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76",
  "user_id": "user-42"
}
```

### 这个用户仍有效的登录会话

对应结构：`hai:iam:sessions:{<scope-digest>}`。

登录后保存令牌对应的会话，验证、刷新和退出都更新同一用户记录，避免并发修改把旧会话写回来。

```json
{
  "revision": "revision-42",
  "sessions": {
    "<access-token:redacted>": {
      "session": {
        "userId": "user-42",
        "username": "example-user",
        "roles": [
          "reader"
        ],
        "permissions": [
          "orders.read"
        ],
        "createdAt": "2026-11-17T00:00:00.000Z",
        "expiresAt": "2026-11-18T00:00:00.000Z"
      },
      "refreshExpiresAt": 1795478400000,
      "refreshToken": "<refresh-token:redacted>"
    }
  }
}
```

示例令牌对应 user-42。访问凭据在 2026-11-18 00:00 UTC 失效，刷新凭据可保留更久；`refreshExpiresAt` 是 Unix 毫秒。`revision` 在内容变化时更换，凭据均已脱敏。

### 一次性验证码和发送等待时间

对应结构：`hai:iam:otp:example@example.invalid`。

保存某个邮箱或手机号当前那一次验证码，以及输错次数和何时允许重发。

```json
{
  "version": "otp-version-42",
  "code": "<otp:redacted>",
  "attempts": 0,
  "expiresAt": 1794873900000,
  "cooldownUntil": 1794873660000
}
```

此例假设在 2026-11-17 00:00 UTC 签发验证码，尚未输错；验证码 5 分钟有效、60 秒内不能重发。`expiresAt` 和 `cooldownUntil` 均为 Unix 毫秒。`code` 已隐藏；成功使用后不能再次拿它通过验证。

### 本次人机验证的服务端依据

对应结构：`hai:iam:captcha:<id>`。

服务端保存挑战及验证秘密，收到用户答案时检查用途是否匹配，并保证挑战只使用一次。

```json
{
  "operation": "login",
  "signatureSecret": "<secret:redacted>",
  "keySecret": "<secret:redacted>"
}
```

operation:login 表示只能用于登录；秘密已隐藏，公开挑战内容在此省略。这条私有记录不能整体发给页面。

### 短时间内只准用一次的通行票

对应结构为 `hai:iam:ticket:sha256:<票据摘要>`。签发后客户端持有原票据，缓存键只保存它的 SHA-256 十六进制摘要。新版可兑换旧版尚未过期的票据，旧键按原有效期回收。多实例部署时同时切换消费者，旧版实例无法兑换新版发出的票据。

需要临时授权连接或操作时签发票据。用途和有效期核验通过后，兑换请求原子删除读到的记录，再取得绑定的主体和授权参数。

```json
{
  "subjectId": "user-42",
  "purpose": "ai-audio",
  "grant": {
    "operation": "transcribe"
  },
  "expiresAt": 1794873630000
}
```

user-42 获准进行 ai-audio 的 transcribe 操作。假设在 2026-11-17 00:00 UTC 签发，30 秒后过期；`expiresAt` 为 Unix 毫秒。拿同一张票第二次连接会失败。

### 权限读取缓存是否仍可信

对应结构：`hai:iam:read_cache:revision`。

账号或权限正在变化时，用这个共享标记让读取方避开可能过时的缓存。

```json
{
  "epoch": "epoch-42",
  "writers": 0
}
```

writers:0 表示当前没有登记中的写操作，epoch-42 标识这一批缓存；它本身不含用户权限，也不自动过期。

### 短时间复用已查到的账号资料

对应结构：`hai:iam:read_cache:epoch-42:user:v2:user-42`。

让同一时期的重复读取少查数据库，权限或账号改动后不再采用旧批次缓存。

```json
{
  "value": {
    "id": "user-42",
    "username": "example-user"
  }
}
```

value 是 user-42 资料的字段节选，默认60秒后过期。epoch-42 需要与当前版本标记一致才能使用。

## 字段、存储与清理参考

### 数据库

[reldb](reldb.md) 保存账户、角色和权限。[cache](cache.md) 保存有期限的令牌、验证码，以及读取过的账户或权限信息。权限改动后，旧版本的缓存不会继续用于授权。下表注明 SQL 默认值，选填字段省略时保存 NULL。

#### `hai_iam_users`

| 字段                                                                                  | 含义、默认值和约束                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`、`username`                                                                      | 用户主键、唯一用户名                                                                                         |
| `email`、`phone`                                                                      | 可空邮箱、手机号码                                                                                           |
| `display_name`、`avatar_url`                                                          | 可空展示名、头像地址                                                                                         |
| `email_verified`、`phone_verified`                                                    | 邮箱和手机号验证标志，均默认 false                                                                           |
| `password_hash`、`password_updated_at`                                                | 可空密码摘要、密码更新时间                                                                                   |
| `login_failed_count`、`first_login_failed_at`、`last_login_failed_at`、`locked_until` | 失败次数（默认 0）、可空首次和最近失败时间、可空封禁截止                                                     |
| `must_change_password`                                                                | 是否必须改密，默认 false                                                                                     |
| `account_type`、`account_status`                                                      | 账户类型与状态，SQL 默认 `permanent`、`active`                                                               |
| `account_expires_at`、`last_login_at`                                                 | 可空账户到期与最后登录时间                                                                                   |
| `credential_version`、`reset_version`                                                 | 凭据版本和重置请求版本，SQL 默认空字符串。服务端在写入或更换相关凭据时生成新版本，用版本判断旧凭据是否还有效 |
| `reset_hash`、`reset_expires_at`、`reset_attempts`                                    | 可空重置凭据摘要、可空重置截止、尝试次数（默认 0）                                                           |
| `metadata`、`created_at`、`updated_at`                                                | 可空 JSON 附加资料、创建时间、更新时间                                                                       |

#### 角色、权限和 API Key

| 表                         | 字段、默认值和约束                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_iam_roles`            | `id` 主键、`code` 唯一角色码、`name` 展示名、`description` 说明、`is_system` 系统角色标志（默认 false）、`created_at` 创建时间、`updated_at` 更新时间                                                                                                |
| `hai_iam_permissions`      | `id` 主键、`code` 唯一权限码、`name` 展示名、`description` 说明、`resource` 资源、`action` 操作、`type` 权限类型、`sensitive_operations` 敏感操作配置、`created_at` 创建时间、`updated_at` 更新时间                                                  |
| `hai_iam_user_roles`       | `user_id` 用户 ID 与 `role_id` 角色 ID 组成唯一对，并按 `user_id` 建索引                                                                                                                                                                             |
| `hai_iam_role_permissions` | `role_id` 角色 ID 与 `permission_id` 权限 ID 组成唯一对，并按 `role_id` 建索引                                                                                                                                                                       |
| `hai_iam_api_keys`         | API Key 启用时创建。`id` 主键、`user_id` 归属、`name` 展示名、`key_hash` 密钥摘要、`key_prefix` 展示前缀、`enabled` 启用标志（默认 true）、`expires_at` 可空截止、`created_at` 创建时间、`last_used_at` 可空最后使用时间、`scopes` 可空授权范围 JSON |

API Key 原始值只在签发时返回。用 `iam.user`、`iam.authz` 等公开业务入口修改账户、角色或权限，便于 IAM 同步更新关联的会话与缓存。直接改 SQL 记录会绕开这些同步步骤。

<a id="data-fields"></a>

### 缓存键

下面是逻辑键。如果 [cache](cache.md) 配置了 `keyPrefix`，Redis 的物理键需要同时带该前缀。

| 逻辑键                                  | 值                                                                                                                                                   | 默认值、有效期和行为                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hai:iam:sessions:{<scope>}`            | 每个用户范围对应一条缓存记录。`revision` 为记录版本，`sessions` 按访问令牌记录各会话，可带刷新令牌及到期时间                                         | 键中的 scope 是用户范围摘要。访问令牌默认 86400 秒，刷新令牌默认 604800 秒。此键保留到最后一个有效令牌到期。更换或撤销令牌时，只有缓存版本仍匹配才写入 |
| `hai:iam:otp:<归一化身份>`              | `version`、当前 `code`、`attempts`、`expiresAt`、`cooldownUntil` 保存版本、当前验证码、输错次数、到期时间与可再次发送的时间                          | 一次性验证码默认 300 秒有效，可输错最多 3 次。重发默认需等 60 秒。验证码使用后，如果等待期尚未结束，仍须等到期才能重发                                 |
| `hai:iam:captcha:<id>`                  | `operation`、`challenge` 与服务端校验秘密保存用途及挑战                                                                                              | 默认 120 秒。一次验证使用后，其他并发请求不能再用同一挑战                                                                                              |
| `hai:iam:ticket:sha256:<摘要>`         | `subjectId` 主体、`purpose` 用途、`grant` 授权参数（默认空对象）、`expiresAt` 截止                                                                   | 默认 30 秒。用途吻合后才能兑换，同一张票只能用一次                                                                                                     |
| `hai:iam:read_cache:revision`           | `epoch` 是当前缓存版本，`writers` 是正在进行的写入次数                                                                                               | 首次创建时生成版本，写入数为 0。该键没有过期时间。正在写入时，查询直接读数据库                                                                         |
| `hai:iam:read_cache:<epoch>:<查询标识>` | `{ value }` 包装已成功的读取结果，覆盖 `user:v2:<userId>`、`apikey:<id>`、`verified_apikey:<摘要>`、`authorization:<userId>`、`sensitive:<操作或 *>` | 默认 60 秒。读取缓存后再次检查缓存版本，当前权限变化时不再使用旧版本的记录，旧键自行到期                                                               |

会话快照的 `version` 在内容变化时更新。`credentialVersion` 用来确认会话仍对应账户当前的凭据版本。`terminalType` 保存登录终端（旧记录缺失时按 web 处理），`apiKeyId`、`apiKeyScopes` 仅用于 API Key 派生会话。`userId`、`username`、`displayName`、`avatarUrl` 标识用户及可选展示资料，`roles`、`permissions` 保存授权码，`source` 记录可选登录来源。`accessToken` 是访问凭据，`createdAt`、`startedAt`、`lastActiveAt`、`expiresAt` 分别记录本次签发、初次签发、最近活动与到期，旧记录没有 `startedAt` 时取 `createdAt`。`maxAge` 保存该会话的有效期秒数，`data` 保存可选扩展数据。

会话、票据、验证码和凭据索引均属于私有认证数据。
