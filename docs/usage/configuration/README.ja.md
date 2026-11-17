# アプリケーションの設定

[ガイドのトップ](../README.ja.md) · [初回リリースの手順](../getting-started/workflow.ja.md) · [検証ガイド](../governance/verification.md)

このディレクトリは、実在する設定ファイル（YAML、hai.json、ネイティブ工程と環境ファイル）の項目と反映方法を扱います。引数、依存注入、コールバック、UI props は[機能リファレンス](../function/README.ja.md)、公開設定レスポンスは[データ構造](../data/README.ja.md)に記載します。独立ファイルのないモジュールでは所有者だけを説明します。

変更したい動作から設定を探します。たとえば、操作していないセッションの有効時間を短くするには IAM のセッション設定を変更します。応答が遅い場合はクライアントの制限時間、接続プール、接続先サービスをそれぞれ確認します。パッケージ名が分かる場合は、下の一覧から設定項目と既定値を調べてください。

<a id="modules"></a>

## モジュール別の設定

### 実行基盤と API

[core](core.ja.md) · [api-contract](api-contract.ja.md) · [api-client](api-client.ja.md) · [crypto](crypto.ja.md) · [serv](serv.ja.md) · [kit](kit.ja.md)

### データとファイル

[reldb](reldb.ja.md) · [cache](cache.ja.md) · [storage](storage.ja.md) · [vecdb](vecdb.ja.md) · [datapipe](datapipe.ja.md)

### アプリ機能

[iam](iam.ja.md) · [ai](ai.ja.md) · [tools](tools.ja.md) · [audit](audit.ja.md) · [feedback](feedback.ja.md) · [payment](payment.ja.md) · [reach](reach.ja.md) · [scheduler](scheduler.ja.md) · [ui](ui.ja.md) · [capacitor](capacitor.ja.md)

### ビルドと実行

[cli](cli.ja.md) · [deploy](deploy.ja.md) · [runner](runner.ja.md)

## 分野別の設定

| 分野 | 主な設定場所 |
| --- | --- |
| [起動・上書き・ログ・ライフサイクル](runtime.md) | `_core.yml`、dotenv、`HAI_*`、アプリ起動コード |
| [データベース・キャッシュ・ファイル・テキスト](data.md) | `_db.yml`、`_cache.yml`、`_storage.yml`、`_ai.yml.knowledge` |
| [ID・パスワード・セッション・権限](identity.md) | `_iam.yml`、認証ポリシー、サーバー側の認可 |
| [HTTP・クライアント・通信](http.md) | `_serv.yml`、`_kit.yml`、[リクエストのアクセスポリシー](request-access.md) |
| [AI・ナレッジ・ベクトル](ai.md) | `_ai.yml`、`_vecdb.yml`、明示的に設定するストア |
| [フィードバック・通知・監査・ジョブ](operations.md) | `_feedback.yml`、`_reach.yml`、`_audit.yml`、`_scheduler.yml` |
| [画面・決済・デバイス](experience.md) | `_payment.yml`、`capacitor.config.ts`、ネイティブ工程 |
| [ビルド・デプロイ・復旧](delivery.md) | `hai.json` の `build` と `deploy`、`PUBLIC_BASE_PATH`、環境ファイル、前回成功したデプロイ |

サブディレクトリで公開する場合は、[サイトの公開パス](delivery.md#网站部署在子目录) と [HTTP アドレス](http.md) を確認します。再読み込みでリソースを取得できること、API、ログイン、ヘルスチェックが意図したアドレスに届くことを確認してください。外部向け API にアクセス時間帯や IP 制限を設定する場合は、[リクエストのアクセスポリシー](request-access.md) と、元の IP アドレスを通知できるプロキシを確認します。

## 設定が反映されるタイミング

CLI が生成したサーバーでは `core.init()` が `config/` を読み取ります。アプリは設定を検証し、対応するモジュールに渡します。たとえば `config/_db.yml` は `db` という名前で登録され、その設定をアプリが `reldb.init()` に渡すと接続を確立します。Serv と Kit は HTTP アプリまたはリクエストハンドラーを作成するときに設定を受け取ります。API Client、Crypto、UI、Datapipe、Capacitor は呼び出し時に設定を受け取ります。API Contract の入出力はコードで定義します。ビルドとデプロイのコマンドは `hai.json` から設定を読みます。

値を省略すると、フレームワークの既定値が適用されます。CLI が生成する設定ファイルに別の値が書かれている場合は、その値が適用されます。たとえば Feedback のスキーマの既定値は `reach` で、テンプレートはコンソール出力を設定します。例にある値はその場面を説明するためのものです。必須項目に既定値がない場合は、アプリや対象環境で値を指定します。

## 設定変更の確認手順

1. 変更したい動作を記録し、現在値のファイル、環境変数、値を使うコードを探します。
2. 対象環境の値を変更します。[上書きの順序](runtime.md#配置从哪里来) を確認し、認証情報は非公開の環境ファイルに保存します。
3. 設定値を検証し、ドキュメントに従ってサービスを再起動または再初期化します。ブラウザに組み込む値を変更したときはクライアントを再ビルドします。動作確認ではポートやログレベルなど必要な項目だけを見ます。
4. 分離したアカウントやデータで、成功、拒否、失敗からの復旧を試します。スキーマで確認できるのは名前、型、範囲です。接続や動作は実行して確認してください。
5. 復旧に使う成果物、移行記録、互換性のあるバックアップを保管します。

公開設定の変更に合わせて、スキーマ、呼び出し元、モジュールガイド、テンプレート、テストも更新します。注釈付きの設定例は `pnpm check:usage-examples` で検証できます。
