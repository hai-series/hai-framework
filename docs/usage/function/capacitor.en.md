# @h-ai/capacitor API reference

[Chinese source](capacitor.md) · [Configuration](../configuration/capacitor.en.md) · [Data structures](../data/capacitor.en.md)

<a id="quick-start"></a>

## Quick start

Use the native module after `capacitor.init()`. Detect the runtime before doing work that needs a device. Remove push listeners when changing accounts or leaving a screen.

```ts
import { capacitor } from '@h-ai/capacitor'

const initialized = await capacitor.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
const failures: unknown[] = []
try {
  const saved = await capacitor.preferences.set('theme', 'dark')
  if (!saved.success)
    throw new Error(saved.error.message)
  const theme = await capacitor.preferences.get('theme')
  if (!theme.success)
    throw new Error(theme.error.message)
  // theme.data 为 'dark'；尚未保存的键为 null。
}
catch (cause) {
  failures.push(cause)
}
finally {
  const closed = await capacitor.close()
  if (!closed.success)
    failures.push(closed.error)
}
if (failures.length)
  throw new AggregateError(failures, 'Native preference operation failed')
```

<a id="api-reference"></a>

## API list

The output is HaiResult.data for module and preference operations. The token adapter methods reject on plugin failure. Import the named exports from @h-ai/capacitor.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `capacitor.init` | Detect platform and prepare the runtime | None | `void` | `await capacitor.init()` |
| `capacitor.close` | Release active native listeners | None | `void` | `await capacitor.close()` |
| `capacitor.getPlatform` | Identify Android, iOS or web | None | `string` | `capacitor.getPlatform()` |
| `capacitor.isNative` | Check whether code runs in a native app | None | `boolean` | `capacitor.isNative()` |
| `capacitor.device.getInfo` | Read OS and hardware information | None | `DeviceInfo` | `await capacitor.device.getInfo()` |
| `capacitor.device.getAppVersion` | Read the installed app version and build | None | `{ version, build }` | `await capacitor.device.getAppVersion()` |
| `capacitor.camera.takePhoto` | Capture or select an image | `{ source = "prompt", quality = 90, resultType = "uri", width?, height? }?` | `PhotoResult` | `await capacitor.camera.takePhoto({ source: 'camera' })` |
| `capacitor.push.register` | Register a device with the native push service | `{ signal? }?` | `PushRegistration` | `await capacitor.push.register()` |
| `capacitor.push.listen` | Receive deliveries and notification actions | `callbacks, { signal? }?` | `PushCleanup` | `await capacitor.push.listen(callbacks)` |
| `capacitor.statusBar.configure` | Apply only the supplied native status bar settings | `{ style?, backgroundColor?, overlay? }` | `void` | `await capacitor.statusBar.configure({ style: 'dark' })` |
| `capacitor.statusBar.show` | Show the native status bar | None | `void` | `await capacitor.statusBar.show()` |
| `capacitor.statusBar.hide` | Hide the native status bar | None | `void` | `await capacitor.statusBar.hide()` |
| `capacitor.preferences.get` | Read a nonsensitive preference | `key` | `string or null` | `await capacitor.preferences.get('theme')` |
| `capacitor.preferences.set` | Save a nonsensitive preference | `key, value` | `void` | `await capacitor.preferences.set('theme', 'dark')` |
| `capacitor.preferences.remove` | Remove a named preference | `key` | `void` | `await capacitor.preferences.remove('theme')` |
| `createCapacitorTokenStorage` | Create a native secure credential adapter | None | `TokenStorage` | `createCapacitorTokenStorage()` |
| `tokens.getAccessToken` | Read the access credential | None | `Promise<string or null>` | `await tokens.getAccessToken()` |
| `tokens.setAccessToken` | Save the access credential | `token` | `Promise<void>` | `await tokens.setAccessToken(accessToken)` |
| `tokens.getRefreshToken` | Read the refresh credential | None | `Promise<string or null>` | `await tokens.getRefreshToken()` |
| `tokens.setRefreshToken` | Save the refresh credential | `token` | `Promise<void>` | `await tokens.setRefreshToken(refreshToken)` |
| `tokens.clear` | Remove both credentials | None | `Promise<void>` | `await tokens.clear()` |
| `safeGetPreference` | Read a nonsensitive preference using a named export | `key` | `string or null` | `await safeGetPreference('theme')` |
| `safeSetPreference` | Save a nonsensitive preference using a named export | `key, value` | `void` | `await safeSetPreference('theme', 'dark')` |
| `safeRemovePreference` | Remove a preference using a named export | `key` | `void` | `await safeRemovePreference('theme')` |

The caller supplies callbacks and an optional AbortSignal. Save the cleanup callback from push.listen and await it when leaving the screen. Interpret photo fields according to resultType.
