# @h-ai/capacitor 功能说明

[English](capacitor.en.md) · [日本語](capacitor.ja.md)

通过 `capacitor` 在 Capacitor 的 Android/iOS 应用中获取设备信息、注册推送、拍照或读写应用偏好。先安装需要的原生插件并将其同步到 Android/iOS 项目，运行时按需向用户请求权限。认证凭据使用独立的安全存储适配器。

设备、相机、推送、状态栏和偏好设置操作统一从 `capacitor` 进入，在 `capacitor.init()` 成功后调用。为 API 客户端创建原生安全凭据存储时，调用 `capacitor.createTokenStorage()`；创建适配器无需先初始化，实际读写仍要求原生环境和安全存储插件可用。

[模块 README](../../../packages/capacitor/README.md) · [配置清单](../configuration/capacitor.md) · [数据结构](../data/capacitor.md) · [构建和原生交付](../getting-started/build.md)

<a id="quick-start"></a>

## 最小接入示例

```ts
import { capacitor } from '@h-ai/capacitor'

// 使用默认设置检测并初始化当前 Capacitor 平台；失败时停止，不继续使用偏好操作。
const initialized = await capacitor.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
const failures: unknown[] = []
try {
  // 将 dark 写入 theme；成功表示偏好已保存，本示例在存储失败时抛出错误。
  const saved = await capacitor.preferences.set('theme', 'dark')
  if (!saved.success)
    throw new Error(saved.error.message)
  // 读取同一个 theme 键；已保存时为 dark，键不存在时为 null，读取失败由下方收集。
  const theme = await capacitor.preferences.get('theme')
  if (!theme.success)
    throw new Error(theme.error.message)
  // theme.data 为 'dark'；尚未保存的键为 null。
}
catch (cause) {
  failures.push(cause)
}
finally {
  // 关闭当前 Capacitor 实例并释放监听器；收集清理失败。
  const closed = await capacitor.close()
  if (!closed.success)
    failures.push(closed.error)
}
if (failures.length)
  throw new AggregateError(failures, 'Native preference operation failed')
```

<a id="api-reference"></a>

## 功能说明

<a id="call-options"></a>

调用参数按功能说明：[拍照选项](#camera-options)、[推送回调与取消选项](#push-options)、[状态栏选项](#status-bar-options)。构建 APK 的步骤见独立的 [Android 容器打包](#android-容器打包) 章节。

下面的场景代码从本页最小接入中导入模块；除连接/关闭场景外，均在初始化成功后、关闭前运行。每次调用后先检查 `HaiResult.success`；失败分支返回原结果，成功分支再读取 `data`。未给出函数声明的场景是应用异步业务函数内的片段。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

<a id="platform"></a>

### 准备原生环境与读取设备：`capacitor`

初始化时检测实际平台，设备和版本信息按当前运行环境返回；Web 与原生支持范围不同。

`close()` 从调用开始使模块不可用，并使当时尚未完成的 `init()` 失效。旧初始化结束时返回既有的 `INIT_FAILED`，不会在关闭后把 `isInitialized` 恢复为 `true`。需要继续使用时，先等待关闭完成，再显式调用新一轮 `init()`。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `capacitor.init()` | 检测平台并准备原生插件 | `—` | `Promise<HaiResult<void>>` | `await capacitor.init()` |
| `capacitor.close()` | 释放推送监听等资源 | `—` | `Promise<HaiResult<void>>` | `await capacitor.close()` |
| `capacitor.getPlatform()` | 选择平台行为 | `—` | `string: ios / android / web` | `capacitor.getPlatform()` |
| `capacitor.isNative()` | 判断是否原生环境 | `—` | `boolean` | `capacitor.isNative()` |
| `capacitor.isInitialized` | 检查模块状态 | `—` | `boolean` | `capacitor.isInitialized` |
| `capacitor.device.getInfo()` | 显示设备诊断信息 | `—` | `Promise<HaiResult<{ platform, osVersion, model, manufacturer, isVirtual, appVersion?, appBuild? }>>` | `await capacitor.device.getInfo()` |
| `capacitor.device.getAppVersion()` | 显示当前安装版本 | `—` | `Promise<HaiResult<{ version, build }>>` | `await capacitor.device.getAppVersion()` |

#### 场景：准备原生环境与读取设备

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 使用默认设置初始化当前平台；成功无业务数据，失败时返回原失败结果。
const initResult = await capacitor.init()
if (!initResult.success)
  return initResult
// 无参读取检测到的平台；结果为 web、ios 或 android。
const platform = capacitor.getPlatform() // 'web'、'ios' 或 'android'
// 无参判断当前是否为原生环境；true 表示运行在 iOS 或 Android 原生壳中。
const native = capacitor.isNative() // 原生壳中为 true
capacitor.isInitialized // true
// 读取当前设备的平台、系统及型号；设备操作失败时返回原失败结果。
const infoResult = await capacitor.device.getInfo()
if (!infoResult.success)
  return infoResult
const info = infoResult.data // 设备实际平台、系统及型号
// 读取当前应用的版本和构建号；Web 可能无法提供原生应用信息，需检查 success。
const version = await capacitor.device.getAppVersion() // 需检查 success；Web 可能无法提供原生应用信息
// 关闭当前实例并释放监听器；清理失败时返回原失败结果。
const closeResult = await capacitor.close()
if (!closeResult.success)
  return closeResult
// 监听器已释放，没有业务数据
```

无输入参数；设备结果来自实际插件，不能写死型号或版本。其他例子先初始化并检查平台支持。

设备和推送操作要在 `capacitor.init()` 成功后调用。读写普通偏好也要先初始化，再通过 `capacitor.preferences` 操作；每次调用都先检查 `HaiResult.success`。

- **Token 存储**：`@aparajita/capacitor-secure-storage`（原生必需）。Android 使用 KeyStore + 加密 SharedPreferences，iOS 使用 Keychain；Web 不回退。
- **Preferences**：`@capacitor/preferences`（必需）。通用偏好数据存储，适合非敏感配置，不用于认证 Token。
- **设备信息**：`@capacitor/device`（可选）。平台、版本、型号检测。
- **应用版本**：`@capacitor/app`（可选）。读取 appVersion / appBuild。
- **推送通知**：`@capacitor/push-notifications`（可选）。注册 FCM/APNs Token、监听推送事件。
- **相机/相册**：`@capacitor/camera`（可选）。拍照、选取相册图片。
- **状态栏**：`@capacitor/status-bar`（可选）。沉浸式、背景色、样式配置。

<a id="camera"></a>

### 取得用户选择的照片：`capacitor.camera`

相机或相册选择由用户完成；根据后续上传方式选择 uri、base64 或 dataUrl。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `capacitor.camera.takePhoto(options?)` | 拍照或选择相册图片 | 可选 `options`，控制来源、画质、尺寸和返回格式。见[拍照选项](#camera-options)。 | `Promise<HaiResult<{ data: string, format: string }>>` | `await capacitor.camera.takePhoto({ source: "photos", resultType: "dataUrl" })` |

<a id="camera-options"></a>

#### 拍照选项

以下字段属于 `capacitor.camera.takePhoto(options)` 的 `options` 参数。

| 字段 | 默认与条件 | 用途 |
| --- | --- | --- |
| `source` | 默认 `prompt` | `camera` 打开相机，`photos` 选择相册，`prompt` 由设备显示选择器。 |
| `quality` | 默认 `90` | 画质范围为 0–100。 |
| `width` / `height` | 可省略，无默认尺寸限制 | 以像素指定图片最大宽度和高度。 |
| `resultType` | 默认 `uri` | 成功时 `data` 分别为可显示的图片 URL（`uri`）、裸 Base64（`base64`）或带 MIME 前缀的 Data URL（`dataUrl`）；`format` 为插件返回的图片格式。 |

#### 场景：取得用户选择的照片

```ts
// 以画质 80 选择照片并请求 Data URL；成功返回图片数据和格式，取消或插件失败时返回错误。
const photo = await capacitor.camera.takePhoto({ source: 'photos', resultType: 'dataUrl', quality: 80 })
if (photo.success) {
  const source = photo.data.data // 用户所选图片的 Data URL
  const format = photo.data.format // 实际图片格式
}
```

输入选择相册、80 质量和 dataUrl；输出图像内容与格式由用户文件决定，取消或拒绝权限按真实结果处理，不使用空成功代替。

#### 场景：打开摄像头并取得 Base64

```ts
// 以画质 80 打开相机，取得 Base64 图片内容和设备报告的格式；权限或拍摄失败时在下方抛出错误。
const photo = await capacitor.camera.takePhoto({
  source: 'camera',
  resultType: 'base64',
  quality: 80,
})
if (!photo.success)
  throw new Error(photo.error.message)
photo.data // { data: '用户拍摄图片的 Base64 内容', format: 'jpeg' }；格式以实际设备结果为准
```

<a id="push"></a>

### 登记与监听推送：`capacitor.push`

先申请系统权限并登记推送，再监听收到和点击事件；页面或身份结束时解除监听。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `capacitor.push.register(options?)` | 申请权限并获取推送标识 | 可选 `options.signal: AbortSignal` 中止注册。自调用开始，取得 token 与收尾清理共用 30 秒期限。 | `Promise<HaiResult<{ token: string }>>`；超时或中止及时返回失败，原生清理可继续。 | `await capacitor.push.register()` |
| `capacitor.push.listen(callbacks, options?)` | 接收推送与点击事件 | `callbacks` 对象必填，含可选的收件 `onReceived(notification)` 与点击 `onActionPerformed(action)`。设置阶段限时 30 秒；可选 `options.signal` 在成功后仍可停止回调并发起清理。 | `Promise<HaiResult<() => Promise<HaiResult<void>>>>`；成功返回需等待并检查结果的清理函数。 | `await capacitor.push.listen(callbacks, { signal })` |

<a id="push-options"></a>

#### 推送回调与取消选项

`callbacks` 是 `listen()` 的第一个参数，`options` 是第二个参数；`register()` 只接收可选的 `options`。

| 字段 | 默认与条件 | 用途 |
| --- | --- | --- |
| `callbacks.onReceived(notification)` | 可省略 | 收到通知时调用，参数为本模块的 `PushNotification` 对象。 |
| `callbacks.onActionPerformed(notification)` | 可省略 | 用户点击通知时调用，参数同样为 `PushNotification`，不是插件原始点击事件。 |
| `options.signal` | 可省略，来自应用的 `AbortController` | 中止未完成的注册或监听设置时及时返回失败；监听成功后仍可停止回调并发起清理，中止不代表原生移除已完成。 |

#### 场景：登记与监听推送

原生推送注册会请求用户权限并等待插件事件。必须先挂载成功/失败监听，再触发注册，避免漏掉立即返回的事件。

![push.register：从权限到原生 Token](../images/function-capacitor-push.svg)

`register()` 从调用开始计时：平台检测、插件加载、权限申请、挂载监听、取得真实 token 和收尾移除监听共用 30 秒期限。只有取得 token 且收尾清理在期限内成功，才返回成功。即使 token 已到达，原生移除一直未完成也会在总期限到达时返回失败；传入的 `signal` 中止时同样及时返回失败。

拒绝、超时、取消或模块关闭会停止本次业务回调并启动清理。失败结果可以先于原生清理完成返回；未完成或移除失败的句柄仍由模块保留，迟到的 `addListener` 句柄到达后也会发起移除。取得 token 后仍需应用把它与当前账号关联到服务端，取得 token 不代表消息已推送。

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
const received: unknown[] = []
const actions: unknown[] = []
// 使用默认设置为当前设备注册推送；成功返回平台签发的 token，注册失败时返回原失败结果。
const registrationResult = await capacitor.push.register()
if (!registrationResult.success)
  return registrationResult
const registration = registrationResult.data // 平台签发的推送 token，不写入日志
// 将收到的通知和点击事件分别追加到对应数组；成功返回异步清理函数，设置失败时返回原失败结果。
const stopResult = await capacitor.push.listen({
  onReceived: notification => { received.push(notification) },
  onActionPerformed: action => { actions.push(action) },
})
if (!stopResult.success)
  return stopResult
const stop = stopResult.data
// 移除上方安装的监听器；成功无业务数据，清理失败时返回原失败结果。
const stopResult2 = await stop()
if (!stopResult2.success)
  return stopResult2
// 已移除本次登记的监听器，没有业务数据
```

输入是应用提供的两个处理函数；回调收到真实平台通知。Token 不写日志，Web 不具备原生推送能力时返回失败。

`capacitor.push.register({ signal })` 与 `capacitor.push.listen(callbacks, { signal })` 只在 Android/iOS 原生应用调用插件。`listen()` 的 30 秒限制只覆盖监听设置；成功后不按这个期限终止监听，传入的 `signal` 仍可停止回调并启动清理，也可显式调用返回的清理函数。

清理函数和 `capacitor.close()` 返回 `Promise<HaiResult<void>>`，不设清理超时，等待已经取得的句柄实际完成原生移除。尚未返回的 `addListener` 不阻塞这次关闭，迟到后仍会发起移除；关闭返回成功不代表这些尚未返回的调用已完成。原生移除失败时返回 `PUSH_CLEANUP_FAILED`，句柄保留供同一清理函数或后续 `close()` 重试。不要把注册失败或信号中止当成原生资源已经释放的证明。

<a id="status-bar"></a>

### 控制系统状态栏：`capacitor.statusBar`

使用原生状态栏插件调整文字颜色与覆盖方式，再按页面需要显示或隐藏。

`style` 沿用 Capacitor 的背景主题命名：`dark` 显示浅色文字，适合深色背景；`light` 显示深色文字，适合浅色背景；`default` 跟随系统外观。`style` 不会设置背景颜色；背景来自页面或平台支持的 `backgroundColor` 设置。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `capacitor.statusBar.configure(config)` | 设置状态栏显示 | 必填 `config` 对象，其中 `style`、`backgroundColor`、`overlay` 可省略。见[状态栏选项](#status-bar-options)。 | `Promise<HaiResult<void>>` | `await capacitor.statusBar.configure({ style: "dark", overlay: true })` |
| `capacitor.statusBar.show()` | 显示状态栏 | `—` | `Promise<HaiResult<void>>` | `await capacitor.statusBar.show()` |
| `capacitor.statusBar.hide()` | 隐藏状态栏 | `—` | `Promise<HaiResult<void>>` | `await capacitor.statusBar.hide()` |

<a id="status-bar-options"></a>

#### 状态栏选项

以下字段属于 `capacitor.statusBar.configure(config)` 的 `config` 参数；省略某项时，不调用插件修改该项设置。实际效果以目标平台支持范围为准。

| 字段 | 默认与条件 | 用途 |
| --- | --- | --- |
| `style` | 可省略 | `dark` 为深色背景选择浅色文字，`light` 为浅色背景选择深色文字，`default` 跟随系统外观。 |
| `backgroundColor` | 可省略；平台支持时生效 | 十六进制背景颜色，例如 `#ffffff`。 |
| `overlay` | 可省略；平台支持时生效 | `true` 让状态栏覆盖 WebView，`false` 让 WebView 位于状态栏下方。 |

#### 场景：控制系统状态栏

下面假设页面在状态栏下方使用深色背景。`dark` 选择浅色文字，`overlay: true` 让页面延伸到状态栏下方。

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 为深色页面背景设置浅色状态栏文字并启用覆盖；平台不支持或插件失败时返回原失败结果。
const configureResult = await capacitor.statusBar.configure({ style: 'dark', overlay: true })
if (!configureResult.success)
  return configureResult
// 隐藏当前应用的状态栏；插件操作失败时返回原失败结果。
const hideResult = await capacitor.statusBar.hide()
if (!hideResult.success)
  return hideResult
// 重新显示状态栏；恢复失败时返回原失败结果。
const showResult = await capacitor.statusBar.show()
if (!showResult.success)
  return showResult
```

成功都没有业务数据，结果体现在系统状态栏；本节例子需要支持该插件的原生设备，不能用浏览器截图证明原生行为。

<a id="preferences"></a>

### 保存普通偏好：`capacitor.preferences`

主题等非敏感字符串在初始化成功后统一通过 `capacitor.preferences` 保存，不用来保存认证密钥。未初始化或关闭后调用会返回 `NOT_INITIALIZED`。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `capacitor.preferences.get(key)` | 读取普通偏好 | 必填 `key` 为非敏感偏好设置的键名。 | `Promise<HaiResult<string / null>>` | `await capacitor.preferences.get("theme")` |
| `capacitor.preferences.set(key, value)` | 保存普通偏好 | 必填 `key` 为偏好设置键名，必填 `value` 为要保存的非敏感字符串。 | `Promise<HaiResult<void>>` | `await capacitor.preferences.set("theme", "dark")` |
| `capacitor.preferences.remove(key)` | 删除普通偏好 | 必填 `key` 为非敏感偏好设置的键名。 | `Promise<HaiResult<void>>` | `await capacitor.preferences.remove("theme")` |

#### 场景：保存普通偏好

```ts
import { capacitor } from '@h-ai/capacitor'

// 无参初始化成功后才能使用偏好操作；失败时停止本示例。
const initialized = await capacitor.init()
if (!initialized.success)
  throw new Error(initialized.error.message, { cause: initialized.error })
const failures: unknown[] = []
try {
  // 将 dark 写入非敏感偏好 demo-theme；成功无数据，失败交给下方错误边界。
  const saved = await capacitor.preferences.set('demo-theme', 'dark')
  if (!saved.success)
    throw new Error(saved.error.message, { cause: saved.error })
  // 读取同一键，成功时为 dark；读取失败不继续删除。
  const current = await capacitor.preferences.get('demo-theme')
  if (!current.success)
    throw new Error(current.error.message, { cause: current.error })
  current.data // 'dark'
  // 删除 demo-theme；成功无数据，删除失败不宣称已清除。
  const removed = await capacitor.preferences.remove('demo-theme')
  if (!removed.success)
    throw new Error(removed.error.message, { cause: removed.error })
  // 再读已经删除的键，成功时为 null；插件读取失败仍需处理。
  const missing = await capacitor.preferences.get('demo-theme')
  if (!missing.success)
    throw new Error(missing.error.message, { cause: missing.error })
  missing.data // null
}
catch (cause) {
  failures.push(cause)
}
finally {
  // 关闭本示例初始化的模块；收集清理失败，关闭后偏好操作不可用。
  const closed = await capacitor.close()
  if (!closed.success)
    failures.push(closed.error)
}
if (failures.length)
  throw new AggregateError(failures, 'Preference verification failed')
```

输入值始终是字符串；set/remove 成功无数据，get 返回字符串或不存在的 null。

<a id="tokens"></a>

### 安全保存登录凭据：`capacitor.createTokenStorage`

原生凭据使用安全存储适配器；把适配器交给 api-client 统一处理保存失败和清理。

从 `@h-ai/capacitor` 导入 `capacitor`，调用 `capacitor.createTokenStorage()` 得到下表中的 `tokens` 对象。创建适配器无需先调用 `capacitor.init()`。实际读写要求原生环境和安全存储插件可用，平台或插件失败时对应方法的 Promise 会拒绝。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `capacitor.createTokenStorage()` | 创建原生安全凭据适配器 | `—` | `TokenStorage` | `capacitor.createTokenStorage()` |
| `tokens.getAccessToken()` | 读取已保存的访问令牌 | `—` | `Promise<string / null>` | `await tokens.getAccessToken()` |
| `tokens.getRefreshToken()` | 读取已保存的刷新令牌 | `—` | `Promise<string / null>` | `await tokens.getRefreshToken()` |
| `tokens.setAccessToken(token)` | 保存访问令牌 | 必填 `token`，由可信认证响应提供的访问令牌字符串。 | `Promise<void>` | `await tokens.setAccessToken(accessToken)` |
| `tokens.setRefreshToken(token)` | 保存刷新令牌 | 必填 `token`，由可信认证响应提供的刷新令牌字符串。 | `Promise<void>` | `await tokens.setRefreshToken(refreshToken)` |
| `tokens.clear()` | 删除本机两类凭据 | `—` | `Promise<void>` | `await tokens.clear()` |

#### 场景：安全保存登录凭据

输入为可信登录响应中的两类令牌，只在原生安全插件可用时运行。下面读回相同值并在 finally 清理，成功 clear 后读为 null；插件错误拒绝 Promise，交给应用错误边界。

```ts
import { capacitor } from '@h-ai/capacitor'

async function verifySecureStorage(accessToken: string, refreshToken: string) {
  // 使用默认键名创建原生安全凭据存储适配器；各项操作通过安全存储插件完成。
  const tokens = capacitor.createTokenStorage()
  try {
    // 保存签发的访问令牌；成功无返回数据，安全写入失败时 Promise 拒绝。
    await tokens.setAccessToken(accessToken)
    // 保存签发的刷新令牌；存储失败时 Promise 拒绝。
    await tokens.setRefreshToken(refreshToken)
    return {
      // 读取已保存的访问令牌；写入成功后应与传入值一致，不存在时为 null，插件失败时 Promise 拒绝。
      accessMatches: await tokens.getAccessToken() === accessToken,
      // 读取已保存的刷新令牌；写入成功后应与传入值一致，不存在时为 null，插件失败时 Promise 拒绝。
      refreshMatches: await tokens.getRefreshToken() === refreshToken,
    } // 两个比较结果均为 true
  }
  finally {
    // 删除两项安全凭据；部分删除失败时 Promise 拒绝，并携带清理错误。
    await tokens.clear()
  }
}
```

#### 与 api-client 配合的 Token 安全存储

```ts
import { apiClient } from '@h-ai/api-client'
import { capacitor } from '@h-ai/capacitor'

// 使用服务端 URL 和刷新接口配置客户端；初始化失败时停止后续设置。
const initialized = await apiClient.init({
  baseUrl: 'https://api.example.com/v1',
  auth: {
    // 使用原生安全存储适配器保存签发的凭据；原生插件失败时，读写操作的 Promise 会拒绝。
    storage: capacitor.createTokenStorage(),
    refreshPath: '/auth/refresh',
  },
})
if (!initialized.success)
  throw new Error(initialized.error.message)
```

`capacitor.createTokenStorage()` 仅在 Android/iOS 原生环境中持久化 token，并要求已安装 `@aparajita/capacitor-secure-storage`。适配器的方法直接返回 Promise：Web 调用、插件不可用、读写或删除失败都会拒绝 Promise，不能当作空凭据或保存/退出成功。Web 入口应选择 api-client 的 Cookie/内存存储。

调用 `tokens.clear()` 时，当前实例立即停止返回旧的访问令牌和刷新令牌，再等待原生存储删除它们。删除失败时，当前实例仍不会读出旧凭据。单个键重新写入成功后才能再次读取。

已连接客户端时，使用 `apiClient.auth.setTokens()` 和 `apiClient.auth.clear()` 保证按顺序写入。页面需在成功或失败后结束加载状态，退出时清除页面上的登录信息。设备删除失败时提示用户重试，并通过服务端退出接口撤销会话，避免重启后旧凭据仍能使用。插件恢复后可以用原实例重试。

任一凭据写入失败都会屏蔽整对凭据，因此 access 已保存而 refresh 保存失败时也不会留下可读的半完成会话。登录/注册保存失败后应尝试 `auth.clear()` 清理部分持久数据；清理再次失败须明确提示，不得声称设备凭据已删除。

同一模块中的全部 TokenStorage 实例共享原生变更队列。`clear()` 等待更早调用的写入完成再删除，避免迟到写入在清理成功后恢复旧凭据；之后显式调用的写入可保存新凭据。该顺序不跨独立 WebView/JavaScript 运行环境提供进程间协调。

## Android 容器打包

这项功能用于把移动应用打包为 Android APK。容器提供编译所需的 Node.js、JDK 和 Android SDK；最终交付的是 APK 文件，构建镜像保留在构建机上供下次复用。

Hai CLI 会使用已安装的 `@h-ai/capacitor` 包内的 `images/android.Dockerfile`，自动准备镜像和构建工作副本。普通应用使用下面的项目构建入口即可；手动构建镜像的说明放在本节最后，供维护构建环境时使用。

### 准备打包工程

先确认这三个目录概念：

| 名称 | 如何识别 | 用途 |
| --- | --- | --- |
| Hai 工程根目录 | 包含本工程的 `hai.json` 和 `package.json` | 在这里执行 `pnpm build --target app ...`，产物也归档到这里。 |
| 原生应用目录 | 包含 `capacitor.config.ts`，并被 `hai.json` 的 `build.app` 列出 | 单应用工程通常是 `.`；Fullstack 可为 `apps/orders-app`。CLI 在这里编译前端、同步 Capacitor 并构建 Android 工程。 |
| 框架源码仓库根目录 | `hai-framework` 仓库中包含 `packages/`、`apps/` 的目录 | 供框架维护者修改源码；使用 npm 包打包自己的应用时不需要取得这个仓库。 |

宿主机需安装项目要求的 Node.js 和 pnpm，先完成项目依赖安装，并保留 `pnpm-lock.yaml`。启动 Docker 或 Podman，确认引擎能运行 `linux/amd64` 容器；Windows 的引擎需提供 Linux 容器环境。Android 的 JDK 和 SDK 由镜像提供。

原生应用需已有 `capacitor.config.ts`。发布包还要求已有并受版本控制的 `android/` 工程；首次调试构建可以由 CLI 在临时工作副本中创建 Android 壳，这不会在源工程中留下可供维护的 `android/` 目录。

### 使用项目构建入口生成 APK

以下命令在 **Hai 工程根目录** 执行。Windows PowerShell 中使用 `pnpm.cmd`。

```sh
# 生成调试 APK；auto 依次尝试可用的 Podman、Docker，完成后打印 APK 的归档路径。
pnpm build --target app --platform android --runtime auto --debug
```

需要固定引擎时，将 `--runtime auto` 改为 `--runtime docker` 或 `--runtime podman`。省略 `--runtime` 会选择本机原生构建，而不是本节的容器流程。

CLI 按以下顺序执行：

1. 定位包内 Dockerfile，准备或复用工具链镜像。当前定义包含 Node.js 24、pnpm 12.11.2、JDK 21、Android SDK 36，以及 Build Tools 35.0.0 / 36.0.0。
2. 从项目的锁文件所在目录创建临时工作副本，排除宿主的 `node_modules`、旧构建产物、`.env` 文件和签名材料。
3. 在容器中按锁文件安装依赖，构建应用依赖的本地 workspace 包，再编译应用前端。
4. 同步或创建 Android 工程，执行 Gradle 构建，并校验生成的 APK；发布包随后进入独立的签名步骤。
5. 将 APK 和 `manifest.json` 归档到宿主机，再清理临时工作副本。镜像和项目的下载缓存保留，供后续构建复用。

调试包位于 `.hai/build/app/android/debug/<批次目录>/`。同级的 `latest` 文件记录最新成功批次的目录名；APK 的具体位置以命令打印的路径或该批次 `manifest.json` 中的文件清单为准。容器内的工作副本会被清理，取包时使用归档目录。

### 生成签名发布包

先准备已有的 `android/` 工程，并通过构建进程或 CI 提供 `HAI_ANDROID_KEYSTORE`、`HAI_ANDROID_STORE_PASSWORD`、`HAI_ANDROID_KEY_ALIAS`、`HAI_ANDROID_KEY_PASSWORD`。密钥库路径相对于 Hai 工程根目录解析；签名材料通过独立步骤使用，不放进构建镜像。

```sh
# 使用已准备的签名设置生成发布 APK；签名条件缺失时失败，成功后打印 release 批次的 APK 路径。
pnpm build --target app --platform android --runtime auto
```

发布产物归档到 `.hai/build/app/android/release/<批次目录>/`。签名设置和离线前置见[原生和离线条件](../getting-started/build.md#native-builds)。构建下载需要访问镜像仓库、Node.js/npm、Android 工具下载站、Gradle、Google Maven 和 Maven Central；源与代理设置见[下载源和代理](../configuration/delivery.md#下载源和代理)。

`linux/amd64` 指编译容器的架构。APK 内的 `arm64-v8a`、`armeabi-v7a` 等目标 ABI 仍由应用的 Gradle 工程和原生插件决定。iOS 打包使用 macOS/Xcode，不能用这个 Android 镜像替代。

### 可选：手动构建工具链镜像

在自定义 CI 或排查工具链时，可以单独构建包内镜像。以下是 **Linux/WSL 的 Bash 命令**。先在已安装 `@h-ai/capacitor`、包含 `capacitor.config.ts` 的应用目录执行：

```sh
# 通过公开包入口定位 images 目录；路径由本应用实际安装的包决定，不假定 node_modules 的提升位置。
image_dir="$(node --input-type=module -e 'import { fileURLToPath } from "node:url"; process.stdout.write(fileURLToPath(new URL("../images/", import.meta.resolve("@h-ai/capacitor"))))')"
# 确认安装包中存在构建定义；失败时先检查应用依赖是否已安装完整。
test -f "$image_dir/android.Dockerfile"
```

如果正在维护 **hai-framework 源码本身**，也可以在包含 `packages/`、`apps/` 的仓库根目录，改用下面这条赋值。它和上面的包定位方式二选一：

```sh
# 仅适用于框架源码检出；这里的路径指仓库内文件，不是业务应用的目录约定。
image_dir="$PWD/packages/capacitor/images"
```

选定 `image_dir` 后，执行一次镜像构建：

```sh
# 从指定 Dockerfile 构建可复用的工具链镜像；这一步不编译应用，也不生成 APK。
docker build --platform linux/amd64 -t hai-capacitor-android:36 \
  -f "$image_dir/android.Dockerfile" "$image_dir"
```

`-f` 指定 Dockerfile，最后一个 `"$image_dir"` 指定[构建上下文](https://docs.docker.com/build/concepts/context/)；此处只需发送工具链定义所在目录。`hai-capacitor-android:36` 是这个手动镜像的本地名称，供自己的 CI 或容器命令使用。Hai CLI 会按工具定义生成自己的缓存标签，不会因为手动创建了这个名称就直接采用它。


## 错误处理

`init/close`、device/camera/push/statusBar/preferences 业务操作返回 `HaiResult<T>`；`getPlatform/isNative/isInitialized` 返回直接值。TokenStorage 适配器方法以 Promise 拒绝报告平台与存储错误：

```ts
import { HaiCapacitorError, capacitor } from '@h-ai/capacitor'

// 使用默认结果设置打开设备相机；成功返回照片，权限被拒绝或相机不可用时返回结构化失败。
const result = await capacitor.camera.takePhoto({ source: 'camera' })
if (!result.success) {
  if (result.error.code === HaiCapacitorError.CAMERA_FAILED.code) {
    // 相机权限被拒绝或插件未安装
  }
}
```

常用错误码：

| 错误码                                        | code                | 说明                 |
| --------------------------------------------- | ------------------- | -------------------- |
| `HaiCapacitorError.INIT_FAILED`               | `hai:capacitor:001` | 初始化失败           |
| `HaiCapacitorError.NOT_AVAILABLE`             | `hai:capacitor:002` | 能力不可用           |
| `HaiCapacitorError.INIT_IN_PROGRESS`          | `hai:capacitor:003` | 初始化进行中         |
| `HaiCapacitorError.NOT_INITIALIZED`           | `hai:capacitor:010` | 未初始化             |
| `HaiCapacitorError.PREFERENCES_GET_FAILED`    | `hai:capacitor:011` | Preferences 读取失败 |
| `HaiCapacitorError.PREFERENCES_SET_FAILED`    | `hai:capacitor:012` | Preferences 写入失败 |
| `HaiCapacitorError.PREFERENCES_REMOVE_FAILED` | `hai:capacitor:013` | Preferences 删除失败 |
| `HaiCapacitorError.DEVICE_INFO_FAILED`        | `hai:capacitor:020` | 设备信息获取失败     |
| `HaiCapacitorError.APP_VERSION_FAILED`        | `hai:capacitor:021` | 应用版本获取失败     |
| `HaiCapacitorError.PUSH_REGISTER_FAILED`      | `hai:capacitor:030` | 推送注册失败         |
| `HaiCapacitorError.PUSH_LISTEN_FAILED`        | `hai:capacitor:031` | 推送监听失败         |
| `HaiCapacitorError.PUSH_CLEANUP_FAILED`       | `hai:capacitor:032` | 推送监听清理失败，可重试 |
| `HaiCapacitorError.CAMERA_FAILED`             | `hai:capacitor:040` | 相机操作失败         |
| `HaiCapacitorError.STATUS_BAR_FAILED`         | `hai:capacitor:050` | 状态栏操作失败       |
