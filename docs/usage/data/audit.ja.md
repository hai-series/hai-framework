# @h-ai/audit データ構造

<!-- translation: partial -->

[原文（中国語）](audit.md) · [設定](../configuration/audit.ja.md) · [API リファレンス](../function/audit.ja.md)

監査イベントは RelDB に保存します。バックアップを有効にすると設定済みの Storage にオブジェクトを書き出します。削除の条件はデータベースのポリシー行で共有します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_audit_logs` | 主キー `id`、操作とリソース、`created_at`、任意の操作主体・リソース ID・JSON の詳細・接続元・クライアント情報・分類・結果・重大度・追跡情報・主体のスナップショット。作成日時で索引。 |
| `hai_audit_policy` | 単一行 `id=1`。初期値は `enabled=0`、`min_days=90`。 |
| `hai_audit_alert_claims` | ルール、送信先、時間帯の組で一意に取得。識別子と状態、任意のキュー ID・エラーコードを保持。 |

追加の設定項目や利用例は[中国語リファレンス](audit.md)に掲載しています。
