# @h-ai/capacitor Configuration

[Chinese source](capacitor.md) · [Data structures](../data/capacitor.en.md) · [API reference](../function/capacitor.en.md)

Set `appId`, `appName` and the actual web output directory `webDir` in the native project. A physical device must be able to reach the API URL passed to the API client. `CAPACITOR_SERVER_URL` is optional for device development; ship synced assets in release builds.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `appId` | Project supplies | Unique application identifier in `capacitor.config.ts`. |
| `appName` | Project supplies | Display name in the native project. |
| `webDir` | Match build output | Directory copied into the native package. |
| `CAPACITOR_SERVER_URL` | Optional | Template reads this environment value for device development; release builds use synced assets. |
