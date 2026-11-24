# @h-ai/iam Data structures

[Chinese source](iam.md) · [Configuration](../configuration/iam.en.md) · [API reference](../function/iam.en.md)

<a id="example-data"></a>

## What these records are for

### The user account

Structure: `hai_iam_users`.

Store identity and whether the account may be used; login and authorization check it.

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

user-42 is an active permanent account. Null email/password_hash means absent, not permission to sign in with an empty password.

### Roles assignable to users

Structure: `hai_iam_roles`.

Name a set of responsibilities so several users can receive the same permissions.

```json
{
  "id": "role-reader",
  "code": "reader",
  "name": "Reader",
  "is_system": false
}
```

role-reader has code reader, display name Reader and is not a system role.

### Individual application permissions

Structure: `hai_iam_permissions`.

Give a protected operation a stable permission code checked by the server.

```json
{
  "id": "permission-read",
  "code": "orders.read",
  "name": "Read orders",
  "resource": "orders",
  "action": "read"
}
```

orders.read means reading orders. Creating this row alone grants nobody that permission.

### Which user has which role

Structure: `hai_iam_user_roles`.

Link users to roles without duplicating all role details in each user row.

```json
{
  "user_id": "user-42",
  "role_id": "role-reader"
}
```

user-42 receives role-reader; the pair is unique.

### Which role includes which permission

Structure: `hai_iam_role_permissions`.

Link roles to permissions when calculating what a user may do.

```json
{
  "role_id": "role-reader",
  "permission_id": "permission-read"
}
```

role-reader includes permission-read; with the user-role link, user-42 gains orders.read.

### Credentials for programmatic calls

Structure: `hai_iam_api_keys`.

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
    "orders.read"
  ]
}
```

apikey-42 belongs to user-42 and allows orders.read only. Redacted digest/prefix cannot recover the original key, returned only at issue time.

### Bind a directory entry to a local account

`hai_iam_ldap_identities` is the source of truth for LDAP sign-in and offline imports. `directory_id` and `entry_id` uniquely identify a directory entry. `user_id` references a local user and is unique within the directory. Deleting the user removes the binding. The example keeps the entry linked to `user-42` even after a rename.

```json
{
  "directory_id": "company-directory",
  "entry_id": "3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76",
  "user_id": "user-42"
}
```

### The user’s active login sessions

Structure: `hai:iam:sessions:{<scope-digest>}`.

Store token-backed sessions for verification, renewal and logout; concurrent updates must not restore old sessions.

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

The token belongs to user-42. Access expires at 2026-11-18 00:00 UTC; refresh may last longer, with `refreshExpiresAt` in Unix milliseconds. `revision` changes with updates. Tokens are redacted.

### One-time code and resend delay

Structure: `hai:iam:otp:example@example.invalid`.

Track the current code for one identity, failed attempts and when another may be sent.

```json
{
  "version": "otp-version-42",
  "code": "<otp:redacted>",
  "attempts": 0,
  "expiresAt": 1794873900000,
  "cooldownUntil": 1794873660000
}
```

Assuming issue at 2026-11-17 00:00 UTC, this code has no failed attempts, lasts five minutes and has a 60-second resend delay. `expiresAt` and `cooldownUntil` are Unix milliseconds. The redacted code cannot be reused after success.

### Server record for a CAPTCHA challenge

Structure: `hai:iam:captcha:<id>`.

Keep the challenge and server secrets to check the intended operation and one-time use.

```json
{
  "operation": "login",
  "signatureSecret": "<secret:redacted>",
  "keySecret": "<secret:redacted>"
}
```

operation:login restricts it to login. Secrets are redacted and challenge details omitted; never send the whole private record to a page.

### A short-lived one-use ticket

The key is `hai:iam:ticket:sha256:<ticket digest>`. The client holds the original ticket, and the key contains only its hexadecimal SHA-256 digest. Updated instances still accept old tickets until they expire. When deploying to several instances, switch consumers together because older instances cannot redeem newly issued tickets.

After checking the purpose and expiration, redemption atomically removes the matching record and returns its subject and authorization parameters.

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

user-42 may transcribe through ai-audio. Assuming issue at 2026-11-17 00:00 UTC, the ticket expires 30 seconds later; `expiresAt` is Unix milliseconds. A second connection with the same ticket fails.

### Whether cached permissions remain current

Structure: `hai:iam:read_cache:revision`.

A shared marker lets readers avoid stale cache during account or permission writes.

```json
{
  "epoch": "epoch-42",
  "writers": 0
}
```

writers:0 means no registered write is in progress; epoch-42 identifies the cache generation. This marker contains no permissions and does not expire.

### Briefly reuse a fetched account

Structure: `hai:iam:read_cache:epoch-42:user:v2:user-42`.

Reduce repeated database reads while avoiding older cache generations after changes.

```json
{
  "value": {
    "id": "user-42",
    "username": "example-user"
  }
}
```

value is a user-42 excerpt, normally expiring after 60 seconds. epoch-42 must still match the current marker.

## Field, storage and cleanup reference

### Database tables

Identity data belongs to RelDB and revocable session state uses a shared Cache in production. Keep credentials and authorization state on the server.

IAM uses seven tables in total. It creates the LDAP and API Key tables only when those features are enabled.

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

#### `hai_iam_users`

| Column | Type | Nullable | Default | Meaning | Example |
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
| `login_failed_count` | `INTEGER` | Yes | `0` | Failed login count. | `0` |
| `first_login_failed_at` | `TIMESTAMP` | Yes | — | First failed login in the current counting window. | `NULL` |
| `last_login_failed_at` | `TIMESTAMP` | Yes | — | Most recent failed login time. | `NULL` |
| `locked_until` | `TIMESTAMP` | Yes | — | When the login lockout ends. | `NULL` |
| `metadata` | `JSON` | Yes | — | Application-specific user details. | `{"department":"Support"}` |
| `created_at` | `TIMESTAMP` | No | — | Account creation time. | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | No | — | Account's last update time. | `2026-11-17T00:00:00Z` |
| `must_change_password` | `BOOLEAN` | No | `false` | Whether the next sign-in requires a password change. | `false` |
| `account_type` | `TEXT` | No | `permanent` | Account type. | `permanent` |
| `account_status` | `TEXT` | No | `active` | Current account status. | `active` |
| `account_expires_at` | `TIMESTAMP` | Yes | — | Account expiry time. | `NULL` |
| `last_login_at` | `TIMESTAMP` | Yes | — | Time of the most recent successful sign-in. | `2026-11-17T00:00:00Z` |
| `credential_version` | `TEXT` | No | `""` | Changes when credentials change so IAM can invalidate old sessions. | `<credential-version>` |
| `reset_version` | `TEXT` | No | `""` | Version of the current password-reset request. | `<reset-version>` |
| `reset_hash` | `TEXT` | Yes | — | Digest of the reset credential. | `NULL` |
| `reset_expires_at` | `BIGINT` | Yes | — | Reset credential expiry in Unix milliseconds. | `1794874500000` |
| `reset_attempts` | `INTEGER` | No | `0` | Number of attempts to verify the current reset credential. | `0` |

<a id="table-hai-iam-roles"></a>

#### `hai_iam_roles`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Role primary key. | `role-reader` |
| `code` | `TEXT` | No | — | Unique role code checked by the application. | `reader` |
| `name` | `TEXT` | No | — | Role display name. | `Reader` |
| `description` | `TEXT` | Yes | — | Description of the role. | `Can read orders` |
| `is_system` | `BOOLEAN` | Yes | `false` | Whether it is a system role. | `false` |
| `created_at` | `TIMESTAMP` | No | — | Role creation time. | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | No | — | Role's last update time. | `2026-11-17T00:00:00Z` |

<a id="table-hai-iam-permissions"></a>

#### `hai_iam_permissions`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Permission primary key. | `permission-read` |
| `code` | `TEXT` | No | — | Unique permission code. | `orders.read` |
| `name` | `TEXT` | No | — | Permission display name. | `Read orders` |
| `description` | `TEXT` | Yes | — | Description of what the permission allows. | `Read order details` |
| `resource` | `TEXT` | Yes | — | Type of resource being accessed. | `orders` |
| `action` | `TEXT` | Yes | — | Allowed action. | `read` |
| `type` | `TEXT` | Yes | — | Permission type used by the application for classification. | `NULL` |
| `sensitive_operations` | `JSON` | Yes | — | Sensitive-operation settings for the permission. | `NULL` |
| `created_at` | `TIMESTAMP` | No | — | Permission creation time. | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | No | — | Permission's last update time. | `2026-11-17T00:00:00Z` |

<a id="table-hai-iam-user-roles"></a>

#### `hai_iam_user_roles`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `TEXT` | No | — | User ID in the unique user-role pair. Indexed for lookup. | `user-42` |
| `role_id` | `TEXT` | No | — | Granted role ID in the unique pair with `user_id`. | `role-reader` |

<a id="table-hai-iam-role-permissions"></a>

#### `hai_iam_role_permissions`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `role_id` | `TEXT` | No | — | Role ID in the unique role-permission pair. Indexed for lookup. | `role-reader` |
| `permission_id` | `TEXT` | No | — | Granted permission ID in the unique pair with `role_id`. | `permission-read` |

<a id="table-hai-iam-api-keys"></a>

#### `hai_iam_api_keys`

| Column | Type | Nullable | Default | Meaning | Example |
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
| `scopes` | `JSON` | Yes | — | Scopes available to the API key. | `["orders.read"]` |

<a id="table-hai-iam-ldap-identities"></a>

#### `hai_iam_ldap_identities`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `directory_id` | `TEXT` | No | — | Directory ID used to distinguish LDAP directories. | `company-directory` |
| `entry_id` | `TEXT` | No | — | Stable entry ID in the unique pair with `directory_id`. | `3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76` |
| `user_id` | `TEXT` | No | — | References the local user. Unique with `directory_id`. Deleting the user also removes the binding. | `user-42` |

IAM returns the original API key only when issuing it. Update accounts, roles, and permissions through APIs such as `iam.user` and `iam.authz` so IAM can update the related sessions and cache.

<a id="data-fields"></a>

### Cache keys

IAM writes six cache record families. These are logical keys. Redis adds `keyPrefix` if configured. Sessions, codes, tickets and authorization state stay server-side.

| Key or family | Purpose | Default expiry and cleanup |
| --- | --- | --- |
| [`hai:iam:sessions:{<scope-digest>}`](#cache-iam-sessions) | Keep active sessions and refresh credentials for one user scope together. | Expires with the last valid access or refresh credential. Deleted when no sessions remain. Sliding expiry follows session settings. |
| [`hai:iam:otp:<identifier>`](#cache-iam-otp) | Verify the current code for an email address or phone and limit attempts and resends. | Code defaults to 300 seconds, resend cooldown to 60 seconds. The key lasts until the later deadline. Use or exhausted attempts clears the code. |
| [`hai:iam:captcha:<id>`](#cache-iam-captcha) | Verify a challenge's purpose, solution and validity. | `captcha.ttlSeconds` defaults to 120 seconds. Verification consumes the key. Expiry requires a new challenge. |
| [`hai:iam:ticket:sha256:<digest>`](#cache-iam-ticket) | Allow one short-lived exchange for a specific purpose. | Defaults to 30 seconds, configurable via `ttlMs`. Deleted atomically on successful exchange. |
| [`hai:iam:read_cache:revision`](#cache-iam-revision) | Identify which batch of cached account and permission data is usable. | No automatic expiry. Writes change the generation. |
| [`hai:iam:read_cache:<epoch>:<query>`](#cache-iam-result) | Briefly reuse successful account or permission reads. | Expires 60 seconds after a write. A generation change immediately bypasses old keys. |

<a id="cache-iam-sessions"></a>

#### `hai:iam:sessions:{<scope-digest>}`

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
| `session.terminalType` | `string` | `web` | Client category. Older records without a value are treated as `web`. | `web` |
| `session.apiKeyId` | `string` | — | Bound key ID on sessions issued from an API key. | `apikey-42` |
| `session.apiKeyScopes` | `string[]` | — | Allowed scopes of a session issued from an API key. | `["orders.read"]` |
| `session.roles` | `string[]` | — | Role codes for the session. | `["reader"]` |
| `session.permissions` | `string[]` | — | Permission codes for the session. | `["orders.read"]` |
| `session.source` | `string` | — | Optional sign-in source. | `pc` |
| `session.accessToken` | `string` | — | Access credential for the session. | `<access-token:redacted>` |
| `session.createdAt` | ISO date string | — | Current issuance time. | `2026-11-17T00:00:00.000Z` |
| `session.startedAt` | ISO date string | `createdAt` | First issuance time, preserved on refresh. Older records fall back to `createdAt`. | `2026-11-17T00:00:00.000Z` |
| `session.lastActiveAt` | ISO date string | — | Most recent activity time, used to apply idle deadlines. | `2026-11-17T00:00:00.000Z` |
| `session.expiresAt` | ISO date string | — | Access session expiry. | `2026-11-18T00:00:00.000Z` |
| `session.maxAge` | `number` | `86400` | Access lifetime in seconds. Creation can override it. The session keeps that lifetime. | `86400` |
| `session.data` | JSON object | — | Optional application data. | `{"theme":"dark"}` |

<a id="cache-iam-otp"></a>

#### `hai:iam:otp:<identifier>`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `version` | `string` | — | Issuance version of the current code. `identifier` is the normalized email or phone. | `otp-version-42` |
| `code` | `string` / `null` | — | Active code, cleared on consumption or exhausted attempts. | `<otp:redacted>` |
| `attempts` | `integer` | — | Verification attempts for this issuance. Starts at `0`. | `0` |
| `expiresAt` | `number` | — | Expiry time of the code in Unix milliseconds. | `1794873900000` |
| `cooldownUntil` | `number` | — | Earliest resend time in Unix milliseconds. | `1794873660000` |

<a id="cache-iam-captcha"></a>

#### `hai:iam:captcha:<id>`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `operation` | `string` | — | Expected operation. The issuer generates the challenge `id` in the key. | `login` |
| `challenge` | JSON object | — | Challenge parameters used to verify the solution. | `{…}` |
| `signatureSecret` | `string` | — | Server-only secret for the challenge signature. | `<secret:redacted>` |
| `keySecret` | `string` | — | Server-only secret for the derived key signature. | `<secret:redacted>` |

<a id="cache-iam-ticket"></a>

#### `hai:iam:ticket:sha256:<digest>`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `subjectId` | `string` | — | Subject verified at issue time. The key `digest` comes from the original ticket sent to the client. | `user-42` |
| `purpose` | `string` | — | Single purpose the exchange must match. | `ai-audio` |
| `grant` | JSON object | `{}` | Allowed operations, models, sessions or other parameters at issuance. | `{"operation":"transcribe"}` |
| `expiresAt` | `number` | — | Ticket deadline in Unix milliseconds. | `1794873630000` |

<a id="cache-iam-revision"></a>

#### `hai:iam:read_cache:revision`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `epoch` | `string` | — | Cache generation used to form query cache keys. | `epoch-42` |
| `writers` | `integer` | — | Number of unconfirmed writes. The initial value is `0`. | `0` |

<a id="cache-iam-result"></a>

#### `hai:iam:read_cache:<epoch>:<query>`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `value` | JSON | — | Wraps a successful query result. Example key: `hai:iam:read_cache:epoch-42:user:v2:user-42`. | `{"id":"user-42","username":"example-user"}` |

After credentials change, IAM compares `credentialVersion` and refuses old sessions. While accounts or permissions are being written, IAM reads from the database. The next `epoch` bypasses old read entries, which expire on schedule.
