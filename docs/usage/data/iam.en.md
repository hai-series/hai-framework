# @h-ai/iam Data structures

<!-- translation: partial -->

[Chinese source](iam.md) · [Configuration](../configuration/iam.en.md) · [API reference](../function/iam.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

Database and file samples show relevant fields, not complete writable records. Omitted fields are not automatically optional. Examples can represent different moments in a process.

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

The token belongs to user-42. Access expires the next day, refresh may last longer, and revision changes with updates. Tokens are redacted.

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

No failed attempts yet; the code lasts five minutes and resend waits 60 seconds. The redacted code cannot be reused after success.

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

Structure: `hai:iam:ticket:<ticket:redacted>`.

Issue temporary authorization checked against subject and purpose, then consume it once.

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

user-42 may transcribe through ai-audio for 30 seconds. A second connection with the same ticket fails.

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

Identity data belongs to RelDB and revocable session state uses a shared Cache in production. Keep credentials and authorization state on the server.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_iam_users` | User identity, login names, password hash, status and profile fields. |
| `hai_iam_roles`, `hai_iam_permissions` | Named roles and permission definitions. |
| `hai_iam_user_roles`, `hai_iam_role_permissions` | Relational links between users/roles and roles/permissions. |
| `hai_iam_api_keys` | API key lifecycle and user ownership; store hashed key material. |
| Cache / キャッシュ | Per-user sessions and indexes, token verification and revocation state, OTP attempts, challenge and one-time-ticket records. TTL and cleanup depend on the credential or policy. |

Still untranslated: the complete account fields, cache key shapes and credential expiry behavior. Read the [Chinese source section](iam.md#data-fields).
