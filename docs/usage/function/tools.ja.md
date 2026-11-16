# @h-ai/tools 機能説明

`tools` を使って業務ツールを定義、登録、実行します。モデルプロトコルから独立しており、軽量なエントリは Node とブラウザーで利用できます。初期化、データベース、コンテナーは不要です。

[モジュール README](../../../packages/tools/README.ja.md) · [設定](../configuration/tools.ja.md) · [データの管理主体](../data/tools.ja.md)

## 最小構成での導入

```sh
pnpm add @h-ai/tools zod
```

次の例は業務コードからの直接呼び出しです。`registry` にはホストが明示的に登録したツールだけが含まれます。主体情報は信頼できるサーバー側のコンテキストから渡します。

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export async function calculate(objectId: string) {
  const registry = tools.createRegistry({
    authorize: ({ context }) => context.objectId === objectId,
  })
  const registered = registry.register(tools.define({
    name: 'sum',
    description: 'Add two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => ({ total: a + b }),
  }))
  if (!registered.success)
    return registered
  return registry.execute('sum', { a: 2, b: 3 }, { objectId })
  // 成功结果的 data 为 { total: 5 }。
}
```

## 公開エントリとインスタンスメソッド

| エントリ | 用途 | 入力とデフォルト | 戻り値 |
| --- | --- | --- | --- |
| `tools.define` | 引数検証付きツールを定義 | 名前、説明、Zod Schema、handler。ツールのデフォルトタイムアウトは 30 秒 | ツールインスタンス |
| `tools.createRegistry` | 明示的に有効化するツール集合を作成 | 任意の `authorize` | レジストリインスタンス |
| `tool.execute` | 単一の定義を実行 | 業務入力、任意の実行コンテキスト | `Promise<HaiResult<TOutput>>` |
| `tool.toDefinition` | プロトコル中立のツール説明を取得 | なし | 名前、説明、入力 JSON Schema |
| `registry.register/registerMany` | ツールを登録 | 単一ツールまたはツール配列 | `HaiResult<void>`。同名は上書きせず、一括登録はアトミック |
| `registry.replace` | 既存ツールを明示的に置換 | ツールインスタンス | `HaiResult<void>`。名前が存在しなければ失敗 |
| `registry.get/has/getNames` | 現在の集合を照会 | 名前または引数なし | ツール、存在判定、または名前一覧 |
| `registry.getDefinitions` | 現在の中立な定義を取得 | なし | 中立な定義の配列 |
| `registry.execute` | 名前を指定して実行 | 名前、業務入力、任意のコンテキスト | `Promise<HaiResult<unknown>>` |
| `registry.executeAll` | 一括実行 | `{ name, input }[]`。デフォルトは逐次実行で、明示的な並列実行も可能 | `Promise<HaiResult<unknown[]>>` |
| `registry.unregister/clear/size` | 無効化、全消去、件数取得 | 名前または引数なし | 削除結果、void、または件数 |

上記の `tool` と `registry` は作成操作から返されたインスタンスであり、パッケージ直下の独立関数ではありません。レジストリはほかのツールを暗黙的に検出、有効化しません。

## カスタム拡張とモデル連携

ツールを追加するには Schema と処理関数を用意し、`tools.define` で作成して必要な集合に登録します。Tools の内部実装を変更する必要はありません。レジストリは手書きまたはコピーしたツールオブジェクトを拒否し、すべての実行が同じ検証、認可、キャンセル処理を通るようにします。処理関数では既存モジュールを組み合わせられますが、Tools 自体は AI に依存しません。

名前は 1～64 文字の ASCII で、英字から始め、以降は英字、数字、アンダースコア、ハイフンを使用できます。定義時の名前またはデフォルトタイムアウトが無効な場合は `TypeError` をスローします。これは開発時の設定エラーであり、業務実行では引き続き `HaiResult` を返します。モデルに渡すツール引数には、JSON Schema に変換できるオブジェクト Schema を使います。`z.date()` や JSON Schema で表現できないカスタム型は、そのままモデル引数に使用できません。定義の変換時にエラーが報告されます。

モデルから利用する場合は `@h-ai/ai` をインストールし、`ai.tools.adapt(registry)` でプロトコルアダプターを取得します。`getDefinitions()` はモデルリクエスト用の定義を返し、`execute(toolCall)` はモデルメッセージを同じレジストリへの業務呼び出しに変換します。[AI ツール呼び出し](ai.md#工具调用)（中国語）を参照してください。

## 認可、失敗、キャンセル

引数検証に成功してから認可と handler を実行します。レジストリ単位と呼び出し単位の認可は、両方とも通過する必要があります。認可が false を返すか例外が発生した場合は実行を拒否します。処理関数も、最終的にアクセスするリソースの権限を再確認する必要があります。

実行オプションの `signal`、`objectId`、`sessionId`、`deadline`、`timeoutMs` は処理関数に渡されます。優先順位は絶対期限 `deadline`、呼び出し単位のタイムアウト、ツールのタイムアウト、デフォルトの 30 秒です。期限は非同期の引数検証、認可、処理関数を含み、各段階で実際の期限も確認します。キャンセルとタイムアウトは待機を終了し、シグナルを伝達できます。シグナルに応答しない関数は実行を継続する可能性があります。プロセスやコンテナーの停止確認は Runner が担当します。

業務上の失敗は `HaiResult` を返します。`data` を読む前に `success` を確認してください。Tools の検証、認可、実行、タイムアウト、キャンセルのエラーは `hai:tools` 名前空間を使います。モデルの JSON 解析エラーは AI アダプター層が処理します。

## 複数ノードと独立ジョブ

各ノードは同じ設定からツール集合を構築し、業務認可とリソースには共有バックエンドを使います。レジストリはプロセス内の実装集合です。タスクの取得、リース、イベント、キャンセルは引き続き Runner、成果物のバイト列は Storage が担当します。レジストリに分散実行状態を保存しないでください。

文書、Office、OCR、ブラウザーの独立イメージは [jobs](../../../packages/tools/jobs/README.md) にあります。MCP の管理対象ジョブは引き続き `ai.mcp.services` 経由で Runner に渡します。認可済みファイル ID のみを渡し、実行ノードは再確認後に入力を読み取り、成果物を公開します。

## 開発とテスト

`pnpm --filter @h-ai/tools test` で中立な内部実装を検証し、`pnpm --filter @h-ai/tools test:jobs` で独立ジョブのプロトコルを検証します。コンテナーの受け入れ検証には、ジョブの説明に従って固定イメージを準備する必要があります。単体テストの結果を、実際のイメージの受け入れ検証とみなさないでください。
