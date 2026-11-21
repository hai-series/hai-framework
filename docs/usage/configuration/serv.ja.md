# @h-ai/serv 設定

<!-- translation: partial -->

[原文（中国語）](serv.md) · [データ構造](../data/serv.ja.md) · [API リファレンス](../function/serv.ja.md)

サーバーのエントリーで `config/_serv.yml` を読み込みます。HTTP 層へ設定を渡し、デプロイの認証情報はサーバーの環境変数に置きます。

## 設定例

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  port: 3000
http:
  apiPrefix: /api/v1
  trustedProxies: auto
  access: false
```

### 別ドメインの管理画面から API を利用する

`config/_serv.yml` に記述します。管理画面の Origin からの応答読み取りと認証情報の送信を許可します。CORS は認証や権限確認の代わりにはなりません。Cookie を使う場合は適切な Cookie 属性も必要です。Origin は実際の管理画面に置き換えます。

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  host: 0.0.0.0
  port: 3000
cors:
  origin: https://console.example.com
  credentials: true
```

### API ドキュメントとヘルスチェックの URL を設定する

OpenAPI は `/openapi.json`、閲覧画面は `/docs`、ヘルスチェックは `/healthz` と `/readyz` を使います。閲覧画面にはアプリ側が認証したユーザー情報が必要です。ヘルスチェックは配備時の稼働確認用で、すべての外部業務システムの正常性を保証するものではありません。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  apiPrefix: /api/v1
  openapi:
    path: /openapi.json
  docs:
    path: /docs
    requireAuth: true
  health:
    path: /healthz
    readyPath: /readyz
```

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `server.host`, `server.port` | `127.0.0.1`, `3000` | 待ち受けアドレスとポート。 |
| `http.trustedProxies`, `http.access` | `auto`, `false` | 信頼するプロキシと任意のリクエストポリシー。信頼できるインフラのアドレスだけを指定。 |
| `transport` | `false` | オブジェクトにするとアプリ層の暗号化が有効。クライアントとサーバーで一致させる。 |
| `transport.maxPlaintextBytes`, `maxFutureSkewSeconds`, `maxRequestAgeSeconds` | `auto`, `30`, `300` | 平文の上限バイト数とリクエスト時刻の上限秒数。 |
| `transport.routePlaintextBytes`, `excludePaths`, `keyExchangePath` | `undefined`, `[]`, `/_hai/key-exchange` | ルート別の上限、暗号化しないパス、鍵交換エンドポイント。 |
| `http.apiPrefix` | `/api/v1` | API ルートを配置するプレフィックス。 |
| `http.openapi`, `http.docs` | `false`, `false` | 必要時に OpenAPI またはドキュメントを公開。オブジェクト形式の既定は `/openapi.json` と `/docs`。`requireAuth` で保護可能。 |
| `http.health.path`, `readyPath` | `/health`, `/ready` | 稼働と準備状況のエンドポイント。既定で有効。 |
| `cors.origin`, `cors.nativeOrigins` | 省略可 | アクセスを必要とするアプリのオリジンだけ許可。 |
| `cors.allowedHeaders`, `exposedHeaders`, `credentials` | Built-in headers, `[]`, `false` | CORS で受理するヘッダー、クライアントに公開するレスポンスヘッダー、認証情報の扱いを設定。 |

未翻訳：CORS の個別項目、API 仕様とヘルスチェックの切替、通信の制限。[中国語の該当節](serv.md#configuration-fields)を参照してください。
