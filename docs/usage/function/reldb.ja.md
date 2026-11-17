# @h-ai/reldb API リファレンス

<!-- translation: partial -->

[原文（中国語）](reldb.md) · [設定](../configuration/reldb.ja.md) · [データ構造](../data/reldb.ja.md)

<a id="quick-start"></a>

設定したデータベースを初期化し、SQL、型付き CRUD テーブル、トランザクションから選びます。値をバインド引数で渡し、識別子には信頼できる定義を使います。値を読む前に `HaiResult.success` を確認します。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `reldb.ddl.createTable`, `dropTable`, `addColumn`, `dropColumn`, `renameTable`, `createIndex`, `dropIndex`, `raw` | 信頼できるテーブル・列の定義でデータベース構造を変更。 | `await reldb.ddl.dropTable('orders')` |
| `reldb.sql.query`, `get`, `execute`, `batch`, `queryPage` | クエリ、一行の取得、書き込み、一括実行、ページ取得。 | `await reldb.sql.query('SELECT id FROM orders')` |
| `reldb.pagination.normalize`, `build`, `reldb.schemaColumns` | ページ指定の正規化、ページ節の準備、スキーマからの列定義作成。 | `reldb.pagination.normalize({ page: 1 })` |
| `reldb.tx.begin`, `wrap` | トランザクションを明示管理、または処理をトランザクションで囲む。 | `await reldb.tx.begin()` |
| `reldb.crud.table` | 典型的な CRUD を行う型付きテーブルを作成。 | `reldb.crud.table('orders')` |
| `reldb.json.extract`, `set`, `insert`, `remove`, `merge` | JSON の項目の取得や更新に使うドライバー別の関数を構築。 | `reldb.json.extract('payload', '$.status')` |

追加の設定項目や利用例は[中国語リファレンス](reldb.md)に掲載しています。
