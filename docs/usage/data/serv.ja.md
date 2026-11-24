# @h-ai/serv データ構造

[简体中文](serv.md) · [English](serv.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/serv.ja.md) · [API リファレンス](../function/serv.ja.md)

Serv はリクエストを処理するルートに認証済みのユーザー情報と追跡 ID を渡します。更新 Cookie が有効な場合は、ブラウザーが次回更新用の資格情報を保持します。

<a id="runtime-data"></a>

## プロセス内データ

アプリの永続化は業務モジュールが管理します。Serv はリクエストごとのコンテキストを提供します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| リクエスト情報 | 信頼済みのリクエスト・クライアント情報は処理中だけ保持。トークンとセッションは IAM、通信レジストリは Crypto が管理。 |

<a id="example-data"></a>

### 処理関数に渡す利用者情報とリクエスト番号

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

<a id="browser-storage"></a>

## ブラウザーのストレージ

| キー | 書き込む条件と保持期間 |
| --- | --- |
| `hai_refresh_token` | 有効時にサーバーが更新用 Cookie を API の更新パスに設定。既定は 30 日、HttpOnly、SameSite=Strict。Secure は環境または明示設定に従う。 |

### ブラウザーの認証更新 Cookie

ブラウザーが自動送信して認証を更新します。

```json
"<refresh-token:redacted>"
```

既定30日、HttpOnly、Strict、更新経路限定です。サーバー失効後は Cookie が残っていても更新できません。
