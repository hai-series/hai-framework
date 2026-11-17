# @h-ai/api-client データ構造

[原文（中国語）](api-client.md) · [設定](../configuration/api-client.ja.md) · [API リファレンス](../function/api-client.ja.md)

クライアントはローカルの認証情報を管理し、サーバーのセッションは IAM が永続化します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | 既定のアダプター。アクセス用の値は初期状態で空、再読み込みで消失。更新 Cookie はブラウザーが送信。 |
| `apiClient.tokenStorage.memory()` | 両方のトークンは初期状態で空。削除またはインスタンス破棄まで保持。SSR のリクエストごとに分離。 |
| `TokenStorage` | アプリ指定のアダプター。ネイティブでは OS の安全なストレージを利用可能。Web の既定は localStorage を使わない。 |
