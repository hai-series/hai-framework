# @h-ai/tools 機能説明

`tools` で業務ツールを定義・登録・実行します。業務コード、画面操作、AI から同じ実装を利用できます。

[モジュール README](../../../packages/tools/README.ja.md) · [設定](../configuration/tools.ja.md) · [データの帰属](../data/tools.ja.md)

## エントリーポイントの選択

| インポート先 | 用途 | 実行とライフサイクル |
| --- | --- | --- |
| `@h-ai/tools` | 短時間の業務関数、ブラウザー内ツール、モデル連携用の中立な定義 | `tools.define/createRegistry` は純粋な定義・ファクトリー。`init/close` は不要で、Runner やモデル SDK を読み込まない |
| `@h-ai/tools/server` | 再開可能なタスク、進捗・キャンセル、文書とコンテナジョブ | 軽量メソッドに `tools.createService/createArtifactTools/createJobTools` を追加。初期化済み Runner を利用する |

軽量エントリーはブラウザーでも利用できますが、サーバーの権限は信頼できるサーバー側で検証します。`/server` をフロントエンドにインポートしないでください。

## 最小構成

```sh
pnpm add @h-ai/tools zod
```

通常の業務呼び出しの例です。登録したツールだけを使用し、信頼できるサーバーから本人情報を渡します。

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export async function calculate(objectId: string) {
  const registry = tools.createRegistry({
    authorize: ({ context }) => context.objectId === objectId,
  })
  const registered = registry.register(tools.define({
    name: 'sum',
    title: '合計',
    description: 'Add two numbers',
    examples: [{ label: '2 + 3', input: { a: 2, b: 3 } }],
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => ({ total: a + b }),
  }))
  if (!registered.success)
    return registered
  return registry.execute('sum', { a: 2, b: 3 }, { objectId })
}
```

成功時の `data` は `{ total: 5 }` です。`title` は画面の表示名で、安定した `name` はプロトコルと有効化ルールの識別子です。`examples` はフォームのプリセットで、自動実行や権限付与は行いません。`tool.toDefinition()` と登録器の定義にも含まれます。

既存サービスが `HaiResult` を返す場合は `resultHandler`、通常データを返す場合は `handler` を使います。必ず片方だけを指定します。失敗の `HaiResult` を `handler` で返すと、成功データとして包まれてしまいます。

```ts
import type { HaiResult } from '@h-ai/core'
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export function createLookup(read: (id: string) => Promise<HaiResult<string>>) {
  return tools.define({
    name: 'document_lookup',
    description: 'Read an authorized document',
    parameters: z.object({ id: z.string().min(1) }),
    resultHandler: ({ id }) => read(id),
  })
}
```

## 軽量メソッド

| メソッド | 用途と戻り値 |
| --- | --- |
| `tools.define` | 名前・説明・Zod Schema・処理関数 → ツール。既定タイムアウトは 30 秒 |
| `tools.createRegistry` | 任意の `authorize` → 登録器 |
| `tool.execute` | 業務入力と任意のコンテキスト → `Promise<HaiResult<TOutput>>` |
| `tool.toDefinition` | 名前・表示名・説明・入力 JSON Schema・プリセットの中立定義 |
| `registry.register/registerMany` | 登録 → `HaiResult<void>`。重名は上書きせず、一括登録はアトミック |
| `registry.replace` | 既存の名前を明示的に置換 → `HaiResult<void>` |
| `registry.get/has/getNames/getDefinitions` | 現在の集合と中立定義を取得 |
| `registry.execute` | 名前・入力・任意のコンテキスト → `Promise<HaiResult<unknown>>` |
| `registry.executeAll` | `{ name, input }[]` → `Promise<HaiResult<unknown[]>>`。既定は逐次実行 |
| `registry.unregister/clear/size` | プロセス内の集合を無効化・消去・集計 |

`tool` と `registry` はファクトリーの戻り値であり、パッケージ直下の関数ではありません。登録器は他のツールを自動発見せず、`tools.define` が作成したインスタンスだけを受け付けます。手書き・コピーしたオブジェクトは拒否します。

名前は ASCII 1～64 文字で、先頭は英字、以降は英数字・アンダースコア・ハイフンです。名前、既定タイムアウト、処理関数の組み合わせが不正な場合、定義エラーとして `TypeError` を送出します。モデル用のパラメーターは JSON Schema に変換可能である必要があり、通常はオブジェクト Schema を使います。`z.date()` など表現できない型は直接使用できません。

`HaiToolsError` は `hai:tools` 名前空間の NOT_FOUND、ALREADY_REGISTERED、VALIDATION_FAILED、EXECUTION_FAILED、FORBIDDEN、TIMEOUT、CANCELLED を含みます。入力・認可・期限・キャンセルの失敗は失敗の `HaiResult` を返します。`resultHandler` は既存の業務エラーを保持し、モデル JSON の解析エラーは AI アダプターが処理します。

固定ジョブの `TIMEOUT` は `HaiToolsError.TIMEOUT`、安全でない Office 文書・プロジェクトや既知の入力拒否は `VALIDATION_FAILED` に対応します。サンドボックスや依存関係の不足、不正なジョブ出力、未知のワーカ障害は `EXECUTION_FAILED` のままとし、ユーザー入力の誤りとして扱いません。公開メッセージは翻訳済みの文言を使い、ワーカの原文を表示しません。処理とコンテナの解放が両方失敗した場合は解放エラーを主エラーとし、最初の処理エラーを安全に整形して `error.ext.operationError` に保持します。単独の失敗ではこの拡張を追加しません。

## サーバータスクサービス

[Runner](runner.md) をインストール・初期化して `/server` からインポートします。ホストが本人情報、有効化、認可、成果物アクセスを提供します。サービスは借りた Runner を初期化・終了しません。

```ts
import type { RunnerFunctions } from '@h-ai/runner'
import type { ToolArtifactAccess } from '@h-ai/tools/server'
import { tools } from '@h-ai/tools/server'

export function createDocumentService(runner: RunnerFunctions, files: ToolArtifactAccess) {
  return tools.createService({
    id: 'documents',
    runner,
    createTools: context => tools.createArtifactTools({ context, files }),
    enabled: { groups: ['documents', 'analysis'] },
    authorize: ({ context }) => context.scope.userId.length > 0,
  })
}
```

例は信頼済みユーザーの存在だけを確認します。`files.read/publish/save` は本人、リソース、最終確定条件も検証してください。本人情報はモデル引数ではなく `ToolServiceContext.scope` に渡します。

| サービスメソッド | 入力 | 結果 |
| --- | --- | --- |
| `service.catalog` | 信頼済みコンテキスト | 有効な定義とグループ |
| `service.submit` | `{ name, input, idempotencyKey? }` とコンテキスト | Runner 状態、`receipt: { id, key }`、イベント、任意の出力 |
| `service.find` | 冪等キーと信頼済みコンテキスト | 本人の受付済みタスクを取得。未登録時の data は undefined で、取消を意味しない |
| `service.inspect` | 完全な受領情報、コンテキスト、任意の `{ after }` | 現在の状態と追加イベント。次回は `next` を使用 |
| `service.cancel` | 完全な受領情報とコンテキスト | キャンセル要求後の実際の状態。終端まで取得を継続 |
| `service.invoke` | submit と同じ | 提出して完了を待ち、`HaiResult<RunnerJson>` を返す |
| `service.close` | なし | 自サービスのハンドラーだけを解除。Runner の終了や実行中タスクの停止証明ではない |

業務結果は先に `success` を確認します。最終出力が必要な業務処理では `invoke`、長い画面操作では `submit/inspect` を使い、完全な受領情報と `queued/running/cancelling` などの実際の状態を保持します。キャンセルの応答だけではプロセス終了を証明できません。

`enabled` は必須です。指定グループと個別ツールの和集合から `exclude` を除きます。空オブジェクトはすべて無効です。`catalog` はファクトリーと有効化ルールで作成し、個々の `authorize` は呼びません。利用者別の非表示はコンテキストに応じた `createTools/enabled` で実施します。提出時と実行ノードで集合を作り直して認可するため、古いカタログから無効化を回避できません。

## 成果物・ジョブツールの再利用

| ファクトリー | 提供する機能 | ホストの入力 |
| --- | --- | --- |
| `tools.createArtifactTools` | `artifact_create/read/save`、`data_analyze` | `context` と `files`。`files.save` がある場合だけ保存ツールを含む |
| `tools.createJobTools` | 文書の抽出・生成、Office 変換・再計算、OCR、ブラウザー画像、Web 採集、プロジェクトのプレビュー構築、動画レンダリング | `context`、`files`、初期化済み `runner`、`environments`。ブラウザー系は `browserProxy` も必要 |

`artifact_create` は Markdown・HTML・表・グラフを作成します。表とグラフの内容は JSON オブジェクトです。`artifact_save` は `baseVersion` を含み、競合と最終書き込みはホストが処理します。`data_analyze` は構造化された行から件数・合計・平均・最小・最大を算出して表とグラフの参照を公開し、任意コードは実行しません。

環境を割り当てたジョブだけがカタログに現れます。`documents` は `documents_extract/documents_generate`、`office` は `office_convert/office_recalculate`、`ocr` は `ocr_recognize`、`browser` は `browser_navigate`、`web` は `web_capture`、`preview` は `preview_build`、`video` は `video_render` です。入力、固定イメージ、capability、ネットワーク要件は [ジョブ説明](../../../packages/tools/jobs/README.md) を参照してください。`browser/web` は信頼済みホストの `browserProxy` も必要です。形式は `http://loopback 以外の IPv4:port` です。既存のモデル用出口プロキシを再利用でき、モデル引数ではなく `HAI_TOOL_BROWSER_PROXY` でジョブに渡します。割り当て後も Runner の能力・ネットワーク検証が必要です。

画像・音声・文書の書き換えには [AI](ai.md) の `ai.tools.createBuiltinTools` を使い、同じ `ToolSet` に統合します。Tools は AI に逆依存しません。`video_render` の入力は準備済みのプロジェクトパッケージです。URL からの紹介動画全体は、以下の AI ワークフローで採集・構成・ナレーション・素材の組み立ても行います。

`documents_generate` は `format: docx/xlsx/pptx`、タイトル、任意の段落・表・スライドを受け取り、固定形式の Office ファイルを生成します。UTF-8 JSON 資料は 256 KiB までで、段落・表は形式別に検証します。PPTX は各ページ最大 6 段落、各 160 文字、合計 800 文字です。表は最大 6 列・データ 6 行・各セル 32 文字で、表があるページの本文は 120 文字の 1 段落までです。`slides` は PPTX 専用で、トップレベルの段落・表と併用できません。内蔵例をフォームに適用してからタイトル・内容を編集できます。

`artifact_create` と `data_analyze` は管理実行中に各論理出力へ安定した ID を割り当て、ホストは再試行時の内容一致も確認します。分析表は元の列ラベルを保持します。元データがエディター予約列 `row_id` を含む場合、その列には別フィールド名を付けて上書きを防ぎます。内部行 ID は行順で決まり、生成ファイル名は拡張子を保ち 160 文字以内にします。

グループと環境キーは別です。office/ocr ジョブは documents グループ、browser/preview ジョブは web グループに属します。該当グループを選んで環境キーを割り当て、同名のグループを作る必要はありません。

サービスは Runner の制限を継承し、提出パラメーター・各イベント・最終出力はそれぞれ 512 KiB JSON までです。50 MiB のファイル・成果物上限はバイト数で、同量の JSON を埋め込める意味ではありません。コンテナ入力合計は 50 MiB と環境 scratchMiB の小さい値も適用します。Schema が長いテキストや多くの行を許可しても、タスク全体の JSON 上限が必要です。大きな内容は権限付きファイル参照で渡します。[Runner の境界](runner.md#恢复任务读取事件和取消) を参照してください。

## プロジェクトから Web プレビューを構築

`preview_build({ fileId })` は権限付きプロジェクト ZIP を読み、任意の `environments.preview` に割り当てた固定 `preview.build` ジョブで `text/html`・`kind: html` の成果物を作成します。`web` グループに属し、ローカル構築だけなら browserProxy は不要です。既存の成果物画面で表示し、常駐プレビューゲートウェイや状態テーブルは追加しません。閉じると iframe を破棄し、構築コンテナはジョブ終了時に既に破棄されています。

ZIP のルートに `index.html` が必要です。固定 esbuild/Svelte でローカル HTML・JS/TS・CSS・対応するローカル素材・ブラウザー専用 Svelte コンポーネントを単体 HTML にまとめ、対応する Vite 形式のルート相対素材も扱います。import.meta.env は固定 production フィールドだけを提供し、import.meta.url と実行時 computed import は非対応です。プロジェクトの package scripts・設定は実行せず、依存関係もインストールしません。設定ファイルは無視します。SvelteKit・任意 npm パッケージ・Vite プラグインは非対応で、node_modules を ZIP に含めることもできません。module の入口は一つで、複数のローカルモジュールを import できます。srcset・async/defer スクリプト・iframe などの入れ子の文書は非対応です。画像・フォント・音声・動画は data URL に埋め込み、ローカル SVG のスクリプト・外部参照は許可しません。展開合計 8 MiB、各ソースと最終 HTML はそれぞれ 1 MiB、構築コマンドは 60 秒までで、外側の Runner 制限も適用します。失敗時に以前の HTML を公開しません。表示には引き続き same-origin 権限のない iframe と親画面の frame-src が必要で、構築によって自由なネットワーク実行を許可しません。

## Web サイトから編集可能な紹介動画を作成

AI の `ai.tools.createBuiltinTools({ context, files, executeJob? })` は、`executeJob` がある場合だけ `website_video` を `video` グループに追加します。ホストはコールバックを同じサービスの `web_capture/video_render` に限定し、認可・Runner・成果物アクセスを共有します。アプリで動画生成を再実装しません。

必須入力は HTTPS `url` です。任意に `goal`、6～30 秒の `durationSeconds`（既定 15）、`width/height`（既定 1280×720、偶数、16:9/9:16/1:1、最大 1920×1080 総画素）、`language`（既定 zh-CN）、`voice/model/brandColor` を指定します。実際に採集した内容からモデルが脚本と構成を作り、各ショットの WAV 音声を生成してプロジェクトを組み立て、動画ジョブで描画します。

SCRIPT.md、DESIGN.md、STORYBOARD.json、編集可能な STORYBOARD.md、各 WAV、SRT、Web 画面の表紙、工程 ZIP、video-workflow.json、MP4 を残します。結果は `sourceUrl/captureId/scriptId/storyboardId/audioIds/projectId/subtitlesId/coverId/videoId/durationSeconds/artifacts` です。表紙は実際の Web 採集に由来し、生成画像をサイト画面の代わりにはしません。

再試行では `captureId` で採集を再利用できます。構成 Markdown の変更後に `storyboardId` と `audioIds` を渡すと、audioText と narration が同じショットの音声を再利用し、変更箇所だけ再生成します。工程 ZIP を直接 `video_render` へ渡して再描画も可能です。字幕は文単位の時間区間で、単語ごとの同期は保証しません。音声が目標時間に収まらない場合は明示的に失敗し、途中で切り捨てません。

ホストは全体の選択ルールで `web_capture` と `video_render` の両方を有効にする必要もあります。Hai Agent は `workbench.selection.groups/tools` の和集合から exclude を除き、両依存が利用可能な場合だけ `website_video` を登録します。video グループだけ、または website_video だけの選択では足りません。web/video の両グループ、または website_video/web_capture/video_render を明示的に選びます。タスク設定の依存認可は全体の無効化を上書きしません。

実際の LLM、既定の WAV TTS、web/video 環境、browserProxy が必要です。長い処理ではサービスの `runTimeoutMs` を 1200000 にできます。調整タスクは通常容量、入れ子のジョブは割り当て済みツール環境を使い、ツール枠を相互に占有しません。実モデルと HyperFrames の描画は配置ごとに受け入れを行います。

## モデル連携・キャンセル・複数ノード

軽量登録器は `ai.tools.adapt(registry)` でモデルに接続します。`getDefinitions()` をモデル要求に使い、`execute(toolCall)` で同じ登録器を実行します。サーバー画面とエージェントも同じサービスと認可を共有します。

軽量実行の期限は、絶対 `deadline`、呼び出し別 `timeoutMs`、ツールのタイムアウト、既定 30 秒の順です。非同期検証・認可・処理関数を含みます。キャンセルや期限切れは待機を止めてシグナルを渡しますが、応答しない関数は継続する場合があります。プロセス終了と解放は Runner が確認します。

サービスは `hai.tools.<id>.v1` を Runner に登録し、既存タスク・リース・イベントを再利用します。新しいキューや Tools 状態テーブルは作りません。各ノードでサービス ID と設定を揃え、Runner データベースと Storage を共有します。API ノードは `executor: false`、実行ノードは固定イメージと再起動後も安定した一意のノード ID を使用できます。受領情報全体からタスク・サービス・本人の帰属を検証し、タスク ID だけを信用しません。

大きなファイルは権限付き参照で返し、読み取り・公開の認可はホストが行います。ログやイベントに秘密情報や画像・音声・動画の本体を記録しないでください。

## 開発テスト

`pnpm --filter @h-ai/tools test` はカーネルとサービス、`pnpm --filter @h-ai/tools test:jobs` はジョブプロトコルを検証します。実イメージとブラウザーの受け入れは別途環境が必要です。ユニットテストだけで実イメージを検証済みとはしません。
