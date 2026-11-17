# @h-ai/crypto データ構造

[原文（中国語）](crypto.md) · [設定](../configuration/crypto.ja.md) · [API リファレンス](../function/crypto.ja.md)

長期鍵はアプリが管理します。通信レジストリにはクライアント公開鍵と再送検知用の一時的な記録を保存します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_crypto_transport_client_keys` | 主キー `client_id`、SM2 `public_key`、`created_at_ms`、NULL 可の `expires_at_ms`。 |
| `hai_crypto_transport_requests` | 一意な `request_key` にクライアントとリクエスト ID の JSON ペアを保存。`expires_at` はミリ秒。 |
| `hai_crypto_transport_capacity` | 単一行 `id=1`、初期値は `max_clients=10000`、`revision=0`。サービス間で共有。 |
| `hai:crypto:transport:client:<clientId>` | クライアントの SM2 公開鍵を Redis に保存。 |
| `hai:crypto:transport:request:<clientId>:<requestId>` | 値は `true`。有効期限付きの再送検知マーカー。 |
