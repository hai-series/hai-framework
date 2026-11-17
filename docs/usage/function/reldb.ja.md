# @h-ai/reldb API リファレンス

<!-- translation: partial -->

[原文（中国語）](reldb.md) · [設定](../configuration/reldb.ja.md) · [データ構造](../data/reldb.ja.md)

<a id="quick-start"></a>

## クイックスタート

設定したデータベースを初期化し、SQL、型付き CRUD テーブル、トランザクションから選びます。値をバインド引数で渡し、識別子には信頼できる定義を使います。値を読む前に `HaiResult.success` を確認します。

```ts
import { HaiReldbError, reldb } from '@h-ai/reldb'

// 初始化
const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initialized.success)
  throw new Error(initialized.error.message)

// DDL
await reldb.ddl.createTable('users', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
})

// SQL
await reldb.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['张三', 'test@example.com'])
const users = await reldb.sql.query<{ id: number, name: string }>('SELECT * FROM users')

// 分页查询
const page = await reldb.sql.queryPage<{ id: number, name: string }>({
  sql: 'SELECT id, name FROM users ORDER BY id',
  pagination: { page: 1, pageSize: 20 },
})

// CRUD
const userCrud = reldb.crud.table({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
  dbType: 'sqlite',
})
await userCrud.create({ name: '李四', email: 'li@test.com' })
const user = await userCrud.findById(1)

// 关闭
await reldb.close()
```

<a id="api-reference"></a>

## API 一覧

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `reldb.ddl.createTable`, `dropTable`, `addColumn`, `dropColumn`, `renameTable`, `createIndex`, `dropIndex`, `raw` | 信頼できるテーブル・列の定義でデータベース構造を変更。 | `await reldb.ddl.dropTable('orders')` |
| `reldb.sql.query`, `get`, `execute`, `batch`, `queryPage` | クエリ、一行の取得、書き込み、一括実行、ページ取得。 | `await reldb.sql.query('SELECT id FROM orders')` |
| `reldb.pagination.normalize`, `build`, `reldb.schemaColumns` | ページ指定の正規化、ページ節の準備、スキーマからの列定義作成。 | `reldb.pagination.normalize({ page: 1 })` |
| `reldb.tx.begin`, `wrap` | トランザクションを明示管理、または処理をトランザクションで囲む。 | `await reldb.tx.begin()` |
| `reldb.crud.table` | 典型的な CRUD を行う型付きテーブルを作成。 | `reldb.crud.table('orders')` |
| `reldb.json.extract`, `set`, `insert`, `remove`, `merge` | JSON の項目の取得や更新に使うドライバー別の関数を構築。 | `reldb.json.extract('payload', '$.status')` |

追加の設定項目や利用例は[中国語リファレンス](reldb.md)に掲載しています。
