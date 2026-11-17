# Datapipe の API

<!-- translation: partial -->

[パッケージ README](../../../packages/datapipe/README.ja.md) · [設定](../configuration/datapipe.ja.md) · [データ構造](../data/datapipe.ja.md)

テキストを整形したり、短いチャンクに分割したりできます。複数の処理を組み合わせる場合は再利用できるパイプラインを作ります。

<a id="quick-start"></a>

## クイックスタート

```ts
import { datapipe } from '@h-ai/datapipe'

const rawText = '<p>One. Two.</p>'

// ビルダーに 3 つの処理を登録し、入力を渡して実行します。
const result = await datapipe.pipeline()
  .clean({ removeHtml: true }) // HTML タグを取り除くオプションを渡します。
  .transform(text => text.toLowerCase()) // 次の処理に渡す文字列を返します。
  .chunk({ mode: 'sentence', maxSize: 80 }) // 分割方法と長さの上限を渡します。
  .run(rawText) // 元のテキストを渡します。成功時の data は { text, chunks } です。

if (!result.success)
  throw new Error(result.error.message)

const { text, chunks } = result.data // 'one. two.' と、文に分割したチャンクです。
```

<a id="api-reference"></a>

## API 一覧

| API | 用途 | 引数と既定値 | 戻り値 | 例 |
| --- | --- | --- | --- | --- |
| `datapipe.clean(text, options?)` | HTML タグを除去し、必要な項目を整形 | 文字列を渡します。既定ではタグを除去して空白を整理し、URL とメールアドレスは残します | `HaiResult<string>` | `datapipe.clean('<p>Hello</p>')` |
| `datapipe.chunk(text, options)` | 文、段落、見出しなどで分割 | 文字列と `mode` が必須です。`maxSize` の既定値は `1500`、`overlap` は `0` です | `HaiResult<DataChunk[]>`。入力が空白だけなら空の配列 | `datapipe.chunk('One. Two.', { mode: 'sentence' })` |
| `datapipe.pipeline()` | 処理を順に実行するビルダーの作成 | 引数なし | `PipelineBuilder` | `const pipeline = datapipe.pipeline().clean()` |

### パイプラインのメソッド

| メソッド | 用途 | 引数と既定値 | 戻り値 | 例 |
| --- | --- | --- | --- | --- |
| `pipeline.clean(options?)` | テキストの整形 | 既定値は `datapipe.clean()` と同じ | ビルダー | `pipeline.clean({ removeUrls: true })` |
| `pipeline.transform(callback)` | 分割前の文字列を変換 | コールバックは現在のテキストを受け取り、文字列または Promise を返します | ビルダー | `pipeline.transform(text => text.toLowerCase())` |
| `pipeline.chunk(options)` | テキストを分割 | `mode` を含む分割オプション | ビルダー | `pipeline.chunk({ mode: 'paragraph' })` |
| `pipeline.chunkTransform(callback)` | チャンクの絞り込みや変更 | コールバックは現在のチャンクを受け取り、チャンク配列または Promise を返します | ビルダー | `pipeline.chunkTransform(parts => parts.filter(part => part.content.length > 10))` |
| `pipeline.run(text)` | 登録順に処理を実行 | 元のテキスト | `Promise<HaiResult<PipelineResult>>`。成功時は `{ text, chunks }` | `await pipeline.run('<p>Hello</p>')` |

分割手順がない場合は処理後の本文と空のチャンク配列を返します。

### 分割と表示の注意点

`sentence`、`paragraph`、`markdown`、`page` はそれぞれ文、段落、見出し、改ページで区切ります。`custom` は正規表現を使います。`word` は空白で分けた語の数を数えるため、空白を含まない日本語のまとまりが 1 語になることがあります。他のモードでは Unicode コードポイントを数えます。空白、句読点、区切り文字も残ります。一つのまとまりが上限を超える場合は途中で分割します。重複は上限未満で指定すると、前のチャンクの末尾を次のチャンクにも含められます。

Markdown のセクションをまたぐ重複はありません。コードブロック内の `#` は本文です。見出しを取り除くには `markdownKeepTitle: false` を指定します。[分割の設定](../configuration/datapipe.ja.md)

HTML として表示する場合は、整形後も UI の安全なレンダリングを使ってください。独自の置き換えや区切りに使う正規表現は内容を確認してから渡します。任意の入力から正規表現を作ると、処理時間が大幅に延びることがあります。

## エラー

`data` を読む前に `success` を確認します。`mode: 'custom'` で区切りが設定されていない場合は `MISSING_SEPARATOR`、正規表現が無効な場合は `CHUNK_FAILED` が返ります。設定が無効な場合は `CONFIG_ERROR` が返ることがあります。コードを比較するには `@h-ai/datapipe` から `HaiDatapipeError` をインポートし、`result.error.code === HaiDatapipeError.MISSING_SEPARATOR.code` のように使います。

<a id="call-options"></a>

## 呼び出し引数と接続オプション

`datapipe.clean(text, options)` または `datapipe.chunk(text, options)` に、テキストとオプションを渡します。オプションは呼び出しごとに適用されます。AI のナレッジベースに文書を取り込む場合は、[`knowledge.cleanOptions` と `knowledge.chunkOptions`](../configuration/ai.md#knowledge) に、ナレッジベースから Datapipe に渡す設定を書きます。

```yaml schema=@h-ai/datapipe:ChunkOptionsSchema
mode: paragraph
maxSize: 1000
overlap: 0
```

短いテキストで、チャンクの単語数を確認できます。

```ts
import { datapipe } from '@h-ai/datapipe'

// 3 語を渡し、チャンクごとの上限を 1 語にします。
const result = datapipe.chunk('alpha beta gamma', { mode: 'word', maxSize: 1 })
if (!result.success)
  throw new Error(result.error.message)

// 元のテキストに含まれる空白も各チャンクに残ります。
const contents = result.data.map(chunk => chunk.content)
// ['alpha ', 'beta ', 'gamma']
```

### テキストの整形

| オプション | 既定値 | 動作 |
| --- | --- | --- |
| `removeHtml` | `true` | HTML タグを取り除きます。 |
| `removeUrls` | `false` | URL を取り除きます。 |
| `removeEmails` | `false` | メールアドレスを取り除きます。 |
| `normalizeWhitespace` | `true` | 連続する空白と余分な空行を整理します。 |
| `trim` | `true` | 先頭と末尾の空白を取り除きます。 |
| `customReplacements` | 任意 | リストの順序で置き換えを適用します。 |
| `customReplacements[].pattern` | 各要素に必須 | アプリが用意した正規表現か、正規表現として解釈する文字列です。 |
| `customReplacements[].replacement` | 各要素に必須 | 置き換えに使う文字列です。 |

### チャンクへの分割

| オプション | 既定値 | 動作 |
| --- | --- | --- |
| `mode` | 必須 | `sentence`、`paragraph`、`markdown`、`page`、`word`、`character`、`custom` から選びます。 |
| `maxSize` | `1500` | 区切りと重複部分を含む、チャンクごとの上限です。正の整数を指定します。単語モードでは空白で区切った語を、それ以外では Unicode コードポイントを数えます。 |
| `overlap` | `0` | 次のチャンクにも含める長さです。0 以上、`maxSize` 未満の整数を指定します。 |
| `separator` | `custom` で必須 | アプリが用意した区切り用の正規表現です。 |
| `markdownMinLevel` | `2` | 既定ではレベル 1 と 2 の見出しで区切ります。3 を指定するとレベル 3 も区切りに使います。範囲は 1～6 です。 |
| `markdownKeepTitle` | `true` | 見出しを分割結果に残します。 |

たとえば `datapipe.chunk(text, { mode: 'paragraph' })` ではチャンク間が重なりません。AI のナレッジベースには独自の既定値があります。上限、重複、見出しの設定を変更した場合は、元のテキストを処理し直してからインデックスのチャンクを入れ替えてください。

<a id="text-import-guide"></a>

## テキストの清洗と分割

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](datapipe.md#text-import-guide)にあり、この節は部分翻訳です。
