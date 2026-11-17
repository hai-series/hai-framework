# @h-ai/kit 設定

[原文（中国語）](kit.md) · [データ構造](../data/kit.ja.md) · [API リファレンス](../function/kit.ja.md)

サーバーのエントリーで `config/_kit.yml` を読み込みます。HTTP 層へ設定を渡し、デプロイの認証情報はサーバーの環境変数に置きます。

```yaml schema=@h-ai/kit:KitConfigSchema
server:
  port: 3000
trustedProxies: auto
access: false
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `server.host`, `server.port` | `127.0.0.1`, `3000` | 待ち受けアドレスとポート。 |
| `trustedProxies`, `access` | `auto`, `false` | 信頼するプロキシと任意のリクエストポリシー。信頼できるインフラのアドレスだけを指定。 |
| `transport` | `false` | オブジェクトにするとアプリ層の暗号化が有効。クライアントとサーバーで一致させる。 |
| `transport.maxPlaintextBytes`, `maxFutureSkewSeconds`, `maxRequestAgeSeconds` | `auto`, `30`, `300` | 平文の上限バイト数とリクエスト時刻の上限秒数。 |
| `transport.routePlaintextBytes`, `excludePaths`, `keyExchangePath` | `undefined`, `[]`, `/api/_hai/key-exchange` | ルート別の上限、暗号化しないパス、鍵交換エンドポイント。 |
