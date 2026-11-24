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

IAM 一共使用 7 张表。启用 LDAP 或 API Key 时，才创建对应的表。

| 表名 | 用途 |
| --- | --- |
| [`hai_iam_users`](#table-hai-iam-users) | 保存账号资料、状态、凭据摘要和登录保护信息。 |
| [`hai_iam_roles`](#table-hai-iam-roles) | 登记可分配给账号的角色。 |
| [`hai_iam_permissions`](#table-hai-iam-permissions) | 登记应用要检查的具体权限。 |
| [`hai_iam_user_roles`](#table-hai-iam-user-roles) | 查询用户被授予的角色。 |
| [`hai_iam_role_permissions`](#table-hai-iam-role-permissions) | 查询角色授予的权限。 |
| [`hai_iam_api_keys`](#table-hai-iam-api-keys) | 查程序凭据的归属、摘要和可用范围。 |
| [`hai_iam_ldap_identities`](#table-hai-iam-ldap-identities) | 将目录中的稳定身份关联到本地账号。 |

<a id="table-hai-iam-users"></a>

#### `hai_iam_users`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 用户主键。 | `user-42` |
| `username` | `TEXT` | 否 | — | 唯一用户名，用于登录。 | `example-user` |
| `email` | `TEXT` | 是 | — | 邮箱地址。 | `null` |
| `phone` | `TEXT` | 是 | — | 电话号码。 | `NULL` |
| `display_name` | `TEXT` | 是 | — | 显示名。 | `Example User` |
| `avatar_url` | `TEXT` | 是 | — | 头像地址。 | `https://images.example.invalid/user-42.png` |
| `email_verified` | `BOOLEAN` | 是 | `false` | 邮箱是否验证过。 | `false` |
| `phone_verified` | `BOOLEAN` | 是 | `false` | 手机号是否验证过。 | `false` |
| `password_hash` | `TEXT` | 是 | — | 密码摘要。无本地密码的账号可为空。 | `null` |
| `password_updated_at` | `TIMESTAMP` | 是 | — | 最近一次设置密码的时间。 | `NULL` |
| `login_failed_count` | `INTEGER` | 是 | `0` | 登录失败计数。 | `0` |
| `first_login_failed_at` | `TIMESTAMP` | 是 | — | 当前计数周期内首次登录失败的时间。 | `NULL` |
| `last_login_failed_at` | `TIMESTAMP` | 是 | — | 最近一次登录失败的时间。 | `NULL` |
| `locked_until` | `TIMESTAMP` | 是 | — | 登录锁定截止时间。 | `NULL` |
| `metadata` | `JSON` | 是 | — | 应用保存的扩展资料。 | `{"department":"Support"}` |
| `created_at` | `TIMESTAMP` | 否 | — | 账号创建时间。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 否 | — | 账号最近修改时间。 | `2026-11-17T00:00:00Z` |
| `must_change_password` | `BOOLEAN` | 否 | `false` | 下次登录后是否要求修改密码。 | `false` |
| `account_type` | `TEXT` | 否 | `permanent` | 账号类型。 | `permanent` |
| `account_status` | `TEXT` | 否 | `active` | 账号当前状态。 | `active` |
| `account_expires_at` | `TIMESTAMP` | 是 | — | 账号的使用截止时间。 | `NULL` |
| `last_login_at` | `TIMESTAMP` | 是 | — | 最近登录成功时间。 | `2026-11-17T00:00:00Z` |
| `credential_version` | `TEXT` | 否 | `""` | 修改凭据时换一个版本，用来判定会话是否仍有效。 | `<credential-version>` |
| `reset_version` | `TEXT` | 否 | `""` | 当前密码重置请求的版本。 | `<reset-version>` |
| `reset_hash` | `TEXT` | 是 | — | 重置凭据摘要。 | `NULL` |
| `reset_expires_at` | `BIGINT` | 是 | — | 重置凭据的截止时间，Unix 毫秒。 | `1794874500000` |
| `reset_attempts` | `INTEGER` | 否 | `0` | 当前重置凭据已验证的次数。 | `0` |

<a id="table-hai-iam-roles"></a>

#### `hai_iam_roles`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 角色主键。 | `role-reader` |
| `code` | `TEXT` | 否 | — | 唯一角色码，用于代码判断角色。 | `reader` |
| `name` | `TEXT` | 否 | — | 角色显示名。 | `Reader` |
| `description` | `TEXT` | 是 | — | 角色用途说明。 | `Can read orders` |
| `is_system` | `BOOLEAN` | 是 | `false` | 是否为系统角色。 | `false` |
| `created_at` | `TIMESTAMP` | 否 | — | 角色创建时间。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 否 | — | 角色最近修改时间。 | `2026-11-17T00:00:00Z` |

<a id="table-hai-iam-permissions"></a>

#### `hai_iam_permissions`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 权限主键。 | `permission-read` |
| `code` | `TEXT` | 否 | — | 唯一权限码。 | `orders.read` |
| `name` | `TEXT` | 否 | — | 权限显示名。 | `Read orders` |
| `description` | `TEXT` | 是 | — | 权限用途说明。 | `Read order details` |
| `resource` | `TEXT` | 是 | — | 操作的资源类型。 | `orders` |
| `action` | `TEXT` | 是 | — | 允许执行的操作。 | `read` |
| `type` | `TEXT` | 是 | — | 应用用于分类的权限类型。 | `NULL` |
| `sensitive_operations` | `JSON` | 是 | — | 属于该权限的敏感操作配置。 | `NULL` |
| `created_at` | `TIMESTAMP` | 否 | — | 权限创建时间。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 否 | — | 权限最近修改时间。 | `2026-11-17T00:00:00Z` |

<a id="table-hai-iam-user-roles"></a>

#### `hai_iam_user_roles`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `TEXT` | 否 | — | 获授角色的用户 ID，是唯一组合的一部分，也是查询索引。 | `user-42` |
| `role_id` | `TEXT` | 否 | — | 授予的角色 ID，与 `user_id` 组成唯一组合。 | `role-reader` |

<a id="table-hai-iam-role-permissions"></a>

#### `hai_iam_role_permissions`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `role_id` | `TEXT` | 否 | — | 包含该权限的角色 ID，是唯一组合的一部分，也是查询索引。 | `role-reader` |
| `permission_id` | `TEXT` | 否 | — | 角色授予的权限 ID，与 `role_id` 组成唯一组合。 | `permission-read` |

<a id="table-hai-iam-api-keys"></a>

#### `hai_iam_api_keys`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | API Key 主键。 | `apikey-42` |
| `user_id` | `TEXT` | 否 | — | API Key 所属用户 ID。 | `user-42` |
| `name` | `TEXT` | 否 | — | 供用户区分各密钥的显示名。 | `Example API` |
| `key_hash` | `TEXT` | 否 | — | 用于验证 API Key 的摘要。 | `<hash:redacted>` |
| `key_prefix` | `TEXT` | 否 | — | 用于识别密钥的显示前缀。 | `<prefix:redacted>` |
| `enabled` | `BOOLEAN` | 否 | `true` | API Key 是否可用。 | `true` |
| `expires_at` | `TIMESTAMP` | 是 | — | API Key 的使用截止时间。 | `null` |
| `created_at` | `TIMESTAMP` | 否 | — | API Key 签发时间。 | `2026-11-17T00:00:00Z` |
| `last_used_at` | `TIMESTAMP` | 是 | — | 最近一次使用时间。 | `NULL` |
| `scopes` | `JSON` | 是 | — | API Key 可使用的授权范围。 | `["orders.read"]` |

<a id="table-hai-iam-ldap-identities"></a>

#### `hai_iam_ldap_identities`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `directory_id` | `TEXT` | 否 | — | 目录 ID，用于区分不同 LDAP 目录。 | `company-directory` |
| `entry_id` | `TEXT` | 否 | — | 目录条目的稳定 ID，与 `directory_id` 组成唯一组合。 | `3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76` |
| `user_id` | `TEXT` | 否 | — | 引用本地用户。与 `directory_id` 组成唯一组合，删除用户会级联清除绑定。 | `user-42` |

API Key 原始值只在签发时返回。用 `iam.user`、`iam.authz` 等公开入口修改账号、角色或权限，IAM 会同步维护关联会话和缓存。

<a id="data-fields"></a>

### 缓存键

IAM 写入 6 类缓存记录。以下是逻辑键。如果 Cache 设置了 `keyPrefix`，Redis 中还会加上该前缀。会话、验证码、票据及授权数据仅供服务端读取。

| 键或类别 | 用途 | 默认有效期与清理 |
| --- | --- | --- |
| [`hai:iam:sessions:{<scope-digest>}`](#cache-iam-sessions) | 在同一位置管理一个用户范围内的有效会话和刷新凭据。 | 随最后一个仍有效的 access 或 refresh 期限到期。无会话时删除，滑动续期按会话配置。 |
| [`hai:iam:otp:<identifier>`](#cache-iam-otp) | 验证某个邮箱或手机号当前的验证码，限制输错次数和重发频率。 | 默认验证码 300 秒、重发间隔 60 秒，键保留到两项中较晚的时间。用过或用尽次数时清空码。 |
| [`hai:iam:captcha:<id>`](#cache-iam-captcha) | 让服务端确认挑战的用途、答案和有效性。 | `captcha.ttlSeconds` 默认 120 秒。成功验证后删除，过期后重新发起挑战。 |
| [`hai:iam:ticket:sha256:<digest>`](#cache-iam-ticket) | 只允许客户端短时间内兑换一次约定用途的授权。 | 默认 30 秒，可通过 `ttlMs` 指定。成功兑换时原子删除。 |
| [`hai:iam:read_cache:revision`](#cache-iam-revision) | 告诉读取方哪批账号和权限缓存仍可用。 | 无自动期限，发生写入时更换代次。 |
| [`hai:iam:read_cache:<epoch>:<query>`](#cache-iam-result) | 短时间复用成功读取的账号资料或权限。 | 写入后 60 秒到期。状态代次改变后立即停止读取旧键。 |

<a id="cache-iam-sessions"></a>

#### `hai:iam:sessions:{<scope-digest>}`

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `revision` | `string` | — | 快照版本，每次内容变动时更新，避免把别人的修改写回去。 | `revision-42` |
| `sessions` | JSON object | — | 以访问令牌为键，保存该范围内的会话条目。 | `{"<access-token:redacted>":{…}}` |
| `sessions.*.refreshToken` | `string` | — | 如果该会话可刷新，保存对应的刷新凭据。 | `<refresh-token:redacted>` |
| `sessions.*.refreshExpiresAt` | `number` | — | 刷新凭据截止时间，Unix 毫秒。默认签发后 7 天。 | `1795478400000` |
| `sessions.*.session` | JSON object | — | 认证和授权消耗的会话快照，见下列字段。 | `{"userId":"user-42",…}` |
| `session.userId` | `string` | — | 已登录用户 ID。下列 `session.*` 均指单条会话内的字段。 | `user-42` |
| `session.username` | `string` | — | 登录名，可省略。 | `example-user` |
| `session.displayName` | `string` | — | 显示名，可省略。 | `Example User` |
| `session.avatarUrl` | `string` | — | 头像地址，可省略。 | `https://images.example.invalid/user-42.png` |
| `session.version` | `string` | — | 显式修改会话时更新，例行滑动续期保留。 | `session-version-42` |
| `session.credentialVersion` | `string` | — | 签发时绑定的凭据版本，改密码后用来拒绝旧会话。 | `credential-version-42` |
| `session.terminalType` | `string` | `web` | 终端分组，老记录没有时按 `web` 归类。 | `web` |
| `session.apiKeyId` | `string` | — | 仅 API Key 派生会话保存关联密钥 ID。 | `apikey-42` |
| `session.apiKeyScopes` | `string[]` | — | API Key 派生会话的授权范围。 | `["orders.read"]` |
| `session.roles` | `string[]` | — | 当前会话的角色码。 | `["reader"]` |
| `session.permissions` | `string[]` | — | 当前会话的权限码。 | `["orders.read"]` |
| `session.source` | `string` | — | 可选的登录来源。 | `pc` |
| `session.accessToken` | `string` | — | 此会话使用的访问凭据。 | `<access-token:redacted>` |
| `session.createdAt` | ISO date string | — | 本次签发时间。 | `2026-11-17T00:00:00.000Z` |
| `session.startedAt` | ISO date string | `createdAt` | 初次签发时间，刷新时保留。旧记录缺失时取 `createdAt`。 | `2026-11-17T00:00:00.000Z` |
| `session.lastActiveAt` | ISO date string | — | 最近一次活动的时间，用来判断是否闲置过久。 | `2026-11-17T00:00:00.000Z` |
| `session.expiresAt` | ISO date string | — | 访问会话的到期时间。 | `2026-11-18T00:00:00.000Z` |
| `session.maxAge` | `number` | `86400` | access 有效期，单位秒。创建时可覆盖，后续使用签发时的时长。 | `86400` |
| `session.data` | JSON object | — | 可选的扩展资料。 | `{"theme":"dark"}` |

<a id="cache-iam-otp"></a>

#### `hai:iam:otp:<identifier>`

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `version` | `string` | — | 当前验证码的签发版本。键的 `identifier` 是规范化邮箱或手机号。 | `otp-version-42` |
| `code` | `string` / `null` | — | 当前验证码；已消耗或尝试用完后为空。 | `<otp:redacted>` |
| `attempts` | `integer` | — | 本次验证码的验证次数，签发时写入 `0`。 | `0` |
| `expiresAt` | `number` | — | 验证码的截止时间，Unix 毫秒。 | `1794873900000` |
| `cooldownUntil` | `number` | — | 最早可重发的时间，Unix 毫秒。 | `1794873660000` |

<a id="cache-iam-captcha"></a>

#### `hai:iam:captcha:<id>`

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `operation` | `string` | — | 挑战用途，验证时须匹配业务操作。键的 `id` 由签发方生成。 | `login` |
| `challenge` | JSON object | — | 挑战参数，校验答案时使用。 | `{…}` |
| `signatureSecret` | `string` | — | 验证挑战签名的服务端秘密。 | `<secret:redacted>` |
| `keySecret` | `string` | — | 验证派生密钥签名的服务端秘密。 | `<secret:redacted>` |

<a id="cache-iam-ticket"></a>

#### `hai:iam:ticket:sha256:<digest>`

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `subjectId` | `string` | — | 签发时已确认的主体。键的 `digest` 由客户端收到的原票据计算。 | `user-42` |
| `purpose` | `string` | — | 票据唯一用途，兑换请求必须匹配。 | `ai-audio` |
| `grant` | JSON object | `{}` | 签发时允许的业务操作、模型、会话等参数。 | `{"operation":"transcribe"}` |
| `expiresAt` | `number` | — | 票据截止时间，Unix 毫秒。 | `1794873630000` |

<a id="cache-iam-revision"></a>

#### `hai:iam:read_cache:revision`

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `epoch` | `string` | — | 当前缓存代次，用来组成查询缓存的键。 | `epoch-42` |
| `writers` | `integer` | — | 尚未确认完成的写入数。初始写入 `0`。 | `0` |

<a id="cache-iam-result"></a>

#### `hai:iam:read_cache:<epoch>:<query>`

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `value` | JSON | — | 成功查询结果的包装，示例键 `hai:iam:read_cache:epoch-42:user:v2:user-42`。 | `{"id":"user-42","username":"example-user"}` |

改变用户凭据后，IAM 比较 `credentialVersion` 以拒绝旧会话。账号或权限正在写入时，读取方查数据库。写入完毕后使用新 `epoch`，旧读缓存按原期限到期。
