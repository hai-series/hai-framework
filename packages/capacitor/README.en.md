# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-client](../api-client/README.en.md) · [@h-ai/core](../core/README.en.md)

A Capacitor native bridge for hai Framework mobile apps, with a unified API for secure token storage, device information, push notifications, camera, and status bar access.

## Quick Start

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
  // theme.data is 'dark'; an absent key returns null.
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

## Features

### Purpose, inputs and outputs

Use capacitor subfeatures after successful initialization. Check HaiResult.success before reading data; void has no business data and Promises must be awaited. tokens is an independent adapter returned by createCapacitorTokenStorage(); its methods reject on native storage failure. Standalone Preferences helpers do not use module state and wrap the same plugin operations in HaiResult.

| Entry                            | Use case                                     | Input (`—` means none)                                                                                 | Return value                                                                                          | Call example                                                                    |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `capacitor.init`                 | Detect and prepare the native host           | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.init()`                                                        |
| `capacitor.close`                | Release owned native resources               | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.close()`                                                       |
| `capacitor.getPlatform`          | Choose platform behavior                     | `—`                                                                                                    | `string: ios / android / web`                                                                         | `capacitor.getPlatform()`                                                       |
| `capacitor.isNative`             | Check the native environment                 | `—`                                                                                                    | `boolean`                                                                                             | `capacitor.isNative()`                                                          |
| `capacitor.isInitialized`        | Check module readiness                       | `—`                                                                                                    | `boolean`                                                                                             | `capacitor.isInitialized`                                                       |
| `capacitor.device.getInfo`       | Read device diagnostics                      | `—`                                                                                                    | `Promise<HaiResult<{ platform, osVersion, model, manufacturer, isVirtual, appVersion?, appBuild? }>>` | `await capacitor.device.getInfo()`                                              |
| `capacitor.device.getAppVersion` | Read the installed app version               | `—`                                                                                                    | `Promise<HaiResult<{ version, build }>>`                                                              | `await capacitor.device.getAppVersion()`                                        |
| `capacitor.camera.takePhoto`     | Capture or select a photo                    | `{ source?: camera/photos/prompt, quality?: 0…100, width?, height?, resultType?: uri/base64/dataUrl }` | `Promise<HaiResult<{ data: string, format: string }>>`                                                | `await capacitor.camera.takePhoto({ source: "photos", resultType: "dataUrl" })` |
| `capacitor.push.register`        | Request permission and a push token          | `{ signal?: AbortSignal }`                                                                             | `Promise<HaiResult<{ token: string }>>`                                                               | `await capacitor.push.register()`                                               |
| `capacitor.push.listen`          | Observe notifications and taps               | `{ onReceived?, onActionPerformed? }, { signal? }`                                                     | `Promise<HaiResult<() => Promise<HaiResult<void>>>>`                                                  | `await capacitor.push.listen(callbacks, { signal })`                            |
| `capacitor.statusBar.configure`  | Configure the status bar                     | `{ style?: dark/light/default, backgroundColor?: color, overlay?: boolean }`                           | `Promise<HaiResult<void>>`                                                                            | `await capacitor.statusBar.configure({ style: "dark", overlay: true })`         |
| `capacitor.statusBar.show`       | Show the status bar                          | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.statusBar.show()`                                              |
| `capacitor.statusBar.hide`       | Hide the status bar                          | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.statusBar.hide()`                                              |
| `capacitor.preferences.get`      | Read a nonsensitive preference               | `key: string`                                                                                          | `Promise<HaiResult<string / null>>`                                                                   | `await capacitor.preferences.get("theme")`                                      |
| `capacitor.preferences.set`      | Save a nonsensitive preference               | `key: string, value: string`                                                                           | `Promise<HaiResult<void>>`                                                                            | `await capacitor.preferences.set("theme", "dark")`                              |
| `capacitor.preferences.remove`   | Remove a nonsensitive preference             | `key: string`                                                                                          | `Promise<HaiResult<void>>`                                                                            | `await capacitor.preferences.remove("theme")`                                   |
| `createCapacitorTokenStorage`    | Create native secure token storage           | `—`                                                                                                    | `TokenStorage`                                                                                        | `createCapacitorTokenStorage()`                                                 |
| `tokens.getAccessToken`          | Read the saved access token                  | `—`                                                                                                    | `Promise<string / null>`                                                                              | `await tokens.getAccessToken()`                                                 |
| `tokens.getRefreshToken`         | Read the saved refresh token                 | `—`                                                                                                    | `Promise<string / null>`                                                                              | `await tokens.getRefreshToken()`                                                |
| `tokens.setAccessToken`          | Save an access token                         | `token: string`                                                                                        | `Promise<void>`                                                                                       | `await tokens.setAccessToken(accessToken)`                                      |
| `tokens.setRefreshToken`         | Save a refresh token                         | `token: string`                                                                                        | `Promise<void>`                                                                                       | `await tokens.setRefreshToken(refreshToken)`                                    |
| `tokens.clear`                   | Remove both saved credentials                | `—`                                                                                                    | `Promise<void>`                                                                                       | `await tokens.clear()`                                                          |
| `safeGetPreference`              | Read a preference without module lifecycle   | `key: string`                                                                                          | `Promise<HaiResult<string / null>>`                                                                   | `await safeGetPreference("theme")`                                              |
| `safeSetPreference`              | Save a preference without module lifecycle   | `key: string, value: string`                                                                           | `Promise<HaiResult<void>>`                                                                            | `await safeSetPreference("theme", "dark")`                                      |
| `safeRemovePreference`           | Remove a preference without module lifecycle | `key: string`                                                                                          | `Promise<HaiResult<void>>`                                                                            | `await safeRemovePreference("theme")`                                           |

Photo source selects the camera, library or prompt; quality is 0–100 and width/height are pixel constraints. Successful data is a displayable webPath, raw Base64 or a MIME-prefixed Data URL according to resultType; format is the plugin image format. callbacks.onReceived/onActionPerformed receive notifications and signal comes from an application AbortController. A successful listen returns an async cleanup function whose result must be checked. Import standalone factories and Preferences helpers from the package root.

- **Token storage**: `@aparajita/capacitor-secure-storage` (required on native platforms). Android uses KeyStore + encrypted SharedPreferences; iOS uses Keychain. No Web fallback.
- **Preferences**: `@capacitor/preferences` (required). General preferences storage for nonsensitive settings, not authentication tokens.
- **Device information**: `@capacitor/device` (optional). Platform, version, and model detection.
- **App version**: `@capacitor/app` (optional). Read appVersion / appBuild.
- **Push notifications**: `@capacitor/push-notifications` (optional). Register FCM/APNs tokens and listen for push events.
- **Camera/gallery**: `@capacitor/camera` (optional). Capture photos or select gallery images.
- **Status bar**: `@capacitor/status-bar` (optional). Immersive mode, background color, and style settings.

### Secure token storage with api-client

```ts
import { apiClient } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

await apiClient.init({
  baseUrl: 'https://api.example.com/v1',
  auth: {
    storage: createCapacitorTokenStorage(),
    refreshPath: '/auth/refresh',
  },
})
```

`createCapacitorTokenStorage()` persists tokens only on native Android/iOS and requires `@aparajita/capacitor-secure-storage`. Its methods return promises directly: Web calls, an unavailable plugin, and failed reads, writes, or removals reject instead of pretending credentials are absent or an operation succeeded. Web entry points should select api-client cookie or memory storage.

`clear()` immediately blocks both old credentials in this adapter instance and waits for all native removals before reporting the result. Failures keep them blocked; a successful write reopens only that key. Update credentials through `apiClient.auth` for serialized writes and handle rejected `setTokens()` / `clear()` calls. The UI must release its loading state, discard the logged-out identity, and display failures. Instance-local blocking does not prove persistent deletion; revocation across restarts still requires server logout/session revocation. Retry with the same instance after the plugin recovers.

A failed credential write blocks both credentials, including an access token already saved before a refresh-token write failed. After failed login or registration persistence, attempt `auth.clear()` to remove partially saved data. Report cleanup failures explicitly instead of claiming device credentials were deleted.

All TokenStorage instances in the same module share a native mutation queue. `clear()` waits for earlier writes before removing credentials, preventing late writes from restoring old tokens after successful cleanup. Explicit later writes may save new credentials. This ordering does not coordinate independent WebViews or JavaScript runtimes.

### Device information and push notifications

```ts
import { capacitor } from '@h-ai/capacitor'

const info = await capacitor.device.getInfo()
if (info.success) {
  // info.data.platform — 'android' | 'ios' | 'web'
}

const reg = await capacitor.push.register()
if (reg.success) {
  // reg.data.token — FCM/APNs 推送 Token
}
```

Push requires an actual native platform. The setup phase of `push.register({ signal? })` and `push.listen(callbacks, { signal? })` has a 30-second deadline including permission requests and listener attachment. Failure, timeout, cancellation and `capacitor.close()` stop callbacks and remove owned handles; late handles are removed when they arrive. Other consumers are not affected through removeAllListeners. After listen succeeds, its signal and returned cleanup can still stop it. Cleanup and close return `HaiResult<void>`; native removal failures return `PUSH_CLEANUP_FAILED` (`capacitor:032`) and retain failed handles for retry without repeating successful removals. Closing disables the module immediately, and initialization retries pending cleanup first. Controlled plugin timing tests do not replace repeated registration, permission and FCM/APNs checks on Android/iOS devices.

### Status bar

```ts
import { capacitor } from '@h-ai/capacitor'

await capacitor.statusBar.configure({
  style: 'dark',
  overlay: true,
  backgroundColor: '#ffffff',
})
```

### Camera

```ts
const photo = await capacitor.camera.takePhoto({
  source: 'camera',
  resultType: 'base64',
  quality: 80,
})
```

### Preferences

```ts
await capacitor.preferences.set('my_key', 'value')
const result = await capacitor.preferences.get('my_key')
await capacitor.preferences.remove('my_key')
```

`capacitor.preferences` is for general preferences such as language, theme, and drafts. Use `createCapacitorTokenStorage()` for authentication tokens.

### Build an Android APK in a container

Run `pnpm build --target app --platform android --runtime auto --debug` at the Hai project root. Omit `--debug` for a signed release. Successful batches appear under `.hai/build/app/android/<variant>/`. See the [native build and signing instructions](../../docs/usage/getting-started/build.md#原生和离线条件).

The build image includes Node.js 24, pnpm 12.11.2, JDK 21, Android SDK 36, and Build Tools 35.0.0 and 36.0.0. The build runs on `linux/amd64`. The app's Gradle project and native plugins determine the APK's target ABIs, such as `arm64-v8a` and `armeabi-v7a`. Building for iOS requires macOS and Xcode.

Build the image from the framework repository root. In a project with this package installed, set `image_dir` to the `images` directory in the installed `@h-ai/capacitor` package.

```sh
image_dir=packages/capacitor/images
docker build --platform linux/amd64 -t hai-capacitor-android:36 \
  -f "$image_dir/android.Dockerfile" "$image_dir"
```

Run the container from the project root. Start with a clean working copy, run `pnpm install --frozen-lockfile` in the container, and build any local workspace packages the app depends on. Then run the app's existing build, `cap sync android`, and APK packaging commands. The APK is written to the mounted project. With rootless Podman, replace `docker` with `podman` and add `--userns=keep-id` alongside `--user`.

```sh
docker run --rm -it --platform linux/amd64 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e GRADLE_USER_HOME=/tmp/.gradle -e ANDROID_USER_HOME=/tmp/.android \
  -v "$PWD:/workspace" hai-capacitor-android:36 bash
```

Downloading dependencies requires access to npm, Gradle distributions, Google Maven, and Maven Central. Use the app's signing workflow for release builds. Mount the keystore read-only and inject passwords through the build environment. See the [mobile-app packaging and acceptance example](../../apps/mobile-app/README.md#原生交付与验收).

## Configuration

This module has no configuration file. `capacitor.init()` only checks whether the Capacitor runtime is available.

Native WebViews load a client application. For SvelteKit, configure a static SPA as below; pure Svelte/Vite templates do not use this route file:

```ts
// src/routes/+layout.ts
export const prerender = true
export const ssr = false
```

## Error Handling

`init/close`, device/camera/push/statusBar/preferences operations and `safe*Preference` return `HaiResult<T>`; `getPlatform/isNative/isInitialized` return direct values. TokenStorage methods reject on platform or storage errors:

```ts
import { capacitor, HaiCapacitorError } from '@h-ai/capacitor'

const result = await capacitor.camera.takePhoto({ source: 'camera' })
if (!result.success) {
  if (result.error.code === HaiCapacitorError.CAMERA_FAILED.code) {
    // 相机权限被拒绝或插件未安装
  }
}
```

Common error codes:

| Error code                                    | code                | Description                         |
| --------------------------------------------- | ------------------- | ----------------------------------- |
| `HaiCapacitorError.INIT_FAILED`               | `hai:capacitor:001` | Initialization failed               |
| `HaiCapacitorError.NOT_AVAILABLE`             | `hai:capacitor:002` | Capability unavailable              |
| `HaiCapacitorError.INIT_IN_PROGRESS`          | `hai:capacitor:003` | Initialization in progress          |
| `HaiCapacitorError.NOT_INITIALIZED`           | `hai:capacitor:010` | Not initialized                     |
| `HaiCapacitorError.PREFERENCES_GET_FAILED`    | `hai:capacitor:011` | Preferences read failed             |
| `HaiCapacitorError.PREFERENCES_SET_FAILED`    | `hai:capacitor:012` | Preferences write failed            |
| `HaiCapacitorError.PREFERENCES_REMOVE_FAILED` | `hai:capacitor:013` | Preferences removal failed          |
| `HaiCapacitorError.DEVICE_INFO_FAILED`        | `hai:capacitor:020` | Device information retrieval failed |
| `HaiCapacitorError.APP_VERSION_FAILED`        | `hai:capacitor:021` | App version retrieval failed        |
| `HaiCapacitorError.PUSH_REGISTER_FAILED`      | `hai:capacitor:030` | Push registration failed            |
| `HaiCapacitorError.PUSH_LISTEN_FAILED`        | `hai:capacitor:031` | Push listener failed                |
| `HaiCapacitorError.CAMERA_FAILED`             | `hai:capacitor:040` | Camera operation failed             |
| `HaiCapacitorError.STATUS_BAR_FAILED`         | `hai:capacitor:050` | Status bar operation failed         |

## Development

```bash
pnpm --filter @h-ai/capacitor test
```

> Tests must mock `@capacitor/*` modules because they depend on native plugins.

Public operations, internal resource scopes and types include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证). Typechecking does not prove device permissions or live FCM/APNs delivery.

## License

Apache-2.0
