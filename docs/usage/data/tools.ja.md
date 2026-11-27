# @h-ai/tools データ構造

[简体中文](tools.md) · [English](tools.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/tools.ja.md) · [API リファレンス](../function/tools.ja.md)

レジストリはツール定義を現在のプロセスに保持します。ファイルが必要な場合は、ホストが内容、権限、バージョンを管理します。

<a id="runtime-data"></a>

## プロセス内データ

登録済みのツールは現在のプロセスに保持されます。`registry.getNames()` で利用可能な名前を確認できます。プロセスの終了や `registry.clear()` で登録は消えます。

| データ | 保存元 | 使う場面 |
| --- | --- | --- |
| ツールの実装、入力スキーマ、タイトル、プリセット、グループ | アプリが各プロセスで組み立てる | Tools が一覧を生成し、入力を検証してハンドラーを呼ぶ |
| 有効なツールと権限 | アプリのサーバー設定と業務認可システム | ホストの認可規則に従い、直接実行時に呼び出し元と検証済みの入力を確認 |
| ファイル本体、所有者、バージョン、保持期間 | ホストのファイルストアと業務サービス | ホストが現在の主体に対して読み書きし、公開や保存の際に権限とバージョンを確認する |

<a id="artifact-access"></a>

## 成果物アクセス契約

ツールがファイルを必要とする場合、ホストが `ToolArtifactAccess` を実装します。[Storage](storage.ja.md) や既存のファイルストアを利用できます。複数ノードでタスクを処理するときは、どのノードからも同じファイルにアクセスできるようにします。

| ホストのコールバック | データと権限 |
| --- | --- |
| `read(context, { id })` | 現在の主体にファイルの読み取り権限があることを確認する。`id/name/mediaType/data` と、必要に応じて `kind/version` を返す |
| `publish(context, { name, kind, mediaType, data, id? })` | 公開権限を確認してファイル本体を保存し、成果物参照を返す。ツールは安定した ID を渡せる。たとえば `artifact_create` は信頼済みの実行 ID から成果物 ID を生成する。重複排除と保持期間はホストが管理する |
| `save(context, { id, baseVersion, content })` | 任意。所有者と基準バージョンを確認して新しい内容を保存する。バージョンが競合した場合はホストがエラーを返す |

<a id="artifact-storage"></a>

### ファイルの保存先

利用例のレジストリでは、`files.publish` がバイト列をメモリー内の `Map` に保存し、`files.read` が ID から取得します。プロセスが終了するとファイルは失われます。アプリに組み込む際は、ホストが両方のコールバックを実際のストレージと権限チェックに接続します。[利用例のレジストリ](../function/tools.ja.md#artifact-setup)

Agent ワークスペースは `config/_storage.yml` から Storage の設定を読み込みます。既定の `type: local` は、サービスの作業ディレクトリから見た `./data/uploads` にファイル本体を書き込みます。`HAI_STORAGE_ROOT` でルートディレクトリを変更できます。Agent の `.env.prod` は `s3` を選び、`HAI_STORAGE_BUCKET` で設定した S3 互換バケットに書き込みます。Agent はファイル情報を `hai_agent_resources` に、バージョンごとのオブジェクトキーとチェックサムを `hai_agent_resource_versions` に保存します。読み取り時は所有者を確認し、該当するバージョンのオブジェクトキーで本文を取得します。[ローカルと S3 の設定](../configuration/storage.ja.md)

### 生成ファイルやページへの参照

`artifact_create` が成功すると、下記の Markdown の利用例のようにファイル参照が返ります。`id` はホストのファイルライブラリでファイルを識別します。ホストが `files.save` を提供する場合は、読み取った `version` を `baseVersion` として `artifact_save` に渡します。Agent は保存に成功すると同じ ID を使い、バージョン番号を増やします。新しいバージョンがすでにある場合は競合エラーを返します。[Markdown の利用例](../function/tools.ja.md#artifact-example)

```json
{
  "id": "artifact-1",
  "title": "Project notes",
  "kind": "markdown",
  "version": 1,
  "mediaType": "text/markdown"
}
```

<a id="runtime-tasks"></a>
<a id="example-data"></a>
<a id="tool-events"></a>
<a id="size-and-retention"></a>

永続ツールサービスを使う場合は、[受領情報、イベント、保持期間](tools-runner.ja.md#runtime-tasks) を参照してください。
