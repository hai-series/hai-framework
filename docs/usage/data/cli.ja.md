# @h-ai/cli データ構造

[简体中文](cli.md) · [English](cli.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/cli.ja.md) · [API リファレンス](../function/cli.ja.md)

CLI はビルド後にバージョン、ソースの識別情報、イメージ一覧を `manifest.json` に書き出します。デプロイ時はこのファイルで公開対象の成果物を確認できます。

<a id="files"></a>

## ファイルと成果物

CLI はプロジェクトと成果物のファイルを生成します。実行時のテーブルとキーは生成したアプリで有効なモジュールが管理します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| プロジェクトファイル | 指定先にソース、ワークスペースの一覧、機能設定、リソースを保持。 |
| `manifest.json` | 成功したビルドで生成し、出力先に由来と成果物を保存。 |
| 診断バンドル | 呼び出し側がファイルを選択。証跡と出力の形式は [Feedback](feedback.ja.md) を参照。 |
| デプロイ用ファイル | アーカイブとサーバーのリリース状態は [Deploy](deploy.ja.md) を参照。 |

<a id="example-data"></a>

### ビルド成果物のバージョンとイメージ一覧

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
