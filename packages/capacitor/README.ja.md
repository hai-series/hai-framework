# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-client](../api-client/README.ja.md) · [@h-ai/core](../core/README.ja.md)

## 概要

hai Framework のモバイルアプリ向け Capacitor ネイティブブリッジ。安全な Token ストレージ、端末情報、プッシュ通知、カメラ、ステータスバーを共通 API で提供します。

## 主な機能

- **Token ストレージ**：`@aparajita/capacitor-secure-storage`（ネイティブで必須）。Android は KeyStore + 暗号化 SharedPreferences、iOS は Keychain を使用。Web へのフォールバックはありません。
- **Preferences**：`@capacitor/preferences`（必須）。機密情報を含まない一般設定の保存用で、認証 Token には使用しません。
- **端末情報**：`@capacitor/device`（任意）。プラットフォーム、バージョン、機種を取得。
- **アプリバージョン**：`@capacitor/app`（任意）。appVersion / appBuild を取得。
- **プッシュ通知**：`@capacitor/push-notifications`（任意）。FCM/APNs Token の登録と通知イベントの監視。
- **カメラ/アルバム**：`@capacitor/camera`（任意）。撮影とアルバム画像の選択。
- **ステータスバー**：`@capacitor/status-bar`（任意）。没入型表示、背景色、スタイルの設定。

## 使い始める

### クイックスタート

```ts
import { capacitor } from '@h-ai/capacitor'

// 应用启动时初始化（检测 Capacitor 环境）
const result = await capacitor.init()
if (!result.success) {
  // 非 Capacitor 环境（纯 Web）
}
```

#### api-client と連携する安全な Token ストレージ

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

#### 端末情報とプッシュ通知

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

#### ステータスバー

```ts
import { capacitor } from '@h-ai/capacitor'

await capacitor.statusBar.configure({
  style: 'dark',
  overlay: true,
  backgroundColor: '#ffffff',
})
```

#### カメラ

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

`capacitor.preferences` は言語、テーマ、下書きなどの一般的な設定用です。認証 Token には `createCapacitorTokenStorage()` を使用してください。

### 設定

このモジュールに設定ファイルはありません。`capacitor.init()` は Capacitor の実行環境が利用可能かどうかのみを確認します。

Capacitor アプリケーションは SPA モードを使用してください：

```ts
// src/routes/+layout.ts
export const prerender = true
export const ssr = false
```

### エラー処理

`capacitor.*` と `safe*Preference` は `HaiResult<T>` を返します。TokenStorage のメソッドはプラットフォームや保存エラーで Promise を reject します。

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

Push は実際のネイティブ環境が必要です。`push.register({ signal? })` と `push.listen(callbacks, { signal? })` の設定段階は権限要求とリスナー登録を含め30秒で終了します。失敗、タイムアウト、中止、`capacitor.close()` はコールバックを停止し、所有するハンドルを除去します。遅延したハンドルも到着時に除去し、removeAllListeners で他の利用者を巻き込みません。listen 成功後も signal と cleanup が有効です。cleanup と close は `HaiResult<void>` を返し、ネイティブ除去失敗は `PUSH_CLEANUP_FAILED`（`capacitor:032`）です。失敗したハンドルを保持して再試行し、成功済みの除去は繰り返しません。終了直後にモジュールを無効化し、再初期化前に残存ハンドルを処理します。制御したプラグイン試験は Android/iOS 実機の権限、FCM/APNs、反復登録試験を代替しません。

公開操作、内部リソースと型には型検査できる例があります。[JSDoc 規約（中国語）](../../docs/module-jsdoc.md) を参照してください。型検査は端末権限や FCM/APNs の実配信を保証しません。

## ライセンス

Apache-2.0
