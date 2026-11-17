# @h-ai/kit データ構造

[原文（中国語）](kit.md) · [設定](../configuration/kit.ja.md) · [API リファレンス](../function/kit.ja.md)

Kit はリクエスト処理を担当します。セッションの永続化は IAM、暗号化通信の状態は Crypto が管理します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai:kit:ratelimit:{<digest>}` | 値は `count` とミリ秒の `resetAt`。ダイジェストにはアプリの名前空間、集計時間、対象を含む。複数インスタンスでは共有 Redis アダプターを使用。 |
| `hai_access_token` | アクセストークンを格納する認証 Cookie。名前は設定可能。 |
