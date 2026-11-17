# @h-ai/tools 機能説明

`tools` で業務ツールを定義・登録・実行します。業務コード、画面操作、AI から同じ実装を利用できます。

[モジュール README](../../../packages/tools/README.ja.md) · [設定](../configuration/tools.ja.md) · [データの帰属](../data/tools.ja.md)

## エントリーポイントの選択

| インポート先 | 用途 | 実行とライフサイクル |
| --- | --- | --- |
| `@h-ai/tools` | 短時間の業務関数、ブラウザー内ツール、モデル連携用の中立な定義 | `tools.define/createRegistry` は純粋な定義・ファクトリー。`init/close` は不要で、Runner やモデル SDK を読み込まない |
| `@h-ai/tools/server` | 再開可能なタスク、進捗・キャンセル、文書とコンテナジョブ | 軽量メソッドに `tools.createService/createArtifactTools/createJobTools` を追加。初期化済み Runner を利用する |

軽量エントリーはブラウザーでも利用できますが、サーバーの権限は信頼できるサーバー側で検証します。`/server` をフロントエンドにインポートしないでください。

<a id="quick-start"></a>

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

<a id="api-reference"></a>

## 軽量メソッド

| API | 用途 | 入力 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `tools.define` | ツールを定義し、実行時に入力を検証する。既定のタイムアウトは `30000` ms。定義が無効なら `TypeError` | `definition` | `Tool<TInput, TOutput>` | `const tool = tools.define(definition)` |
| `tools.createRegistry` | `authorize` を省略すると、登録先独自の認可条件を適用しない空の登録先を作る | `options? = {}` | `ToolRegistryOperations` | `const registry = tools.createRegistry()` |
| `tool.execute` | 入力を検証して実行する。利用者、認可、キャンセル信号、期限も指定できる | `input, options? = {}` | `Promise<HaiResult<TOutput>>` | `await tool.execute({ a: 2, b: 3 })` |
| `tool.toDefinition` | 入力の規則を JSON Schema に変換する。変換できないときは例外 | なし | `ToolDefinition` | `tool.toDefinition()` |
| `registry.register` | ツールを 1 件登録する。同じ名前があれば失敗 | `tool` | `HaiResult<void>` | `registry.register(tool)` |
| `registry.registerMany` | 複数のツールを登録する。重複や無効な項目が一つでもあれば、どれも登録しない | `tools: Tool[]` | `HaiResult<void>` | `registry.registerMany([tool])` |
| `registry.replace` | 既存のツールを同名の新しい定義で置き換える。登録済みの名前が必要 | `tool` | `HaiResult<void>` | `registry.replace(updatedTool)` |
| `registry.unregister` | 指定した名前を削除する。登録済みの場合だけ `true` | `name` | `boolean` | `registry.unregister('sum')` |
| `registry.get` | 名前で実体を取得し、なければ `undefined` | `name` | `Tool / undefined` | `registry.get('sum')` |
| `registry.has` | 名前が登録済みか確認する | `name` | `boolean` | `registry.has('sum')` |
| `registry.getNames` | 登録された名前を一覧にする | なし | `string[]` | `registry.getNames()` |
| `registry.getDefinitions` | 登録済みツールの定義を返す。入力を JSON Schema に変換できないときは例外 | なし | `ToolDefinition[]` | `registry.getDefinitions()` |
| `registry.execute` | 登録済みツールを実行する。登録先と呼び出しの両方に認可条件があれば、両方を満たす必要がある | `name, input, options? = {}` | `Promise<HaiResult<unknown>>` | `await registry.execute('sum', { a: 2, b: 3 })` |
| `registry.executeAll` | 既定では順に実行して最初の失敗で停止する。`parallel: true` では、失敗しても実行を開始した処理は取り消されない | `calls: ToolInvocation[], options?` | `Promise<HaiResult<unknown[]>>` | `await registry.executeAll([{ name: 'sum', input: { a: 2, b: 3 } }])` |
| `registry.clear` | 登録内容を消去する。進行中の呼び出しはキャンセルしない | なし | `void` | `registry.clear()` |
| `registry.size` | 登録済みの件数を取得する（プロパティ） | なし | `number` | `registry.size` |

`tool` と `registry` はファクトリーの戻り値であり、パッケージ直下の関数ではありません。登録器は他のツールを自動発見せず、`tools.define` が作成したインスタンスだけを受け付けます。手書き・コピーしたオブジェクトは拒否します。

名前は ASCII 1～64 文字で、先頭は英字、以降は英数字・アンダースコア・ハイフンです。名前、既定タイムアウト、処理関数の組み合わせが不正な場合、定義エラーとして `TypeError` を送出します。モデル用のパラメーターは JSON Schema に変換可能である必要があり、通常はオブジェクト Schema を使います。`z.date()` など表現できない型は直接使用できません。

`HaiToolsError` は `hai:tools` 名前空間の NOT_FOUND、ALREADY_REGISTERED、VALIDATION_FAILED、EXECUTION_FAILED、FORBIDDEN、TIMEOUT、CANCELLED を含みます。入力・認可・期限・キャンセルの失敗は失敗の `HaiResult` を返します。`resultHandler` は既存の業務エラーを保持し、モデル JSON の解析エラーは AI アダプターが処理します。

固定ジョブの `TIMEOUT` は `HaiToolsError.TIMEOUT`、安全でない Office 文書・プロジェクトや既知の入力拒否は `VALIDATION_FAILED` に対応します。サンドボックスや依存関係の不足、不正なジョブ出力、未知のワーカ障害は `EXECUTION_FAILED` のままとし、ユーザー入力の誤りとして扱いません。公開メッセージは翻訳済みの文言を使い、ワーカの原文を表示しません。処理とコンテナの解放が両方失敗した場合は解放エラーを主エラーとし、最初の処理エラーを安全に整形して `error.ext.operationError` に保持します。単独の失敗ではこの拡張を追加しません。

## サーバータスクサービス

[Runner](runner.ja.md) をインストール・初期化して `/server` からインポートします。ホストが本人情報、有効化、認可、成果物アクセスを提供します。サービスは借りた Runner を初期化・終了しません。

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

画像・音声・文書の書き換えには [AI](ai.ja.md) の `ai.tools.createBuiltinTools` を使い、同じ `ToolSet` に統合します。Tools は AI に逆依存しません。`video_render` の入力は準備済みのプロジェクトパッケージです。URL からの紹介動画全体は、以下の AI ワークフローで採集・構成・ナレーション・素材の組み立ても行います。

`documents_generate` は `format: docx/xlsx/pptx`、タイトル、任意の段落・表・スライドを受け取り、固定形式の Office ファイルを生成します。UTF-8 JSON 資料は 256 KiB までで、段落・表は形式別に検証します。PPTX は各ページ最大 6 段落、各 160 文字、合計 800 文字です。表は最大 6 列・データ 6 行・各セル 32 文字で、表があるページの本文は 120 文字の 1 段落までです。`slides` は PPTX 専用で、トップレベルの段落・表と併用できません。内蔵例をフォームに適用してからタイトル・内容を編集できます。

`artifact_create` と `data_analyze` は管理実行中に各論理出力へ安定した ID を割り当て、ホストは再試行時の内容一致も確認します。分析表は元の列ラベルを保持します。元データがエディター予約列 `row_id` を含む場合、その列には別フィールド名を付けて上書きを防ぎます。内部行 ID は行順で決まり、生成ファイル名は拡張子を保ち 160 文字以内にします。

グループと環境キーは別です。office/ocr ジョブは documents グループ、browser/preview ジョブは web グループに属します。該当グループを選んで環境キーを割り当て、同名のグループを作る必要はありません。

サービスは Runner の制限を継承し、提出パラメーター・各イベント・最終出力はそれぞれ 512 KiB JSON までです。50 MiB のファイル・成果物上限はバイト数で、同量の JSON を埋め込める意味ではありません。コンテナ入力合計は 50 MiB と環境 scratchMiB の小さい値も適用します。Schema が長いテキストや多くの行を許可しても、タスク全体の JSON 上限が必要です。大きな内容は権限付きファイル参照で渡します。[Runner の境界](runner.ja.md#api-reference) を参照してください。

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

<a id="call-options"></a>

## 呼び出し引数と接続オプション

[機能説明](tools.ja.md) · [データの帰属](../data/tools.ja.md)

`tools.define/createRegistry` は純粋な定義・ファクトリーで、モジュール YAML・環境変数・`init/close` はありません。サーバー用は `@h-ai/tools/server` からインポートし、初期化済み Runner を利用します。

### 定義と軽量実行

| 場所 | フィールド | 既定値と用途 |
| --- | --- | --- |
| 定義 | `name/description/parameters` | 必須。名前は ASCII 1～64 文字、先頭は英字、以降は英数字・アンダースコア・ハイフン。Zod で入力を検証 |
| 定義 | `handler` または `resultHandler` | 片方だけ必須。通常データ、または既存の `HaiResult` を返す |
| 定義 | `title/examples` | 任意の表示名と `{ label, input }[]` プリセット。権限は変わらない |
| 定義 | `timeoutMs` | 整数 0～2147483647 ミリ秒。省略時 30 秒、0 は即時期限切れ |
| 登録器 | `authorize` | 任意。設定時は毎回の呼び出しで許可が必要 |
| 実行 | `signal` | 処理関数へ渡すキャンセルシグナル |
| 実行 | `objectId/sessionId` | 信頼済みの本人・セッション。未認証のモデル入力から取得しない |
| 実行 | `deadline/timeoutMs` | 絶対期限、呼び出し別、ツール、30 秒の順。検証・認可・処理を含む |
| 実行 | `authorize` | 呼び出し別の追加認可。登録器の認可と両方必要 |
| 一括実行 | `parallel` | 既定 false。並列可能な操作だけ有効にする |

不正な名前・既定タイムアウト・処理関数の組み合わせは定義時に `TypeError` を送出します。業務実行は `HaiResult` を返します。登録器は `tools.define` が作成したツールだけを受け付けます。モデル用パラメーターは JSON Schema に変換可能なものを使い、通常はオブジェクトにします。

### tools.createService

| フィールド | 必須・既定値 | 用途 |
| --- | --- | --- |
| `id` | 必須、英数字・アンダースコア・点・ハイフンの 1～60 文字 | Runner 型 `hai.tools.<id>.v1`。同じサービスのノード間で統一 |
| `runner` | 必須 | 初期化済み Runner。サービスはライフサイクルを所有しない |
| `createTools` | 必須 | 信頼済み `ToolServiceContext` から `ToolSet` または Promise を返す。実行ノードで再構築 |
| `enabled` | 必須 | `ToolSelection` またはコンテキスト関数。グループとツールの和集合から `exclude` を除く。`{}` はすべて無効 |
| `authorize` | 必須 | `{ context, name, input, phase }`。`phase` は `submit` または `execute` で両方の許可が必要 |
| `runTimeoutMs` | 300000 ミリ秒 | 実行期限。整数 1～86400000 |
| `queueTimeoutMs` | 300000 ミリ秒 | 待機期限。整数 1～86400000 |

`ToolServiceContext` は `scope: { tenantId, userId }` と任意の `sessionId/signal` を含みます。実際の `execution` は Runner 実行ノードが設定します。クライアントが申告した本人情報や実行コンテキストを受け入れないでください。

`ToolSet` は `tools`、任意の `groups: { id, title, tools }[]` と `environments: Record<toolName, environmentId>` を含みます。環境割り当ては Runner 環境を指定し、実行ノードでも再確認します。`ToolSelection` の `groups/tools/exclude` は名前の配列です。

カタログは各ツールの `authorize` を呼びません。利用者別の表示制限は `createTools/enabled` で行います。サーバーの認可と最終リソース検証は別途必要で、ボタンを隠すだけでは無効化できません。

`service.submit/invoke` は同一ユーザー操作の idempotencyKey を維持します。受付不明時は新しいキーで重複提出せず `service.find(key, context)` で取得します。カタログ無効化後も本人の旧タスクは照会でき、本人・サービスの検証は維持します。

### 成果物・ジョブファクトリー

`tools.createArtifactTools({ context, files })` は `ToolArtifactAccess.read/publish` と任意の `save` を受け取ります。`save` がなければ `artifact_save` は含みません。バージョン・競合・権限・バイト保存はホストが管理します。

`tools.createJobTools({ context, files, runner, environments, browserProxy? })` は次のキーを受け取ります。省略した環境のツールは作成しません。

| 環境キー | ツール | 能力とネットワーク |
| --- | --- | --- |
| `documents` | `documents_extract/documents_generate` | 固定の文書イメージ。オフライン |
| `office` | `office_convert/office_recalculate` | 固定の Office イメージ。オフライン |
| `ocr` | `ocr_recognize` | 固定の OCR イメージ。オフライン |
| `browser` | `browser_navigate` | ブラウザー能力。内部ネットワークと管理されたプロキシ |
| `web` | `web_capture` | Web 採集能力。内部ネットワークと管理されたプロキシ |
| `preview` | `preview_build` | 固定 `preview.build` ツールチェーン。オフライン |
| `video` | `video_render` | 固定の動画イメージ。オフライン |

`browser/web` は環境と `browserProxy` の両方がある場合だけカタログに含めます。信頼済みホストが `http://loopback 以外の IPv4:port` を設定し、`RunnerLaunch.env.HAI_TOOL_BROWSER_PROXY` でコンテナに渡します。モデル引数で設定・上書きはできません。既存のモデル用出口プロキシを再利用でき、別のプロキシサービスは必須ではありません。

browserProxy は完全な IPv4 リテラルと明示的ポートの HTTP ルート URL（`http://<IPv4>:<port>`、末尾 / は任意）で、ポートは 1～65535 です。ホスト名・IPv6・認証情報・他のパス・query・fragment は使えません。0.0.0.0、127.0.0.0/8、169.254.0.0/16、224.0.0.0/4 は拒否します。不正なプロキシの場合 browser/web ツールは登録されないため、配置設定を確認してください。

office/ocr は環境キーで、ジョブは documents グループです。browser/preview のジョブは web グループです。documents/web を選び、必要な環境を割り当てます。

web/video 環境は resources.pids: 512 から試験し、同時実行の合計を収容する Runner toolCapacity も設定してください。カスタムリソースは全 4 項目が必要です。検証したブラウザーはプロセス・スレッド上限 128 で EAGAIN となりました。512 は今回のイメージの試験開始値で、すべてのイメージや並列数を保証しません。CPU・メモリ・一時領域も測定します。

今回の動画 Runner 環境は `resources.scratchMiB: 6144`、ノードは `toolCapacity.scratchMiB: 8192` を試験開始値とします。Tools の新設定ではなく Runner の項目です。HyperFrames 0.9.56 は描画前に一時ディレクトリと出力ディレクトリの両方で 1024 MiB 以上の空き容量を必須とします。入力ファイルがある場合、Runner の tmp は scratchMiB 合計の 4 分の 1 なので、6144 MiB なら 1536 MiB を確保でき、旧合計 512 MiB は検査に失敗します。上限値は使用済みメモリ量ではなく、ディスク検査も省略しません。ノードは並列ジョブと host 調整用 default 容量も満たす必要があります。6144/8192 はすべての負荷や全工程の検証完了を意味しません。[ジョブのリソース要件](../../../packages/tools/jobs/README.md#配置) を参照してください。

値はイメージ名ではなく Runner 環境 ID です。一致する capability、固定イメージ、リソース・ネットワーク上限を登録します。[ジョブ説明](../../../packages/tools/jobs/README.md) と [Runner 設定](../configuration/runner.md) を参照してください。Tools のインストールだけではイメージの取得やコンテナの起動はしません。

AI の website_video は `ai.tools.createBuiltinTools` に `executeJob` がある場合だけ登録し、同じサービスの web_capture/video_render に限定します。実際の LLM、既定 WAV TTS、web/video 環境、browserProxy が必要です。長い処理は runTimeoutMs: 1200000 を明示できます。[ワークフロー](tools.ja.md#web-サイトから編集可能な紹介動画を作成) を参照してください。

### アプリケーションと複数ノード

Tools に全体の有効化スイッチはありません。各アプリケーションが設定からファクトリーと `enabled` を組み立てます。Hai Agent の `workbench.selection` は groups/tools/exclude を使い、省略時は既定の内蔵グループ、明示的な `{}` はすべて無効です。`workbench` スイッチ、グループ、環境割り当ては [Agent 使用説明](../../../apps/agent/README.ja.md#設定)、画像・音声モデルは [AI 設定](../configuration/ai.md) を参照してください。

同じサービスのノードは既存 Runner データベースと Storage を共有し、サービス ID・ツール定義・環境を揃えます。新しいキューや状態テーブルは作りません。API ノードは Runner `executor: false`、実行ノードは再起動後も安定した一意の `nodeId` を設定できます。実行ノードで有効化と認可を再確認するため、フロントエンドだけで無効化しないでください。

`close()` は自サービスのハンドラーだけを解除し、借りた Runner は終了しません。キャンセル後は終端まで状態を読み取り、待機の中断をプロセス終了と扱わないでください。

パラメーター・各イベント・出力は Runner の各 512 KiB JSON 上限も適用します。50 MiB ファイルと scratchMiB は別制約です。[データ境界](../data/tools.ja.md#サイズと保持期間) を参照してください。
