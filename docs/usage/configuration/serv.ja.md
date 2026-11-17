# @h-ai/serv 設定

<!-- translation: partial -->

[原文（中国語）](serv.md) · [データ構造](../data/serv.ja.md) · [API リファレンス](../function/serv.ja.md)

サーバーのエントリーで `config/_serv.yml` を読み込みます。HTTP 層へ設定を渡し、デプロイの認証情報はサーバーの環境変数に置きます。

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  port: 3000
http:
  apiPrefix: /api/v1
  trustedProxies: auto
  access: false
```

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

追加の設定項目や利用例は[中国語リファレンス](serv.md)に掲載しています。
