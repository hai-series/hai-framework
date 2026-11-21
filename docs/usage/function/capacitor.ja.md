# @h-ai/capacitor API リファレンス

[原文（中国語）](capacitor.md) · [設定](../configuration/capacitor.ja.md) · [データ構造](../data/capacitor.ja.md)

<a id="quick-start"></a>

## クイックスタート

`capacitor.init()` の後にネイティブ機能を使います。実機が必要な処理の前に環境を確認します。アカウント変更や画面離脱時にはプッシュのリスナーを解除します。

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

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。各呼び出しで HaiResult.success を確認し、失敗時は元の結果を返して、成功時だけ data を読みます。関数宣言のない例はアプリの非同期業務関数内の断片です。独立したテストデータと明示した後片付けを使います。

<a id="platform"></a>

### ネイティブ環境の準備と端末情報：`capacitor`

初期化時に実際のプラットフォームを検出します。端末・版の情報は環境依存で、Web とネイティブでは対応範囲が異なります。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `capacitor.init` | 実行環境を判定して準備 | `—` | `void` | `await capacitor.init()` |
| `capacitor.close` | 稼働中のネイティブリスナーを解放 | `—` | `void` | `await capacitor.close()` |
| `capacitor.getPlatform` | Android・iOS・Web を判別 | `—` | `string` | `capacitor.getPlatform()` |
| `capacitor.isNative` | ネイティブアプリ内か判定 | `—` | `boolean` | `capacitor.isNative()` |
| `capacitor.isInitialized` | 检查模块状态 | `—` | `boolean` | `capacitor.isInitialized` |
| `capacitor.device.getInfo` | OS と端末情報を取得 | `—` | `DeviceInfo` | `await capacitor.device.getInfo()` |
| `capacitor.device.getAppVersion` | インストール済みアプリの版とビルド番号を取得 | `—` | `{ version, build }` | `await capacitor.device.getAppVersion()` |

#### 利用例：ネイティブ環境の準備と端末情報

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
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

引数なしです。端末情報は実プラグイン由来なので機種や版を固定しません。他の例でも初期化と対応確認が必要です。

モジュールと設定操作は HaiResult.data を示します。トークンアダプターはプラグイン障害時に Promise を拒否します。単体関数は @h-ai/capacitor からインポートします。

アプリがコールバックと任意の AbortSignal を渡します。push.listen の解除関数を保持し、画面を離れる際に実行して待機します。画像の形式は resultType に従います。

<a id="call-options"></a>

#### 呼び出し引数と接続オプション

| Option | Default | Meaning |
| --- | --- | --- |
| `camera.takePhoto`: `source`, `quality`, `resultType` | `prompt`, `90`, `uri` | カメラ・写真・選択画面、0～100 の品質、URI・Base64・Data URL 出力を指定。 |
| `camera.takePhoto`: `width`, `height` | 省略可 | 最大の幅と高さ（ピクセル）。 |
| `statusBar.configure`: `style`, `backgroundColor`, `overlay` | 省略可 | 省略時は現在の設定を保持。16 進カラーと WebView に重ねるかを指定。 |
| `push.register`, `push.listen`: `signal` | 省略可 | 中断すると登録を取り消すかリスナーを解除。 |
| `push.listen`: `onReceived`, `onActionPerformed` | 省略可 | 受信時と通知を操作したときのコールバック。 |

[引数と手順の詳細](capacitor.md#platform)

<a id="camera"></a>

### 利用者が選ぶ写真の取得：`capacitor.camera`

利用者に写真元を選んでもらい、後の転送に合わせて uri・base64・dataUrl を選びます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `capacitor.camera.takePhoto` | 画像を撮影または選択 | `{ source?: camera/photos/prompt, quality?: 0…100, width?, height?, resultType?: uri/base64/dataUrl }` | `PhotoResult` | `await capacitor.camera.takePhoto({ source: 'camera' })` |

#### 利用例：利用者が選ぶ写真の取得

```ts
// Select a photo at quality 80 and request a data URL. Success includes image data and format. Cancellation or plugin failure returns an error.
const photo = await capacitor.camera.takePhoto({ source: 'photos', resultType: 'dataUrl', quality: 80 })
if (photo.success) {
  const source = photo.data.data // selected image data URL
  const format = photo.data.format // actual image format
}
```

相册・品質 80・dataUrl を入力します。本文と形式は選んだ写真によります。取消や権限拒否を空の成功で代用しません。

[引数と手順の詳細](capacitor.md#camera)

<a id="push"></a>

### プッシュの登録と購読：`capacitor.push`

システム権限を取得・登録して受信と操作を購読し、画面や利用主体の終了時に解除します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `capacitor.push.register` | 端末をプッシュ通知サービスに登録 | `{ signal?: AbortSignal }` | `PushRegistration` | `await capacitor.push.register()` |
| `capacitor.push.listen` | 通知の受信とタップなどの操作を監視 | `{ onReceived?, onActionPerformed? }, { signal? }` | `PushCleanup` | `await capacitor.push.listen(callbacks)` |

#### 利用例：プッシュの登録と購読

ネイティブのプッシュ登録では許可とプラグインのイベントを待ちます。即座の通知を失わないよう、先に成功・失敗の監視を設定します。

![push.register：権限確認からネイティブ Token まで](../images/function-capacitor-push.ja.svg)

30 秒の制限は許可・監視の設定・登録結果の待機を含みます。拒否・時間切れ・中止・close では遅れて届くハンドルも解放します。登録と監視の解放が成功してから実際の token を返します。解放失敗も失敗となり、close で再試行できます。サーバーで本人との関連付けはアプリが行います。

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
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

アプリの二つの処理関数に実際の通知が渡されます。トークンはログに出さず、Web で未対応なら失敗を扱います。

[引数と手順の詳細](capacitor.md#push)

<a id="status-bar"></a>

### ステータスバーの制御：`capacitor.statusBar`

ネイティブプラグインでスタイルと重ね方を設定し、画面に応じて表示・非表示にします。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `capacitor.statusBar.configure` | 指定したステータスバーの設定だけを適用 | `{ style?: dark/light/default, backgroundColor?: color, overlay?: boolean }` | `void` | `await capacitor.statusBar.configure({ style: 'dark' })` |
| `capacitor.statusBar.show` | ネイティブのステータスバーを表示 | `—` | `void` | `await capacitor.statusBar.show()` |
| `capacitor.statusBar.hide` | ネイティブのステータスバーを非表示 | `—` | `void` | `await capacitor.statusBar.hide()` |

#### 利用例：ステータスバーの制御

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
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

成功時に業務データはなく、実端末のバーで確認します。ブラウザでネイティブ動作を証明しません。

[引数と手順の詳細](capacitor.md#status-bar)

<a id="preferences"></a>

### 一般的な設定の保存：`capacitor.preferences`

テーマなど秘密でない文字列を Preferences に保存します。独立した safe 関数も同じ結果契約で、認証情報には使いません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `capacitor.preferences.get` | 機密でない設定を取得 | `key: string` | `string or null` | `await capacitor.preferences.get('theme')` |
| `capacitor.preferences.set` | 機密でない設定を保存 | `key: string, value: string` | `void` | `await capacitor.preferences.set('theme', 'dark')` |
| `capacitor.preferences.remove` | 指定設定を削除 | `key: string` | `void` | `await capacitor.preferences.remove('theme')` |
| `safeGetPreference` | 単体ヘルパーで機密でない設定を取得 | `key: string` | `string or null` | `await safeGetPreference('theme')` |
| `safeSetPreference` | 単体ヘルパーで機密でない設定を保存 | `key: string, value: string` | `void` | `await safeSetPreference('theme', 'dark')` |
| `safeRemovePreference` | 単体ヘルパーで設定を削除 | `key: string` | `void` | `await safeRemovePreference('theme')` |

#### 利用例：一般的な設定の保存

```ts
// import はモジュールの先頭へ置き、残りはアプリの非同期業務関数内で実行します。失敗結果は呼び出し元へ返します。
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

値は文字列です。set/remove は業務データなし、get は文字列または null です。

[引数と手順の詳細](capacitor.md#preferences)

<a id="tokens"></a>

### 認証情報の安全な保存：`createCapacitorTokenStorage`

ネイティブの安全な保存を api-client に渡し、保存失敗と削除を一元管理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `createCapacitorTokenStorage` | ネイティブの安全な認証情報アダプターを作る | `—` | `TokenStorage` | `createCapacitorTokenStorage()` |
| `tokens.getAccessToken` | アクセストークンを読む | `—` | `Promise<string or null>` | `await tokens.getAccessToken()` |
| `tokens.getRefreshToken` | リフレッシュトークンを読む | `—` | `Promise<string or null>` | `await tokens.getRefreshToken()` |
| `tokens.setAccessToken` | アクセストークンを保存 | `token: string` | `Promise<void>` | `await tokens.setAccessToken(accessToken)` |
| `tokens.setRefreshToken` | リフレッシュトークンを保存 | `token: string` | `Promise<void>` | `await tokens.setRefreshToken(refreshToken)` |
| `tokens.clear` | 両方の認証情報を削除 | `—` | `Promise<void>` | `await tokens.clear()` |

#### 利用例：認証情報の安全な保存

信頼できるログイン応答のトークンをネイティブ端末で入力。保存値を読み戻し finally で削除します。プラグインの失敗は Promise の拒否で通知します。

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
