# @h-ai/cli データ構造

[原文（中国語）](cli.md) · [設定](../configuration/cli.ja.md) · [API リファレンス](../function/cli.ja.md)

CLI はプロジェクトと成果物のファイルを生成します。実行時のテーブルとキーは生成したアプリで有効なモジュールが管理します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| Project / プロジェクト | 指定先にソース、ワークスペースの一覧、機能設定、リソースを保持。 |
| `manifest.json` | 成功したビルドで生成し、出力先に由来と成果物を保存。 |
| Diagnostic bundle / 診断バンドル | 呼び出し側がファイルを選択。証跡と出力の形式は [Feedback](feedback.md) を参照。 |
| Deploy / デプロイ | アーカイブとサーバーのリリース状態は [Deploy](deploy.md) を参照。 |
