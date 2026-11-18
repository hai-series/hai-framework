# @h-ai/capacitor API reference

[Chinese source](capacitor.md) · [Configuration](../configuration/capacitor.en.md) · [Data structures](../data/capacitor.en.md)

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

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. The value helper checks HaiResult.success and preserves the original error. Use isolated test data and explicit cleanup.

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="platform"></a>

### Prepare native access and read device data: `capacitor`

Initialization detects the actual platform. Device and version data depend on the runtime; web and native capabilities differ.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `capacitor.init` | Detect platform and prepare the runtime | None | `void` | `await capacitor.init()` |
| `capacitor.close` | Release active native listeners | None | `void` | `await capacitor.close()` |
| `capacitor.getPlatform` | Identify Android, iOS or web | None | `string` | `capacitor.getPlatform()` |
| `capacitor.isNative` | Check whether code runs in a native app | None | `boolean` | `capacitor.isNative()` |
| `capacitor.isInitialized` | 检查模块状态 | `—` | `boolean` | `capacitor.isInitialized` |
| `capacitor.device.getInfo` | Read OS and hardware information | None | `DeviceInfo` | `await capacitor.device.getInfo()` |
| `capacitor.device.getAppVersion` | Read the installed app version and build | None | `{ version, build }` | `await capacitor.device.getAppVersion()` |

#### Scenario: Prepare native access and read device data

```ts
value(await capacitor.init())
const platform = capacitor.getPlatform() // 'web', 'ios' or 'android'
const native = capacitor.isNative() // true on the native shell
capacitor.isInitialized // true
const info = value(await capacitor.device.getInfo()) // actual platform, OS and model
const version = await capacitor.device.getAppVersion() // check success; web may not supply native app data
value(await capacitor.close()) // undefined; listeners released
```

These calls take no input. Device data comes from actual plugins; initialize and check support before other examples.

The output is HaiResult.data for module and preference operations. The token adapter methods reject on plugin failure. Import the named exports from @h-ai/capacitor.

The caller supplies callbacks and an optional AbortSignal. Save the cleanup callback from push.listen and await it when leaving the screen. Interpret photo fields according to resultType.

<a id="call-options"></a>

#### Call arguments and integration options

| Option | Default | Meaning |
| --- | --- | --- |
| `camera.takePhoto`: `source`, `quality`, `resultType` | `prompt`, `90`, `uri` | Select camera, album or prompt, quality from 0 to 100, and URI/Base64/Data URL output. |
| `camera.takePhoto`: `width`, `height` | Optional | Maximum dimensions in pixels. |
| `statusBar.configure`: `style`, `backgroundColor`, `overlay` | Optional | Preserve current settings when omitted. Use a hex color and choose whether to cover the WebView. |
| `push.register`, `push.listen`: `signal` | Optional | Cancel registration or remove listeners when aborted. |
| `push.listen`: `onReceived`, `onActionPerformed` | Optional | Callbacks for delivery and interaction. |

[Detailed parameters and workflows](capacitor.md#platform)

<a id="camera"></a>

### Get a user-selected photo: `capacitor.camera`

Let the user choose a camera or photo source and choose uri, base64 or dataUrl for the next upload step.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `capacitor.camera.takePhoto` | Capture or select an image | `{ source = "prompt", quality = 90, resultType = "uri", width?, height? }?` | `PhotoResult` | `await capacitor.camera.takePhoto({ source: 'camera' })` |

#### Scenario: Get a user-selected photo

```ts
const photo = await capacitor.camera.takePhoto({ source: 'photos', resultType: 'dataUrl', quality: 80 })
if (photo.success) {
  const source = photo.data.data // selected image data URL
  const format = photo.data.format // actual image format
}
```

The input selects photos, quality 80 and dataUrl. Image content and format depend on user choice; handle cancellation and permission failures according to the returned result.

[Detailed parameters and workflows](capacitor.md#camera)

<a id="push"></a>

### Register and listen for push: `capacitor.push`

Request system permission, register push and listen for receipt and action events. Remove listeners when the owner ends.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `capacitor.push.register` | Register a device with the native push service | `{ signal? }?` | `PushRegistration` | `await capacitor.push.register()` |
| `capacitor.push.listen` | Receive deliveries and notification actions | `callbacks, { signal? }?` | `PushCleanup` | `await capacitor.push.listen(callbacks)` |

#### Scenario: Register and listen for push

Native push registration requests permission and waits for plugin events. Success/error listeners are attached before registration so immediate events are not lost.

![push.register: permission to native token](../images/function-capacitor-push.en.svg)

The 30-second boundary covers permission, listeners and registration events. Denial, timeout, cancellation or close cleans up known and late handles. Success requires a real registration event and successful listener cleanup. Cleanup failure also returns failure; close can retry cleanup. The application must still associate the token with the account on its server.

```ts
const received: unknown[] = []
const actions: unknown[] = []
const registration = value(await capacitor.push.register()) // { token: '<platform token>' }
const stop = value(await capacitor.push.listen({
  onReceived: notification => { received.push(notification) },
  onActionPerformed: action => { actions.push(action) },
}))
value(await stop()) // undefined; registered listeners removed
```

Inputs are application callbacks receiving real platform events. Do not log tokens; unsupported native push in web returns failure.

[Detailed parameters and workflows](capacitor.md#push)

<a id="status-bar"></a>

### Control the system status bar: `capacitor.statusBar`

Use the native status-bar plugin to configure style and overlay, then show or hide it for the page.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `capacitor.statusBar.configure` | Apply only the supplied native status bar settings | `{ style?, backgroundColor?, overlay? }` | `void` | `await capacitor.statusBar.configure({ style: 'dark' })` |
| `capacitor.statusBar.show` | Show the native status bar | None | `void` | `await capacitor.statusBar.show()` |
| `capacitor.statusBar.hide` | Hide the native status bar | None | `void` | `await capacitor.statusBar.hide()` |

#### Scenario: Control the system status bar

```ts
value(await capacitor.statusBar.configure({ style: 'dark', overlay: true }))
value(await capacitor.statusBar.hide())
value(await capacitor.statusBar.show())
```

Successful calls have no business data; observe the actual system bar on a supported native device. Browser output does not prove native behavior.

[Detailed parameters and workflows](capacitor.md#status-bar)

<a id="preferences"></a>

### Save ordinary preferences: `capacitor.preferences`

Store non-sensitive strings such as theme preferences. Independent safe helpers use the same result contract and are not credential storage.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `capacitor.preferences.get` | Read a nonsensitive preference | `key` | `string or null` | `await capacitor.preferences.get('theme')` |
| `capacitor.preferences.set` | Save a nonsensitive preference | `key, value` | `void` | `await capacitor.preferences.set('theme', 'dark')` |
| `capacitor.preferences.remove` | Remove a named preference | `key` | `void` | `await capacitor.preferences.remove('theme')` |
| `safeGetPreference` | Read a nonsensitive preference using a named export | `key` | `string or null` | `await safeGetPreference('theme')` |
| `safeSetPreference` | Save a nonsensitive preference using a named export | `key, value` | `void` | `await safeSetPreference('theme', 'dark')` |
| `safeRemovePreference` | Remove a preference using a named export | `key` | `void` | `await safeRemovePreference('theme')` |

#### Scenario: Save ordinary preferences

```ts
import { safeGetPreference, safeRemovePreference, safeSetPreference } from '@h-ai/capacitor'
value(await capacitor.preferences.set('demo-theme', 'dark'))
value(await capacitor.preferences.get('demo-theme')) // 'dark'
value(await capacitor.preferences.remove('demo-theme'))
value(await safeSetPreference('demo-theme', 'light'))
value(await safeGetPreference('demo-theme')) // 'light'
value(await safeRemovePreference('demo-theme'))
value(await safeGetPreference('demo-theme')) // null
```

Values are strings. set/remove have no business data; get returns a string or null.

[Detailed parameters and workflows](capacitor.md#preferences)

<a id="tokens"></a>

### Store credentials securely: `createCapacitorTokenStorage`

Use the native secure-storage adapter and give it to api-client to coordinate persistence failures and cleanup.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `createCapacitorTokenStorage` | Create a native secure credential adapter | None | `TokenStorage` | `createCapacitorTokenStorage()` |
| `tokens.getAccessToken` | Read the access credential | None | `Promise<string or null>` | `await tokens.getAccessToken()` |
| `tokens.getRefreshToken` | Read the refresh credential | None | `Promise<string or null>` | `await tokens.getRefreshToken()` |
| `tokens.setAccessToken` | Save the access credential | `token` | `Promise<void>` | `await tokens.setAccessToken(accessToken)` |
| `tokens.setRefreshToken` | Save the refresh credential | `token` | `Promise<void>` | `await tokens.setRefreshToken(refreshToken)` |
| `tokens.clear` | Remove both credentials | None | `Promise<void>` | `await tokens.clear()` |

#### Scenario: Store credentials securely

Supply tokens from a trusted login response on a native device with the secure plugin. Reads return the stored strings; finally clears them. Plugin failures reject the Promise.

```ts
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

async function verifySecureStorage(accessToken: string, refreshToken: string) {
  const tokens = createCapacitorTokenStorage()
  try {
    await tokens.setAccessToken(accessToken)
    await tokens.setRefreshToken(refreshToken)
    return {
      accessMatches: await tokens.getAccessToken() === accessToken,
      refreshMatches: await tokens.getRefreshToken() === refreshToken,
    } // both true
  }
  finally {
    await tokens.clear()
  }
}
```
