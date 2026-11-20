# @h-ai/storage データ構造

[原文（中国語）](storage.md) · [設定](../configuration/storage.ja.md) · [API リファレンス](../function/storage.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

まず用途と例を読み、必要に応じて後半の項目・保存規則を確認してください。ID と業務内容は架空で、秘密は隠しています。時刻は 2026-11-17 00:00 UTC を起点とし、単位は各説明に記します。

### ファイルの基本情報

対応する構造：`FileMetadata`。

一覧や詳細で場所・サイズ・種類を伝え、本文をダウンロードせず確認できます。

```json
{
  "key": "reports/order-42.txt",
  "size": 5,
  "contentType": "text/plain",
  "lastModified": "2026-11-17T00:00:00.000Z",
  "metadata": {
    "orderId": "order-42"
  }
}
```

5バイトのテキストファイルです。lastModified はコードでは Date、JSON では UTC 文字列です。

### ローカルファイルに添える情報

対応する構造：`Local sidecar`。

ローカル FS が MIME 型などを保持しないため、Storage が小さな付属ファイルに保存します。

```json
{
  "contentType": "text/plain",
  "metadata": {
    "orderId": "order-42"
  }
}
```

text/plain で order-42 に関連する例です。内部ファイルは手動変更しません。

ファイルシステムのスナップショットから復元する際は、ファイルの内容と `.hai-storage-meta/` を両方保存します。デバイス ID、inode、作成時刻が元のレコードに対応することを確認してください。通常のファイルコピーでは、メタデータディレクトリもコピーしていても、これらの値が変わり、`file.head()` が対応するレコードを見つけられないことがあります。別のファイルシステムに移行する際は、移行元への書き込みを停止し、`file.head()` でコンテンツ型とカスタムメタデータを、`file.getStream()` で内容を取得します。移行先では `file.put()` で書き込み、対応するレコードを作成します。

## 項目・保存・削除のリファレンス

オブジェクトは呼び出し側のキーで保存先に置かれます。Storage は SQL テーブルや Redis キーを作成しません。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `key` | オブジェクトパス。UTF-8 で最大 1024 バイト。 |
| `size`, `contentType`, `lastModified` | バイト数、MIME タイプ、保存先が返す更新日時。S3 のアップロード結果にはアプリが成功応答を受け取った時刻が入ります。 |
| `etag` | キャッシュの検証値。ローカルはサイズと更新日時を使用し、S3 はサービスの値を使用。内容の検証には `storage.checksum` を使用。 |
| `metadata` | アップロード時に設定する任意の文字列属性。 |
