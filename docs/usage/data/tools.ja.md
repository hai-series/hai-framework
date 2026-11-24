# @h-ai/tools データ構造

[简体中文](tools.md) · [English](tools.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/tools.ja.md) · [API リファレンス](../function/tools.ja.md)

サーバー側ツールを送信すると、クライアントは受領情報で進捗を追い、成果物の参照で生成されたファイルやページを読み取ります。実行記録は Runner、アクセス確認はホストが担当します。

<a id="runtime-data"></a>

## プロセス内データ

Tools は独自のデータベーステーブル、キャッシュキー、永続リースを持ちません。軽量定義と登録器はプロセス内に存在し、`clear()` または終了で失われます。サーバータスクは Runner の既存保存先を使い、新しいキューや実行状態テーブルは作りません。

| データ | 所有者とライフサイクル |
| --- | --- |
| 実装・Schema・表示名・プリセット・グループ | 各ノードでホストが構築。共有タスク状態ではない |
| 有効化と認可 | ホストの信頼済み設定。提出時と実行時に再確認 |
| タスク・冪等キー・リース・状態・イベント | [Runner](runner.ja.md) が保存・整理。型は `hai.tools.<id>.v1` |
| ファイル・成果物のバイト | [Storage](storage.ja.md) が保存。ホストのコールバックで読み取り・公開 |
| 文書バージョン・帰属・競合 | 業務サービスが管理。`baseVersion` は最終書き込みの条件 |
| MCP サービス一覧と Broker | [AI](ai.ja.md) とホストが管理。Tools に複製しない |

<a id="runtime-tasks"></a>

## タスクと受領情報

`ToolRun` は `receipt: { id, key }`、Runner `status`、任意の `output/failure`、`events`、追加取得用の `next` を返します。`inspect(receipt, context, { after })` で続きを読みます。受領情報全体を保持し、各ノードで現在の本人とサービスの帰属を検証します。タスク ID だけで取得・キャンセルを許可しません。

`queued/running/cancelling` は終端ではありません。キャンセルは停止要求で、実際の完了・失敗・解放は Runner に記録します。`service.close()` はタスクの削除や停止証明ではありません。

<a id="example-data"></a>

### ツール実行の進捗と結果

受付情報を保存し、再提出せずに状態や後続イベントを確認します。

```json
{
  "receipt": {
    "id": "execution-42",
    "key": "order-42-preview"
  },
  "status": "succeeded",
  "output": {
    "artifactId": "artifact-42"
  },
  "events": [],
  "next": 0
}
```

execution-42 は成功し artifact-42 を指します。例にイベントはなく next は0です。公開アクセス権ではありません。

<a id="artifact-access"></a>

## 成果物アクセス契約

ホストが `ToolArtifactAccess` を実装し、各操作で現在の本人と最終確定条件を確認します。

| コールバック・データ | 構造と用途 |
| --- | --- |
| `read(context, { id })` | `HaiResult<ToolArtifact>`。`id/name/mediaType/data` と任意の `kind/version` |
| `publish(context, { name, kind, mediaType, data, id? })` | バイトを保存して権限付き参照を返す。冪等性・帰属・保持期間はホストが管理 |
| `save(context, { id, baseVersion, content })` | 任意のバージョン条件付き保存。参照を返し、競合はホストが報告 |
| `ToolArtifactReference` | `{ id, title, kind, version, mediaType }`。ツール結果と後続の画面取得に使用 |

ジョブ出力は安定した実行・出力識別子で再試行時の重複排除を支援しますが、公開権限と冪等性はホストでも検証します。共有環境は同じ Storage と Runner データベースを使います。あるノードのメモリやローカル一時パスを共有成果物の保存先として扱いません。

ブラウザー出口プロキシはホストの配置設定で、`HAI_TOOL_BROWSER_PROXY` を通じてジョブに渡します。ユーザー入力や共有業務状態ではありません。認証情報をモデル引数や出力に含めないでください。

モデルメッセージ、イベント、ログには必要な構造化情報、機密を除いたエラー、権限付き参照だけを残します。秘密情報、画像・音声・動画や大きなバイト本体を定義や LLM コンテキストに書き込まないでください。ダウンロード、Range 要求、バージョン読み取りもホストが認可します。

website_video の採集・脚本・編集可能な構成・各音声・字幕・表紙・工程・動画はホストが認可する成果物です。captureId/storyboardId/audioIds は復元用参照であり公開取得の権限ではありません。音声はナレーションが一致する場合だけ再利用し、最終公開で帰属を再確認します。

`service.find(key, context)` は既存 Runner の冪等記録を読み、未登録なら success: true、data: undefined を返します（アプリ HTTP は null に投影）。待機提出用テーブルは作りません。取消・無効化・照会は別操作で、無効化後も本人の旧受領情報を取得できます。

`preview_build` は権限付き ZIP のみを読み、新しい単体 HTML 参照を公開します。ZIP・ソース・HTML に同じ帰属確認を適用します。構築ディレクトリは Runner が片付ける一時タスクデータで、常駐構築サービスはありません。展開合計 8 MiB、各ソースと最終 HTML はそれぞれ 1 MiB、固定構築コマンドは 60 秒で、一般的なファイル上限より小さい制限を優先します。構築失敗では新しいプレビュー成果物を作成しません。

### 生成ファイルやページへの参照

ID と表示情報だけを返し、本体保存と認可は宿主が担当します。

```json
{
  "id": "artifact-42",
  "title": "Order preview",
  "kind": "html",
  "version": "version-1",
  "mediaType": "text/html"
}
```

artifact-42 は HTML の第1版で、後の編集時に版を確認します。HTML 本体は含みません。

## サイズと保持期間

ToolService は Runner の 512 KiB JSON 上限を継承し、提出・各イベント・最終出力それぞれに適用します。ジョブのファイル・成果物は 50 MiB までで、入力合計は scratchMiB との小さい方にも制限されます。別々の制限であり、ファイル本体は権限付き参照で渡してください。[Runner](runner.ja.md) がイベント総量・件数とタスク・冪等キーの保持期間を管理し、完了タスクは既定で 7 日間です。整理後の find は成功して data: undefined となり、未受付や取消の証明ではありません。長期間の業務重複排除はホストが管理します。
