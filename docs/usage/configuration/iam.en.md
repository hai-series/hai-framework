# @h-ai/iam Configuration

<!-- translation: partial -->

[Chinese source](iam.md) · [Data structures](../data/iam.en.md) · [API reference](../function/iam.en.md)

## Configuration entry

Load `_iam.yml` after database and required authentication dependencies initialized. Treat login, registration, challenges, permissions and session policies as separate controls. Publish only the form settings intended for browsers.

On configuration validation failure, `iam.init()` returns `CONFIG_ERROR`. Its message and `error.ext.fields` list invalid field paths, while `error.cause` retains the original validation error. Server logs include an `issues` array with paths, error categories and descriptions, without recording the complete configuration.

## Configuration reference

<a id="password"></a>

### Password policy

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `password.minLength`, `maxLength` | `8`, `128` | Accepted password length range. |
| `password.requireUppercase`, `requireLowercase`, `requireNumber`, `requireSpecialChar` | `true`, `true`, `true`, `false` | Character categories required by the policy. |
| `password.minCharacterClasses`, `expirationDays`, `preventSamePassword`, `requireInitialChange` | `0`, `0`, `false`, `false` | Optional character category count, expiry and change conditions. |
| `otp.length`, `expiresIn`, `maxAttempts`, `resendInterval` | `6`, `300`, `3`, `60` | Digits, lifetime in seconds, attempt cap and resend delay. |
| `reauthentication.enabled`, `operations`, `ttlSeconds` | `false`, `[]`, `300` | Require fresh proof for chosen sensitive operations. |
| `initialCredentials.enabled`, `loginAccess.enabled` | `false`, `false` | Opt into initial credential flow or address and schedule restrictions. |
| `accounts.dormantAfterDays`, `scanIntervalSeconds` | `0`, `3600` | Dormancy threshold and periodic scan interval. |
| `ldap`, `session`, `register`, `captcha` | See backend | Configure directory providers, session lifetime and scope, public registration, and interactive proof separately. |
| `ldap.directoryId` | Required when LDAP is enabled | Stable identifier shared by deployments using this directory. Use 1–96 lowercase letters, digits, dots, underscores or hyphens, starting with a letter or digit. |
| `ldap.identityAttribute` | `entryUUID` | Immutable directory entry identifier. Set `objectGUID` for Active Directory. |
| `ui.variant` | `card` | Select the public login layout and optional branding fields. |

<a id="session"></a>

### Sessions

Configure server session expiration and limits under `session`. A browser may receive the public expiry and page-exit settings. Always invalidate the server session when the user logs out.

Still untranslated: the complete login, password, session and account-policy tables. Read the [Chinese source section](iam.md#configuration-fields).

## Configuration examples

```yaml schema=@h-ai/iam:IamConfigSchema
login:
  password: true
  otp: false
register:
  enabled: false
session:
  maxAge: 3600
```

### Use passwords with a 30-minute idle timeout

Put this in `config/_iam.yml`. Require at least 12 characters and disable self-registration. Both timeouts use seconds: users sign in again after 30 idle minutes or eight hours since login. This does not rewrite existing account passwords.

```yaml schema=@h-ai/iam:IamConfigSchema
login:
  password: true
  otp: false
  ldap: false
register:
  enabled: false
password:
  minLength: 12
session:
  idleTimeout: 1800
  absoluteTimeout: 28800
```

### Connect to the company LDAP directory

Supply the complete URL, bind account and user search base. Load the bind password from the private server environment. This example keeps local password login enabled. When LDAP is unused, omit both the whole `ldap` section and its `HAI_IAM_LDAP_*` variables. Leaving only the password variable creates an incomplete configuration and prevents startup.

```yaml schema=@h-ai/iam:IamConfigSchema
login:
  password: true
  ldap: true
ldap:
  url: ldaps://directory.example.com:636
  bindDn: cn=app-reader,ou=services,dc=example,dc=com
  bindPassword: ${HAI_IAM_LDAP_BINDPASSWORD}
  searchBase: ou=people,dc=example,dc=com
```
