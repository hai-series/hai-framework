# @h-ai/iam データ構造

<!-- translation: partial -->

[原文（中国語）](iam.md) · [設定](../configuration/iam.ja.md) · [API リファレンス](../function/iam.ja.md)

認証データは RelDB に保存し、取り消し可能なセッション状態は本番環境で Cache を共有します。認証情報と権限状態はサーバーに保持します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_iam_users` | ユーザー ID、ログイン名、パスワードハッシュ、状態とプロフィール項目。 |
| `hai_iam_roles`, `hai_iam_permissions` | 名前付きロールと権限定義。 |
| `hai_iam_user_roles`, `hai_iam_role_permissions` | ユーザーとロール、ロールと権限の対応。 |
| `hai_iam_api_keys` | API キーの状態と所有者。キー素材はハッシュ化して保存。 |
| Cache / キャッシュ | 利用者のセッションと索引、トークン検証・失効、OTP の試行、チャレンジと一回用チケット。期限と削除は認証方式・ポリシーによる。 |

未翻訳：アカウントの全項目、キャッシュキーと認証情報の有効期限。[中国語の該当節](iam.md#data-fields)を参照してください。
