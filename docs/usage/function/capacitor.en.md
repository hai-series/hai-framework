# @h-ai/capacitor API reference

[Chinese source](capacitor.md) · [Configuration](../configuration/capacitor.en.md) · [Data structures](../data/capacitor.en.md)

<a id="quick-start"></a>

Use the native module after `capacitor.init()`. Detect the runtime before doing work that needs a device. Remove push listeners when changing accounts or leaving a screen.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `capacitor.init()`, `close()`, `getPlatform()`, `isNative()`, `isInitialized()` | Initialize or close the module and query platform or lifecycle state without options. | `capacitor.getPlatform()` |
| `capacitor.device.getInfo()`, `getAppVersion()` | Return device metadata or the installed version. | `await capacitor.device.getInfo()` |
| `capacitor.camera.takePhoto(options?)` | Prompt for a photo by default and return it in URI form. Quality defaults to 90. | `await capacitor.camera.takePhoto({ source: 'camera' })` |
| `capacitor.push.register(options?)`, `listen(handlers, options?)` | Request permission and a token, or receive notifications and action events. Pass an abort signal for cleanup. | `await capacitor.push.listen({ onReceived }, { signal })` |
| `capacitor.statusBar.configure(options)`, `show()`, `hide()` | Set color, style and overlay, or toggle visibility. | `await capacitor.statusBar.show()` |
| `capacitor.preferences.get(key)`, `set(key, value)`, `remove(key)` | Manage ordinary strings on the device. | `await capacitor.preferences.set('theme', 'dark')` |
| `createCapacitorTokenStorage()` | Create the native token adapter with access/refresh get, set and clear operations. Import from `@h-ai/capacitor`. | `const tokens = createCapacitorTokenStorage()` |
| `safeGetPreference`, `safeSetPreference`, `safeRemovePreference` | Standalone helpers for non-sensitive preferences, accepting a key and a value for set. | `await safeGetPreference('theme')` |
