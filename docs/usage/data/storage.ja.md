# @h-ai/storage データ構造

[原文（中国語）](storage.md) · [設定](../configuration/storage.ja.md) · [API リファレンス](../function/storage.ja.md)

オブジェクトは呼び出し側のキーで保存先に置かれます。Storage は SQL テーブルや Redis キーを作成しません。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `key` | オブジェクトパス。UTF-8 で最大 1024 バイト。 |
| `size`, `contentType`, `lastModified` | バイト数、MIME タイプ、保存先が返す更新日時。 |
| `etag` | キャッシュの検証値。ローカルはサイズと更新日時を使用し、S3 はサービスの値を使用。内容の検証には `storage.checksum` を使用。 |
| `metadata` | アップロード時に設定する任意の文字列属性。 |
