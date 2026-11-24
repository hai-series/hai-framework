# @h-ai/deploy データ構造

[简体中文](deploy.md) · [English](deploy.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/deploy.ja.md) · [API リファレンス](../function/deploy.ja.md)

デプロイが中断した場合、運用者はデプロイ ID から処理ログと結果を調べ、対象にビルドが反映されたか確認できます。成果物はビルド環境、公開記録と実行設定はデプロイ先が管理します。

<a id="files"></a>

## ファイルと成果物

Deploy は SQL テーブルや Redis キーを作りません。ビルド成果物は公開まではローカルにあり、公開済みリリースは配置先サーバーに保存します。クラウド上のリソースはそのサービスが管理します。

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| ビルドの `manifest.json` | 成果物の種類、アプリ・ビルド識別子、イメージやファイルの一覧と検証情報。 |
| アーカイブの `manifest.json` | 配置対象とビルド情報。`apply.sh`、`config/`、`images/`、`.hai/` と同梱します。 |
| `.hai/SHA256SUMS` | 配置前に照合するファイルごとの SHA-256。 |
| `<root>/releases/<id>/` | 配置 ID ごとのディレクトリ。Compose と実行時設定を含みます。 |
| `<root>/.deploy.lock` | 公開先のルートごとに一プロセスだけ実行できます。終了時に解放され、手動削除すると排他制御を壊すおそれがあります。 |
| `<root>/steps-<id>.jsonl` | ステップごとに `stage`、`status`、`durationSeconds` を記録。 |
| `<root>/result-<id>.json` | 配置の最終結果。接続が切れた後でも確認できます。 |
| 配置先の実行時設定 | アプリや接続先の認証情報を含むことがあります。リリースとともに管理し、配置先でアクセスを制限します。 |

配置状態はリリース処理の記録です。業務データはアプリが利用するデータベースやオブジェクトストレージに残ります。

<a id="example-data"></a>

### 配布するファイル群を照合

展開スクリプトが目的のアプリとビルドか確認します。

```json
{
  "version": 5,
  "primaryService": "serv",
  "appVersion": "1.0.0",
  "buildId": "example-20261117",
  "partial": false
}
```

example-20261117 はビルド識別です。実際の包にはイメージと検査値も必要で、文章だけ変えても成果物にはなりません。

### 展開が進んだ段階を確認

各段階を1行ずつ記録し、切断後も進捗を調べられます。

```json
{
  "stage": "health",
  "status": "passed",
  "durationSeconds": 2
}
```

health は2秒で成功しましたが、全体の結果は最終結果ファイルで確認します。

### 切断後に確認できる状態

エラー後に終了済みと未確認を分け、無条件の再実行を避けます。

```json
{
  "reason": "timeout",
  "localTermination": "confirmed",
  "remoteExecution": "unknown",
  "deploymentId": "deploy-orders-42",
  "resultFile": "/opt/hai/apps/orders/result-deploy-orders-42.json"
}
```

ローカルは終了しましたが遠端は不明です。まず対応 resultFile を確認します。

### 展開全体の最終結果

切断後も同じ展開番号の結果を照合できます。

```json
{
  "deploymentId": "deploy-orders-42",
  "stage": "complete",
  "exitCode": 0,
  "durationSeconds": 42,
  "recoveryStatus": "not-needed"
}
```

0終了で42秒、復旧不要の例です。業務データが変わっていない証明ではありません。

`schemaVersion: 1` の CLI 受領書には `artifactDir`、`manifestPath`、v5 マニフェストが入ります。非公開バンドルの `deploymentTarget` にはプロジェクト、対象ディレクトリ、エンジンと Docker モード、リスナーとポート、外部 HTTPS アドレスを記録し、配備 ID とともにバンドルのハッシュで保護します。検証成功時の `proof` には `deploymentId` と各稼働ロールの `imageId` と `archiveSha256` が入ります。順にイメージ構成と tar 全体の SHA-256 です。Docker containerd では稼働コンテナーのプラットフォームマニフェストで構成を特定します。呼び出し元がバンドル受領書と検証結果を保存します。
