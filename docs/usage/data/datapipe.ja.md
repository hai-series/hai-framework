# Datapipe のデータ構造

[データ構造の目次](README.ja.md) · [Datapipe の設定](../configuration/datapipe.ja.md) · [Datapipe の API](../function/datapipe.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### 清洗・分割後の結果

対応する構造：`PipelineResult`。

検索やモデル入力のために清洗して小分けし、結果は返すだけで自動保存しません。

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

## 項目・保存・削除のリファレンス

### データベースとキャッシュ

Datapipe は SQL テーブル、Redis キー、ディスクキャッシュを作成しません。処理済みの本文やチャンクは呼び出し結果として返ります。[ナレッジベース](ai.md) やアプリ側のストレージへ保存できます。

### 入出力

処理中のテキスト、チャンク、メタデータは呼び出し内で使われます。返された本文やチャンクに、アプリが持つ URL、ファイル名、コンテンツタイプなどの出典情報を対応付けられます。呼び出しをまたぐ重複排除や履歴管理は、アプリが結果を保存・比較し、不要になったものを削除します。
