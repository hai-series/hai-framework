# @h-ai/iam Configuration

<!-- translation: partial -->

[Chinese source](iam.md) · [Data structures](../data/iam.en.md) · [API reference](../function/iam.en.md)

Load `_iam.yml` after database and required authentication dependencies initialized. Treat login, registration, challenges, permissions and session policies as separate controls. Publish only the form settings intended for browsers.

```yaml schema=@h-ai/iam:IamConfigSchema
login:
  password: true
  otp: false
register:
  enabled: false
session:
  maxAge: 3600
```

<a id="password"></a>

## Password policy

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
| `ui.variant` | `card` | Select the public login layout and optional branding fields. |

<a id="session"></a>

## Sessions

Configure server session expiration and limits under `session`. A browser may receive the public expiry and page-exit settings. Always invalidate the server session when the user logs out.

Additional options and workflow examples are available in the [Chinese reference](iam.md).
