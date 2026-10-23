# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-client](../api-client/README.en.md) · [@h-ai/core](../core/README.en.md)

## Introduction

A Capacitor native bridge for hai Framework mobile apps, with a unified API for secure token storage, device information, push notifications, camera, and status bar access.

## Core features

- **Token storage**: `@aparajita/capacitor-secure-storage` (required on native platforms). Android uses KeyStore + encrypted SharedPreferences; iOS uses Keychain. No Web fallback.
- **Preferences**: `@capacitor/preferences` (required). General preferences storage for nonsensitive settings, not authentication tokens.
- **Device information**: `@capacitor/device` (optional). Platform, version, and model detection.
- **App version**: `@capacitor/app` (optional). Read appVersion / appBuild.
- **Push notifications**: `@capacitor/push-notifications` (optional). Register FCM/APNs tokens and listen for push events.
- **Camera/gallery**: `@capacitor/camera` (optional). Capture photos or select gallery images.
- **Status bar**: `@capacitor/status-bar` (optional). Immersive mode, background color, and style settings.

## Getting started

### Quick start

```ts
import { capacitor } from '@h-ai/capacitor'

// 应用启动时初始化（检测 Capacitor 环境）
const result = await capacitor.init()
if (!result.success) {
  // 非 Capacitor 环境（纯 Web）
}
```

#### Secure token storage with api-client

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

#### Device information and push notifications

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

#### Status bar

```ts
import { capacitor } from '@h-ai/capacitor'

await capacitor.statusBar.configure({
  style: 'dark',
  overlay: true,
  backgroundColor: '#ffffff',
})
```

#### Camera

```ts
const photo = await capacitor.camera.takePhoto({
  source: 'camera',
  resultType: 'base64',
  quality: 80,
})
```

#### Preferences

```ts
await capacitor.preferences.set('my_key', 'value')
const result = await capacitor.preferences.get('my_key')
await capacitor.preferences.remove('my_key')
```

`capacitor.preferences` is for general preferences such as language, theme, and drafts. Use `createCapacitorTokenStorage()` for authentication tokens.

### Configuration

This module has no configuration file. `capacitor.init()` only checks whether the Capacitor runtime is available.

Capacitor applications must use SPA mode:

```ts
// src/routes/+layout.ts
export const prerender = true
export const ssr = false
```

### Error handling

Business operations on `capacitor.*` and `safe*Preference` return `HaiResult<T>`. TokenStorage adapter methods reject their promises on platform or storage errors:

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

## Development and testing

```bash
pnpm --filter @h-ai/capacitor test
```

> Tests must mock `@capacitor/*` modules because they depend on native plugins.

Public operations, internal resource scopes and types include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证). Typechecking does not prove device permissions or live FCM/APNs delivery.

## License

Apache-2.0
