# @h-ai/capacitor Data Structures

[简体中文](capacitor.md) · [日本語](capacitor.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/capacitor.en.md) · [API reference](../function/capacitor.en.md)

A mobile application can store sign-in credentials in the secure device store and recover the session later. Device preferences separately hold ordinary settings such as the last opened tab.

## Device storage

Device credentials live in Android encrypted storage protected by the system keystore or iOS Keychain. IAM owns the server session. Ordinary preferences are distinct from secure credentials.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_access_token`, `hai_refresh_token` | Fixed device keys shared by secure token adapter instances. A missing credential is empty. The adapter writes and clears both values. |
| Preferences | Caller-defined key and ordinary string. No TTL. Replacing a key overwrites its previous value. |

<a id="example-data"></a>

### Device access credential

A native app reads this from secure storage to call signed-in APIs.

```json
"<access-token:redacted>"
```

The token is redacted. Logout clears it through the adapter; IAM still decides server-session validity.

### Device renewal credential

A native app can exchange this credential for new tokens after access expiry.

```json
"<refresh-token:redacted>"
```

Keep it in platform secure storage, not Preferences. No local TTL does not mean unlimited validity: the server can invalidate it.

### A non-sensitive device preference

Preferences stores non-sensitive UI choices under application-owned keys.

```json
"orders"
```

orders selects the orders tab next time. This example key is not framework authentication state.
