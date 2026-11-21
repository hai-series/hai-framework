# @h-ai/capacitor 設定

[原文（中国語）](capacitor.md) · [データ構造](../data/capacitor.ja.md) · [API リファレンス](../function/capacitor.ja.md)

ネイティブプロジェクトで `appId`、`appName`、実際の Web 出力先 `webDir` を設定します。API クライアントに渡す URL は実機から到達できる必要があります。`CAPACITOR_SERVER_URL` は実機での開発時に任意で指定し、リリースでは同期済みの静的ファイルを使います。

## 設定例

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.orders',
  appName: 'Orders',
  webDir: 'dist',
}
export default config
```

### SvelteKit の静的ビルドを取り込む

静的アダプターが `build/` へ出力する工程を想定しています。`webDir` は実際のビルド先に合わせ、開発サーバーの URL は指定しません。ビルド後にネイティブ工程へ同期し、端末で画面とプラグインを確認します。

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.orders',
  appName: 'Orders',
  webDir: 'build',
}
export default config
```

### 実機開発で PC の開発サーバーに接続する

PC と端末が互いに通信できる必要があります。ローカル開発時だけ `CAPACITOR_SERVER_URL`（例：`http://192.168.1.20:5173`）を設定し、下記のコードで読み込みます。未設定なら同梱ファイルを使います。公開用には変数を解除して再同期します。API の URL と許可する Origin も実際のサーバーに合わせます。

```ts
import type { CapacitorConfig } from '@capacitor/cli'
import process from 'node:process'

const developmentUrl = process.env.CAPACITOR_SERVER_URL
const config: CapacitorConfig = {
  appId: 'com.example.orders',
  appName: 'Orders',
  webDir: 'dist',
  ...(developmentUrl
    ? { server: { url: developmentUrl, cleartext: developmentUrl.startsWith('http:') } }
    : {}),
}
export default config
```

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `appId` | プロジェクトで指定 | `capacitor.config.ts` のアプリ識別子。 |
| `appName` | プロジェクトで指定 | ネイティブアプリの表示名。 |
| `webDir` | ビルド出力と一致 | ネイティブパッケージにコピーするディレクトリ。 |
| `CAPACITOR_SERVER_URL` | 省略可 | 生成テンプレートが端末開発用に読み取る環境値。リリースでは同期した資産を使用。 |
