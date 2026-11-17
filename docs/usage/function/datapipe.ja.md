# Datapipe の API

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

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

<a id="call-options"></a>

<a id="cleaning"></a>

### テキストの抽出と整形：`datapipe.clean`

HTML などから文字列を抽出し、必要に応じて URL や余分な空白を除きます。HTML の安全化とは異なります。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `datapipe.clean(text, options?)` | HTML タグを除去し、必要な項目を整形 | `text` 是字符串。默认移除标签、统一空白并去掉首尾空白，保留 URL 和邮件地址 | `HaiResult<string>` | `datapipe.clean('<p>Hello</p>')` |

#### 利用例：テキストの抽出と整形

```ts
const cleaned = datapipe.clean('<p>Hello   Ada</p>', { removeHtml: true })
if (!cleaned.success)
  throw new Error(cleaned.error.message)
cleaned.data // 'Hello Ada'
```

タグと連続した空白を含む文字列から、成功時にプレーンテキスト Hello Ada を得ます。空白の正規化は既定で有効です。

[引数と手順の詳細](datapipe.md#cleaning)

<a id="chunking"></a>

### 文書を分割する：`datapipe.chunk`

単語・文・段落・Markdown などの境界と最大サイズを選びます。元の区切り文字は結果に残ります。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `datapipe.chunk(text, options)` | 文、段落、見出しなどで分割 | 必填 `text` 和 `options.mode`。每块的 `maxSize` 默认 `1500`，`overlap` 默认 `0` | `HaiResult<DataChunk[]>` | `datapipe.chunk('One. Two.', { mode: 'sentence' })` |

#### 利用例：文書を分割する

```ts
const chunks = datapipe.chunk('alpha beta gamma', { mode: 'word', maxSize: 1 })
if (!chunks.success)
  throw new Error(chunks.error.message)
chunks.data.map(part => part.content) // ['alpha ', 'beta ', 'gamma']
```

三つの単語を一語ずつに分割します。元の位置を追えるよう空白を残します。DataChunk の全フィールドはデータのページを参照してください。

#### 分割と表示の注意点

`sentence`、`paragraph`、`markdown`、`page` はそれぞれ文、段落、見出し、改ページで区切ります。`custom` は正規表現を使います。`word` は空白で分けた語の数を数えるため、空白を含まない日本語のまとまりが 1 語になることがあります。他のモードでは Unicode コードポイントを数えます。空白、句読点、区切り文字も残ります。一つのまとまりが上限を超える場合は途中で分割します。重複は上限未満で指定すると、前のチャンクの末尾を次のチャンクにも含められます。

Markdown のセクションをまたぐ重複はありません。コードブロック内の `#` は本文です。見出しを取り除くには `markdownKeepTitle: false` を指定します。[分割の設定](../configuration/datapipe.ja.md)

HTML として表示する場合は、整形後も UI の安全なレンダリングを使ってください。独自の置き換えや区切りに使う正規表現は内容を確認してから渡します。任意の入力から正規表現を作ると、処理時間が大幅に延びることがあります。

#### 分割オプション

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

<a id="pipelines"></a>

### 再利用する処理手順：`datapipe.pipeline`

整形・文字列変換・分割・分割結果の加工を登録してから run します。登録しただけでは処理は始まりません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `datapipe.pipeline()` | 独立した処理管線を作成 | なし | PipelineBuilder | `const pipeline = datapipe.pipeline()` |
| `pipeline.clean(options?)` | クリーニングを登録 | clean と同じ省略可能な引数 | 同じビルダー | `pipeline.clean({ removeHtml: true })` |
| `pipeline.transform(fn)` | テキスト変換を登録 | 同期・非同期の文字列変換関数 | 同じビルダー | `pipeline.transform(text => text.toLowerCase())` |
| `pipeline.chunk(options)` | 分割を登録 | mode 必須。他は chunk と同じ既定値 | 同じビルダー | `pipeline.chunk({ mode: "word", maxSize: 1 })` |
| `pipeline.chunkTransform(fn)` | 分割結果の変換を登録 | 同期・非同期の配列変換関数 | 同じビルダー | `pipeline.chunkTransform(parts => parts.filter(p => p.content.trim() !== "beta"))` |
| `pipeline.run(text)` | 順に処理を実行 | 原文の文字列 | Promise<HaiResult<PipelineResult>>。手順の失敗は失敗結果 | `await pipeline.run("<p>ALPHA BETA GAMMA</p>")` |

#### 利用例：再利用する処理手順

```ts
const pipeline = datapipe.pipeline()
  .clean({ removeHtml: true })
  .transform(text => text.toLowerCase())
  .chunk({ mode: 'word', maxSize: 1 })
  .chunkTransform(parts => parts.filter(part => part.content.trim() !== 'beta'))
const result = await pipeline.run('<p>ALPHA BETA GAMMA</p>')
if (!result.success)
  throw new Error(result.error.message)
result.data.text // 'alpha beta gamma'
result.data.chunks.map(part => part.content) // ['alpha ', 'gamma']
```

整形と小文字化の結果が text です。分割結果だけを絞り込むため、text の beta は残ります。各ビルダーメソッドと run の入出力をこの流れで確認できます。

#### 分割を省略した場合

分割手順がない場合は処理後の本文と空のチャンク配列を返します。

## エラー

`data` を読む前に `success` を確認します。`mode: 'custom'` で区切りが設定されていない場合は `MISSING_SEPARATOR`、正規表現が無効な場合は `CHUNK_FAILED` が返ります。設定が無効な場合は `CONFIG_ERROR` が返ることがあります。コードを比較するには `@h-ai/datapipe` から `HaiDatapipeError` をインポートし、`result.error.code === HaiDatapipeError.MISSING_SEPARATOR.code` のように使います。
