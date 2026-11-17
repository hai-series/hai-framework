# @h-ai/iam Data structures

<!-- translation: partial -->

[Chinese source](iam.md) · [Configuration](../configuration/iam.en.md) · [API reference](../function/iam.en.md)

Identity data belongs to RelDB and revocable session state uses a shared Cache in production. Keep credentials and authorization state on the server.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_iam_users` | User identity, login names, password hash, status and profile fields. |
| `hai_iam_roles`, `hai_iam_permissions` | Named roles and permission definitions. |
| `hai_iam_user_roles`, `hai_iam_role_permissions` | Relational links between users/roles and roles/permissions. |
| `hai_iam_api_keys` | API key lifecycle and user ownership; store hashed key material. |
| Cache / キャッシュ | Per-user sessions and indexes, token verification and revocation state, OTP attempts, challenge and one-time-ticket records. TTL and cleanup depend on the credential or policy. |

Field constraints, defaults and retention details are available in the [Chinese reference](iam.md).
