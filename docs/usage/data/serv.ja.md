# @h-ai/serv データ構造

[原文（中国語）](serv.md) · [設定](../configuration/serv.ja.md) · [API リファレンス](../function/serv.ja.md)

アプリの永続化は業務モジュールが管理します。Serv はリクエストごとのコンテキストを提供します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_refresh_token` | 有効時にサーバーが更新用 Cookie を API の更新パスに設定。既定は 30 日、HttpOnly、SameSite=Strict。Secure は環境または明示設定に従う。 |
| Request context / リクエスト情報 | 信頼済みのリクエスト・クライアント情報は処理中だけ保持。トークンとセッションは IAM、通信レジストリは Crypto が管理。 |
