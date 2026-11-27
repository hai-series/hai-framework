# @h-ai/tools-runner 設定

[简体中文](tools-runner.md) · [English](tools-runner.en.md)

[モジュール README](../../../packages/tools-runner/README.ja.md) · [データの保存先](../data/tools-runner.ja.md) · [機能](../function/tools-runner.ja.md)

<a id="configuration-fields"></a>

## 設定の読み込み

Tools Runner はホストからファクトリーのオプションを受け取ります。RelDB、Runner のノード、コンテナーイメージはホスト側で設定します。使用するツールはアプリ自身の設定から読み込み、サービスの作成時に渡せます。

| 設定する内容 | 設定先 | 利用する機能 |
| --- | --- | --- |
| サービスで公開するツールと実行を許可する利用者 | サーバーコードの `toolsRunner.createService(...)` に `createTools`、`enabled`、`authorize` を渡す | Tools が有効なツールの一覧を作り、送信時と実行時に認可する |
| タスクの保存先と実行プロセス | アプリ起動時に RelDB を設定し、続いて Runner の `nodeId`、実行の役割、容量を設定する | RelDB がデータベースに接続し、Runner がタスクを保存して実行する |
| コンテナーイメージ、ネットワークポリシー、リソース上限 | Runner の `environments` に登録し、アプリで環境 ID を対応するツールに割り当てる | Runner がコンテナーを提供し、ツールはホストが許可したファイルアクセスを使う |

アプリは認証結果から `scope` を取得し、ツール入力と分けてサービスに渡します。たとえば `{ tenantId: 'demo', userId: 'alice' }` は demo テナントの alice を示します。一覧の内容は `createTools` と `enabled` で決まります。利用者ごとに一覧を変えるには、その 2 箇所で絞り込みます。実行を許可するかどうかは `authorize` が判断し、ファイルへのアクセスは読み書きのたびにホストが確認します。引数と既定値は[呼び出しオプション](../function/tools.ja.md#call-options)と[サービスファクトリー](../function/tools-runner.ja.md#services)を参照してください。

<a id="local-service"></a>

## ローカルで加算サービスを実行する

1. アプリの起動コードで RelDB を使ってローカルの SQLite データベースを開き、Runner を起動します。Runner に `nodeId` を指定し、既定の実行役割を使うと同じプロセスでタスクを処理できます。加算関数は Node 上で動作し、RelDB と Runner が保存と実行の制御を担当します。[RelDB 接続設定](reldb.ja.md#configuration-fields) · [Runner ノード設定](runner.ja.md#configuration-fields)
2. ID が `sum-demo` の Tools サービスを作成し、稼働中の Runner を渡します。`createTools` が返すツールセットに加算関数 `sum` を含め、`enabled: { tools: ['sum'] }` を指定します。信頼できるコンテキストを使って alice に実行権限があるか確認します。一覧に `sum` が表示されたら `{ a: 2, b: 3 }` を送信し、受領情報を使って結果 `5` を確認します。[加算サービスの利用例](../function/tools-runner.ja.md#service-example) · [受領情報と結果の例](../data/tools-runner.ja.md#example-data)
3. アプリの終了時には最初に Tools サービスを閉じてハンドラーの登録を解除し、次に Runner を閉じます。Runner の終了が完了するまで RelDB 接続を維持します。[Runner の終了処理](../function/runner.ja.md#nodes)

同じプロセスですぐに関数を実行する場合は、`tools.createRegistry()` でレジストリーを作成します。Runner の起動やタスクの保存は不要です。[軽量レジストリー](../function/tools.ja.md#registry)

<a id="job-environments"></a>

## コンテナーを使うジョブを追加する

ZIP から HTML プレビューを作る場合は、Runner に `preview-local` という環境を登録します。固定イメージ、`preview.build` ケイパビリティ、リソース上限、`offline` ネットワークポリシーを指定します。アプリで `environments: { preview: 'preview-local' }` を `toolsRunner.createJobTools(...)` に渡し、`preview_build` を有効にします。一覧にツールが出たら、ホストが許可した ZIP の参照を送信し、結果の成果物を確認します。実際のイメージ、権限、ネットワーク設定で動作を検証してください。[Runner コンテナー設定](runner.ja.md#configuration-fields) · [Tools のジョブ環境とファクトリー](../function/tools-runner.ja.md#job-tools) · [ジョブイメージとリソースの例（中国語）](../../../packages/tools/jobs/README.md#配置)

ブラウザーのスクリーンショット撮影と Web キャプチャには、内部ネットワークとデプロイ側で管理する `browserProxy` も必要です。ホストがプロキシをジョブのファクトリーに渡します。ブラウザーのネットワーク要件とプロキシアドレスの書式は[ジョブ環境のオプション](../function/tools-runner.ja.md#job-tools)を参照してください。
