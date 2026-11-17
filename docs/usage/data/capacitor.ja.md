# @h-ai/capacitor データ構造

[原文（中国語）](capacitor.md) · [設定](../configuration/capacitor.ja.md) · [API リファレンス](../function/capacitor.ja.md)

端末の認証情報は Android のキーストアで保護された暗号化ストレージ、または iOS の Keychain に格納します。サーバーのセッションは IAM が管理します。一般の設定は安全な認証情報ストレージと区別します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_access_token`, `hai_refresh_token` | 安全なトークンアダプターで共有する固定キー。未保存は空。アダプターが読み書き・削除。 |
| Preferences / 設定値 | アプリ指定のキーと一般の文字列。有効期限はなし。同じキーは上書き。 |
