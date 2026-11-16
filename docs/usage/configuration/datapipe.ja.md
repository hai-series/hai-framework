# Datapipe の設定

[設定リファレンス](README.ja.md) · [Datapipe の API](../function/datapipe.ja.md)

`datapipe.clean(text, options)` または `datapipe.chunk(text, options)` に、テキストとオプションを渡します。オプションは呼び出しごとに適用されます。AI のナレッジベースに文書を取り込む場合は、[`knowledge.cleanOptions` と `knowledge.chunkOptions`](ai.md#knowledge) に、ナレッジベースから Datapipe に渡す設定を書きます。

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

## テキストの整形

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

## チャンクへの分割

| オプション | 既定値 | 動作 |
| --- | --- | --- |
| `mode` | 必須 | `sentence`、`paragraph`、`markdown`、`page`、`word`、`character`、`custom` から選びます。 |
| `maxSize` | `1500` | 区切りと重複部分を含む、チャンクごとの上限です。正の整数を指定します。単語モードでは空白で区切った語を、それ以外では Unicode コードポイントを数えます。 |
| `overlap` | `0` | 次のチャンクにも含める長さです。0 以上、`maxSize` 未満の整数を指定します。 |
| `separator` | `custom` で必須 | アプリが用意した区切り用の正規表現です。 |
| `markdownMinLevel` | `2` | 既定ではレベル 1 と 2 の見出しで区切ります。3 を指定するとレベル 3 も区切りに使います。範囲は 1～6 です。 |
| `markdownKeepTitle` | `true` | 見出しを分割結果に残します。 |

たとえば `datapipe.chunk(text, { mode: 'paragraph' })` ではチャンク間が重なりません。AI のナレッジベースには独自の既定値があります。上限、重複、見出しの設定を変更した場合は、元のテキストを処理し直してからインデックスのチャンクを入れ替えてください。
