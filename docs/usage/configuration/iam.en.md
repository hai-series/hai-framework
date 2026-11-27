# @h-ai/iam Configuration

[简体中文](iam.md) · [日本語](iam.ja.md) · [Configuration guide](README.en.md) · [API reference](../function/iam.en.md) · [Data structures](../data/iam.en.md)

## Configuration entry

Generated projects with IAM enabled store settings in `config/_iam.yml` in the server workspace. Startup loads the file through `core.init({ configDir: './config', configSchemas: { iam: IamConfigSchema } })`, reads `core.config.getOrThrow('iam')`, and passes the settings and runtime dependencies to `iam.init()`. Initialize RelDB and Cache first. IAM reuses Crypto or initializes it when needed. Restart the generated service to apply changes and wait for successful initialization before accepting authentication requests. [Dependencies and startup order](../function/iam.en.md#module-dependencies)

Before starting IAM for the first time in production, initialize the permission read cache generation in shared Redis. [Initialization and recovery](../data/iam.en.md#iam-read-cache-recovery)

Core overlays the YAML with a JSON setting in `HAI_IAM` or individual `HAI_IAM_*` variables. Within a single source it applies whole objects before individual fields. For example, `HAI_IAM_SESSION_MAXAGE=1800` sets `session.maxAge` to 1,800 seconds. It then expands any remaining `${VAR}` placeholders and validates types. The process environment takes precedence over environment files. Keep LDAP bind credentials in the private server environment. [Environment sources and precedence (Chinese)](runtime.md#配置从哪里来)

If schema validation fails in `iam.init()`, it returns `CONFIG_ERROR`. Check `error.ext.fields` for the rejected field paths and the server log's `issues` array for the corresponding errors. The browser obtains available login methods and page settings through the initialized client's `client.iam.auth.publicConfig()`. The host still verifies sessions and permissions for protected routes. [Public settings and authentication](../function/iam.en.md#authentication)

<a id="configuration-fields"></a>

## Configuration reference

The tables show framework defaults. Fields with defaults can be omitted. The listed password and session defaults apply when either whole section is absent. The CLI can write different values. For example, its regular template disables OTP sign-in and account lockout and relaxes password character requirements. Check the target service's file and environment overrides.

<a id="configuration-examples"></a>

Merge the relevant snippet into the server's `config/_iam.yml`, restart the service, and verify the workflow.

### `login`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `login.password` | Boolean | `true` | Enables ordinary password sign-in. |
| `login.otp` | Boolean | `true` | Enables the OTP switch. The `otp` object and at least one working delivery channel are also required. |
| `login.ldap` | Boolean | `false` | Enables directory sign-in. Complete `ldap` settings and a directory client are also required. |
| `login.apikey` | Boolean | `false` | Enables API key verification, sign-in, and key management. Applications authorize key management operations. |

### `register`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `register.enabled` | Boolean | `true` | Permits public registration and first-time OTP registration. Existing users keep their enabled sign-in methods and administrators can still create accounts. |
| `register.defaultAccountStatus` | `active` or `dormant` | `active` | Initial status for public registration, first-time OTP registration, and new LDAP-synchronized accounts. An administrator must activate a dormant account before it can sign in. |

<a id="password"></a>

### Password policy

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `password.minLength` | Integer from 1 to `password.maxLength` | `8` | Minimum length of newly set passwords, measured by JavaScript string length. |
| `password.maxLength` | Integer from `password.minLength` to 256 | `128` | Maximum length of newly set passwords. |
| `password.requireUppercase` | Boolean | `true` | Requires an ASCII uppercase letter in a new password. |
| `password.requireLowercase` | Boolean | `true` | Requires an ASCII lowercase letter in a new password. |
| `password.requireNumber` | Boolean | `true` | Requires a digit from 0 to 9 in a new password. |
| `password.requireSpecialChar` | Boolean | `false` | Requires supported punctuation, such as `!` or `#`. |
| `password.minCharacterClasses` | Integer, 0–4 | `0` | Minimum number of uppercase, lowercase, digit and punctuation classes represented. Applies alongside individual requirements. |
| `password.expirationDays` | Nonnegative integer, days | `0` | Lifetime from the last password change. Zero disables expiration. After expiration, the user renews the password before signing in. |
| `password.preventSamePassword` | Boolean | `false` | Rejects reuse of the current password. Expiration or mandatory first-change policies also reject reuse. |
| `password.requireInitialChange` | Boolean | `false` | Marks administrator-created or administrator-reset passwords for a mandatory change before establishing a session. |

### `otp`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `otp` | Object | Required to use OTP sign-in. `{}` suffices. | Creates the OTP strategy. |
| `otp.email` | Boolean | `true` | Allows email delivery with `onOtpSendEmail` or the Reach `otp_email` template. |
| `otp.sms` | Boolean | `true` | Allows SMS delivery with `onOtpSendSms` or the Reach `otp_sms` template. |
| `otp.length` | Integer, 4–8 digits | `6` | Number of digits in each code. |
| `otp.expiresIn` | Integer, at least 60 seconds | `300` | Code lifetime from issuance. |
| `otp.maxAttempts` | Positive integer | `3` | Verification attempts per issued code. When exhausted, the user needs a new code. |
| `otp.resendInterval` | Integer, at least 30 seconds | `60` | Minimum time between codes for the same normalized contact. The cooldown continues after the code is used. |

For email code delivery and initial password setup together, see the [email OTP and invitation example](#example-email-otp-invite).

### `ldap`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `ldap` | Object | Required with `login.ldap: true` | Connects the organizational directory and resolves local users from stable directory identities. |
| `ldap.url` | `ldap://` or `ldaps://` URL | Required when supplying `ldap` | Directory address. LDAPS starts with TLS. |
| `ldap.bindDn` | String | Required when supplying `ldap` | DN of the service account that searches the directory. |
| `ldap.bindPassword` | String | Required when supplying `ldap` | Service account password. The default client rejects empty passwords. |
| `ldap.searchBase` | String | Required when supplying `ldap` | Base DN for user searches. |
| `ldap.directoryId` | String of 1–96 lowercase letters, digits, `.`, `_` or `-`, starting with a letter or digit | Required when LDAP sign-in is enabled | Stable identifier shared by all nodes using this directory. |
| `ldap.identityAttribute` | `entryUUID` or `objectGUID` | `entryUUID` | Immutable directory entry identifier. Use `objectGUID` with Active Directory. |
| `ldap.searchFilter` | String | `(uid={{username}})` | Search filter. IAM substitutes the escaped username for the placeholder. |
| `ldap.usernameAttribute` | String | `uid` | Username attribute read when creating a local account. |
| `ldap.emailAttribute` | String | `mail` | Attribute used to synchronize the email address. |
| `ldap.displayNameAttribute` | String | `cn` | Attribute used to synchronize the display name. |
| `ldap.useTls` | Boolean | `false` | Turns on StartTLS for `ldap://` connections in the default client. |
| `ldap.connectTimeout` | Integer, at least 1,000 milliseconds | `5000` | Default client timeout for connections and LDAP operations. |

<a id="example-ldap"></a>

#### Connect to the company LDAP directory

Install `ldapts` in the IAM server workspace or pass a custom client from startup code. Replace the sample URL, DNs and directory ID with actual values. Use the same directory ID on all nodes. Store `HAI_IAM_LDAP_BINDPASSWORD` in the private server environment. Deployments without LDAP should omit the entire `ldap` section and its environment overrides. A bind password override alone creates an incomplete object.

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, ldap: true }
ldap:
  url: ldaps://directory.example.invalid:636
  bindDn: cn=app-reader,ou=services,dc=example,dc=invalid
  bindPassword: ${HAI_IAM_LDAP_BINDPASSWORD}
  searchBase: ou=people,dc=example,dc=invalid
  directoryId: company-directory
  identityAttribute: entryUUID
```

In the target environment, verify certificate trust, the service account's search permissions, and the sign-in route. With a dedicated directory test user, check successful sign-in, refusal of an incorrect password, and the local role assigned at first sign-in. Verify bindings before migrating existing LDAP users. [LDAP identity migration](../function/iam.en.md#ldap-identity-migration)

### `apikey`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `apikey.maxKeysPerUser` | Positive integer | `10` | Maximum number of stored keys per user. |
| `apikey.defaultExpirationDays` | Nonnegative integer, days | `0` | Default validity for a new key. Zero means no expiration. |
| `apikey.prefix` | String | `hai_` | Visible prefix of new keys. Use an application identifier. |

### `passwordReset` and `initialCredentials`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `passwordReset.enabled` | Boolean | `true` | Enables password recovery when a custom delivery callback or the corresponding Reach template is available. |
| `passwordReset.mode` | `email` or `phone` | `email` | The default sender uses the account's email or phone and selects `password_reset` or `password_reset_sms` respectively. |
| `passwordReset.resetUrl` | Absolute HTTP(S) URL | Optional | The default sender adds the token as the `token` query parameter. If omitted, the `resetUrl` template variable contains the token itself. |
| `passwordReset.tokenExpiresIn` | Integer, at least 300 seconds | `3600` | Token lifetime for password recovery and initial password invitations. |
| `passwordReset.maxAttempts` | Positive integer | `3` | Submissions allowed per valid reset token. A failed password-policy check counts as an attempt. |
| `initialCredentials.enabled` | Boolean | `false` | Allows an administrator to send a one-time password setup invitation. Password recovery and a delivery channel for the account are required. |

<a id="example-email-otp-invite"></a>

#### Sign in by email code and send a password setup invitation

Set up a Reach email provider and its `otp_email` and `password_reset` templates, then pass the initialized Reach module to IAM. Applications with their own email delivery can supply the corresponding callbacks.

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, otp: true }
register: { enabled: false }
otp: { email: true, sms: false, expiresIn: 300, resendInterval: 60 }
initialCredentials: { enabled: true }
passwordReset: { enabled: true, mode: email, resetUrl: https://app.example.invalid/auth/reset-password }
```

Replace the reset URL with the actual application page. Check that public settings enable email OTP, recovery and invitations. Sign in with a code for a unique, registered test address. Then invite a test user through the authorized management feature and verify they can open the password setup page and use the token once. [OTP and notification integration](../function/iam.en.md#authentication)

### `captcha` and `security`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `captcha.enabled` | Boolean | `false` | Enables the ALTCHA challenge for password, OTP and LDAP sign-in, self-registration, code issuance, password reset requests, and password renewal. |
| `captcha.ttlSeconds` | Integer, 1–600 seconds | `120` | Lifetime of a single-use challenge. |
| `captcha.cost` | Integer, 100–50,000 | `5000` | ALTCHA work factor per calculation. |
| `captcha.maxCounter` | Integer, 1–2,000 | `100` | Upper bound for the random ALTCHA solution counter. |
| `security.lockoutEnabled` | Boolean | `true` | Counts account-level failures and enables temporary lockout. Turning it off bypasses past locks. |
| `security.failureWindow` | Integer, 1–31,536,000 seconds | `86400` | Fixed counting window starting at the first failure. |
| `security.maxLoginAttempts` | Positive integer | `5` | Number of failures in the window that locks the account. Wrong password, LDAP and issued-code OTP attempts share the account policy. |
| `security.lockoutDuration` | Integer, at least 60 seconds | `900` | Length of the lockout after reaching the threshold. |

All nodes share account lockout state in Redis. Authentication protected by this policy fails when Redis cannot read or write that state. In production, use the same Redis with reliable persistence and `noeviction` on every node. [See how counting, lockout and password reset work](../data/iam.en.md#cache-iam-login-failures)

### `loginAccess`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `loginAccess.enabled` | Boolean | `false` | Restricts establishment of new login sessions. The Serv or Kit host configures request access for signed-in users. |
| `loginAccess.allowIps` | Array of IPv4, IPv6 or CIDR strings, at most 1,000 entries | `[]` | A nonempty list requires a matching trusted address. |
| `loginAccess.denyIps` | Array of IPv4, IPv6 or CIDR strings, at most 1,000 entries | `[]` | Rejects matching addresses before applying the allowlist. Setting either address list also requires a trusted source address. |
| `loginAccess.timezone` | IANA timezone string | `UTC` | Interprets sign-in windows using the server clock. |
| `loginAccess.windows` | Object array, at most 100 entries | `[]` | Time windows that allow sign-in. An empty array allows any time. |
| `loginAccess.windows[].days` | 1–7 integers, each from 1 to 7 | Required for each window | Starting days, Monday 1 to Sunday 7. |
| `loginAccess.windows[].start` | `HH:mm`, 00:00–23:59 | Required for each window | Inclusive start time. |
| `loginAccess.windows[].end` | `HH:mm`, 00:00–23:59, different from `start` | Required for each window | Exclusive end time. An earlier time ends the window after midnight. |

<a id="example-login-access"></a>

#### Allow new sign-ins on the corporate network during office hours

Replace the sample subnet with the actual entry subnet and verify the host's trusted proxy configuration. You can apply a separate host policy to requests made within existing sessions.

```yaml schema=@h-ai/iam:IamConfigSchema
loginAccess:
  enabled: true
  allowIps: [192.0.2.0/24]
  denyIps: [192.0.2.20]
  timezone: Asia/Shanghai
  windows:
    - { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
```

Sign in on a weekday morning from an allowed address. Try again from a denied source or outside the window and expect `LOGIN_ACCESS_DENIED`. Verify the boundaries with the same test account. The window includes 09:00 and excludes 18:00. [Sign-in and host access policies (Chinese)](identity.md)

### `reauthentication`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `reauthentication.enabled` | Boolean | `false` | Enables reauthentication for selected sensitive operations. The current session holder verifies their password to obtain a one-time ticket. |
| `reauthentication.operations` | At most 1,000 strings of 1–128 characters after trimming | `[]` | Operation IDs from the file. The effective list also includes sensitive operations assigned in the RBAC database. |
| `reauthentication.ttlSeconds` | Integer, 1–900 seconds | `300` | Ticket lifetime. Each ticket is bound to the current session, user and operation. |

<a id="example-sensitive-operation"></a>

#### Verify an administrator's password before deleting a user

Use an application that integrates the `iam.users.delete` guard. Use the same operation ID for the server guard and the client reauthentication flow.

```yaml schema=@h-ai/iam:IamConfigSchema
reauthentication:
  enabled: true
  operations: [iam.users.delete]
  ttlSeconds: 120
```

Use an authorized test administrator and a test user. A request without a ticket should fail. After the administrator confirms their password, the specified operation can consume the ticket once within two minutes. The host continues to deny requests without permission. [Reauthentication API](../function/iam.en.md#authentication)

<a id="session"></a>

### Sessions

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `session.maxAge` | Integer, at least 60 seconds | `86400` | Default access lifetime for new sessions. Trusted server code can override it when creating a session. Sliding expiry and refresh use that session's own lifetime. |
| `session.refreshTokenMaxAge` | Integer, at least 3,600 seconds | `604800` | Lifetime of each issued refresh token. An expired access token can still be refreshed during the other applicable lifetimes. |
| `session.sliding` | Boolean | `true` | Enables activity-based extension of access expiry. |
| `session.touchMinInterval` | Nonnegative integer, seconds | `5` | Minimum interval between sliding renewal writes. Applies only with `sliding: true` and `idleTimeout: 0`. Set to 0 to write each change in activity time. |
| `session.singleDevice` | Boolean | `false` | Allows one active session per account when enabled. |
| `session.singleDeviceMode` | `replace` or `reject` | `replace` | In single-session mode, replaces the prior session or keeps it and rejects the new sign-in. |
| `session.maxSessions` | Integer, 0–10,000 | `0` | Global active-session cap per user, including sessions that can still refresh. Zero disables the cap. |
| `session.terminalLimits` | Object keyed by `web`, `app`, `desktop`, `api`, with integer values from 1 to 10,000 | `{}` | Per-terminal caps. An empty object disables grouping. A nonempty object blocks new sessions in unlisted groups. Ordinary sign-ins default to `web` and API key sign-ins default to `api`. |
| `session.terminalLimitMode` | `reject` or `replace` | `reject` | In multi-session mode, reject a new sign-in at the terminal cap or replace the oldest session in the same group. The global cap still applies. |
| `session.idleTimeout` | Integer, 0–31,536,000 seconds | `0` | Idle timeout. Zero disables it. Access verification records activity. Automatic refresh preserves the idle deadline. |
| `session.absoluteTimeout` | Integer, 0–31,536,000 seconds | `0` | Absolute lifetime from the first sign-in. Zero disables it. Refresh preserves the original start time. |
| `session.endOnPageHide` | Boolean | `false` | Publishes a best-effort page exit setting for the browser. It takes effect when the app wires the page-exit handler. Server timeouts provide the fallback. |

The write interval is the smaller of `touchMinInterval` and one tenth of the session's own `maxAge`. For example, a 10-second session created by the server uses a one-second interval with default settings. Requests within the interval still check shared session state and return the last stored activity and expiry times. A valid access token nearing expiry can renew immediately.

<a id="session-deadlines"></a>

#### How session deadlines combine

- `refreshTokenMaxAge` is how long each refresh token can be used. A successful refresh starts a new lifetime for the new refresh token.
- `idleTimeout` is how long a session can go without activity. Sign-in and successful access-token verification both count, including verification on background requests. Refreshing tokens alone or syncing roles and permissions leaves the idle deadline in place.
- `absoluteTimeout` is the maximum length of one sign-in. It starts at the original sign-in and stays fixed through visits and refreshes.

Each token stops working at the earliest of its own expiry, the idle deadline, and the absolute deadline. An expired access token can still be replaced using a valid refresh token. If the refresh token expires first, a valid access token can still be used. Set idle or absolute timeout to `0` to disable that limit. Even with `sliding` off, successful access-token verification pushes back an enabled idle deadline. `TokenPair.expiresIn` reports the issued access lifetime. Idle and absolute limits can end it sooner.

<a id="example-password-session"></a>

#### Use passwords with a 30-minute idle timeout

Add this to the application’s `config/_iam.yml`. Sign in with a test account provisioned by an administrator. The page offers password sign-in, and self-registration fails.

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, otp: false, ldap: false, apikey: false }
register: { enabled: false }
password: { minLength: 12 }
session:
  maxAge: 7200
  sliding: false
  refreshTokenMaxAge: 3600
  idleTimeout: 1800
  absoluteTimeout: 28800
```

Start each case with a separate sign-in at 09:00. An access token has its own two-hour lifetime, and a refresh token has its own one-hour lifetime. Each case shows a different deadline arriving first.

| First deadline | Action and result |
| --- | --- |
| Refresh token expires | Make a request at 09:20 and 09:40 without refreshing. At 10:00, the old refresh token is one hour old and a refresh attempt fails. The access token still works. Its own expiry is 11:00, and the idle deadline at the time of the refresh attempt is 10:10. |
| Idle deadline arrives | Make a request at 09:20. At 09:35, refresh the tokens without using access again. The new refresh token’s own expiry is 10:35, but the idle deadline stays at 09:50. At 09:50 both tokens stop working and the user must sign in again. |
| Absolute limit arrives | Make a request every 20 minutes and refresh every 40 minutes after sign-in. The last refresh is at 16:20. Activity at 16:40 moves the idle deadline to 17:10. The new refresh token’s own expiry is 17:20. At 17:00 the session is eight hours old and both tokens stop working. |

[Session verification and refresh](../function/iam.en.md#sessions)

<a id="example-terminal-session-limit"></a>

#### Limit concurrent sessions by terminal

Use this for applications that support browser and mobile sign-in at the same time. The host supplies the terminal type when it creates a session. This setup allows up to two web sessions and one app session.

```yaml schema=@h-ai/iam:IamConfigSchema
session:
  maxSessions: 3
  terminalLimits: { web: 2, app: 1 }
  terminalLimitMode: reject
```

Open two web sessions and one app session with the same test user. A further web sign-in and a `desktop` sign-in should return `SESSION_LIMIT_EXCEEDED`. Existing sessions should still work. If users need to replace a device within a group, change the mode to `replace` and verify that the third web sign-in replaces the oldest web session. [Session settings](#session)

### `accounts`, `rbac` and seed data

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `accounts.dormantAfterDays` | Integer, 0–36,500 days | `0` | The scan marks active accounts dormant after this period since the last successful sign-in or creation. Zero disables automatic dormancy. |
| `accounts.scanIntervalSeconds` | Integer, 60–86,400 seconds | `3600` | Scan interval when automatic dormancy is enabled. |
| `rbac.enabled` | Boolean | `true` | Enables IAM role-based permission checks. When disabled, `iam.authz.checkPermission()` returns allow. Host HTTP and session guards still apply. |
| `rbac.superAdminRole` | String | `super_admin` | Role code used for super administrator checks. Create and assign it where needed. |
| `rbac.defaultRole` | String | `user` | Existing role code for newly created accounts without explicitly assigned roles. An empty string skips default assignment. |
| `seedDefaultData` | Boolean | `true` | Seeds `admin`, `user`, `guest` and basic permissions at startup. Prepare referenced default roles when supplying your own seeds. |

### `agreements` and `ui`

| Path | Type and constraints | Default or requirement | Effect |
| --- | --- | --- | --- |
| `agreements.userAgreementMarkdown` | Nonempty string | Optional | Agreement Markdown. It takes precedence over the agreement URL. |
| `agreements.privacyPolicyMarkdown` | Nonempty string | Optional | Privacy policy Markdown. It takes precedence over the policy URL. |
| `agreements.userAgreementUrl` | Absolute HTTP(S) URL | Optional | Link to the user agreement. |
| `agreements.privacyPolicyUrl` | Absolute HTTP(S) URL | Optional | Link to the privacy policy. |
| `agreements.showOnRegister` | Boolean | `true` | Shows configured agreements during registration. |
| `agreements.showOnLogin` | Boolean | `false` | Shows configured agreements during sign-in. |
| `ui.variant` | `card` or `split` | `card` | Selects a single-card or split authentication layout. |
| `ui.title` | String | Optional | Authentication panel title. |
| `ui.subtitle` | String | Optional | Authentication panel subtitle. |
| `ui.brandTitle` | String | Optional | Brand area title. |
| `ui.brandText` | String | Optional | Brand area description. |
| `ui.logoUrl` | HTTP(S) address or site path starting with a single `/` | Optional | Brand logo. |
| `ui.illustrationUrl` | HTTP(S) address or site path starting with a single `/` | Optional | Illustration on the authentication page. |

### Runtime dependencies passed by startup code

Server startup code can pass initialized Reach, delivery callbacks, or a custom LDAP client to `iam.init()`. Using the default LDAP client requires `ldapts` in the server workspace. IAM synchronizes new LDAP accounts and profiles by default. Pass `ldapSyncUser: false` to allow sign-in only through an existing valid binding. [LDAP and notification integration](../function/iam.en.md#authentication)
