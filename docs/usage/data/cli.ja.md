# @h-ai/cli データ構造

[原文（中国語）](cli.md) · [設定](../configuration/cli.ja.md) · [API リファレンス](../function/cli.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### ビルド成果物のバージョンとイメージ一覧

対応する構造：`manifest.json (DeploymentArtifact)`。

ビルド後の一覧で版・批次・イメージを照合し、成果物の取り違えを防ぎます。

```json
{
  "version": 5,
  "primaryService": "serv",
  "appVersion": "1.0.0",
  "buildId": "example-20261117",
  "source": {
    "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "dirty": false
  },
  "partial": false,
  "hasWeb": false,
  "images": []
}
```

主サービス serv、版1.0.0 の抜粋です。空の images は省略表示で、そのまま配布できません。

## 項目・保存・削除のリファレンス

CLI はプロジェクトと成果物のファイルを生成します。実行時のテーブルとキーは生成したアプリで有効なモジュールが管理します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| Project / プロジェクト | 指定先にソース、ワークスペースの一覧、機能設定、リソースを保持。 |
| `manifest.json` | 成功したビルドで生成し、出力先に由来と成果物を保存。 |
| Diagnostic bundle / 診断バンドル | 呼び出し側がファイルを選択。証跡と出力の形式は [Feedback](feedback.md) を参照。 |
| Deploy / デプロイ | アーカイブとサーバーのリリース状態は [Deploy](deploy.md) を参照。 |
