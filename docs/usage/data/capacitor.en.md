# @h-ai/capacitor Data structures

[Chinese source](capacitor.md) · [Configuration](../configuration/capacitor.en.md) · [API reference](../function/capacitor.en.md)

Device credentials live in Android encrypted storage protected by the system keystore or iOS Keychain. IAM owns the server session. Ordinary preferences are distinct from secure credentials.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_access_token`, `hai_refresh_token` | Fixed device keys shared by secure token adapter instances. A missing credential is empty. The adapter writes and clears both values. |
| Preferences / 設定値 | Caller-defined key and ordinary string. No TTL. Replacing a key overwrites its previous value. |
