# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-client](../api-client/README.ja.md) · [@h-ai/core](../core/README.ja.md)

hai Framework のモバイルアプリ向け Capacitor ネイティブブリッジ。安全な Token ストレージ、端末情報、プッシュ通知、カメラ、ステータスバーを共通 API で提供します。

## クイックスタート

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
  // theme.data は 'dark'。保存していないキーは null。
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

## 機能

### 用途・入力・出力

capacitor のサブ機能は初期化成功後に使用します。HaiResult<T> は success の確認後に data を読み、void は業務データなし、Promise は await します。tokens は createCapacitorTokenStorage() が返す独立アダプターで、各メソッドはネイティブ保存に失敗すると Promise を拒否します。独立 Preferences ヘルパーはモジュール状態を使わず、同じプラグイン操作を HaiResult で返します。

| 入口                             | 使用場面                                     | 入力（`—` は引数なし）                                                                                 | 戻り値                                                                                                | 呼出例                                                                          |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `capacitor.init`                 | ネイティブ環境を確認して準備する             | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.init()`                                                        |
| `capacitor.close`                | 所有するリソースを解放する                   | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.close()`                                                       |
| `capacitor.getPlatform`          | プラットフォーム別に処理する                 | `—`                                                                                                    | `string: ios / android / web`                                                                         | `capacitor.getPlatform()`                                                       |
| `capacitor.isNative`             | ネイティブ環境か確認する                     | `—`                                                                                                    | `boolean`                                                                                             | `capacitor.isNative()`                                                          |
| `capacitor.isInitialized`        | モジュールの状態を確認する                   | `—`                                                                                                    | `boolean`                                                                                             | `capacitor.isInitialized`                                                       |
| `capacitor.device.getInfo`       | 端末の診断情報を取得する                     | `—`                                                                                                    | `Promise<HaiResult<{ platform, osVersion, model, manufacturer, isVirtual, appVersion?, appBuild? }>>` | `await capacitor.device.getInfo()`                                              |
| `capacitor.device.getAppVersion` | インストール済みアプリの版を取得する         | `—`                                                                                                    | `Promise<HaiResult<{ version, build }>>`                                                              | `await capacitor.device.getAppVersion()`                                        |
| `capacitor.camera.takePhoto`     | 撮影または写真を選択する                     | `{ source?: camera/photos/prompt, quality?: 0…100, width?, height?, resultType?: uri/base64/dataUrl }` | `Promise<HaiResult<{ data: string, format: string }>>`                                                | `await capacitor.camera.takePhoto({ source: "photos", resultType: "dataUrl" })` |
| `capacitor.push.register`        | 権限を要求してプッシュトークンを取得する     | `{ signal?: AbortSignal }`                                                                             | `Promise<HaiResult<{ token: string }>>`                                                               | `await capacitor.push.register()`                                               |
| `capacitor.push.listen`          | 通知とタップを監視する                       | `{ onReceived?, onActionPerformed? }, { signal? }`                                                     | `Promise<HaiResult<() => Promise<HaiResult<void>>>>`                                                  | `await capacitor.push.listen(callbacks, { signal })`                            |
| `capacitor.statusBar.configure`  | ステータスバーを設定する                     | `{ style?: dark/light/default, backgroundColor?: color, overlay?: boolean }`                           | `Promise<HaiResult<void>>`                                                                            | `await capacitor.statusBar.configure({ style: "dark", overlay: true })`         |
| `capacitor.statusBar.show`       | ステータスバーを表示する                     | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.statusBar.show()`                                              |
| `capacitor.statusBar.hide`       | ステータスバーを非表示にする                 | `—`                                                                                                    | `Promise<HaiResult<void>>`                                                                            | `await capacitor.statusBar.hide()`                                              |
| `capacitor.preferences.get`      | 機密でない設定を読む                         | `key: string`                                                                                          | `Promise<HaiResult<string / null>>`                                                                   | `await capacitor.preferences.get("theme")`                                      |
| `capacitor.preferences.set`      | 機密でない設定を保存する                     | `key: string, value: string`                                                                           | `Promise<HaiResult<void>>`                                                                            | `await capacitor.preferences.set("theme", "dark")`                              |
| `capacitor.preferences.remove`   | 機密でない設定を削除する                     | `key: string`                                                                                          | `Promise<HaiResult<void>>`                                                                            | `await capacitor.preferences.remove("theme")`                                   |
| `createCapacitorTokenStorage`    | ネイティブの安全な認証保存を作成する         | `—`                                                                                                    | `TokenStorage`                                                                                        | `createCapacitorTokenStorage()`                                                 |
| `tokens.getAccessToken`          | 保存したアクセストークンを読む               | `—`                                                                                                    | `Promise<string / null>`                                                                              | `await tokens.getAccessToken()`                                                 |
| `tokens.getRefreshToken`         | 保存した更新トークンを読む                   | `—`                                                                                                    | `Promise<string / null>`                                                                              | `await tokens.getRefreshToken()`                                                |
| `tokens.setAccessToken`          | アクセストークンを保存する                   | `token: string`                                                                                        | `Promise<void>`                                                                                       | `await tokens.setAccessToken(accessToken)`                                      |
| `tokens.setRefreshToken`         | 更新トークンを保存する                       | `token: string`                                                                                        | `Promise<void>`                                                                                       | `await tokens.setRefreshToken(refreshToken)`                                    |
| `tokens.clear`                   | 保存した認証情報を削除する                   | `—`                                                                                                    | `Promise<void>`                                                                                       | `await tokens.clear()`                                                          |
| `safeGetPreference`              | モジュールのライフサイクル外で設定を読む     | `key: string`                                                                                          | `Promise<HaiResult<string / null>>`                                                                   | `await safeGetPreference("theme")`                                              |
| `safeSetPreference`              | モジュールのライフサイクル外で設定を保存する | `key: string, value: string`                                                                           | `Promise<HaiResult<void>>`                                                                            | `await safeSetPreference("theme", "dark")`                                      |
| `safeRemovePreference`           | モジュールのライフサイクル外で設定を削除する | `key: string`                                                                                          | `Promise<HaiResult<void>>`                                                                            | `await safeRemovePreference("theme")`                                           |

写真の source はカメラ・ライブラリ・選択画面、quality は 0–100、width/height はピクセル制約です。成功時の data は resultType に応じた webPath、生 Base64、MIME 接頭辞付き Data URL、format はプラグインの画像形式です。callbacks.onReceived/onActionPerformed は通知を受け、signal はアプリの AbortController から渡します。listen 成功時の data は await して結果を確認する解除関数です。独立工場と Preferences ヘルパーはパッケージのルートから import します。

- **Token ストレージ**：`@aparajita/capacitor-secure-storage`（ネイティブで必須）。Android は KeyStore + 暗号化 SharedPreferences、iOS は Keychain を使用。Web へのフォールバックはありません。
- **Preferences**：`@capacitor/preferences`（必須）。機密情報を含まない一般設定の保存用で、認証 Token には使用しません。
- **端末情報**：`@capacitor/device`（任意）。プラットフォーム、バージョン、機種を取得。
- **アプリバージョン**：`@capacitor/app`（任意）。appVersion / appBuild を取得。
- **プッシュ通知**：`@capacitor/push-notifications`（任意）。FCM/APNs Token の登録と通知イベントの監視。
- **カメラ/アルバム**：`@capacitor/camera`（任意）。撮影とアルバム画像の選択。
- **ステータスバー**：`@capacitor/status-bar`（任意）。没入型表示、背景色、スタイルの設定。

### api-client と連携する安全な Token ストレージ

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

`createCapacitorTokenStorage()` は Android/iOS のネイティブ環境でのみ Token を永続化し、`@aparajita/capacitor-secure-storage` が必要です。メソッドは Promise を直接返し、Web 呼び出し、プラグインの利用不可、読み書き・削除の失敗は reject されます。空の認証情報や操作成功として扱わないでください。Web では api-client の Cookie またはメモリーストレージを選びます。

`clear()` は開始時にこのインスタンスの古い認証情報を読み取り不可にし、すべてのネイティブ削除が完了してから結果を返します。失敗時は読み取りを禁止したままにし、各キーへの書き込み成功時のみそのキーを再開します。書き込みを直列化する `apiClient.auth` を使い、`setTokens()` / `clear()` の失敗を処理してください。UI は loading を解除し、ログアウトしたユーザー情報を消去して失敗を表示します。この制限はインスタンス内のみで、永続データの削除を保証しません。再起動後の失効にはサーバーでのセッション撤回が必要です。プラグイン復旧後は同じインスタンスで再試行できます。

認証情報の一方の書き込みが失敗すると両方を読み取り不可にするため、access token 保存後に refresh token の保存が失敗しても不完全な認証状態は公開しません。ログイン・登録時の保存失敗後は `auth.clear()` で部分保存データの削除を試み、削除も失敗した場合は端末の認証情報を削除できたと表示しないでください。

同じモジュール内のすべての TokenStorage はネイティブ変更キューを共有します。`clear()` は先行書き込みの完了後に削除し、削除成功後に古い書き込みが認証情報を復活させることを防ぎます。その後の明示的な書き込みは新しい認証情報を保存できます。別の WebView や JavaScript 実行環境とのプロセス間調整は提供しません。

### 端末情報とプッシュ通知

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

Push は実際のネイティブ環境が必要です。`push.register({ signal? })` と `push.listen(callbacks, { signal? })` の設定段階は権限要求とリスナー登録を含め30秒で終了します。失敗、タイムアウト、中止、`capacitor.close()` はコールバックを停止し、所有するハンドルを除去します。遅延したハンドルも到着時に除去し、removeAllListeners で他の利用者を巻き込みません。listen 成功後も signal と cleanup が有効です。cleanup と close は `HaiResult<void>` を返し、ネイティブ除去失敗は `PUSH_CLEANUP_FAILED`（`capacitor:032`）です。失敗したハンドルを保持して再試行し、成功済みの除去は繰り返しません。終了直後にモジュールを無効化し、再初期化前に残存ハンドルを処理します。制御したプラグイン試験は Android/iOS 実機の権限、FCM/APNs、反復登録試験を代替しません。

### ステータスバー

```ts
import { capacitor } from '@h-ai/capacitor'

await capacitor.statusBar.configure({
  style: 'dark',
  overlay: true,
  backgroundColor: '#ffffff',
})
```

### カメラ

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

`capacitor.preferences` は言語、テーマ、下書きなどの一般的な設定用です。認証 Token には `createCapacitorTokenStorage()` を使用してください。

### コンテナで Android APK をビルドする

Hai プロジェクトルートで `pnpm build --target app --platform android --runtime auto --debug` を実行します。`--debug` を省略すると署名付きリリースになります。成功したビルドは `.hai/build/app/android/<variant>/` に格納します。[ネイティブビルドと署名](../../docs/usage/getting-started/build.md#原生和离线条件)を参照してください。

ビルドイメージには Node.js 24、pnpm 12.11.2、JDK 21、Android SDK 36、Build Tools 35.0.0 と 36.0.0 が含まれます。ビルドは `linux/amd64` で実行します。APK の `arm64-v8a`、`armeabi-v7a` などの対象 ABI は、アプリの Gradle プロジェクトとネイティブプラグインで決まります。iOS のビルドには macOS と Xcode が必要です。

フレームワークのリポジトリルートでイメージをビルドします。このパッケージをインストールしたプロジェクトでは、`image_dir` にインストール先の `@h-ai/capacitor` にある `images` ディレクトリを指定できます。

```sh
image_dir=packages/capacitor/images
docker build --platform linux/amd64 -t hai-capacitor-android:36 \
  -f "$image_dir/android.Dockerfile" "$image_dir"
```

アプリのプロジェクトルートでコンテナを起動します。クリーンな作業コピーを使い、コンテナ内で `pnpm install --frozen-lockfile` を実行してから、アプリが依存するローカルワークスペースパッケージをビルドします。続けてアプリのビルド、`cap sync android`、既存の APK パッケージングを実行します。APK はマウントしたプロジェクトに出力されます。rootless Podman では `docker` を `podman` に変更し、`--user` に加えて `--userns=keep-id` を指定します。

```sh
docker run --rm -it --platform linux/amd64 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e GRADLE_USER_HOME=/tmp/.gradle -e ANDROID_USER_HOME=/tmp/.android \
  -v "$PWD:/workspace" hai-capacitor-android:36 bash
```

依存関係の取得には npm、Gradle の配布元、Google Maven、Maven Central へのアクセスが必要です。リリースにはアプリの署名手順を使用し、キーストアを読み取り専用でマウントして、パスワードをビルド環境から渡します。[mobile-app のビルドと受け入れ確認](../../apps/mobile-app/README.md#原生交付与验收)を参照してください。

## 設定

このモジュールに設定ファイルはありません。`capacitor.init()` は Capacitor の実行環境が利用可能かどうかのみを確認します。

ネイティブ WebView はクライアントアプリを読み込みます。SvelteKit は次の静的 SPA 設定を使い、純粋な Svelte/Vite テンプレートではこのルートファイルを使いません：

```ts
// src/routes/+layout.ts
export const prerender = true
export const ssr = false
```

## エラー処理

`init/close`、device/camera/push/statusBar/preferences と `safe*Preference` は `HaiResult<T>`、`getPlatform/isNative/isInitialized` は直接値を返します。TokenStorage のメソッドはプラットフォームや保存エラーで Promise を reject します。

```ts
import { capacitor, HaiCapacitorError } from '@h-ai/capacitor'

const result = await capacitor.camera.takePhoto({ source: 'camera' })
if (!result.success) {
  if (result.error.code === HaiCapacitorError.CAMERA_FAILED.code) {
    // 相机权限被拒绝或插件未安装
  }
}
```

主なエラーコード：

| エラーコード                                  | code                | 説明                         |
| --------------------------------------------- | ------------------- | ---------------------------- |
| `HaiCapacitorError.INIT_FAILED`               | `hai:capacitor:001` | 初期化に失敗                 |
| `HaiCapacitorError.NOT_AVAILABLE`             | `hai:capacitor:002` | 機能が利用できない           |
| `HaiCapacitorError.INIT_IN_PROGRESS`          | `hai:capacitor:003` | 初期化中                     |
| `HaiCapacitorError.NOT_INITIALIZED`           | `hai:capacitor:010` | 未初期化                     |
| `HaiCapacitorError.PREFERENCES_GET_FAILED`    | `hai:capacitor:011` | Preferences の読み取りに失敗 |
| `HaiCapacitorError.PREFERENCES_SET_FAILED`    | `hai:capacitor:012` | Preferences の書き込みに失敗 |
| `HaiCapacitorError.PREFERENCES_REMOVE_FAILED` | `hai:capacitor:013` | Preferences の削除に失敗     |
| `HaiCapacitorError.DEVICE_INFO_FAILED`        | `hai:capacitor:020` | 端末情報の取得に失敗         |
| `HaiCapacitorError.APP_VERSION_FAILED`        | `hai:capacitor:021` | アプリバージョンの取得に失敗 |
| `HaiCapacitorError.PUSH_REGISTER_FAILED`      | `hai:capacitor:030` | プッシュ登録に失敗           |
| `HaiCapacitorError.PUSH_LISTEN_FAILED`        | `hai:capacitor:031` | プッシュ通知の監視に失敗     |
| `HaiCapacitorError.CAMERA_FAILED`             | `hai:capacitor:040` | カメラ操作に失敗             |
| `HaiCapacitorError.STATUS_BAR_FAILED`         | `hai:capacitor:050` | ステータスバー操作に失敗     |

## 開発とテスト

```bash
pnpm --filter @h-ai/capacitor test
```

> ネイティブプラグインへの依存があるため、テストでは `@capacitor/*` モジュールを mock する必要があります。

公開操作、内部リソースと型には型検査できる例があります。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。型検査は端末権限や FCM/APNs の実配信を保証しません。

## ライセンス

Apache-2.0
