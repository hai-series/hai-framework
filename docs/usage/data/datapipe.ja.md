# @h-ai/datapipe データ構造

<a id="datapipe-のデータ構造"></a>

[简体中文](datapipe.md) · [English](datapipe.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/datapipe.ja.md) · [API リファレンス](../function/datapipe.ja.md)

アプリが文書を取り込むと、Datapipe は順序付きのチャンクと処理統計を返します。保存先や索引先は呼び出し元が選びます。

<a id="response-data"></a>

## リクエストと応答のデータ

Datapipe は SQL テーブル、Redis キー、ディスクキャッシュを作成しません。処理済みの本文やチャンクは呼び出し結果として返ります。[ナレッジベース](ai.ja.md) やアプリ側のストレージへ保存できます。

`PipelineResult.text` には全手順を適用した本文が入ります。`chunks` は最後の分割手順で作られ、その後のチャンク変換で加工できます。URL、ファイル名、コンテンツタイプなどの出典情報を結果に対応付ける処理や、呼び出しをまたぐ重複排除と履歴管理はアプリが担当します。

<a id="example-data"></a>

### 整形・分割後の結果

検索やモデル入力のために本文を整形して小分けし、結果を呼び出し側に返します。

```json
{
  "text": "abcdef",
  "chunks": [
    {
      "index": 0,
      "content": "abc"
    },
    {
      "index": 1,
      "content": "cde"
    },
    {
      "index": 2,
      "content": "ef"
    }
  ]
}
```

3文字ごとに1文字重複させ、abcdef は abc、cde、ef になります。index は0始まりの番号です。

### Markdown チャンクの見出し情報

次は `datapipe.chunk` が成功したときの `data` です。元の文章は `# Q\r\nabcdef` です。Markdown モードで 1 チャンクを最大 4 コードポイントとし、本文から見出し行を除きます。

```json
[
  { "index": 0, "content": "abcd", "metadata": { "title": "Q", "level": 1, "subChunk": true } },
  { "index": 1, "content": "ef", "metadata": { "title": "Q", "level": 1, "subChunk": true } }
]
```

両方のチャンクはレベル 1 の見出し `Q` に属します。`subChunk` は同じ節が複数のチャンクに分かれたことを示し、1 チャンクの場合は省略されます。最初の見出しより前の本文は見出し名が空で、レベルは `0` です。
