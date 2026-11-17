# @h-ai/storage API リファレンス

<!-- translation: partial -->

[原文（中国語）](storage.md) · [設定](../configuration/storage.ja.md) · [データ構造](../data/storage.ja.md)

<a id="quick-start"></a>

Storage を初期化してファイル API でオブジェクトを操作します。署名付き URL の発行前にキーへのアクセスを確認します。大きなダウンロードにはストリームを使います。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `storage.file.put`, `get`, `getStream`, `head`, `exists` | キーで保存、バイトまたはストリーム取得、メタデータ取得、存在確認。 | `await storage.file.head('reports/jan.pdf')` |
| `storage.file.copy`, `delete`, `deleteMany` | キー間でコピー、または一つ・複数のオブジェクトを削除。 | `await storage.file.delete('reports/jan.pdf')` |
| `storage.dir.list`, `delete` | 接頭辞内を列挙・削除。残りを読むには返されたカーソルを使用。 | `await storage.dir.list('reports/')` |
| `storage.presign.getUrl`, `putUrl`, `publicUrl` | 対応する場合はダウンロード、アップロード、または設定済み公開 URL を返す。 | `await storage.presign.getUrl('reports/jan.pdf')` |
| `storage.checksum.generate`, `verify` | 内容の整合性を確認するチェックサムの計算と照合。 | `await storage.checksum.generate(bytes)` |

追加の設定項目や利用例は[中国語リファレンス](storage.md)に掲載しています。
