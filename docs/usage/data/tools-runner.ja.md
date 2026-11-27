# @h-ai/tools-runner データ構造

[简体中文](tools-runner.md) · [English](tools-runner.en.md)

[モジュール README](../../../packages/tools-runner/README.ja.md) · [設定](../configuration/tools-runner.ja.md) · [機能](../function/tools-runner.ja.md)

バックグラウンドのツール呼び出しを投入した後は、受領情報で状態と結果を確認します。永続化は Runner が担当し、ファイル本体はホストが保存します。 [成果物アクセス契約](tools.ja.md#artifact-access)

<a id="runtime-tasks"></a>

## タスクと受領情報

`ToolRun` はタスクの状態を示すスナップショットです。送信の成功は Runner がタスクを受理したことを示します。ツールが正常に完了したかは `status` で確かめます。すでに存在するタスクを再送信すると、現在の状態と、記録済みの出力や失敗理由が返ります。

| 項目 | 意味 |
| --- | --- |
| `receipt.id` | Runner が生成する、16 進数 64 文字の実行 ID |
| `receipt.key` | 送信時の冪等キー。呼び出し元が省略するとサービスが生成する |
| `status` | 保存された現在の状態。各状態の意味は下表を参照 |
| `output` | 正常に終了した実行の JSON 出力。加算の結果は数値 `5` |
| `failure` | Runner が記録した任意の失敗理由。`handler-failed` や `queue-timeout` など |
| `events` と `next` | 今回取得したイベントと次回のカーソル。送信時は空のイベント一覧とカーソル `0` が返る。照会時は保存済みイベントを取得できる |

`receipt` 全体を保存し、同じサービスで認証済みの `scope` とともに渡して照会またはキャンセルします。サービスはキーでタスクを探し、実行 ID と所有者を確認します。送信時の応答を受け取れなかった場合は、元のキーで `find` を呼びます。照会が成功して該当がない場合、`data` は `undefined` です。ツールが無効になっても、同じ主体とサービスの既存タスクを照会できます。

| 状態 | 確認できること |
| --- | --- |
| `queued` | Runner がタスクを保存し、実行ノードの取得を待っている |
| `running` | 実行ノードがタスクを取得した。引き続き状態を確認する |
| `cancelling` | Runner が停止要求を記録し、停止を待っている |
| `succeeded` | 実行が正常に完了した。`output` で結果を確認できる |
| `failed` | 実行に失敗した。`failure` と保存済みイベントで理由を調べる |
| `cancelled` | 待機中のタスクが取り消されたか、実行中のタスクの停止が確認された。すでに行われた書き込みはアプリのルールに沿って確認する |
| `unknown` | Runner が実行結果を確認できなかった。実際に何が起きたかを確かめてから再試行を判断する。[Runner の照合](../function/runner.ja.md#reconciliation) |

永続化中の `invoke()` にキャンセルが届き、その後に Runner がタスクを受理した場合は、`CANCELLED` エラーの `ext.receipt` に受領情報全体が入ります。サービスがキーを生成したタスクにはキャンセルを試みます。呼び出し元がキーを指定したときは、タスクを照会し、必要に応じて `cancel()` を呼びます。Runner が送信を拒否した場合、`invoke()` はそのエラーを返します。Tools サービスを閉じるとハンドラーの登録を解除します。既存タスクは Runner が引き続き管理します。[送信とキャンセル](../function/tools-runner.ja.md#services)

<a id="example-data"></a>

### ツール実行の進捗と結果

以下は、同じタスクが返す `data` の合成スナップショット 2 件です。アプリは信頼できる主体として `{ tenantId: 'demo', userId: 'alice' }` を渡し、`sum-demo` サービスにツール `sum` を送信します。入力は `{ a: 2, b: 3 }`、キーは `sum-2-plus-3` です。初回は待機状態の受領情報を取得します。[実行可能な加算サービス](../function/tools-runner.ja.md#service-example)

```json
{
  "receipt": {
    "id": "263f23b73db46ef9b8f3c891120f39d541a55d2b9d8b99116ec66def48fff51d",
    "key": "sum-2-plus-3"
  },
  "status": "queued",
  "events": [],
  "next": 0
}
```

同じ受領情報で後から照会すると、成功の状態と数値 `5` が返ります。加算ハンドラーはイベントを送らないため、カーソルは `0` のままです。

```json
{
  "receipt": {
    "id": "263f23b73db46ef9b8f3c891120f39d541a55d2b9d8b99116ec66def48fff51d",
    "key": "sum-2-plus-3"
  },
  "status": "succeeded",
  "output": 5,
  "events": [],
  "next": 0
}
```

<a id="tool-events"></a>

### イベントの続きを読み、失敗を確認する

別の合成例では、同じ加算の入力にキー `sum-permission-check` を使います。Runner がタスクを受理した後、実行ノードが改めて権限を確認し、実行を拒否したとします。照会自体は成功し、`ToolRun.status` は `failed`、`failure` は `handler-failed` です。Runner がツールエラーイベントを保存した場合、`events` には以下のような項目が入ります。`createdAt` はミリ秒単位の UNIX タイムスタンプです。

```json
{
  "sequence": 1,
  "data": {
    "type": "tool-error",
    "error": {
      "code": "hai:tools:024",
      "message": "Tool execution is not authorized (traceId: demo-sum-42)",
      "httpStatus": 403,
      "traceId": "demo-sum-42"
    }
  },
  "createdAt": 1767225600000
}
```

`inspect(receipt, context, { after: 0 })` で番号 `1` を取得したら、次回のカーソルに `next` の値 `1` を使います。一度に最大 100 件まで取得できます。続きがなければ空の一覧が返り、カーソルは渡した値のままです。この例では初回送信の言語を `en-US` としています。同じキーで再試行しても最初の言語を使い、言語が記録されていない既存タスクは実行ノードの既定言語を使います。

<a id="size-and-retention"></a>

## サイズと保持期間

| データ | 制限と扱い |
| --- | --- |
| 送信、各イベント、最終出力 | Runner の JSON 上限はそれぞれ 512 KiB。イベントはタスクごとに合計 16 MiB。件数上限は `maxEvents` で、既定は 10,000 件 |
| コンテナージョブの入力ファイルや成果物 | ファイルは 50 MiB まで。コンテナー入力の合計は環境の `scratchMiB` にも従い、小さい方の予算を使う。ジョブ固有の上限がある場合はそちらを適用する。ファイル本体は権限付き参照で渡す。[ジョブの制限](../function/tools-runner.ja.md#job-tools) |
| タスク、イベント、冪等記録 | Runner の `retentionMs` は終了済みタスクを既定で 7 日間保持する。未照合の `unknown` は照合まで保持する。整理後の `find` は成功して `undefined` を返すことがある。より長期の重複防止はアプリが業務操作の記録を保存する。[Runner の保持期間](../configuration/runner.ja.md#configuration-fields) |
