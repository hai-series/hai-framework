# @h-ai/capacitor API reference

[Chinese source](capacitor.md) · [Configuration](../configuration/capacitor.en.md) · [Data structures](../data/capacitor.en.md)

## Quick start

Use the native module after `capacitor.init()`. Detect the runtime before doing work that needs a device. Remove push listeners when changing accounts or leaving a screen.

```ts
import { capacitor } from '@h-ai/capacitor'

// Detect and initialize the current Capacitor platform with defaults. A failed result stops before Preferences are used.
const initialized = await capacitor.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
const failures: unknown[] = []
try {
  // Write dark under theme. Success completes the preference write; storage failure becomes an error in this example.
  const saved = await capacitor.preferences.set('theme', 'dark')
  if (!saved.success)
    throw new Error(saved.error.message)
  // Read the same theme key. Expect dark or null for a missing value. A failed read is collected below.
  const theme = await capacitor.preferences.get('theme')
  if (!theme.success)
    throw new Error(theme.error.message)
  // theme.data 为 'dark'；尚未保存的键为 null。
}
catch (cause) {
  failures.push(cause)
}
finally {
  // Close the active Capacitor instance and release its listeners. Collect any cleanup failure.
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

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. Each call checks HaiResult.success before reading data and returns the original failed result to its caller. Scenarios without a function declaration are fragments inside an async application function. Use isolated test data and explicit cleanup.

<a id="platform"></a>

### Prepare native access and read device data: `capacitor`

Initialization detects the actual platform. Device and version data depend on the runtime; web and native capabilities differ.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `capacitor.init()` | Detect platform and prepare the runtime | None | `void` | `await capacitor.init()` |
| `capacitor.close()` | Release active native listeners | None | `void` | `await capacitor.close()` |
| `capacitor.getPlatform()` | Identify Android, iOS or web | None | `string` | `capacitor.getPlatform()` |
| `capacitor.isNative()` | Check whether code runs in a native app | None | `boolean` | `capacitor.isNative()` |
| `capacitor.isInitialized` | 检查模块状态 | `—` | `boolean` | `capacitor.isInitialized` |
| `capacitor.device.getInfo()` | Read OS and hardware information | None | `DeviceInfo` | `await capacitor.device.getInfo()` |
| `capacitor.device.getAppVersion()` | Read the installed app version and build | None | `{ version, build }` | `await capacitor.device.getAppVersion()` |

#### Scenario: Prepare native access and read device data

```ts
// Fragment inside an async application function; return failed results to its caller.
// Initialize this platform with defaults. Success has no data; return the original failed result on failure.
const initResult = await capacitor.init()
if (!initResult.success)
  return initResult
// Read the detected platform without arguments. The result is web, ios, or android.
const platform = capacitor.getPlatform() // 'web', 'ios' or 'android'
// Check the detected platform without arguments. true means an iOS or Android native shell.
const native = capacitor.isNative() // true on the native shell
capacitor.isInitialized // true
// Read platform, OS, and model from the active device. Return the failed result if the device operation fails.
const infoResult = await capacitor.device.getInfo()
if (!infoResult.success)
  return infoResult
const info = infoResult.data // actual platform, OS and model
// Ask the current app for version and build. Check success because native application data may be unavailable on web.
const version = await capacitor.device.getAppVersion() // check success; web may not supply native app data
// Close the current instance and release listeners. Return the failed result if cleanup fails.
const closeResult = await capacitor.close()
if (!closeResult.success)
  return closeResult
// listeners released
```

These calls take no input. Device data comes from actual plugins; initialize and check support before other examples.

The output is HaiResult.data for module and preference operations. The token adapter methods reject on plugin failure. Import the named exports from @h-ai/capacitor.

The caller supplies callbacks and an optional AbortSignal. Save the cleanup callback from push.listen and await it when leaving the screen. Interpret photo fields according to resultType.

<a id="call-options"></a>

#### Native call options

| Field | Default and conditions | Purpose |
| --- | --- | --- |
| `takePhoto.options.source` | Default `prompt` | Use `camera` for capture, `photos` for the gallery, or `prompt` for the device chooser. |
| `takePhoto.options.quality` / `width` / `height` | Default quality 90. Dimensions are unset. | Quality is 0–100. Width and height specify the maximum size in pixels. |
| `takePhoto.options.resultType` | Default `uri` | On success, `data` is a photo URL, Base64 string, or data URL for `uri`, `base64`, or `dataUrl`, respectively. |
| `configure.config.style` / `backgroundColor` / `overlay` | Omitted settings cause no plugin write | Style accepts `dark`, `light`, or `default`. Pass a hex background color. `overlay` controls whether the bar covers the WebView. |
| `push.register.options.signal` / `push.listen.options.signal` | Optional | Cancels pending registration or removes listeners when aborted. |
| `push.listen.options.onReceived` / `onActionPerformed` | Optional | Handles delivery and user interaction, respectively. |

For example, `takePhoto({ source: "photos", resultType: "uri", width: 1200 })` selects a gallery photo. On success, the result contains a preview URL and the format, with a width limit of 1,200 pixels.

<a id="camera"></a>

### Get a user-selected photo: `capacitor.camera`

Let the user choose a camera or photo source and choose uri, base64 or dataUrl for the next upload step.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `capacitor.camera.takePhoto(options?)` | Capture or select an image | Optional `options` selects the source, quality, dimensions, and output format. See [native call options](#call-options). | `PhotoResult` | `await capacitor.camera.takePhoto({ source: 'camera' })` |

#### Scenario: Get a user-selected photo

```ts
// Select a photo at quality 80 and request a data URL. Success includes image data and format. Cancellation or plugin failure returns an error.
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
| `capacitor.push.register(options?)` | Register a device with the native push service | Optional `options.signal: AbortSignal` cancels registration waiting. Omitting it supplies no caller cancellation signal. | `PushRegistration` | `await capacitor.push.register()` |
| `capacitor.push.listen(callbacks, options?)` | Receive deliveries and notification actions | Required `callbacks` object with optional `onReceived(notification)` and `onActionPerformed(action)`. Optional `options.signal` releases these listeners on abort. | `PushCleanup` | `await capacitor.push.listen(callbacks)` |

#### Scenario: Register and listen for push

Native push registration requests permission and waits for plugin events. Success/error listeners are attached before registration so immediate events are not lost.

![push.register: permission to native token](../images/function-capacitor-push.en.svg)

The 30-second boundary covers permission, listeners and registration events. Denial, timeout, cancellation or close cleans up known and late handles. Success requires a real registration event and successful listener cleanup. Cleanup failure also returns failure; close can retry cleanup. The application must still associate the token with the account on its server.

```ts
// Fragment inside an async application function; return failed results to its caller.
const received: unknown[] = []
const actions: unknown[] = []
// Register this device for push with default settings. Success contains the platform token. Return the failed result on registration failure.
const registrationResult = await capacitor.push.register()
if (!registrationResult.success)
  return registrationResult
const registration = registrationResult.data // { token: '<platform token>' }
// Append delivered notifications and actions to the given arrays. Success returns an async listener cleanup function. Return the failed result on setup failure.
const stopResult = await capacitor.push.listen({
  onReceived: notification => { received.push(notification) },
  onActionPerformed: action => { actions.push(action) },
})
if (!stopResult.success)
  return stopResult
const stop = stopResult.data
// Remove the listeners installed above. Success has no data. Return the failed result on cleanup failure.
const stopResult2 = await stop()
if (!stopResult2.success)
  return stopResult2
// registered listeners removed
```

Inputs are application callbacks receiving real platform events. Do not log tokens; unsupported native push in web returns failure.

[Detailed parameters and workflows](capacitor.md#push)

<a id="status-bar"></a>

### Control the system status bar: `capacitor.statusBar`

Use the native status-bar plugin to configure style and overlay, then show or hide it for the page.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `capacitor.statusBar.configure(config)` | Apply only the supplied native status bar settings | Required `config` object with optional `style`, `backgroundColor`, and `overlay`. See [native call options](#call-options). | `void` | `await capacitor.statusBar.configure({ style: 'dark' })` |
| `capacitor.statusBar.show()` | Show the native status bar | None | `void` | `await capacitor.statusBar.show()` |
| `capacitor.statusBar.hide()` | Hide the native status bar | None | `void` | `await capacitor.statusBar.hide()` |

#### Scenario: Control the system status bar

```ts
// Fragment inside an async application function; return failed results to its caller.
// Apply dark status text and enable overlay on the active native view. Return the failed result for unsupported platform or plugin errors.
const configureResult = await capacitor.statusBar.configure({ style: 'dark', overlay: true })
if (!configureResult.success)
  return configureResult
// Hide the status bar for the active app. Return the failed result if the plugin operation fails.
const hideResult = await capacitor.statusBar.hide()
if (!hideResult.success)
  return hideResult
// Show the status bar again. Return the failed result if restoration fails.
const showResult = await capacitor.statusBar.show()
if (!showResult.success)
  return showResult
```

Successful calls have no business data; observe the actual system bar on a supported native device. Browser output does not prove native behavior.

[Detailed parameters and workflows](capacitor.md#status-bar)

<a id="preferences"></a>

### Save ordinary preferences: `capacitor.preferences`

Store non-sensitive strings such as theme preferences. Independent safe helpers use the same result contract and are not credential storage.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `capacitor.preferences.get(key)` | Read a nonsensitive preference | Required `key` names the nonsensitive preference. | `string or null` | `await capacitor.preferences.get('theme')` |
| `capacitor.preferences.set(key, value)` | Save a nonsensitive preference | Required `key` names the preference and `value` is the nonsensitive string to save. | `void` | `await capacitor.preferences.set('theme', 'dark')` |
| `capacitor.preferences.remove(key)` | Remove a named preference | Required `key` names the nonsensitive preference. | `void` | `await capacitor.preferences.remove('theme')` |
| `safeGetPreference(key)` | Read a nonsensitive preference using a named export | Required `key` names the nonsensitive preference. | `string or null` | `await safeGetPreference('theme')` |
| `safeSetPreference(key, value)` | Save a nonsensitive preference using a named export | Required `key` names the preference and `value` is the nonsensitive string to save. | `void` | `await safeSetPreference('theme', 'dark')` |
| `safeRemovePreference(key)` | Remove a preference using a named export | Required `key` names the nonsensitive preference. | `void` | `await safeRemovePreference('theme')` |

#### Scenario: Save ordinary preferences

```ts
// Keep imports at module scope; run the remaining fragment inside an async application function and return failures to its caller.
import { safeGetPreference, safeRemovePreference, safeSetPreference } from '@h-ai/capacitor'
// Write dark at demo-theme through the initialized Preferences API. Return the failed result on a failed write.
const setResult = await capacitor.preferences.set('demo-theme', 'dark')
if (!setResult.success)
  return setResult
// Read demo-theme through Preferences. It returns dark, or null if the key is gone. Return the failed result on failure.
const getResult = await capacitor.preferences.get('demo-theme')
if (!getResult.success)
  return getResult
getResult.data // 'dark'
// Remove demo-theme through Preferences. Success has no data. Return the failed result for storage errors.
const removeResult = await capacitor.preferences.remove('demo-theme')
if (!removeResult.success)
  return removeResult
// Use the standalone helper to write light at demo-theme. Return the failed result for storage errors.
const safeSetPreferenceResult = await safeSetPreference('demo-theme', 'light')
if (!safeSetPreferenceResult.success)
  return safeSetPreferenceResult
// Read the same key with the standalone helper. Expect light. Return the failed result on a failed read.
const safeGetPreferenceResult = await safeGetPreference('demo-theme')
if (!safeGetPreferenceResult.success)
  return safeGetPreferenceResult
safeGetPreferenceResult.data // 'light'
// Delete demo-theme with the standalone helper. The returned result is void on success.
const safeRemovePreferenceResult = await safeRemovePreference('demo-theme')
if (!safeRemovePreferenceResult.success)
  return safeRemovePreferenceResult
// Read demo-theme after deletion. Expect null on success. Return the failed result on a failed read.
const safeGetPreferenceResult2 = await safeGetPreference('demo-theme')
if (!safeGetPreferenceResult2.success)
  return safeGetPreferenceResult2
safeGetPreferenceResult2.data // null
```

Values are strings. set/remove have no business data; get returns a string or null.

[Detailed parameters and workflows](capacitor.md#preferences)

<a id="tokens"></a>

### Store credentials securely: `createCapacitorTokenStorage`

Use the native secure-storage adapter and give it to api-client to coordinate persistence failures and cleanup.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `createCapacitorTokenStorage()` | Create a native secure credential adapter | None | `TokenStorage` | `createCapacitorTokenStorage()` |
| `tokens.getAccessToken()` | Read the access credential | None | `Promise<string or null>` | `await tokens.getAccessToken()` |
| `tokens.getRefreshToken()` | Read the refresh credential | None | `Promise<string or null>` | `await tokens.getRefreshToken()` |
| `tokens.setAccessToken(token)` | Save the access credential | Required `token`, the access token string from a trusted authentication response. | `Promise<void>` | `await tokens.setAccessToken(accessToken)` |
| `tokens.setRefreshToken(token)` | Save the refresh credential | Required `token`, the refresh token string from a trusted authentication response. | `Promise<void>` | `await tokens.setRefreshToken(refreshToken)` |
| `tokens.clear()` | Remove both credentials | None | `Promise<void>` | `await tokens.clear()` |

#### Scenario: Store credentials securely

Supply tokens from a trusted login response on a native device with the secure plugin. Reads return the stored strings; finally clears them. Plugin failures reject the Promise.

```ts
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

async function verifySecureStorage(accessToken: string, refreshToken: string) {
  // Create a native secure token storage adapter with default key names. Its operations use the secure plugin.
  const tokens = createCapacitorTokenStorage()
  try {
    // Store the issued access token. This resolves without data or rejects if the secure write fails.
    await tokens.setAccessToken(accessToken)
    // Store the issued refresh token. This rejects on storage failure.
    await tokens.setRefreshToken(refreshToken)
    return {
      // Read the stored access token. It matches the supplied token after a successful write, or is null if absent. Plugin failures reject.
      accessMatches: await tokens.getAccessToken() === accessToken,
      // Read the stored refresh token. It matches the supplied token after a successful write, or is null if absent. Plugin failures reject.
      refreshMatches: await tokens.getRefreshToken() === refreshToken,
    } // both true
  }
  finally {
    // Delete both secure credentials. Partial deletion failure rejects with the cleanup errors.
    await tokens.clear()
  }
}
```
