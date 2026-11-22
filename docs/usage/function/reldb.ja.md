# @h-ai/reldb API リファレンス

<!-- translation: partial -->

[原文（中国語）](reldb.md) · [設定](../configuration/reldb.ja.md) · [データ構造](../data/reldb.ja.md)

<a id="quick-start"></a>

## クイックスタート

設定したデータベースを初期化し、SQL、型付き CRUD テーブル、トランザクションから選びます。値をバインド引数で渡し、識別子には信頼できる定義を使います。値を読む前に `HaiResult.success` を確認します。

```ts
import { HaiReldbError, reldb } from '@h-ai/reldb'

// 初始化
// このプロセス用のインメモリ SQLite を開きます。成功後は SQL を実行でき、失敗時は error です。
const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initialized.success)
  throw new Error(initialized.error.message)

// DDL
// 下の ID、名前、メールで users を作成します。成功時の data はなく、失敗は error に入ります。
await reldb.ddl.createTable('users', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
})

// SQL
// サンプルの名前とメールをプレースホルダーへ束縛します。data.changes は挿入件数、失敗時は error です。
await reldb.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['张三', 'test@example.com'])
// users の全行を読みます。成功時は追加したユーザーを含む配列、失敗時は error です。
const users = await reldb.sql.query<{ id: number, name: string }>('SELECT * FROM users')

// 分页查询
// ID 順で 1 ページ目を最大 20 件取得します。成功時は items と total、失敗時は error です。
const page = await reldb.sql.queryPage<{ id: number, name: string }>({
  sql: 'SELECT id, name FROM users ORDER BY id',
  pagination: { page: 1, pageSize: 20 },
})

// CRUD
// 下の主キーと列指定で users の CRUD リポジトリを作り、後続の処理で使用します。
const userCrud = reldb.crud.table({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
  dbType: 'sqlite',
})
// 名前とメールで 2 人目を作成します。成功時は影響行数、失敗時は error です。
await userCrud.create({ name: '李四', email: 'li@test.com' })
// キー 1 で最初のユーザーを検索します。成功時は行または null、失敗時は error です。
const user = await userCrud.findById(1)

// 关闭
// 引数なしでこの DB 接続を閉じます。成功時の data はなく、失敗時は error です。
await reldb.close()
```

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。各呼び出しで HaiResult.success を確認し、失敗時は元の結果を返し、成功時だけ data を読みます。関数宣言のない例はアプリの非同期業務関数内の断片です。独立したテストデータと明示した後片付けを使います。


<a id="connection"></a>

### 接続・構造準備・終了：`reldb`

先に接続し、prepareSchema で同じ DB の構造準備を調整します。トランザクション終了後に閉じます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reldb.init(config)` | データベース接続を作成して検証 | 必須の `config: ReldbConfigInput`。[バックエンド設定](../configuration/reldb.ja.md)を参照。 | `Promise<HaiResult<void>>` | `await reldb.init({ type: 'sqlite', database: ':memory:' })` |
| `reldb.close()` | 実行中のトランザクションを終了して接続を解放 | なし | `Promise<HaiResult<void>>` | `await reldb.close()` |
| `reldb.prepareSchema(key, prepare)` | 同じ接続で名前を付けてスキーマ変更を調整 | 必須の `key: string` は作業名。非同期の `prepare` は現在の接続の `ddl` と `sql` を受け取ります。 | `Promise<HaiResult<T>>` | `await reldb.prepareSchema('orders', db => db.ddl.createTable('orders', { id: { type: 'TEXT', primaryKey: true } }))` |

#### 利用例：接続・構造準備・終了

入門例は開発用 SQLite です。init と close に業務データはなく、prepareSchema は現在の接続の ddl/sql を渡してコールバック結果を返します。

未翻訳：SQL、JSON、トランザクション、リポジトリの各メソッドの例。[中国語の該当節](reldb.md#api-reference)を参照してください。

[引数と手順の詳細](reldb.md#connection)

<a id="schema"></a>

### テーブルの作成と変更：`reldb.ddl`

信頼するテーブル名・列名・定義を使い、既存データを失う変更は実行前に確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reldb.ddl.createTable(tableName, columns, ifNotExists?)` | テーブルを作成 | `tableName: string` 信頼できるテーブル名。`columns: ReldbTableDef` 列名から列定義へのオブジェクト。`ifNotExists?: boolean` 既定 true。既存テーブルをスキップ。[列とインデックスの定義](#reldb-ddl-fields)を参照 | `void` | `await reldb.ddl.createTable('orders', { id: { type: 'TEXT', primaryKey: true } })` |
| `reldb.ddl.dropTable(tableName, ifExists?)` | テーブルとデータを削除 | `tableName: string` 信頼できるテーブル名。`ifExists?: boolean` 既定 true。対象がなければ処理を省略 | `void` | `await reldb.ddl.dropTable('orders_archive', true)` |
| `reldb.ddl.addColumn(tableName, columnName, columnDef)` | 列を追加 | `tableName: string` 信頼できるテーブル名。`columnName: string` 信頼できる列名。`columnDef: ReldbColumnDef` 追加する列の定義。[列とインデックスの定義](#reldb-ddl-fields)を参照 | `void` | `await reldb.ddl.addColumn('orders', 'note', { type: 'TEXT' })` |
| `reldb.ddl.dropColumn(tableName, columnName)` | 列を削除 | `tableName: string` 信頼できるテーブル名。`columnName: string` 信頼できる列名 | `void` | `await reldb.ddl.dropColumn('orders', 'note')` |
| `reldb.ddl.renameTable(oldName, newName)` | テーブルを改名 | `oldName: string, newName: string` 信頼できる変更前と変更後のテーブル名 | `void` | `await reldb.ddl.renameTable('orders_draft', 'orders')` |
| `reldb.ddl.createIndex(tableName, indexName, indexDef)` | インデックスを作成 | `tableName: string` 信頼できるテーブル名。`indexName: string` 信頼できるインデックス名。`indexDef: ReldbIndexDef` 対象列とオプション。[列とインデックスの定義](#reldb-ddl-fields)を参照 | `void` | `await reldb.ddl.createIndex('orders', 'orders_status', { columns: ['status'] })` |
| `reldb.ddl.dropIndex(indexName, ifExists?)` | インデックスを削除 | `indexName: string` 信頼できるインデックス名。`ifExists?: boolean` 既定 true。対象がなければ処理を省略 | `void` | `await reldb.ddl.dropIndex('orders_status', true)` |
| `reldb.ddl.raw(sql)` | 信頼済み DDL を実行 | `sql: string` 信頼できるコードの構造定義 SQL | `void` | `await reldb.ddl.raw('CREATE TABLE IF NOT EXISTS app_marker (id TEXT PRIMARY KEY)')` |
| `reldb.schemaColumns(table, sql?)` | テーブル構造を取得 | `table: string` 信頼できるテーブル名。`sql?: DmlOperations` 任意の既存 SQL 操作。既定は現在の接続 | `string[]` | `await reldb.schemaColumns('orders')` |

<a id="reldb-ddl-fields"></a>

**列とインデックスの定義**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `ReldbColumnDef.type` | `ColumnType` | 必須 | TEXT、INTEGER、BIGINT、JSON などのポータブルな列型。 |
| `ReldbColumnDef.primaryKey / autoIncrement` | `boolean` | `false` | 主キーと自動採番を指定。自動採番は主キーだけに適用。 |
| `ReldbColumnDef.notNull / unique` | `boolean` | `false` | NULL と重複をそれぞれ制限。 |
| `ReldbColumnDef.defaultValue` | `string \| number \| boolean \| null` | 任意 | 挿入時に列を省略した場合のデータベース既定値。 |
| `ReldbColumnDef.references` | `{ table, column, onDelete?, onUpdate? }` | 任意 | 外部キーを指定する場合は参照先テーブル名と列名が必須。削除・更新の動作は CASCADE、SET NULL、RESTRICT、NO ACTION から選べます。 |
| `ReldbIndexDef.columns` | `string[]` | 必須 | インデックス列名の順序付き一覧。 |
| `ReldbIndexDef.unique` | `boolean` | `false` | インデックスキーの組み合わせの重複を禁止。 |
| `ReldbIndexDef.where` | `string` | 任意 | 対応するバックエンドで部分インデックスの対象を絞る信頼できる静的 SQL 条件。 |

例えば `{ id: { type: "TEXT", primaryKey: true }, paid: { type: "BOOLEAN", defaultValue: false } }` は文字列の主キーと支払いフラグを定義し、挿入で `paid` を省略すると `false` が入ります。

#### 利用例：テーブルの作成と変更

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// テキスト ID を主キーとする注文表を作ります。成功時の data はなく、失敗時は元の結果を返します。
const createTableResult = await reldb.ddl.createTable('demo_orders', { id: { type: 'TEXT', primaryKey: true } })
if (!createTableResult.success)
  return createTableResult
// demo_orders に NULL 可の TEXT 列 note を追加します。失敗時は元の結果を返します。
const addColumnResult = await reldb.ddl.addColumn('demo_orders', 'note', { type: 'TEXT' })
if (!addColumnResult.success)
  return addColumnResult
// 変更後の表の列名は ['id', 'note'] です。失敗時は元の結果を返します。
const schemaColumnsResult = await reldb.schemaColumns('demo_orders')
if (!schemaColumnsResult.success)
  return schemaColumnsResult
schemaColumnsResult.data // ['id', 'note']
// demo_orders.note に指定名の索引を作ります。失敗時は元の結果を返します。
const createIndexResult = await reldb.ddl.createIndex('demo_orders', 'demo_orders_note', { columns: ['note'] })
if (!createIndexResult.success)
  return createIndexResult
// 作成した索引を名前で削除します。true は存在しなくても許容し、失敗時は元の結果を返します。
const dropIndexResult = await reldb.ddl.dropIndex('demo_orders_note', true)
if (!dropIndexResult.success)
  return dropIndexResult
// demo_orders から note 列とその値を削除します。失敗時は元の結果を返します。
const dropColumnResult = await reldb.ddl.dropColumn('demo_orders', 'note')
if (!dropColumnResult.success)
  return dropColumnResult
// 表を demo_orders_old に改名します。失敗時は元の結果を返します。
const renameTableResult = await reldb.ddl.renameTable('demo_orders', 'demo_orders_old')
if (!renameTableResult.success)
  return renameTableResult
// 改名した表を削除します。true は表がなくても許容し、失敗時は元の結果を返します。
const dropTableResult = await reldb.ddl.dropTable('demo_orders_old', true)
if (!dropTableResult.success)
  return dropTableResult
// 固定 DDL でマーカー表を作ります。成功時の data はなく、失敗時は元の結果を返します。
const rawResult = await reldb.ddl.raw('CREATE TABLE IF NOT EXISTS demo_marker (id TEXT PRIMARY KEY)')
if (!rawResult.success)
  return rawResult
// All successful DDL calls have no business data.
```

新しい demo_ テーブルと索引を使います。schemaColumns は実際の列名です。raw は信頼する SQL だけに使い、DDL のトランザクション対応は DB ごとに確認します。

[引数と手順の詳細](reldb.md#schema)

<a id="sql"></a>

### パラメーター付き SQL とページング：`reldb.sql`・`reldb.pagination`

変動する値はパラメーターで渡し、行データと更新結果を区別します。ページングは安定した順序にします。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reldb.sql.query(sql, params?)` | パラメーター付きで複数行を取得 | `sql: string` 信頼できる SQL。実行時の値にはプレースホルダーを使用。`params?: unknown[]` プレースホルダー順に値を束縛。省略時は束縛なし | `T[]` | `await reldb.sql.query('SELECT id FROM orders WHERE status = ?', ['pending'])` |
| `reldb.sql.get(sql, params?)` | パラメーター付きで1行を取得 | `sql: string` 信頼できる SQL。実行時の値にはプレースホルダーを使用。`params?: unknown[]` プレースホルダー順に値を束縛。省略時は束縛なし | `T \| null` | `await reldb.sql.get('SELECT id FROM orders WHERE id = ?', ['o1'])` |
| `reldb.sql.execute(sql, params?)` | パラメーター付きで書き込み | `sql: string` 信頼できる SQL。実行時の値にはプレースホルダーを使用。`params?: unknown[]` プレースホルダー順に値を束縛。省略時は束縛なし | `ExecuteResult` | `await reldb.sql.execute('UPDATE orders SET status = ? WHERE id = ?', ['paid', 'o1'])` |
| `reldb.sql.batch(statements)` | SQL を一括実行 | `statements` 順に実行する SQL 項目。各項目に sql と任意の params | `void` | `await reldb.sql.batch([{ sql: 'DELETE FROM orders WHERE id = ?', params: ['o1'] }])` |
| `reldb.sql.queryPage(options)` | ページと総数を取得 | 必須の `options: PaginationQueryOptions`。[照会フィールド](#reldb-sql-page-options)を参照。 | `PaginatedResult<T>` | `await reldb.sql.queryPage({ sql: 'SELECT id FROM orders ORDER BY id', pagination: { page: 1, pageSize: 20 } })` |
| `reldb.pagination.normalize(options?, overrides?)` | ページ指定を正規化 | 任意の `options: PaginationOptionsInput` と `overrides: PaginationOverrides`。[ページ指定](#reldb-sql-page-options)を参照。 | `NormalizedPagination` | `reldb.pagination.normalize({ page: 1, pageSize: 20 })` |
| `reldb.pagination.build(items, total, pagination)` | ページ取得結果を作成 | `items: T[], total: number, pagination: PaginationOptions` 現在ページの行、全一致件数、ページ番号とページサイズ | `PaginatedResult<T>` | `reldb.pagination.build([], 0, { page: 1, pageSize: 20 })` |

<a id="reldb-sql-page-options"></a>

**SQL ページ照会と既定値**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `PaginationQueryOptions.sql` | `string` | 必須 | LIMIT/OFFSET を除いた信頼できる SELECT。安定したページングには一意列を含む ORDER BY を使用。 |
| `PaginationQueryOptions.params` | `unknown[]` | `[]` | クエリ値をプレースホルダーの順に束縛。 |
| `PaginationQueryOptions.pagination` | `PaginationOptionsInput` | 任意 | 既定値を使う場合は省略。page と pageSize を含み、normalize にも指定できます。 |
| `pagination.page / pageSize` | `number` | 既定 1 ページ目、各 20 件 | 有効な指定値は切り捨て。省略または 1 未満なら対応する既定値。 |
| `PaginationQueryOptions.overrides` | `PaginationOverrides` | 任意 | 既定のページ、ページサイズ、上限を上書き。normalize の 2 番目の引数としても指定可能。 |
| `overrides.defaultPage / defaultPageSize` | `number` | 既定 1 と 20 | 対応する値が省略または 1 未満の場合に使用。正整数を使い、既定件数を上限以内にします。 |
| `overrides.maxPageSize` | `number` | `200` | 呼び出し側が明示したページサイズの上限。 |

3 ページ目に 50 件を指定し、アプリが `{ maxPageSize: 10 }` を適用すると、`{ page: 3, pageSize: 10, offset: 20, limit: 10 }` になります。

`params` はプレースホルダーの順に値を束縛します。束縛する値がなければ省略できます。`page` は 1 始まり、`pageSize` はページごとの件数です。省略または 1 未満の値は `defaultPage` または `defaultPageSize` に戻り、有効な値は小数部分を切り捨てます。明示した `pageSize` は `maxPageSize` 以下に収まります。`overrides` はアプリで正の整数を指定し、既定の件数を上限以内に設定してください。

#### 利用例：パラメーター付き SQL とページング

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// テキスト主キーで照会用の表を作ります。失敗時は元の結果を返します。
const createTableResult = await reldb.ddl.createTable('demo_sql', { id: { type: 'TEXT', primaryKey: true } })
if (!createTableResult.success)
  return createTableResult
// 挿入のプレースホルダーに o1 を束縛します。結果は影響行数を含み、失敗時は元の結果を返します。
const insertedResult = await reldb.sql.execute('INSERT INTO demo_sql (id) VALUES (?)', ['o1'])
if (!insertedResult.success)
  return insertedResult
const inserted = insertedResult.data // affected-row result
// 挿入した ID を取得します。結果は [{ id: 'o1' }]、失敗時は元の結果を返します。
const queryResult = await reldb.sql.query('SELECT id FROM demo_sql ORDER BY id')
if (!queryResult.success)
  return queryResult
queryResult.data // [{ id: 'o1' }]
// o1 を束縛して最初の行 { id: 'o1' } を取得します。失敗時は元の結果を返します。
const getResult2 = await reldb.sql.get('SELECT id FROM demo_sql WHERE id = ?', ['o1'])
if (!getResult2.success)
  return getResult2
getResult2.data // { id: 'o1' }
// ページ 1、件数 20 から最初のページの上限とオフセットを得ます。
const pagination = reldb.pagination.normalize({ page: 1, pageSize: 20 })
// 利用者は 3 ページ目に 50 件を指定します。画面の上限は 10 件なので、20 行を飛ばして最大 10 行を取得します。
const limited = reldb.pagination.normalize({ page: 3, pageSize: 50 }, { maxPageSize: 10 })
limited // { page: 3, pageSize: 10, offset: 20, limit: 10 }
// 固定 SQL と正規化済みページ設定を渡し、o1 のページと総数 1 を取得します。失敗時は元の結果を返します。
const pageResult = await reldb.sql.queryPage({ sql: 'SELECT id FROM demo_sql ORDER BY id', pagination })
if (!pageResult.success)
  return pageResult
const page = pageResult.data
// page.items: [{ id: 'o1' }], total: 1
// 例の行、総数、ページ設定から同等のページオブジェクトを作ります。
reldb.pagination.build([{ id: 'o1' }], 1, { page: 1, pageSize: 20 }) // equivalent page envelope
// バッチで o1 を削除します。成功時は行を削除して data はなく、失敗時は元の結果を返します。
const batchResult = await reldb.sql.batch([{ sql: 'DELETE FROM demo_sql WHERE id = ?', params: ['o1'] }])
if (!batchResult.success)
  return batchResult
// 成功時の業務データはありません。
// 削除後に o1 を検索すると null を返します。照会失敗時は元の結果を返します。
const getResult = await reldb.sql.get('SELECT id FROM demo_sql WHERE id = ?', ['o1'])
if (!getResult.success)
  return getResult
getResult.data // null
```

o1 はバインド値です。get の null は正常な該当なし、query は配列、batch は業務データなしです。識別子を値パラメーターにしません。

[引数と手順の詳細](reldb.md#sql)

<a id="transactions"></a>

### まとめて確定・取消する：`reldb.tx`

複数の読み書きを一貫させるため同じトランザクションに入れます。手動開始では必ず確定・取消します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reldb.tx.begin()` | 手動トランザクションを開始 | なし | `DmlWithTxOperations` | `await reldb.tx.begin()` |
| `reldb.tx.wrap(fn)` | コールバックを自動コミット・ロールバック | `fn: TxWrapCallback<T>` トランザクションを受け取る非同期コールバック。正常終了でコミット、例外でロールバック | `T` | `await reldb.tx.wrap(async tx => { const found = await tx.get('SELECT 1 AS value'); if (!found.success) throw new Error(found.error.message); return found.data })` |

#### 利用例：まとめて確定・取消する

自動トランザクションの境界です。各操作の HaiResult を確認し、業務上の失敗では例外を発生させてコミットを防ぎます。

![tx.wrap：コミットとロールバックの条件](../images/function-reldb-transaction.ja.svg)

通常の戻り値は、未確認の失敗 HaiResult も含めてコミットへ進みます。例外でロールバックし、その終了処理の失敗も扱います。外部の送信・支払・ファイル操作は SQL の巻き戻しでは取り消せません。

以下では wrap の戻り値・例外時取消・begin 後の commit/rollback・一括処理を示します。失敗した HaiResult を正常な戻り値として確定しないでください。

[引数と手順の詳細](reldb.md#transactions)

<a id="repositories"></a>

### レコード単位の操作：`reldb.crud`

テーブルとアプリの項目をリポジトリで対応付け、作成・検索・更新・削除します。必要ならトランザクションに結び付けます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reldb.crud.table(config)` | テーブルの CRUD 操作を作成 | テーブルと業務レコードのマッピングを示す `config: CrudConfig<TItem>` が必須。[設定項目](#reldb-crud-config)を参照。 | `ReldbCrudRepository<TItem>` | `reldb.crud.table('orders')` |
| `repository.create(data, tx?)` | レコードを追加 | `data: Record<string, unknown>` DB 列名をキーにした業務データ。`tx?: DmlWithTxOperations` 既存トランザクション。省略時は通常の接続を使用 | `Promise<HaiResult<ExecuteResult>>` | `await repository.create({ id: 'r1', name: 'Ada' })` |
| `repository.createMany(items, tx?)` | 複数レコードを追加 | `items: Array<Record<string, unknown>>` 各項目は 1 レコードの列名と値。`tx?: DmlWithTxOperations` 既存トランザクション。省略時は通常の接続を使用 | `Promise<HaiResult<void>>` | `await repository.createMany([{ id: 'r2', name: 'Lin' }])` |
| `repository.createOrUpdate(data, tx?)` | ID で追加・更新 | `data: Record<string, unknown>` DB 列名をキーにした業務データ。`tx?: DmlWithTxOperations` 既存トランザクション。省略時は通常の接続を使用 | `Promise<HaiResult<ExecuteResult>>` | `await repository.createOrUpdate({ id: 'r1', name: 'Ada v2' })` |
| `repository.findById(id, tx?)` | 不存在なら null | `id` 作成した列の型に合う主キー値。`tx?: DmlWithTxOperations` 既存トランザクション。省略時は通常の接続を使用 | `Promise<HaiResult<TItem \| null>>` | `await repository.findById('r1')` |
| `repository.getById(id, tx?)` | 不存在なら失敗 | `id` 作成した列の型に合う主キー値。`tx?: DmlWithTxOperations` 既存トランザクション。省略時は通常の接続を使用 | `Promise<HaiResult<TItem>>` | `await repository.getById('r1')` |
| `repository.findAll(options?, tx?)` | 条件検索 | `options` に任意の `where`、`params`、`orderBy`、`limit`、`offset`。既存トランザクションを使うには `tx` を指定 | `Promise<HaiResult<TItem[]>>` | `await repository.findAll({ orderBy: 'id ASC' })` |
| `repository.findPage(options, tx?)` | ページ検索 | `options` オブジェクトは必須で、各項目は任意。`where`、`params`、`orderBy` は `findAll` と同じ。`pagination` と `overrides` は [SQL のページ指定](#sql) と同じ。`tx` は任意 | `Promise<HaiResult<PaginatedResult<TItem>>>` | `await repository.findPage({ pagination: { page: 1, pageSize: 10 } })` |
| `repository.updateById(id, data, tx?)` | ID で更新 | `id` 作成した列の型に合う主キー値。`data: Record<string, unknown>` DB 列名をキーにした業務データ。`tx?: DmlWithTxOperations` 既存トランザクション。省略時は通常の接続を使用 | `Promise<HaiResult<ExecuteResult>>` | `await repository.updateById('r1', { name: 'Ada v3' })` |
| `repository.deleteById(id, tx?)` | ID で削除 | `id` 作成した列の型に合う主キー値。`tx?: DmlWithTxOperations` 既存トランザクション。省略時は通常の接続を使用 | `Promise<HaiResult<ExecuteResult>>` | `await repository.deleteById('r2')` |
| `repository.count(options?, tx?)` | 件数を取得 | `options` に任意の `where` と `params`。条件を省略すると全件を集計。`tx` は任意 | `Promise<HaiResult<number>>` | `await repository.count()` |
| `repository.exists(options?, tx?)` | 条件に一致するか確認 | `options` に任意の `where` と `params`。条件を省略するとテーブルに行があるか確認。`tx` は任意 | `Promise<HaiResult<boolean>>` | `await repository.exists({ where: 'name = ?', params: ['Lin'] })` |
| `repository.existsById(id, tx?)` | ID の存在を確認 | `id` 作成した列の型に合う主キー値。`tx?: DmlWithTxOperations` 既存トランザクション。省略時は通常の接続を使用 | `Promise<HaiResult<boolean>>` | `await repository.existsById('r2')` |

<a id="reldb-crud-config"></a>

**CrudConfig<TItem>**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `table` | `string` | 必須 | リポジトリが使用する信頼できるテーブル名。 |
| `dbType` | `DbType` | 必須 | SQL の生成に使う現在の接続の方言。 |
| `idColumn` | `string` | `id` | 検索、競合時の更新、削除で使う主キー列。 |
| `select` | `string[]` | `*` | 返す列。 |
| `createColumns / updateColumns` | `string[]` | 入力データの列 | 書き込み可能な列を制限。更新では主キーが除外されます。 |
| `mapRow` | `(row: QueryRow) => TItem` | 任意 | 取得した行をアプリの業務オブジェクトに変換。 |

`orders` に `idColumn: "order_id"` と `select: ["order_id", "status"]` を指定すると、`findById("o1")` は order_id で検索して 2 列を返し、なければ null を返します。

<a id="reldb-repository-query-options"></a>

**リポジトリ照会のオプション**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `where` | `string` | 任意 | findAll、findPage、count、exists に適用。WHERE を含まない信頼できる静的条件。 |
| `params` | `unknown[]` | `[]` | where のプレースホルダーに動的な値を順に束縛します。 |
| `orderBy` | `string` | 任意 | findAll / findPage 用の信頼できるソート式。ORDER BY は含めません。ページングやオフセットには安定した順序を指定。 |
| `limit / offset` | `number` | 件数無制限 / 先頭から | findAll の最大件数と飛ばす件数。offset のみでも指定可能。 |
| `pagination / overrides` | `PaginationOptionsInput / PaginationOverrides` | 任意 | findPage 専用。[SQL のページ指定](#reldb-sql-page-options)と同じ項目。 |

ID `r1` と `r2` がある場合、`findAll({ orderBy: "id ASC", offset: 1 })` は `r1` を飛ばし、`r2` だけを返します。任意の `tx` を渡すと既存トランザクションに参加します。

`findAll({ orderBy, offset })` は指定した行数をスキップし、残りの行を返します。SQLite、PostgreSQL、MySQL では `limit` を省略できます。

`where` と `orderBy` は WHERE または ORDER BY キーワードを除いた、アプリが定義する SQL 断片です。動的な値はプレースホルダーの順に `params` に指定します。`limit` を省略すると、任意の `offset` 以降で条件に合うすべての行を取得します。ページ分割やオフセット指定には安定した `orderBy` を使用します。

#### 利用例：レコード単位の操作

以下の完全な定義から、インスタンスの入力・行・ページ・件数・該当なしを確認できます。独自実装には BaseReldbCrudRepository を使えます。

[引数と手順の詳細](reldb.md#repositories)

<a id="json-fields"></a>

### JSON フィールドの読み書き：`reldb.json`

各関数はパラメーター付き SQL 式を組み立てます。実際の変更は SQL 実行時です。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reldb.json.extract(column, path)` | JSON 値を取得する SQL 式を作成 | `column: string` 信頼できる JSON 列名または SQL の列表現。`path: string` 対象の JSON パス。例は $.status | `JsonSqlExpr` | `reldb.json.extract('payload', '$.status')` |
| `reldb.json.set(column, path, value)` | JSON パスを設定する SQL 式を作成 | `column: string` 信頼できる JSON 列名または SQL の列表現。`path: string` 対象の JSON パス。例は $.status。`value` 対象パスに書き込む JSON 値 | `JsonSqlExpr` | `reldb.json.set('payload', '$.status', 'paid')` |
| `reldb.json.insert(column, path, value)` | 未存在 JSON パスを追加する SQL 式を作成 | `column: string` 信頼できる JSON 列名または SQL の列表現。`path: string` 対象の JSON パス。例は $.status。`value` 対象パスに書き込む JSON 値 | `JsonSqlExpr` | `reldb.json.insert('payload', '$.note', 'checked')` |
| `reldb.json.remove(column, path)` | JSON パスを削除する SQL 式を作成 | `column: string` 信頼できる JSON 列名または SQL の列表現。`path: string` 対象の JSON パス。例は $.status | `JsonSqlExpr` | `reldb.json.remove('payload', '$.note')` |
| `reldb.json.merge(column, patch)` | JSON を統合する SQL 式を作成 | `column: string` 信頼できる JSON 列名または SQL の列表現。`patch: Record<string, unknown>` JSON オブジェクトへマージする項目と値 | `JsonSqlExpr` | `reldb.json.merge('payload', { status: 'paid' })` |

#### 利用例：JSON フィールドの読み書き

以下では payload に対する各パスと実行後の JSON を示します。方言を DB に合わせ、式オブジェクトを保存済みデータと混同しません。

[引数と手順の詳細](reldb.md#json-fields)
