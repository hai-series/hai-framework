# @h-ai/iam Data Structures

[简体中文](iam.md) · [日本語](iam.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/iam.en.md) · [API reference](../function/iam.en.md)

Take the order reader `user-42`. Their account row determines whether they can sign in, and their role assignments determine whether they can read orders. After sign-in, IAM writes a session to the shared cache. Changing a password, rebinding contact details, or changing account state advances the credential version, so the old session can no longer authenticate. The examples share one fictional account, role, and permission. Stored records are excerpts with secrets redacted.

## Database

[RelDB](reldb.en.md) is authoritative for accounts and authorization. Use IAM user and authorization operations for writes so IAM maintains associations and invalidates affected cached reads. The tables use RelDB logical types. A dash in the SQL default column means there is no explicit default. A nullable column is `NULL` when neither the application nor the database supplies a value.

IAM uses seven tables. It prepares the five base tables during `iam.init()`. It prepares the API Key table when `login.apikey` is enabled, and the LDAP identity table when `login.ldap` is enabled and a directory is configured. Trusted LDAP identity import also prepares the LDAP table.

| Table | Purpose |
| --- | --- |
| [`hai_iam_users`](#table-hai-iam-users) | Store account details, status, credential hashes and login protection state. |
| [`hai_iam_roles`](#table-hai-iam-roles) | Define roles that can be assigned to accounts. |
| [`hai_iam_permissions`](#table-hai-iam-permissions) | Define individual permissions the application checks. |
| [`hai_iam_user_roles`](#table-hai-iam-user-roles) | Look up which roles were granted to a user. |
| [`hai_iam_role_permissions`](#table-hai-iam-role-permissions) | Look up the permissions granted by a role. |
| [`hai_iam_api_keys`](#table-hai-iam-api-keys) | Look up a programmatic credential's owner, hash and scopes. |
| [`hai_iam_ldap_identities`](#table-hai-iam-ldap-identities) | Link a stable directory identity to a local account. |

<a id="table-hai-iam-users"></a>

### `hai_iam_users`

`id` is the primary key and `username` has a database uniqueness constraint. Email and phone have no column-level uniqueness constraint. Account operations enforce their business rules, and OTP requires a unique normalized contact on its channel. SQLite stores `TIMESTAMP` as Unix milliseconds, `BOOLEAN` as an integer, and `JSON` as text. PostgreSQL uses `TIMESTAMP`, `BOOLEAN`, and `JSONB`. MySQL maps logical `TEXT` to `VARCHAR(255)` and uses `DATETIME`, `TINYINT(1)`, and `JSON`. Examples express the shared meaning with ISO 8601 dates, booleans, and JSON.

On account creation IAM generates the ID and writes the creation and update times. Self-service registration normally writes `permanent` and `register.defaultAccountStatus`. Administrators can set the type, state, and expiry, and a temporary account requires an expiry. Password registration sets the hash and password-set time and starts with both contact flags `false`. OTP-only or LDAP-only accounts can have no local password. SQL initializes credential and reset versions to `""`, and later security operations write new versions.

RelDB uses `login_lockout_version` to select the account’s [login failure record](#cache-iam-login-failures). Confirming a password reset writes a new UUID in the same SQL statement that saves the new password. Later authentication reads the new version and the previous key expires on its original deadline. Ordinary profile updates and administrator password changes preserve the existing lockout deadline.

Requesting a password reset sets `reset_attempts` to `0`, and checking the current valid token consumes one attempt. Users need a new token after expiry or exhaustion. A successful reset clears the hash and expiry and advances the credential version. The inactivity scan marks eligible active accounts `dormant` according to `accounts.dormantAfterDays` and advances their credential versions. Expired and dormant account rows remain until an administrator deletes them.

| Column | Type | Nullable | SQL default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | User primary key. | `user-42` |
| `username` | `TEXT` | No | — | Unique username used to sign in. | `example-user` |
| `email` | `TEXT` | Yes | — | Email address. | `null` |
| `phone` | `TEXT` | Yes | — | Phone number. | `NULL` |
| `display_name` | `TEXT` | Yes | — | Display name. | `Example User` |
| `avatar_url` | `TEXT` | Yes | — | Avatar URL. | `https://images.example.invalid/user-42.png` |
| `email_verified` | `BOOLEAN` | Yes | `false` | Whether the email address is verified. | `false` |
| `phone_verified` | `BOOLEAN` | Yes | `false` | Whether the phone number is verified. | `false` |
| `password_hash` | `TEXT` | Yes | — | Password hash. NULL is possible for accounts without a local password. | `null` |
| `password_updated_at` | `TIMESTAMP` | Yes | — | Time the password was last set. | `NULL` |
| `login_lockout_version` | `TEXT` | No | `initial` | Selects the current login failure record. Confirming a password reset writes a new UUID. | `initial` |
| `metadata` | `JSON` | Yes | — | Application-specific user details. | `{"department":"Support"}` |
| `created_at` | `TIMESTAMP` | No | — | Account creation time. | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | No | — | Account's last update time. | `2026-11-17T00:00:00Z` |
| `must_change_password` | `BOOLEAN` | No | `false` | Whether the next sign-in requires a password change. | `false` |
| `account_type` | `TEXT` | No | `permanent` | `permanent` or `temporary`. | `permanent` |
| `account_status` | `TEXT` | No | `active` | `active`, `dormant`, or `closed`. | `active` |
| `account_expires_at` | `TIMESTAMP` | Yes | — | Account expiry time. | `NULL` |
| `last_login_at` | `TIMESTAMP` | Yes | — | Time of the most recent successful sign-in. | `2026-11-17T00:00:00Z` |
| `credential_version` | `TEXT` | No | `""` | Changes when credentials change so IAM can invalidate old sessions. | `<credential-version>` |
| `reset_version` | `TEXT` | No | `""` | Version of the current password-reset request. | `<reset-version>` |
| `reset_hash` | `TEXT` | Yes | — | Digest of the reset credential. | `NULL` |
| `reset_expires_at` | `BIGINT` | Yes | — | Reset credential expiry in Unix milliseconds. | `1794874500000` |
| `reset_attempts` | `INTEGER` | No | `0` | Number of attempts to verify the current reset credential. | `0` |

<a id="example-data"></a>

<a id="the-user-account"></a>

#### Example · The user account

Store identity and whether the account may be used; login and authorization check it.

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

`user-42` is an active permanent account. The email address is fictional and the password hash is redacted. Role and permission codes come from the association rows below.

<a id="table-hai-iam-roles"></a>

### `hai_iam_roles`

`id` is the primary key and `code` is unique. IAM generates the ID and writes both timestamps on creation. It removes user and permission associations when deleting a role and restricts deletion of system roles.

| Column | Type | Nullable | SQL default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Role primary key. | `role-reader` |
| `code` | `TEXT` | No | — | Unique role code checked by the application. | `reader` |
| `name` | `TEXT` | No | — | Role display name. | `Reader` |
| `description` | `TEXT` | Yes | — | Description of the role. | `Can read orders` |
| `is_system` | `BOOLEAN` | Yes | `false` | Whether it is a system role. | `false` |
| `created_at` | `TIMESTAMP` | No | — | Role creation time. | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | No | — | Role's last update time. | `2026-11-17T00:00:00Z` |

<a id="roles-assignable-to-users"></a>

#### Example · Roles assignable to users

Name a set of responsibilities so several users can receive the same permissions.

```json
{
  "id": "role-reader",
  "code": "reader",
  "name": "Reader",
  "is_system": false
}
```

`role-reader` has code `reader` and display name Reader. `is_system` is `false`.

<a id="table-hai-iam-permissions"></a>

### `hai_iam_permissions`

`id` is the primary key and `code` is unique. IAM generates the ID and writes both timestamps on creation. Deleting a permission through IAM also removes its role associations. `type` can be `menu`, `api`, or `button`. `sensitive_operations` lists operation names the authorization service uses to require fresh authentication.

| Column | Type | Nullable | SQL default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Permission primary key. | `permission-read` |
| `code` | `TEXT` | No | — | Unique permission code. | `orders:read` |
| `name` | `TEXT` | No | — | Permission display name. | `Read orders` |
| `description` | `TEXT` | Yes | — | Description of what the permission allows. | `Read order details` |
| `resource` | `TEXT` | Yes | — | Type of resource being accessed. | `orders` |
| `action` | `TEXT` | Yes | — | Allowed action. | `read` |
| `type` | `TEXT` | Yes | — | Permission type used by the application for classification. | `NULL` |
| `sensitive_operations` | `JSON` | Yes | — | Sensitive-operation settings for the permission. | `NULL` |
| `created_at` | `TIMESTAMP` | No | — | Permission creation time. | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | No | — | Permission's last update time. | `2026-11-17T00:00:00Z` |

<a id="individual-application-permissions"></a>

#### Example · Individual application permissions

Give a protected operation a stable permission code checked by the server.

```json
{
  "id": "permission-read",
  "code": "orders:read",
  "name": "Read orders",
  "resource": "orders",
  "action": "read"
}
```

`orders:read` means reading orders. `resource` is `orders` and `action` is `read`. Granting it also requires a role association.

<a id="table-hai-iam-user-roles"></a>

### `hai_iam_user_roles`

The unique index `idx_user_role_user_role` covers `(user_id, role_id)`, and `idx_user_role_user` supports lookup by user. These columns refer to the user and role IDs. IAM removes the association when either record is deleted.

| Column | Type | Nullable | SQL default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `TEXT` | No | — | User ID in the unique user-role pair. Indexed for lookup. | `user-42` |
| `role_id` | `TEXT` | No | — | Granted role ID in the unique pair with `user_id`. | `role-reader` |

<a id="which-user-has-which-role"></a>

#### Example · Which user has which role

Link users to roles without duplicating all role details in each user row.

```json
{
  "user_id": "user-42",
  "role_id": "role-reader"
}
```

`user-42` receives `role-reader`. This pair is stored once.

<a id="table-hai-iam-role-permissions"></a>

### `hai_iam_role_permissions`

The unique index `idx_role_perm_role_perm` covers `(role_id, permission_id)`, and `idx_role_perm_role` supports lookup by role. These columns refer to the role and permission IDs. IAM removes the association when either record is deleted.

| Column | Type | Nullable | SQL default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `role_id` | `TEXT` | No | — | Role ID in the unique role-permission pair. Indexed for lookup. | `role-reader` |
| `permission_id` | `TEXT` | No | — | Granted permission ID in the unique pair with `role_id`. | `permission-read` |

<a id="which-role-includes-which-permission"></a>

#### Example · Which role includes which permission

Link roles to permissions when calculating what a user may do.

```json
{
  "role_id": "role-reader",
  "permission_id": "permission-read"
}
```

`role-reader` includes `permission-read`. Together with the preceding user-role link, `user-42` gains `orders:read`.

<a id="table-hai-iam-api-keys"></a>

### `hai_iam_api_keys`

`id` is the primary key. `user_id` identifies the owning account checked during authentication. IAM finds candidates by `key_prefix` and then checks the hash. On issue IAM writes a generated ID, creation time, `enabled: true`, and `last_used_at: NULL`. Omitting scopes writes an empty array. With no expiry requested and the default expiry policy, IAM writes `expires_at: NULL`. The default quota counts up to 10 rows per user, including disabled and expired keys. Revoking a key deletes its row. Deleting the owner prevents the key from authenticating. The table has no delete cascade from the user.

`verifyApiKey` calculates the intersection of the account’s current grants and the key’s scopes at verification time. The row stores the key’s own scopes. [Programmatic credentials](../function/iam.en.md#api-keys)

| Column | Type | Nullable | SQL default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | API key primary key. | `apikey-42` |
| `user_id` | `TEXT` | No | — | ID of the user who owns the API key. | `user-42` |
| `name` | `TEXT` | No | — | Display name used to identify the key. | `Example API` |
| `key_hash` | `TEXT` | No | — | Hash used to verify the API key. | `<hash:redacted>` |
| `key_prefix` | `TEXT` | No | — | Key prefix for display. | `<prefix:redacted>` |
| `enabled` | `BOOLEAN` | No | `true` | Whether the API key is enabled. | `true` |
| `expires_at` | `TIMESTAMP` | Yes | — | API key expiry time. | `null` |
| `created_at` | `TIMESTAMP` | No | — | API key issuance time. | `2026-11-17T00:00:00Z` |
| `last_used_at` | `TIMESTAMP` | Yes | — | Last used time. | `NULL` |
| `scopes` | `JSON` | Yes | — | Permission scopes configured for the API key. | `["orders:read"]` |

<a id="credentials-for-programmatic-calls"></a>

#### Example · Credentials for programmatic calls

Allow a script to call limited APIs for a user, storing a digest for verification.

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

`apikey-42` belongs to `user-42` and is scoped to `orders:read`. The example redacts `key_hash` and `key_prefix`.

<a id="table-hai-iam-ldap-identities"></a>

### `hai_iam_ldap_identities`

`idx_ldap_identity_entry` and `idx_ldap_identity_user` enforce uniqueness of `(directory_id, entry_id)` and `(directory_id, user_id)` respectively. The `user_id` foreign key references `hai_iam_users.id` and cascades on account deletion. The directory ID comes from `ldap.directoryId` or the import input. The entry ID is the directory’s stable identifier. The application writes all three IDs when it creates the binding. Changing the directory login name or DN preserves that binding.

| Column | Type | Nullable | SQL default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `directory_id` | `TEXT` | No | — | Directory ID used to distinguish LDAP directories. | `company-directory` |
| `entry_id` | `TEXT` | No | — | Stable entry ID in the unique pair with `directory_id`. | `3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76` |
| `user_id` | `TEXT` | No | — | References the local user. Unique with `directory_id`. Deleting the user also removes the binding. | `user-42` |

IAM returns the original API key only when issuing it. Update accounts, roles, and permissions through APIs such as `iam.user` and `iam.authz` so IAM can update the related sessions and cache.

<a id="bind-a-directory-entry-to-a-local-account"></a>

#### Example · Bind a directory entry to a local account

The company directory’s stable entry ID is bound to `user-42`. The same binding is used after a directory rename.

```json
{
  "directory_id": "company-directory",
  "entry_id": "3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76",
  "user_id": "user-42"
}
```

<a id="data-fields"></a>

## Cache

IAM writes seven families of server-side cache records. Production nodes share one Redis service and logical namespace. Development and tests can use single-process Memory. When [Cache](cache.en.md) is configured with `keyPrefix`, Redis keys also include that prefix. Defaults in the cache tables describe what IAM writes to new records.

| Key or family | Purpose | Default expiry and cleanup |
| --- | --- | --- |
| [`hai:iam:sessions:{<scope-digest>}`](#cache-iam-sessions) | Keep active sessions and refresh credentials for one user scope together. | Expires with the last valid access or refresh credential. Deleted when no sessions remain. Sliding expiry follows session settings. |
| [`hai:iam:login_failures:<userId>:<lockoutVersion>`](#cache-iam-login-failures) | Share failure counts and lockout deadlines across nodes. | Expires at the end of the fixed window or, once locked, at the lockout deadline. |
| [`hai:iam:otp:<identifier>`](#cache-iam-otp) | Store the current code and the account resolved for a normalized contact, and limit attempts and resends. | Code defaults to 300 seconds, resend cooldown to 60 seconds. The key lasts until the later deadline. Use or exhausted attempts clears the code. |
| [`hai:iam:captcha:<id>`](#cache-iam-captcha) | Verify a challenge's purpose, solution and validity. | `captcha.ttlSeconds` defaults to 120 seconds. Verification consumes the key. Expiry requires a new challenge. |
| [`hai:iam:ticket:sha256:<digest>`](#cache-iam-ticket) | Allow one short-lived exchange for a specific purpose. | Defaults to 30 seconds, configurable via `ttlMs`. Deleted atomically on successful exchange. |
| [`hai:iam:read_cache:revision`](#cache-iam-revision) | Identify which batch of cached account and permission data is usable. | No automatic expiry. Writes change the generation. |
| [`hai:iam:read_cache:<epoch>:<query>`](#cache-iam-result) | Briefly reuse successful account or permission reads. | Expires 60 seconds after a write. A generation change immediately bypasses old keys. |

<a id="cache-iam-sessions"></a>

### `hai:iam:sessions:{<scope-digest>}`

Both access and refresh tokens use the format `s1.<scope-digest>.<random>`. Each token gets its own random value. The `scope-digest` is the hexadecimal SHA-256 digest of the user ID. When a request arrives, IAM can read those 64 characters directly from the token to find the session document, saving a lookup from token to user ID. It then matches the **full token** against the session in that document.

For example, hashing `user-42` produces the key below. With the default key name, Redis Cluster uses the content inside the braces to select the slot. A user's access and refresh credentials share one document, updated atomically with a single-key compare-and-swap.

```text
hai:iam:sessions:{6d894aa3ee802549d7f340e7c1cf0d1c1cb14cd84f768d92ffaa6785337c4997}
```

By the time IAM reads the account and authorization cache, it already has the user ID. At the earlier session lookup, the current token supplies the digest. Using the raw user ID as the session key would require an encoded ID in the token or a separate lookup to resolve the ID. The digest gives the token's routing segment a fixed length and alphabet. The user ID is stored inside the session document.

A new access token lasts 86,400 seconds by default and refresh lasts 604,800 seconds. Sliding access expiry is on by default. A valid refresh can rotate an expired access token. Rotation replaces both tokens and preserves the first issue time. Idle and absolute limits, when enabled, apply to both tokens. Automatic rotation and role synchronization leave user activity unchanged. [Session deadlines and configuration example](../configuration/iam.en.md#session-deadlines)

Without an idle timeout, `session.touchMinInterval` coalesces sliding writes. Session lookup and verification return the activity and expiry timestamps committed to Redis.

Quotas count valid sessions per user in the current credential version. Sessions with expired access but usable refresh still count. The default `maxSessions: 0` is unlimited. `terminalLimits` defaults to `{}`. When configured, new logins must use a listed terminal. Single-device mode is off by default. Its `replace` option replaces sessions in the same credential version, while `reject` declines repeated sign-in. Explicit sign-out removes both tokens. Revoking refresh alone preserves access. An empty document is deleted. Other documents receive a TTL through the latest access or refresh retention deadline. Later writes prune expired entries.

In the table, `sessions.*` refers to the entry under any access-token key. Verification looks up the entry using the full access token from the request and fills `Session.accessToken` from that key. Refresh finds the entry by its `refreshToken`, then uses the access key to remove the old entry and store the replacement atomically. The result of `iam.session.create()` passes the newly issued pair to sign-in in `data._tokenPair`. Redis stores the access token as the entry key and the refresh token alongside the session.

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `revision` | `string` | — | Snapshot revision, changed on each write to prevent overwriting an intervening update. | `revision-42` |
| `sessions` | JSON object | — | Access-token keys map to the sessions in this scope. | `{"<access-token:redacted>":{…}}` |
| `sessions.*.refreshToken` | `string` | — | Stores the refresh credential for a refreshable session. | `<refresh-token:redacted>` |
| `sessions.*.refreshExpiresAt` | `number` | — | Refresh credential deadline in Unix milliseconds. Defaults to seven days from issuance. | `1795478400000` |
| `sessions.*.session` | JSON object | — | Session snapshot used for authentication and authorization. Fields are below. | `{"userId":"user-42",…}` |
| `session.userId` | `string` | — | Signed-in user ID. The `session.*` paths below belong to one entry. | `user-42` |
| `session.username` | `string` | — | Optional username. | `example-user` |
| `session.displayName` | `string` | — | Optional display name. | `Example User` |
| `session.avatarUrl` | `string` | — | Optional avatar URL. | `https://images.example.invalid/user-42.png` |
| `session.version` | `string` | — | Updated when a session is explicitly changed. Sliding refresh preserves it. | `session-version-42` |
| `session.credentialVersion` | `string` | — | Credential version bound at issuance, used to refuse old sessions after a password change. | `credential-version-42` |
| `session.terminalType` | `string` | `web` / `api` | `web`, `app`, `desktop`, or `api`. When omitted, password and other standard sign-ins use `web`, while API Key sign-in uses `api`. | `web` |
| `session.apiKeyId` | `string` | — | Bound key ID on sessions issued from an API key. | `apikey-42` |
| `session.apiKeyScopes` | `string[]` | — | Optional scopes copied when issuing a session from an API Key. | `["orders:read"]` |
| `session.roles` | `string[]` | `[]` | Provided by authorization or the creation input. Omission writes `[]`. | `["reader"]` |
| `session.permissions` | `string[]` | `[]` | Provided by authorization or the creation input. Omission writes `[]`. | `["orders:read"]` |
| `session.source` | `string` | — | Optional sign-in source. | `pc` |
| `session.createdAt` | ISO date string | — | Current issuance time. | `2026-11-17T00:00:00.000Z` |
| `session.startedAt` | ISO date string | — | First issuance time, preserved on refresh. | `2026-11-17T00:00:00.000Z` |
| `session.lastActiveAt` | ISO date string | — | Most recent activity time, used to apply idle deadlines. | `2026-11-17T00:00:00.000Z` |
| `session.expiresAt` | ISO date string | — | Access session expiry. | `2026-11-18T00:00:00.000Z` |
| `session.maxAge` | `number` | `86400` | Access lifetime in seconds. Creation can override it. The session keeps that lifetime. | `86400` |
| `session.data` | JSON object | — | Optional application data. | `{"theme":"dark"}` |

<a id="the-users-active-login-sessions"></a>

#### Example · The user’s active login sessions

This Redis record shows a session issued to `user-42`. Both tokens are redacted. Verification, refresh, and sign-out use the same user record.

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

The example access token expires at 2026-11-18 00:00 UTC. `refreshExpiresAt` corresponds to 2026-11-24 00:00 UTC.

<a id="cache-iam-login-failures"></a>

### `hai:iam:login_failures:<userId>:<lockoutVersion>`

`userId` comes from `hai_iam_users.id` and `lockoutVersion` from the same row’s `login_lockout_version`. With `security.lockoutEnabled` enabled, qualifying failures are written only to shared Redis. The first failure starts a fixed window. Further failures keep its original end time. The window defaults to 86,400 seconds, with five failures triggering a 900-second lock. An unlocked record expires at the end of the window, and a locked record expires at `lockedUntil`. The next qualifying failure after expiry starts at one.

Redis atomically compares and updates failures from all nodes and sets the lockout at the threshold. Once the credential check passes, IAM uses the same atomic comparison to clear the record. Authentication still fails if another node has already locked the account. Disabling the policy skips this record. If Redis fails, authentication subject to the policy fails without falling back to the database or local memory. Use reliable persistence and `noeviction` on production Redis to preserve active lockout records.

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `revision` | `string` | Random on creation | Revision of the current record, used to detect concurrent changes during an atomic comparison. | `failure-revision-42` |
| `count` | `number` | `1` | Number of qualifying failures in the fixed window. | `5` |
| `firstFailedAt` | `number` | Time of first failure | Start of the fixed counting window in Unix milliseconds. | `1794873600000` |
| `lastFailedAt` | `number` | Time of first failure | Most recent counted failure in Unix milliseconds. | `1794873780000` |
| `lockedUntil` | `number` / `null` | `null` | Lockout deadline in Unix milliseconds. `null` means unlocked. | `1794874680000` |

<a id="lockout-record-at-the-failure-threshold"></a>

#### Example · Two nodes share the lockout deadline

`user-42` still has version `initial`. The first failure is recorded at 00:00 UTC on 2026-11-17, and another node records the fifth at 00:03. All nodes read `hai:iam:login_failures:user-42:initial` and find the account locked until 00:18 UTC.

```json
{
  "revision": "failure-revision-42",
  "count": 5,
  "firstFailedAt": 1794873600000,
  "lastFailedAt": 1794873780000,
  "lockedUntil": 1794874680000
}
```

The record expires at 00:18 UTC. If the user confirms a password reset first, IAM looks up the new version and the previous key’s deadline no longer affects authentication.

<a id="cache-iam-otp"></a>

### `hai:iam:otp:<identifier>`

`identifier` is the normalized email address or phone number on the selected channel. A new issue writes a new version, the bound subject, the code, `attempts: 0`, and both deadlines. Checking a current challenge counts an attempt atomically. A correct submission or reaching `otp.maxAttempts` clears the code. The default cap is three attempts. An incorrect attempt on a current challenge can also affect the separate account sign-in count. A new issue replaces the challenge and resets its count. Sending too soon returns a cooldown error. A spent code retains the cooldown, and the key expires when both periods have elapsed. All nodes use the same record.

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `version` | `string` | — | Issuance version of the current code. `identifier` is the normalized email or phone. | `otp-version-42` |
| `subject` | `{ userId: string, credentialVersion: string }` / `null` | — | User ID and credential version at issuance. `null` limits the code to first-time registration. Older records missing this field cannot authorize sign-in. | `{ "userId": "user-42", "credentialVersion": "credential-17" }` |
| `code` | `string` / `null` | — | Active code, cleared on consumption or exhausted attempts. | `<otp:redacted>` |
| `attempts` | `integer` | `0` | Verification attempts for this issuance. Starts at `0`. | `0` |
| `expiresAt` | `number` | — | Expiry time of the code in Unix milliseconds. | `1794873900000` |
| `cooldownUntil` | `number` | — | Earliest resend time in Unix milliseconds. | `1794873660000` |

<a id="one-time-code-and-resend-delay"></a>

#### Example · One-time code and resend delay

The record tracks the current code for one contact, the account resolved at issuance, failed attempts, and when another code may be sent.

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

For issuance at 2026-11-17 00:00 UTC, resending is available at 00:01 and the code expires at 00:05. On redemption, IAM checks that the contact still resolves uniquely to `user-42` and the credential version remains `credential-17`.

<a id="cache-iam-captcha"></a>

### `hai:iam:captcha:<id>`

`id` is the challenge ID from the issue response. The record contains the purpose, ALTCHA challenge, and verification material with a default TTL of 120 seconds. After the purpose and answer match, IAM removes the record. Only the verification that removes it can succeed. Incorrect submissions leave the record unchanged and have no separate counter. Nodes verify the same challenge in the shared cache.

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `operation` | `string` | — | Allowed values are `login`, `register`, `sendOtp`, `passwordReset`, and `renewPassword`. | `login` |
| `challenge` | JSON object | — | Challenge parameters used to verify the solution. | `{…}` |
| `signatureSecret` | `string` | — | Server-only secret for the challenge signature. | `<secret:redacted>` |
| `keySecret` | `string` | — | Server-only secret for the derived key signature. | `<secret:redacted>` |

<a id="server-record-for-a-captcha-challenge"></a>

#### Example · Server record for a CAPTCHA challenge

Keep the challenge and server secrets to check the intended operation and one-time use.

```json
{
  "operation": "login",
  "signatureSecret": "<secret:redacted>",
  "keySecret": "<secret:redacted>"
}
```

`operation: login` restricts this challenge to sign-in. The excerpt omits the public `challenge` and redacts the signing secrets.

<a id="cache-iam-ticket"></a>

### `hai:iam:ticket:sha256:<digest>`

`digest` is the hexadecimal SHA-256 digest of the original ticket. Issuing records the subject, purpose, grant, and expiry. Omitted `grant` becomes `{}`, and the default lifetime is 30,000 milliseconds. Successful consumption deletes the record atomically. A purpose mismatch leaves the ticket in place. Fresh-authentication tickets use the same format and bind the operation, session version, and credential version in the grant.

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `subjectId` | `string` | — | Subject verified at issue time. The key `digest` comes from the original ticket sent to the client. | `user-42` |
| `purpose` | `string` | — | Single purpose the exchange must match. | `ai-audio` |
| `grant` | JSON object | `{}` | Allowed operations, models, sessions or other parameters at issuance. | `{"operation":"transcribe"}` |
| `expiresAt` | `number` | — | Ticket deadline in Unix milliseconds. | `1794873630000` |

<a id="a-short-lived-one-use-ticket"></a>

#### Example · A short-lived one-use ticket

This record binds the `ai-audio` purpose. The receiving service reads the permitted operation from the grant.

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

The exchange grants `user-42` the `transcribe` operation. The illustrated deadline is 2026-11-17 00:00:30 UTC.

<a id="cache-iam-revision"></a>

### `hai:iam:read_cache:revision`

Two service nodes have looked up `user-42` and cached that this user can read orders. When an administrator revokes access on node A, IAM uses this shared marker to tell node B when to stop using cached results and when it can cache new ones. The same marker covers queries for account status, sensitive-operation rules and API keys.

<a id="whether-cached-permissions-remain-current"></a>

#### Example · Whether cached permissions remain current

An administrator revokes `orders:read` from `user-42` on node A while node B handles this user’s requests to read orders.

1. **Before the change**, node B can use the cached grants. It checks that the marker has stayed the same before returning a cached result.
2. **During the transaction**, node A registers the write before updating the database. Node B pauses cache use and queries the database. Until the revocation commits, the committed grants visible to node B may still include `orders:read`.
3. **After commit**, node A confirms the write has ended, and both nodes can cache new database results under a fresh set of keys. On its next database lookup, node B sees grants without `orders:read`.

For example, “can read orders” can remain under `hai:iam:read_cache:epoch-42:user_access:user-42` for up to 60 seconds. After commit, new permission checks look only under `hai:iam:read_cache:epoch-44:user_access:user-42`, so they leave the old result unused.

If the transaction rolls back, the grant remains and later lookups can cache that database state. If IAM cannot register the write, the revocation stops before updating the database. When the marker cannot be read, or a committed change cannot be marked complete, readers keep querying the database. The marker has no expiry. Leave it in place while writes are in progress.

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `epoch` | `string` | Randomly generated at initialization | Identifies the current set of cache keys. It changes at the start and end of a write. | `epoch-42` |
| `writers` | `integer` | `0` | Counts registered writes whose completion has yet to be confirmed. When greater than `0`, nodes query the database. | `0` |
| `activeWriters` | JSON array | `[]` | Each in-flight write has an ID and `startedAt` in Unix milliseconds. Release uses the ID, and the timestamp is for diagnostics. | `[{"id":"writer-a","startedAt":1794873600000}]` |

This is the marker value before the revocation starts.

```json
{
  "epoch": "epoch-42",
  "writers": 0,
  "activeWriters": []
}
```

<a id="iam-read-cache-recovery"></a>

#### Recover a stuck writer registration

The account and permissions cache needs a shared database primary and Redis. When the database confirms completion, IAM releases the registration by ID. If Redis loses the reply, the node retries the same ID. A node exit or an uncertain database commit or rollback leaves the registration in place, and readers keep using the database. Long-lived registrations trigger a warning.

**During the write and after recovery**

The revocation adds a registration, so both nodes query the database. Safe recovery creates a new generation with an empty registration list.

```json
{
  "epoch": "epoch-43",
  "writers": 1,
  "activeWriters": [{ "id": "writer-a", "startedAt": 1794873600000 }]
}
```

For a new production deployment, initialize the marker before starting IAM nodes. After restoring a Redis backup, create a new generation before resuming IAM traffic. To recover from a stuck registration, stop IAM write entry points, background jobs and external transaction callers. Verify on the database primary that all old transactions have ended. Keep reading from the database until that is confirmed.

Prepare a private `private-cache.json` with the same Redis Cache settings as the application, including the primary, logical database and `keyPrefix`. The inspection returns the current `epoch`, `writers` and registrations. The example uses `epoch-43` for the observed value. On a fresh install use `missing` as returned by the inspection. Apply only after verifying that writers have drained.

```sh
node ./node_modules/@h-ai/iam/dist/read-cache-maintenance.js --cache private-cache.json
node ./node_modules/@h-ai/iam/dist/read-cache-maintenance.js --cache private-cache.json --apply --expect-epoch epoch-43 --writers-drained
```

The apply command compares the entire observed marker and sets a new random `epoch`. Check for `success: true`, a new generation and `writers: 0` before restoring traffic. If the comparison fails or the outcome is unknown, stay in maintenance and inspect again after verifying database transactions. Old entries expire at their original TTL. A missing or invalid marker sends production reads to the database and blocks guarded writes from registering.

<a id="cache-iam-result"></a>

### `hai:iam:read_cache:<epoch>:<query>`

For account `user-42`, suppose `revision.epoch` is `epoch-42`. IAM reads this full key.

```text
hai:iam:read_cache:epoch-42:user_access:user-42
```

- **`<epoch>` identifies the current batch.** IAM reads the `epoch` field from `hai:iam:read_cache:revision`. This example uses `epoch-42` for readability. The runtime generates a random UUID and changes it when database writes start and finish.
- **`<query>` is the entire suffix after that batch ID.** Here it is `user_access:user-42`. The first part selects account state and authorization. The second identifies the account.

In the old suffix `user:v2:user-42`, `v2` identified the format of the cached account fields. IAM added it when lifecycle fields such as `accountStatus` replaced `enabled`. The combined record uses `user_access:user-42`. Old keys expire on their original 60-second lifetime.

IAM uses the current batch when no writes are pending and checks the batch again on a cache hit. It queries the database on a miss. Successful results expire 60 seconds after being cached. Failed queries leave no cached result.

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `value` | object / `string[]` / `null` | — | Successful query result stored inside this wrapper. | `{"account":null,"authorization":{"roles":[],"permissions":[]}}` |

| Query suffix | Variable source and result |
| --- | --- |
| [`user_access:<userId>`](#briefly-reuse-a-fetched-account) | `userId` is the account ID. `value.account` holds account state and is `null` if the account is absent. `value.authorization` holds deduplicated `roles: string[]` and `permissions: string[]`. |
| [`sensitive:<operation>`](#cache-iam-query-sensitive) | `operation` is the operation name, with `*` for all. The result is a `string[]` of sensitive operation names. |
| [`apikey:<apiKeyId>`](#cache-iam-query-apikey) | `apiKeyId` comes from the derived session. The result has `userId: string`, `enabled: boolean`, `expiresAt: number \| null`, and `scopes: string[]`. An absent key returns `null`. |
| [`verified_apikey:<fingerprint>`](#cache-iam-query-verified-apikey) | `fingerprint` is the hexadecimal SHA-256 digest of the raw key. The result stores `id`, `userId`, `name`, `keyPrefix`, `enabled`, `expiresAt`, `createdAt`, `lastUsedAt`, and `scopes`. |

The `account` object contains `username`, `accountType`, `accountStatus`, `accountExpiresAt`, `credentialVersion`, `mustChangePassword`, `hasPassword`, and `passwordUpdatedAt`, plus optional `displayName` and `avatarUrl`. Token verification checks expiry against the current time and uses `credentialVersion` to validate the existing session.

Numeric dates in these cached values are Unix milliseconds. The verified API key record uses `null` for missing dates. Its fields have the same meaning as the metadata returned by `iam.apiKey`.

<a id="briefly-reuse-a-fetched-account"></a>

#### Example · Read account state and grants together

This is the full value for `hai:iam:read_cache:epoch-42:user_access:user-42`. One read supplies `account` for validating the account and `authorization` for checking `orders:read`.

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

`hasPassword` records whether a local password exists. Password hashes, tokens, and reset credentials have their own storage.

<a id="cache-iam-query-sensitive"></a>

#### Example · Look up operations that require reauthentication

`hai:iam:read_cache:epoch-42:sensitive:orders.cancel` holds the result of checking whether `orders.cancel` is registered on a permission record. The array is empty when the operation is absent.

```json
{
  "value": [
    "orders.cancel"
  ]
}
```

`hai:iam:read_cache:epoch-42:sensitive:*` holds all sensitive operations registered on permission records. In this example, `profile.update` is registered as well.

```json
{
  "value": [
    "orders.cancel",
    "profile.update"
  ]
}
```

<a id="cache-iam-query-apikey"></a>

#### Example · Check the API key behind a session

When validating a session issued from `apikey-42`, IAM reads `hai:iam:read_cache:epoch-42:apikey:apikey-42`. The cached value shows that the key belongs to `user-42`, is enabled, has no expiry, and is scoped to `orders:read`. A successful lookup for a missing key stores `{"value":null}`.

```json
{
  "value": {
    "userId": "user-42",
    "enabled": true,
    "expiresAt": null,
    "scopes": [
      "orders:read"
    ]
  }
}
```

<a id="cache-iam-query-verified-apikey"></a>

#### Example · Reuse a successful API key verification

This example shows the API key metadata saved after successful verification. IAM derives the fingerprint from the incoming key. The example fingerprint is fictional and contains 64 hexadecimal characters.

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
    "scopes": [
      "orders:read"
    ]
  }
}
```

<a id="file-and-runtime-data"></a>

## Files and runtime data

IAM owns no data files. The application chooses the SQLite file, if any, through RelDB configuration. The deployment owns Redis and the production database. IAM holds validated configuration, repository references, and an optional inactivity scan in memory. Closing IAM stops the scan and releases local references. Committed database rows and Redis records retain their own expiry and revocation rules. [Module configuration](../configuration/iam.en.md)

Applications read data through the server-side `iam.user`, `iam.authz`, `iam.session`, and `iam.apiKey` operations. The host’s optional modules store delivery records and audit events. See [Reach data](reach.en.md) and [Audit data](audit.en.md).

<a id="public-responses"></a>

## Public API responses

These excerpts show successful `HaiResult` responses. Check `success` first and read `error.code` on failure. TypeScript `Date` values become ISO 8601 strings in JSON, while fields defined as Unix milliseconds remain numbers. Return access tokens, refresh tokens, one-time tickets, and newly issued keys only to their intended trusted callers. Select the fields a public page needs to display.

<a id="response-login"></a>

### Sign-in and permissions

`iam.auth.login()` returns the user, token pair, and roles and permissions used for that login. Use `iam.auth.verifyToken()` to obtain current authorization for subsequent protected requests. The illustrated `expiresIn` is the issued access lifetime in seconds. Additional idle or absolute limits also constrain authentication.

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

### Session refresh

`iam.session.refresh()` returns a new token pair. Replace the old access and refresh values after success. The old values cease to be valid.

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

### Read or update a profile

`iam.user.getUser()` returns `User | null`. A successful response with `data: null` means the account does not exist. These profile fields can come from a read or a successful `iam.user.updateCurrentUser()`. A real contact change returns the updated profile and invalidates the old session.

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

### Issue an API Key

`iam.apiKey.createApiKey()` returns public metadata plus the `rawKey` available only on issue. `listApiKeys()` and `getApiKey()` omit the raw key and its hash.

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

### Tickets and CAPTCHA challenges

`iam.ticket.issue()` returns the original ticket and a Unix millisecond deadline. On success `iam.ticket.consume()` returns the server-bound `subjectId`, `purpose`, and `grant`. For an audio transcription ticket, the trusted service reads the permitted operation and subject from that result. The public result from `iam.auth.createCaptcha()` contains `id` and `challenge`. The interface sends the challenge answer, while the server keeps its verification secrets in the cache.

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

### Authentication-page configuration

`iam.getPublicConfig()` returns settings safe to expose. Its sensitive operation list includes the database configuration. A page uses `login` and `passwordReset` to decide which sign-in and recovery options to display. Cache records, credentials, and connection details stay on the server.

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
