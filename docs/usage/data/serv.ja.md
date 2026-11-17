# @h-ai/serv データ構造

[原文（中国語）](serv.md) · [設定](../configuration/serv.ja.md) · [API リファレンス](../function/serv.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

まず用途と例を読み、必要に応じて後半の項目・保存規則を確認してください。ID と業務内容は架空で、秘密は隠しています。時刻は 2026-11-17 00:00 UTC を起点とし、単位は各説明に記します。

### 今回のリクエストの身元と手掛かり

対応する構造：`ServContext`。

処理関数が利用者・権限・調査対象を知るための情報です。

```json
{
  "requestId": "request-42",
  "locale": "zh-CN",
  "ip": "192.0.2.42",
  "terminalType": "web",
  "session": {
    "userId": "user-42",
    "roles": [
      "reader"
    ],
    "permissions": [
      "orders.read"
    ]
  }
}
```

request-42 が追跡番号で、検証済み user-42 は注文参照可です。Request と logger は省略し、自己申告の権限は採用しません。

### ブラウザーの認証更新 Cookie

対応する構造：`hai_refresh_token`。

ブラウザーが自動送信して認証を更新します。

```json
"<refresh-token:redacted>"
```

既定30日、HttpOnly、Strict、更新経路限定です。サーバー失効後は Cookie が残っていても更新できません。

## 項目・保存・削除のリファレンス

アプリの永続化は業務モジュールが管理します。Serv はリクエストごとのコンテキストを提供します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_refresh_token` | 有効時にサーバーが更新用 Cookie を API の更新パスに設定。既定は 30 日、HttpOnly、SameSite=Strict。Secure は環境または明示設定に従う。 |
| Request context / リクエスト情報 | 信頼済みのリクエスト・クライアント情報は処理中だけ保持。トークンとセッションは IAM、通信レジストリは Crypto が管理。 |
