# @h-ai/capacitor API リファレンス

[原文（中国語）](capacitor.md) · [設定](../configuration/capacitor.ja.md) · [データ構造](../data/capacitor.ja.md)

<a id="quick-start"></a>

## クイックスタート

`capacitor.init()` の後にネイティブ機能を使います。実機が必要な処理の前に環境を確認します。アカウント変更や画面離脱時にはプッシュのリスナーを解除します。

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

## API 一覧

モジュールと設定操作は HaiResult.data を示します。トークンアダプターはプラグイン障害時に Promise を拒否します。単体関数は @h-ai/capacitor からインポートします。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `capacitor.init` | 実行環境を判定して準備 | なし | `void` | `await capacitor.init()` |
| `capacitor.close` | 稼働中のネイティブリスナーを解放 | なし | `void` | `await capacitor.close()` |
| `capacitor.getPlatform` | Android・iOS・Web を判別 | なし | `string` | `capacitor.getPlatform()` |
| `capacitor.isNative` | ネイティブアプリ内か判定 | なし | `boolean` | `capacitor.isNative()` |
| `capacitor.device.getInfo` | OS と端末情報を取得 | なし | `DeviceInfo` | `await capacitor.device.getInfo()` |
| `capacitor.device.getAppVersion` | インストール済みアプリの版とビルド番号を取得 | なし | `{ version, build }` | `await capacitor.device.getAppVersion()` |
| `capacitor.camera.takePhoto` | 画像を撮影または選択 | `{ source = "prompt", quality = 90, resultType = "uri", width?, height? }?` | `PhotoResult` | `await capacitor.camera.takePhoto({ source: 'camera' })` |
| `capacitor.push.register` | 端末をプッシュ通知サービスに登録 | `{ signal? }?` | `PushRegistration` | `await capacitor.push.register()` |
| `capacitor.push.listen` | 通知の受信とタップなどの操作を監視 | `callbacks, { signal? }?` | `PushCleanup` | `await capacitor.push.listen(callbacks)` |
| `capacitor.statusBar.configure` | 指定したステータスバーの設定だけを適用 | `{ style?, backgroundColor?, overlay? }` | `void` | `await capacitor.statusBar.configure({ style: 'dark' })` |
| `capacitor.statusBar.show` | ネイティブのステータスバーを表示 | なし | `void` | `await capacitor.statusBar.show()` |
| `capacitor.statusBar.hide` | ネイティブのステータスバーを非表示 | なし | `void` | `await capacitor.statusBar.hide()` |
| `capacitor.preferences.get` | 機密でない設定を取得 | `key` | `string or null` | `await capacitor.preferences.get('theme')` |
| `capacitor.preferences.set` | 機密でない設定を保存 | `key, value` | `void` | `await capacitor.preferences.set('theme', 'dark')` |
| `capacitor.preferences.remove` | 指定設定を削除 | `key` | `void` | `await capacitor.preferences.remove('theme')` |
| `createCapacitorTokenStorage` | ネイティブの安全な認証情報アダプターを作る | なし | `TokenStorage` | `createCapacitorTokenStorage()` |
| `tokens.getAccessToken` | アクセストークンを読む | なし | `Promise<string or null>` | `await tokens.getAccessToken()` |
| `tokens.setAccessToken` | アクセストークンを保存 | `token` | `Promise<void>` | `await tokens.setAccessToken(accessToken)` |
| `tokens.getRefreshToken` | リフレッシュトークンを読む | なし | `Promise<string or null>` | `await tokens.getRefreshToken()` |
| `tokens.setRefreshToken` | リフレッシュトークンを保存 | `token` | `Promise<void>` | `await tokens.setRefreshToken(refreshToken)` |
| `tokens.clear` | 両方の認証情報を削除 | なし | `Promise<void>` | `await tokens.clear()` |
| `safeGetPreference` | 単体ヘルパーで機密でない設定を取得 | `key` | `string or null` | `await safeGetPreference('theme')` |
| `safeSetPreference` | 単体ヘルパーで機密でない設定を保存 | `key, value` | `void` | `await safeSetPreference('theme', 'dark')` |
| `safeRemovePreference` | 単体ヘルパーで設定を削除 | `key` | `void` | `await safeRemovePreference('theme')` |

アプリがコールバックと任意の AbortSignal を渡します。push.listen の解除関数を保持し、画面を離れる際に実行して待機します。画像の形式は resultType に従います。

<a id="call-options"></a>

## 呼び出し引数と接続オプション

| Option | Default | Meaning |
| --- | --- | --- |
| `camera.takePhoto`: `source`, `quality`, `resultType` | `prompt`, `90`, `uri` | カメラ・写真・選択画面、0～100 の品質、URI・Base64・Data URL 出力を指定。 |
| `camera.takePhoto`: `width`, `height` | 省略可 | 最大の幅と高さ（ピクセル）。 |
| `statusBar.configure`: `style`, `backgroundColor`, `overlay` | 省略可 | 省略時は現在の設定を保持。16 進カラーと WebView に重ねるかを指定。 |
| `push.register`, `push.listen`: `signal` | 省略可 | 中断すると登録を取り消すかリスナーを解除。 |
| `push.listen`: `onReceived`, `onActionPerformed` | 省略可 | 受信時と通知を操作したときのコールバック。 |
