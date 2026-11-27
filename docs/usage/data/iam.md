# @h-ai/iam 数据结构

<a id="iam-数据结构"></a>

[English](iam.en.md) · [日本語](iam.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/iam.md) · [功能说明](../function/iam.md)

以订单查看员 `user-42` 为例，账号行决定该用户能否登录，角色关联决定其能否读取订单。登录成功后，IAM 在共享缓存写入会话。改密、联系方式换绑或账号状态变化会推进凭据代际，旧会话随后无法继续认证。下文使用同一组虚构账号、角色和权限。表和缓存示例是记录节选，秘密均已脱敏。

<a id="database"></a>

## 数据库

[RelDB](reldb.md) 是账号与授权的权威存储。通过 IAM 的用户和授权入口写入时，IAM 同时维护关联并作废相关缓存。下列类型是 RelDB 逻辑类型。SQL 默认值的「—」表示没有显式默认值。应用和数据库都未提供值时，可空列为 `NULL`。

IAM 有 7 张表，其中 5 张基础表随 `iam.init()` 准备。API Key 表在 `login.apikey` 启用时准备。LDAP 表在 `login.ldap` 启用并配置目录时准备，受信的 LDAP 身份导入也会准备该表。

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

### `hai_iam_users`

`id` 是主键，`username` 有数据库唯一约束。邮箱和手机号没有列级唯一约束。账号入口按业务规则检查重复，OTP 仅接受渠道内唯一的规范化联系方式。SQLite 将 `TIMESTAMP` 存为 Unix 毫秒整数，将 `BOOLEAN` 存为整数，将 `JSON` 存为文本。PostgreSQL 使用 `TIMESTAMP`、`BOOLEAN` 和 `JSONB`。MySQL 将逻辑 `TEXT` 映射为 `VARCHAR(255)`，并使用 `DATETIME`、`TINYINT(1)` 和 `JSON`。示例以 ISO 8601 日期、布尔值和 JSON 表示共同语义。

IAM 创建用户时生成 ID 并填入创建和更新时间。自助注册通常写入 `permanent` 和 `register.defaultAccountStatus`。管理端可指定类型、状态和到期点，临时账号必须有期限。密码注册写入摘要和设密时间，联系方式验证标记初始为 `false`。只用 OTP 或 LDAP 建立的账号可无本地密码。SQL 将凭据代和重置代初始化为 `""`，后续安全操作写入新的版本。

关系数据库用 `login_lockout_version` 指向账号当前的[登录失败记录](#cache-iam-login-failures)。确认密码重置时，IAM 在保存新密码的同一条 SQL 中写入新的 UUID，后续鉴别只读取新版本，旧键按原期限过期。普通资料更新和管理员重设密码保留原锁定期限。

重置申请将 `reset_attempts` 置为 `0`，核对当前有效令牌时计一次，用尽次数或到期后须重新申请。成功设密清除重置摘要及期限，并推进账号凭据代。闲置扫描会把符合 `accounts.dormantAfterDays` 的活跃账号改为 `dormant` 并推进凭据代。到期和休眠都会保留账号行，物理删除由管理端发起。

| 字段 | 类型 | 可空 | SQL 默认值 | 说明 | 示例 |
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
| `login_lockout_version` | `TEXT` | 否 | `initial` | 当前登录失败记录的版本。确认密码重置时更新为 UUID。 | `initial` |
| `metadata` | `JSON` | 是 | — | 应用保存的扩展资料。 | `{"department":"Support"}` |
| `created_at` | `TIMESTAMP` | 否 | — | 账号创建时间。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 否 | — | 账号最近修改时间。 | `2026-11-17T00:00:00Z` |
| `must_change_password` | `BOOLEAN` | 否 | `false` | 下次登录后是否要求修改密码。 | `false` |
| `account_type` | `TEXT` | 否 | `permanent` | `permanent` 或 `temporary`。 | `permanent` |
| `account_status` | `TEXT` | 否 | `active` | `active`、`dormant` 或 `closed`。 | `active` |
| `account_expires_at` | `TIMESTAMP` | 是 | — | 账号的使用截止时间。 | `NULL` |
| `last_login_at` | `TIMESTAMP` | 是 | — | 最近登录成功时间。 | `2026-11-17T00:00:00Z` |
| `credential_version` | `TEXT` | 否 | `""` | 修改凭据时换一个版本，用来判定会话是否仍有效。 | `<credential-version>` |
| `reset_version` | `TEXT` | 否 | `""` | 当前密码重置请求的版本。 | `<reset-version>` |
| `reset_hash` | `TEXT` | 是 | — | 重置凭据摘要。 | `NULL` |
| `reset_expires_at` | `BIGINT` | 是 | — | 重置凭据的截止时间，Unix 毫秒。 | `1794874500000` |
| `reset_attempts` | `INTEGER` | 否 | `0` | 当前重置凭据已验证的次数。 | `0` |

<a id="example-data"></a>

#### 示例 · 账号本身

保存登录身份和账号是否允许使用，登录或授权时都要检查。

```json
{
  "id": "user-42",
  "username": "example-user",
  "email": "reader@example.invalid",
  "password_hash": "<hash:redacted>",
  "account_type": "permanent",
  "account_status": "active",
  "must_change_password": false,
  "login_lockout_version": "initial"
}
```

`user-42` 是活跃的长期账号。邮箱为虚构联系方式，密码摘要已脱敏。角色和权限来自后面的关联行。

<a id="table-hai-iam-roles"></a>

### `hai_iam_roles`

`id` 是主键，`code` 唯一。创建时 IAM 生成 ID 并填入两个时间。删除角色时，IAM 清理所属用户和权限的关联。系统角色的删除受到限制。

| 字段 | 类型 | 可空 | SQL 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 角色主键。 | `role-reader` |
| `code` | `TEXT` | 否 | — | 唯一角色码，用于代码判断角色。 | `reader` |
| `name` | `TEXT` | 否 | — | 角色显示名。 | `Reader` |
| `description` | `TEXT` | 是 | — | 角色用途说明。 | `Can read orders` |
| `is_system` | `BOOLEAN` | 是 | `false` | 是否为系统角色。 | `false` |
| `created_at` | `TIMESTAMP` | 否 | — | 角色创建时间。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 否 | — | 角色最近修改时间。 | `2026-11-17T00:00:00Z` |

<a id="可以分配给用户的角色"></a>

#### 示例 · 可以分配给用户的角色

把一组职责起成角色，便于给多个用户分配相同权限。

```json
{
  "id": "role-reader",
  "code": "reader",
  "name": "Reader",
  "is_system": false
}
```

`role-reader` 的业务代码是 `reader`，显示名称为 Reader，`is_system` 为 `false`。

<a id="table-hai-iam-permissions"></a>

### `hai_iam_permissions`

`id` 是主键，`code` 唯一。创建时 IAM 生成 ID 并填入两个时间。删除权限时，IAM 也删除角色关联。`type` 可为 `menu`、`api` 或 `button`。`sensitive_operations` 是授权服务用于要求再次鉴别的操作名数组。

| 字段 | 类型 | 可空 | SQL 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 权限主键。 | `permission-read` |
| `code` | `TEXT` | 否 | — | 唯一权限码。 | `orders:read` |
| `name` | `TEXT` | 否 | — | 权限显示名。 | `Read orders` |
| `description` | `TEXT` | 是 | — | 权限用途说明。 | `Read order details` |
| `resource` | `TEXT` | 是 | — | 操作的资源类型。 | `orders` |
| `action` | `TEXT` | 是 | — | 允许执行的操作。 | `read` |
| `type` | `TEXT` | 是 | — | 应用用于分类的权限类型。 | `NULL` |
| `sensitive_operations` | `JSON` | 是 | — | 属于该权限的敏感操作配置。 | `NULL` |
| `created_at` | `TIMESTAMP` | 否 | — | 权限创建时间。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 否 | — | 权限最近修改时间。 | `2026-11-17T00:00:00Z` |

<a id="应用能够检查的具体权限"></a>

#### 示例 · 应用能够检查的具体权限

给每一种受保护的操作一个稳定权限码，服务端检查用户是否拥有它。

```json
{
  "id": "permission-read",
  "code": "orders:read",
  "name": "Read orders",
  "resource": "orders",
  "action": "read"
}
```

`orders:read` 表示读取订单。`resource` 为 `orders`，`action` 为 `read`。分配权限还需要一条角色关联。

<a id="table-hai-iam-user-roles"></a>

### `hai_iam_user_roles`

`idx_user_role_user_role` 将 `(user_id, role_id)` 约束为唯一组合，`idx_user_role_user` 用于按用户查询。两个字段分别引用用户和角色 ID，删除用户或角色时由 IAM 清理关联行。

| 字段 | 类型 | 可空 | SQL 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `TEXT` | 否 | — | 获授角色的用户 ID，是唯一组合的一部分，也是查询索引。 | `user-42` |
| `role_id` | `TEXT` | 否 | — | 授予的角色 ID，与 `user_id` 组成唯一组合。 | `role-reader` |

<a id="哪个用户拥有哪个角色"></a>

#### 示例 · 哪个用户拥有哪个角色

连接账号与角色，不把所有角色重复写进每个账号行。

```json
{
  "user_id": "user-42",
  "role_id": "role-reader"
}
```

`user-42` 获分配 `role-reader`。这一组合只保存一次。

<a id="table-hai-iam-role-permissions"></a>

### `hai_iam_role_permissions`

`idx_role_perm_role_perm` 将 `(role_id, permission_id)` 约束为唯一组合，`idx_role_perm_role` 用于按角色查询。两个字段分别引用角色和权限 ID，删除角色或权限时由 IAM 清理关联行。

| 字段 | 类型 | 可空 | SQL 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `role_id` | `TEXT` | 否 | — | 包含该权限的角色 ID，是唯一组合的一部分，也是查询索引。 | `role-reader` |
| `permission_id` | `TEXT` | 否 | — | 角色授予的权限 ID，与 `role_id` 组成唯一组合。 | `permission-read` |

<a id="哪个角色包含哪个权限"></a>

#### 示例 · 哪个角色包含哪个权限

连接角色与具体权限，用于计算用户最终可以做什么。

```json
{
  "role_id": "role-reader",
  "permission_id": "permission-read"
}
```

`role-reader` 包含 `permission-read`。与上一条用户角色记录关联后，`user-42` 获得 `orders:read`。

<a id="table-hai-iam-api-keys"></a>

### `hai_iam_api_keys`

`id` 是主键。`user_id` 指向认证时核验的所属账号。`key_prefix` 用于筛选候选，最终核对摘要。签发时 IAM 写入生成的 ID、创建时间、`enabled: true` 和 `last_used_at: NULL`。省略范围时写入空数组，选择不设置期限时写入 `expires_at: NULL`，是配置默认行为。每个用户默认最多保存 10 行，禁用和过期的 Key 也计入，撤销 Key 删除该行。账号被删除后，该 Key 不能认证，存储表没有相应的外键级联。

`verifyApiKey` 在验证时计算当前账号授权与 Key 范围的交集。数据库行存的是 Key 自身范围。[程序凭据](../function/iam.md#api-keys)

| 字段 | 类型 | 可空 | SQL 默认值 | 说明 | 示例 |
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
| `scopes` | `JSON` | 是 | — | API Key 配置的权限范围。 | `["orders:read"]` |

<a id="供程序调用的-api-凭据登记"></a>

#### 示例 · 供程序调用的 API 凭据登记

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
    "orders:read"
  ]
}
```

`apikey-42` 属于 `user-42`，限制在 `orders:read` 范围内。示例已隐藏 `key_hash` 和 `key_prefix`。

<a id="table-hai-iam-ldap-identities"></a>

### `hai_iam_ldap_identities`

`idx_ldap_identity_entry` 和 `idx_ldap_identity_user` 分别约束 `(directory_id, entry_id)` 和 `(directory_id, user_id)` 唯一。`user_id` 是引用 `hai_iam_users.id` 的外键，账号删除时级联删除。目录 ID 来自 `ldap.directoryId` 或导入输入，条目 ID 来自目录的稳定标识。绑定时写入三个 ID。目录登录名或 DN 变化时，稳定绑定保留。

| 字段 | 类型 | 可空 | SQL 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `directory_id` | `TEXT` | 否 | — | 目录 ID，用于区分不同 LDAP 目录。 | `company-directory` |
| `entry_id` | `TEXT` | 否 | — | 目录条目的稳定 ID，与 `directory_id` 组成唯一组合。 | `3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76` |
| `user_id` | `TEXT` | 否 | — | 引用本地用户。与 `directory_id` 组成唯一组合，删除用户会级联清除绑定。 | `user-42` |

<a id="记录目录条目与本地用户的归属"></a>

#### 示例 · 记录目录条目与本地用户的归属

示例将公司目录的稳定条目 ID 绑定到 `user-42`。目录条目重命名后仍使用此绑定。

```json
{
  "directory_id": "company-directory",
  "entry_id": "3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76",
  "user_id": "user-42"
}
```

<a id="data-fields"></a>

<a id="cache"></a>

## 缓存

IAM 写入 7 类服务端缓存。生产节点共享同一 Redis 和逻辑命名空间，开发测试可用单进程 Memory。[Cache](cache.md) 配置 `keyPrefix` 时，底层 Redis 键还会加上该前缀。表中默认值指 IAM 初始化新记录时写入的值。

| 键或类别 | 用途 | 默认有效期与清理 |
| --- | --- | --- |
| [`hai:iam:sessions:{<scope-digest>}`](#cache-iam-sessions) | 在同一位置管理一个用户范围内的有效会话和刷新凭据。 | 随最后一个仍有效的 access 或 refresh 期限到期。无会话时删除，滑动续期按会话配置。 |
| [`hai:iam:login_failures:<userId>:<lockoutVersion>`](#cache-iam-login-failures) | 多节点共用账号的失败次数和锁定期限。 | 未锁定时到固定计数窗口结束，已锁定时到解除锁定。 |
| [`hai:iam:otp:<identifier>`](#cache-iam-otp) | 保存规范化联系方式的验证码及签发时确定的账号，限制尝试次数和重发频率。 | 默认验证码 300 秒、重发间隔 60 秒，键保留到两项中较晚的时间。用过或用尽次数时清空码。 |
| [`hai:iam:captcha:<id>`](#cache-iam-captcha) | 让服务端确认挑战的用途、答案和有效性。 | `captcha.ttlSeconds` 默认 120 秒。成功验证后删除，过期后重新发起挑战。 |
| [`hai:iam:ticket:sha256:<digest>`](#cache-iam-ticket) | 只允许客户端短时间内兑换一次约定用途的授权。 | 默认 30 秒，可通过 `ttlMs` 指定。成功兑换时原子删除。 |
| [`hai:iam:read_cache:revision`](#cache-iam-revision) | 告诉读取方哪批账号和权限缓存仍可用。 | 无自动期限，发生写入时更换代次。 |
| [`hai:iam:read_cache:<epoch>:<query>`](#cache-iam-result) | 短时间复用成功读取的账号资料或权限。 | 写入后 60 秒到期。状态代次改变后立即停止读取旧键。 |

<a id="cache-iam-sessions"></a>

### `hai:iam:sessions:{<scope-digest>}`

Access 和 refresh 的格式都是 `s1.<scope-digest>.<random>`，最后一段为每张令牌单独生成的随机值。`scope-digest` 是用户 ID 的 SHA-256 十六进制摘要。请求进来时，IAM 手上先有令牌，从中取出这 64 个十六进制字符就能定位会话文档，省去一次令牌到用户 ID 的查询。找到文档后，还要用**完整令牌**匹配其中的会话。

以 `user-42` 为例，SHA-256 的结果对应下面这条 Redis 键。默认键名的花括号内是 Redis Cluster 用来选择存储槽的内容。同一用户的 access 和 refresh 都落在一个文档里，IAM 用单键比较交换原子更新它。

```text
hai:iam:sessions:{6d894aa3ee802549d7f340e7c1cf0d1c1cb14cd84f768d92ffaa6785337c4997}
```

读取账号与权限缓存时，IAM 已经知道用户 ID，可以直接拼接键名。会话这一步发生得更早，当前令牌提供的是摘要。若用原始用户 ID 做会话键，令牌也须提供经编码的 ID，或由服务端先查出对应的 ID。摘要让令牌的定位段长度和字符集固定，用户 ID 保存在会话文档中。

新会话默认 access 86400 秒，refresh 604800 秒。默认允许滑动续期，access 到期仍可用有效的 refresh。刷新更换令牌对，保留首次签发时间。启用闲置或绝对期限时，两种令牌均受限。自动刷新和角色权限同步不记录用户活动。[会话期限与配置示例](../configuration/iam.md#session-deadlines)

未开启闲置期限时，`session.touchMinInterval` 可合并滑动续期写入。读取或验证会话时返回 Redis 已提交的活动和到期时间。

会话配额按用户和有效凭据代统计。access 到期、但仍可刷新的会话计入配额。`maxSessions` 默认 `0`，表示不限。`terminalLimits` 默认 `{}`，设置后匹配相应终端类型，未列出的类型不能新登录。单设备默认关闭。开启并选用 `replace` 时，只替换同一凭据代的已有会话，`reject` 拒绝重复登录。用户主动退出删除关联的两个令牌，显式只吊销 refresh 则保留 access。空分区立即删除，其余按分区内最大的 access 或 refresh 保存期限设置 TTL。其他到期记录在后续写入时清理。

表中的 `sessions.*` 指任一 access 键对应的条目。验票用请求里的完整 access token 找到这条记录，返回时从键填入 `Session.accessToken`。刷新按条目旁的 `refreshToken` 查找，找到后用该条目的 access 键删除旧会话，并原子写入新会话。`iam.session.create()` 的返回值通过 `data._tokenPair` 把本次签发的令牌对交给登录流程。Redis 里的 access token 只在外层键出现，refresh token 只在同一条目的 `refreshToken` 出现。

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
| `session.terminalType` | `string` | `web` / `api` | `web`、`app`、`desktop`、`api`。未指定时，普通登录写入 `web`，API Key 登录写入 `api`。 | `web` |
| `session.apiKeyId` | `string` | — | 仅 API Key 派生会话保存关联密钥 ID。 | `apikey-42` |
| `session.apiKeyScopes` | `string[]` | — | 可选的 Key 范围。签发 Key 会话时写入。 | `["orders:read"]` |
| `session.roles` | `string[]` | `[]` | 签发时取自授权或传入值，省略写入 `[]`。 | `["reader"]` |
| `session.permissions` | `string[]` | `[]` | 签发时取自授权或传入值，省略写入 `[]`。 | `["orders:read"]` |
| `session.source` | `string` | — | 可选的登录来源。 | `pc` |
| `session.createdAt` | ISO date string | — | 本次签发时间。 | `2026-11-17T00:00:00.000Z` |
| `session.startedAt` | ISO date string | — | 初次签发时间，刷新时保留。 | `2026-11-17T00:00:00.000Z` |
| `session.lastActiveAt` | ISO date string | — | 最近一次活动的时间，用来判断是否闲置过久。 | `2026-11-17T00:00:00.000Z` |
| `session.expiresAt` | ISO date string | — | 访问会话的到期时间。 | `2026-11-18T00:00:00.000Z` |
| `session.maxAge` | `number` | `86400` | access 有效期，单位秒。创建时可覆盖，后续使用签发时的时长。 | `86400` |
| `session.data` | JSON object | — | 可选的扩展资料。 | `{"theme":"dark"}` |

<a id="这个用户仍有效的登录会话"></a>

#### 示例 · 这个用户仍有效的登录会话

下面是一条 `user-42` 登录后的 Redis 会话记录。两张令牌均已脱敏。验证、刷新和退出共用这条用户记录。

```json
{
  "revision": "revision-42",
  "sessions": {
    "<access-token:redacted>": {
      "session": {
        "version": "session-version-42",
        "credentialVersion": "credential-version-42",
        "terminalType": "web",
        "userId": "user-42",
        "username": "example-user",
        "roles": [
          "reader"
        ],
        "permissions": [
          "orders:read"
        ],
        "createdAt": "2026-11-17T00:00:00.000Z",
        "startedAt": "2026-11-17T00:00:00.000Z",
        "lastActiveAt": "2026-11-17T00:00:00.000Z",
        "expiresAt": "2026-11-18T00:00:00.000Z",
        "maxAge": 86400
      },
      "refreshExpiresAt": 1795478400000,
      "refreshToken": "<refresh-token:redacted>"
    }
  }
}
```

示例的 access 在 2026-11-18 00:00 UTC 到期，`refreshExpiresAt` 对应 2026-11-24 00:00 UTC。

<a id="cache-iam-login-failures"></a>

### `hai:iam:login_failures:<userId>:<lockoutVersion>`

`userId` 来自 `hai_iam_users.id`，`lockoutVersion` 来自同一行的 `login_lockout_version`。开启 `security.lockoutEnabled` 后，符合条件的鉴别失败只写入共享 Redis。第一次失败开启固定窗口，后续失败不会延后窗口结束时间。默认窗口为 86400 秒，累计 5 次失败后锁定 900 秒。未锁定记录在窗口结束时过期，已锁定记录在 `lockedUntil` 到期。过期后，下次符合条件的失败从 1 开始计数。

Redis 通过原子比较和更新合并各节点的失败次数，达到阈值时设置锁定。凭据检查通过后，IAM 以相同方式清理失败记录。如果另一节点已经锁定账号，这次鉴别仍会被拒绝。关闭策略时跳过这份记录。Redis 故障时，受策略保护的鉴别返回失败，无数据库或本机内存回退。生产 Redis 使用可靠持久化和 `noeviction`，保留未到期的锁定记录。

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `revision` | `string` | 首次随机生成 | 当前记录的版本，用于原子比较时识别并发更新。 | `failure-revision-42` |
| `count` | `number` | `1` | 固定窗口内计入的失败次数。 | `5` |
| `firstFailedAt` | `number` | 首次失败时间 | 固定计数窗口的起点，Unix 毫秒。 | `1794873600000` |
| `lastFailedAt` | `number` | 首次失败时间 | 最近一次计入的失败时间，Unix 毫秒。 | `1794873780000` |
| `lockedUntil` | `number` / `null` | `null` | 解除锁定的时间，Unix 毫秒。未锁定时为 `null`。 | `1794874680000` |

<a id="达到失败阈值后的锁定记录"></a>

#### 示例 · 两个节点共用锁定期限

`user-42` 的版本仍为 `initial`。在 2026-11-17 00:00 UTC 记录第一次失败，00:03 时另一节点记录第五次。所有节点从 `hai:iam:login_failures:user-42:initial` 查到该账号锁定至 00:18 UTC。

```json
{
  "revision": "failure-revision-42",
  "count": 5,
  "firstFailedAt": 1794873600000,
  "lastFailedAt": 1794873780000,
  "lockedUntil": 1794874680000
}
```

00:18 UTC 这条记录到期。如果用户先确认密码重置，IAM 会通过新版本查找记录，旧键上剩余的锁定时间不再影响后续鉴别。

<a id="cache-iam-otp"></a>

### `hai:iam:otp:<identifier>`

键的 `identifier` 是邮件或短信渠道上规范化后的联系方式。新签发写入新版本、签发时的主体、验证码、`attempts: 0` 和两个截止点。验证当前挑战时原子计次，正确或达到 `otp.maxAttempts` 后清空验证码，默认上限为 3。错误的当前挑战可影响账号的登录失败计数，两套计数分别维护。新发送替换旧挑战并重新计数，重发过早返回限时失败。用过或耗尽的挑战仍保留冷却约束，有效期和冷却期都结束后删除记录。多节点共用这一条记录。

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `version` | `string` | — | 当前验证码的签发版本。键的 `identifier` 是规范化邮箱或手机号。 | `otp-version-42` |
| `subject` | `{ userId: string, credentialVersion: string }` / `null` | — | 签发时确定的用户 ID 和凭据代际。`null` 表示仅供首次注册。缺少该字段的旧记录不可用于登录。 | `{ "userId": "user-42", "credentialVersion": "credential-17" }` |
| `code` | `string` / `null` | — | 当前验证码；已消耗或尝试用完后为空。 | `<otp:redacted>` |
| `attempts` | `integer` | `0` | 本次验证码的验证次数，签发时写入 `0`。 | `0` |
| `expiresAt` | `number` | — | 验证码的截止时间，Unix 毫秒。 | `1794873900000` |
| `cooldownUntil` | `number` | — | 最早可重发的时间，Unix 毫秒。 | `1794873660000` |

<a id="一次性验证码和发送等待时间"></a>

#### 示例 · 一次性验证码和发送等待时间

保存某个邮箱或手机号当前的验证码、签发时确定的账号、输错次数和重发时间。

```json
{
  "version": "otp-version-42",
  "subject": { "userId": "user-42", "credentialVersion": "credential-17" },
  "code": "<otp:redacted>",
  "attempts": 0,
  "expiresAt": 1794873900000,
  "cooldownUntil": 1794873660000
}
```

若此记录于 2026-11-17 00:00 UTC 签发，00:01 可重发，00:05 到期。消费时核对联系方式仍唯一对应 `user-42`，凭据代仍为 `credential-17`。

<a id="cache-iam-captcha"></a>

### `hai:iam:captcha:<id>`

`id` 是签发响应中的挑战 ID。签发写入用途、ALTCHA 挑战和验证材料，默认为 120 秒 TTL。通过匹配用途和答案的验证时删除，只有成功删除的一次验证可以通过。错误提交不更新记录，没有独立的尝试次数。多节点从共享缓存核对同一挑战。

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `operation` | `string` | — | 允许 `login`、`register`、`sendOtp`、`passwordReset`、`renewPassword`。 | `login` |
| `challenge` | JSON object | — | 挑战参数，校验答案时使用。 | `{…}` |
| `signatureSecret` | `string` | — | 验证挑战签名的服务端秘密。 | `<secret:redacted>` |
| `keySecret` | `string` | — | 验证派生密钥签名的服务端秘密。 | `<secret:redacted>` |

<a id="本次人机验证的服务端依据"></a>

#### 示例 · 本次人机验证的服务端依据

服务端保存挑战及验证秘密，收到用户答案时检查用途是否匹配，并保证挑战只使用一次。

```json
{
  "operation": "login",
  "signatureSecret": "<secret:redacted>",
  "keySecret": "<secret:redacted>"
}
```

`operation` 为 `login`，挑战只供登录使用。节选省略公开的 `challenge` 并隐藏签名秘密。

<a id="cache-iam-ticket"></a>

### `hai:iam:ticket:sha256:<digest>`

`digest` 是原始票据的 SHA-256 十六进制摘要。IAM 在签发时保存主体、业务用途、授权参数及截止时间。`grant` 省略时写入 `{}`，缺省期限 30000 毫秒。成功消费会原子删除记录，已使用和到期的票据不能继续授权。用途不匹配时保留票据。再认证也用此结构，授权参数另绑定操作、会话版本和凭据代。

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `subjectId` | `string` | — | 签发时已确认的主体。键的 `digest` 由客户端收到的原票据计算。 | `user-42` |
| `purpose` | `string` | — | 票据唯一用途，兑换请求必须匹配。 | `ai-audio` |
| `grant` | JSON object | `{}` | 签发时允许的业务操作、模型、会话等参数。 | `{"operation":"transcribe"}` |
| `expiresAt` | `number` | — | 票据截止时间，Unix 毫秒。 | `1794873630000` |

<a id="短时间内只准用一次的通行票"></a>

#### 示例 · 短时间内只准用一次的通行票

下例绑定 `ai-audio` 用途。兑换方从授权参数读取本次允许的操作。

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

兑换结果授权 `user-42` 进行 `transcribe`。样例截止点对应 2026-11-17 00:00:30 UTC。

<a id="cache-iam-revision"></a>

### `hai:iam:read_cache:revision`

两个服务节点都查过 `user-42` 的权限，记住了这个用户可以读取订单。管理员在节点 A 撤权时，IAM 通过这个共享标记告诉节点 B 何时停止使用缓存，何时可以重新缓存查询结果。账号状态、敏感操作规则和 API Key 的查询结果也使用同一个标记。

<a id="权限读取缓存是否仍可信"></a>

#### 示例 · 权限读取缓存是否仍可信

管理员在节点 A 撤销 `user-42` 的 `orders:read`，节点 B 仍在处理该用户的订单读取请求。

1. **撤权前**，节点 B 可以复用缓存的授权。返回结果前，它再确认标记在这次读取期间没有变化。
2. **事务进行中**，节点 A 在改数据库前先登记写入。节点 B 暂停使用缓存，改查数据库。撤权还没提交时，数据库看到的已提交权限可能仍包含 `orders:read`。
3. **提交后**，节点 A 确认写入结束，两个节点可以把数据库的新结果保存到一批新键中。节点 B 下一次从数据库读到的授权不再包含 `orders:read`。

例如旧键 `hai:iam:read_cache:epoch-42:user_access:user-42` 中的「可以读取订单」最多可保留 60 秒。提交后的新一轮权限检查只查 `hai:iam:read_cache:epoch-44:user_access:user-42`，因此旧键里的结果不会再被采用。

事务回滚时，权限仍在，后续从数据库读取并缓存这一状态。登记写入失败则不执行撤权。若缓存标记读不到，或数据库已提交但无法登记写入结束，读请求继续查数据库。这个共享标记没有到期时间，正在写入时不要手动删除。

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `epoch` | `string` | 首次随机生成 | 当前缓存批次的标识，是查询结果键的一部分。写入开始和结束时都会更换。 | `epoch-42` |
| `writers` | `integer` | `0` | 已登记但尚未确认结束的写入数。大于 `0` 时，各节点直接查数据库。 | `0` |
| `activeWriters` | JSON array | `[]` | 每个在途写入的 ID 和登记时间 `startedAt`，单位 Unix 毫秒。按 ID 释放，时间用于诊断。 | `[{"id":"writer-a","startedAt":1794873600000}]` |

下面是撤权开始前的标记值。

```json
{
  "epoch": "epoch-42",
  "writers": 0,
  "activeWriters": []
}
```

<a id="iam-read-cache-recovery"></a>

#### 恢复长时间未清理的写入登记

账号和权限的 Redis 读缓存需要共享数据库主库和 Redis。写入确认完成后，IAM 按 ID 清理对应登记。Redis 写入回执丢失时，节点会重试清理同一个 ID。数据库提交或回滚结果未知、节点退出时，登记会保留，各节点继续查数据库。长时间未清理会触发告警。

**写入中和恢复后的变化**

撤权开始后，登记增加一条，两个节点都查询数据库。安全恢复后，代次变成新值，登记清空。

```json
{
  "epoch": "epoch-43",
  "writers": 1,
  "activeWriters": [{ "id": "writer-a", "startedAt": 1794873600000 }]
}
```

新生产环境首次启用时，在启动 IAM 节点前建立标记。如果从 Redis 备份恢复，在接入 IAM 流量前先换代。处置卡住的登记时，先停止所有相关 IAM 写入口、后台任务和外部事务调用方，再在数据库主库核实旧事务全部结束。证据不足时保持数据库回源。

准备私有的 `private-cache.json`，内容为应用实际使用的 Redis Cache 配置，Redis 主库、逻辑库和 `keyPrefix` 要相同。预检返回当前 `epoch`、`writers` 和登记。以下例子用 `epoch-43` 表示预检读到的值，首次初始化使用预检返回的 `missing`。确认排空后再应用。

```sh
node ./node_modules/@h-ai/iam/dist/read-cache-maintenance.js --cache private-cache.json
node ./node_modules/@h-ai/iam/dist/read-cache-maintenance.js --cache private-cache.json --apply --expect-epoch epoch-43 --writers-drained
```

应用命令比较读到的完整标记并设置新的随机 `epoch`。核对命令返回 `success: true`、新代次和 `writers: 0` 后再开放流量。若比较失败或命令回执不明，保持维护状态，重新预检并核实事务。旧结果在各自的 TTL 到期后删除。标记缺失或格式无效时，生产读请求查数据库，受保护的写入无法登记。

<a id="cache-iam-result"></a>

### `hai:iam:read_cache:<epoch>:<query>`

以账号 `user-42` 为例，假设 `revision.epoch` 当前为 `epoch-42`。IAM 读的是这个完整键。

```text
hai:iam:read_cache:epoch-42:user_access:user-42
```

- **`<epoch>` 是当前批次号。** IAM 从 `hai:iam:read_cache:revision` 的 `epoch` 字段读取它。这里用 `epoch-42` 便于说明，运行时使用随机 UUID。数据库写入开始和结束时都会换号。
- **`<query>` 是批次号后面的整个键名后缀。** 这里是 `user_access:user-42`，其中 `user_access` 表示账号状态和授权，`user-42` 指定查哪个账号。

旧后缀 `user:v2:user-42` 里的 `v2` 是账号状态缓存值的格式版本。当时 `accountStatus` 等生命周期字段取代了 `enabled`，所以键名加了 `v2` 来区分两种格式。现在账号状态和授权统一存入 `user_access:user-42`，旧键按原来的 60 秒有效期清理。

IAM 只在当前批次没有写入时使用结果缓存。缓存命中时复核批次，缺失时查库。成功结果从写入起保留 60 秒。数据库查询失败时不会发布缓存。

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `value` | object / `string[]` / `null` | — | 成功查询的结果，用此字段包装后保存。 | `{"account":null,"authorization":{"roles":[],"permissions":[]}}` |

| 查询后缀 | 变量来源和结果 |
| --- | --- |
| [`user_access:<userId>`](#短时间复用已查到的账号资料) | `userId` 是账号 ID。`value.account` 保存账号状态，找不到账号时为 `null`。`value.authorization` 保存去重后的 `roles: string[]` 和 `permissions: string[]`。 |
| [`sensitive:<operation>`](#cache-iam-query-sensitive) | `operation` 是要查的操作名，`*` 表示全部。结果为敏感操作名 `string[]`。 |
| [`apikey:<apiKeyId>`](#cache-iam-query-apikey) | `apiKeyId` 来自派生会话。结果为 `userId: string`、`enabled: boolean`、`expiresAt: number \| null` 和 `scopes: string[]`，Key 不存在时为 `null`。 |
| [`verified_apikey:<fingerprint>`](#cache-iam-query-verified-apikey) | `fingerprint` 是原始 Key 的 SHA-256 十六进制摘要。结果保存 `id`、`userId`、`name`、`keyPrefix`、`enabled`、`expiresAt`、`createdAt`、`lastUsedAt` 和 `scopes`。 |

`account` 包含 `username`、`accountType`、`accountStatus`、`accountExpiresAt`、`credentialVersion`、`mustChangePassword`、`hasPassword`、`passwordUpdatedAt`，以及可选的 `displayName` 和 `avatarUrl`。验签按当前时间检查有效期，并以 `credentialVersion` 核对已有会话。

此表的数值日期为 Unix 毫秒。验证 Key 投影的日期缺失时写入 `null`，字段语义与公开的 Key 元数据一致。

<a id="短时间复用已查到的账号资料"></a>

#### 示例 · 一次读取账号状态和权限

下例是 `hai:iam:read_cache:epoch-42:user_access:user-42` 的完整值。请求读取这条记录时，可以用 `account` 核对账号，再用 `authorization` 检查 `orders:read`。

```json
{
  "value": {
    "account": {
      "username": "example-user",
      "displayName": "Example User",
      "accountType": "permanent",
      "accountStatus": "active",
      "accountExpiresAt": null,
      "credentialVersion": "credential-17",
      "mustChangePassword": false,
      "hasPassword": true,
      "passwordUpdatedAt": 1794873600000
    },
    "authorization": {
      "roles": [
        "reader"
      ],
      "permissions": [
        "orders:read"
      ]
    }
  }
}
```

`hasPassword` 只记录本地密码是否存在。密码摘要、令牌和重置凭据由各自的存储管理。

<a id="cache-iam-query-sensitive"></a>

#### 示例 · 查询哪些操作需要再认证

IAM 从数据库权限记录里查 `orders.cancel`，下面的结果表示这项操作已登记为敏感操作。

```text
hai:iam:read_cache:epoch-42:sensitive:orders.cancel
```

```json
{
  "value": ["orders.cancel"]
}
```

`sensitive:*` 使用字面上的 `*` 作为键名的一部分，对应读取数据库里登记的全部敏感操作。应用读取公开策略时，会再合并配置文件里的操作清单。

```text
hai:iam:read_cache:epoch-42:sensitive:*
```

```json
{
  "value": ["orders.cancel", "profile.update"]
}
```

<a id="cache-iam-query-apikey"></a>

#### 示例 · 检查 API Key 登录后的会话

会话里记录的 `apiKeyId` 是 `apikey-42`。IAM 用下面的键查该 Key 是否仍属于当前用户、仍启用、未到期，以及当前允许的操作。

```text
hai:iam:read_cache:epoch-42:apikey:apikey-42
```

```json
{
  "value": {
    "userId": "user-42",
    "enabled": true,
    "expiresAt": null,
    "scopes": ["orders:read"]
  }
}
```

`expiresAt: null` 表示该 Key 没有单独设置截止时间。

<a id="cache-iam-query-verified-apikey"></a>

#### 示例 · 识别请求里提交的 API Key

收到原始 API Key 时，IAM 先算 SHA-256 摘要，再用这条键复用已经验证过的 Key 元数据。下例使用虚构的 64 位十六进制摘要。

```text
hai:iam:read_cache:epoch-42:verified_apikey:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

```json
{
  "value": {
    "id": "apikey-42",
    "userId": "user-42",
    "name": "Example API",
    "keyPrefix": "<prefix:redacted>",
    "enabled": true,
    "expiresAt": null,
    "createdAt": 1794873600000,
    "lastUsedAt": null,
    "scopes": ["orders:read"]
  }
}
```

这里用请求携带的 Key 算出的摘要定位记录。上一例则从已建立的会话中取 `apiKeyId` 定位记录。

<a id="file-and-runtime-data"></a>

## 文件和运行时数据

IAM 没有自有数据文件。SQLite 文件由应用在 RelDB 配置中选择，Redis 和生产数据库由部署方管理。IAM 启动时读取应用传入的配置，运行时维护校验后的配置、仓库引用和可选的闲置账号扫描。关闭 IAM 会停止扫描和释放本地引用，已提交的数据库行和 Redis 记录仍按各自的期限与撤销规则处理。[模块配置](../configuration/iam.md)

应用使用服务端 `iam.user`、`iam.authz`、`iam.session` 或 `iam.apiKey` 读取数据。通知和审计记录由宿主启用的模块保存。通知投递使用 [Reach 数据结构](reach.md)，审计事件使用 [Audit 数据结构](audit.md)。

<a id="public-responses"></a>

## 公开接口响应

下列为 `HaiResult` 的成功响应节选，调用方先检查 `success`。失败时读取 `error.code`。TypeScript 返回的 `Date` 在 JSON 中以 ISO 8601 表示，声明为 Unix 毫秒的数值字段仍是数字。访问令牌、刷新令牌、一次性票据和新发 Key 只交给预期的受信调用方。公开页面按需选择展示字段。

<a id="response-login"></a>

### 登录和权限

`iam.auth.login()` 返回用户、令牌对以及本次签发用的角色和权限。对后续受保护请求使用 `iam.auth.verifyToken()` 获取当前授权。下面的 `expiresIn` 以秒为单位，是签发的 access 时长。独立闲置或绝对期限也会限制认证。

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-42",
      "username": "example-user",
      "accountStatus": "active"
    },
    "tokens": {
      "accessToken": "<access-token:redacted>",
      "refreshToken": "<refresh-token:redacted>",
      "expiresIn": 86400,
      "tokenType": "Bearer"
    },
    "roles": [
      "reader"
    ],
    "permissions": [
      "orders:read"
    ]
  }
}
```

<a id="response-refresh"></a>

### 会话刷新

`iam.session.refresh()` 返回新令牌对。成功后替换原 access 和 refresh，旧值不再有效。

```json
{
  "success": true,
  "data": {
    "accessToken": "<new-access-token:redacted>",
    "refreshToken": "<new-refresh-token:redacted>",
    "expiresIn": 86400,
    "tokenType": "Bearer"
  }
}
```

<a id="response-user"></a>

### 读取或更新资料

`iam.user.getUser()` 返回 `User | null`。成功且 `data: null` 表示没有此账号。以下是读取或 `iam.user.updateCurrentUser()` 成功时的资料字段。联系方式实际变化时，变更照常返回资料，旧会话随后失效。

```json
{
  "success": true,
  "data": {
    "id": "user-42",
    "username": "example-user",
    "email": "reader@example.invalid",
    "displayName": "Example User",
    "accountType": "permanent",
    "accountStatus": "active",
    "createdAt": "2026-11-17T00:00:00.000Z",
    "updatedAt": "2026-11-17T00:00:00.000Z"
  }
}
```

<a id="response-api-key"></a>

### API Key 签发

`iam.apiKey.createApiKey()` 返回公开元数据以及只在此处出现的 `rawKey`。`listApiKeys()` 和 `getApiKey()` 不包含该值或密钥摘要。

```json
{
  "success": true,
  "data": {
    "apiKey": {
      "id": "apikey-42",
      "userId": "user-42",
      "name": "Example API",
      "keyPrefix": "<prefix:redacted>",
      "enabled": true,
      "expiresAt": null,
      "createdAt": "2026-11-17T00:00:00.000Z",
      "lastUsedAt": null,
      "scopes": [
        "orders:read"
      ]
    },
    "rawKey": "<api-key:redacted>"
  }
}
```

<a id="response-ticket"></a>

### 查验票据和人机挑战

`iam.ticket.issue()` 返回原始票据与 Unix 毫秒截止点。`iam.ticket.consume()` 成功返回服务端绑定的 `subjectId`、`purpose` 和 `grant`。如以 AI 语音转写为用途，受信服务从兑换结果读取操作与主体。`iam.auth.createCaptcha()` 的公开数据为 `id` 与 `challenge`，界面发送挑战答案，服务器验证秘密保留在缓存。

```json
{
  "success": true,
  "data": {
    "ticket": "<one-time-ticket:redacted>",
    "expiresAt": 1794873630000
  }
}
```

<a id="response-public-config"></a>

### 认证页面配置

`iam.getPublicConfig()` 返回可公开的设置，敏感操作清单合并数据库配置。页面用 `login` 和 `passwordReset` 判断是否提供各登录及找回入口。缓存内容、凭据及连接地址均留在服务端。

```json
{
  "success": true,
  "data": {
    "captcha": {
      "enabled": true
    },
    "login": {
      "password": true,
      "otp": true,
      "ldap": false,
      "email": true,
      "sms": false
    },
    "passwordReset": {
      "enabled": true,
      "mode": "email"
    },
    "session": {
      "maxAge": 86400,
      "endOnPageHide": false
    }
  }
}
```
