# @h-ai/capacitor Data structures

[Chinese source](capacitor.md) · [Configuration](../configuration/capacitor.en.md) · [API reference](../function/capacitor.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### Device access credential

Structure: `hai_access_token`.

A native app reads this from secure storage to call signed-in APIs.

```json
"<access-token:redacted>"
```

The token is redacted. Logout clears it through the adapter; IAM still decides server-session validity.

### Device renewal credential

Structure: `hai_refresh_token`.

A native app can exchange this credential for new tokens after access expiry.

```json
"<refresh-token:redacted>"
```

Keep it in platform secure storage, not Preferences. No local TTL does not mean unlimited validity: the server can invalidate it.

### A non-sensitive device preference

Structure: `example:last-tab`.

Preferences stores non-sensitive UI choices under application-owned keys.

```json
"orders"
```

orders selects the orders tab next time. This example key is not framework authentication state.

## Field, storage and cleanup reference

Device credentials live in Android encrypted storage protected by the system keystore or iOS Keychain. IAM owns the server session. Ordinary preferences are distinct from secure credentials.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_access_token`, `hai_refresh_token` | Fixed device keys shared by secure token adapter instances. A missing credential is empty. The adapter writes and clears both values. |
| Preferences / 設定値 | Caller-defined key and ordinary string. No TTL. Replacing a key overwrites its previous value. |
