# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

## 概要

共通の `reldb` オブジェクトで SQLite、PostgreSQL、MySQL を操作するリレーショナルデータベースモジュールです。

接続はヘルスチェック成功後に公開します。初期化失敗時は候補リソースを解放し、解放にも失敗した場合は初期化エラーの `error.ext.cleanupPending` が `true` になります。`reldb.close()` は `Promise<HaiResult<void>>` を返し、初期化を待機して並行する終了処理をまとめます。解放開始後は `isInitialized` が `false` となり、設定と操作は利用できません。解放に失敗したリソースは保持され、次の `close()` または `init()` で再試行します。解放が成功するまで代替接続は作成しません。終了結果を必ず確認してください。

```ts
const closed = await reldb.close()
if (!closed.success) {
  // 障害への対処後に一度再試行し、再失敗はアプリへ報告します。
  const retried = await reldb.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

終了処理は既存トランザクションのコミット/ロールバックと解放を待ちます。アプリはトランザクションを終了させてください。SQLite の WAL 設定と worker のハンドシェイクも初期化リソースとして管理します。PostgreSQL の切断済みアイドル接続はプールが除去し、次のクエリで置き換えます。プロセスは終了せず、ログには安全なエラー識別子のみを記録します。

## 主な機能

- 共通 API で SQLite・PostgreSQL・MySQL に接続。
- パラメーター付き SQL、テーブル・索引管理、ページ取得。
- トランザクション、CRUD、Repository による業務の読み書き。

## 使い始める

### クイックスタート

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

`reldb.config` は**機密情報をマスクした設定スナップショット**を返します。DB の `password`、URL 内の認証情報、TLS クライアント秘密鍵 `ssl.key` を非表示にします。状態確認用であり、元の接続情報の再利用には使わないでください。

### 設定

`@h-ai/reldb/schemas` は同じ設定 Schema と型を Zod のみで公開し、DB インスタンスやドライバーを読み込みません。CLI やブラウザーで設定検証に利用できます。MySQL TLS は `false` または厳密なオブジェクトのみで、`{}` は証明書チェーンと DNS ID を検証します。PostgreSQL の真偽値・文字列モード・オブジェクト契約は維持します。

```ts
import { ReldbConfigSchema } from '@h-ai/reldb/schemas'

const checked = ReldbConfigSchema.safeParse({ type: 'mysql', database: 'shop', ssl: {} })
if (!checked.success)
  throw new Error('Invalid database configuration')
// checked.data.ssl: { rejectUnauthorized: true, verifyIdentity: true }
```

接続文字列（`url`）または個別フィールド（`host/port/database/user/password`）を指定できます。

```ts
// SQLite
await reldb.init({ type: 'sqlite', database: './data.db' })

// PostgreSQL
await reldb.init({ type: 'postgresql', url: 'postgres://user:pass@localhost:5432/mydb', database: 'mydb' })

// MySQL
await reldb.init({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  mysql: { charset: 'utf8mb4' },
  pool: { max: 10, acquireTimeout: 5000, queueLimit: 100 },
})
```

#### 接続プールと MySQL URL

MySQL の `pool` は `max`、`acquireTimeout`、`queueLimit` のみを受け付け、省略時もそれぞれ 10、10000 ミリ秒、1000 を使用します。`min`、`idleTimeout` などの未対応フィールドと未実装の `mysql.timezone` は設定検証で拒否します。アイドル接続は mysql2/サーバーによる切断または `close()` で解放し、最小保持数や設定可能なアイドル回収期限は保証しません。[mysql2 3.24.5 の設定](https://github.com/sidorares/node-mysql2/blob/v3.24.5/typings/mysql/lib/Pool.d.ts)は PostgreSQL と異なります。

| フィールド       | PostgreSQL（`pool` 指定時の既定値） | MySQL                                  |
| ---------------- | ----------------------------------- | -------------------------------------- |
| `max`            | 10                                  | 10、借用中と接続確立中の合計上限       |
| `min`            | 1、既存接続の保持下限。事前作成なし | 未対応、拒否                           |
| `idleTimeout`    | 30000 ミリ秒、0 は無効化            | 未対応、拒否                           |
| `acquireTimeout` | 10000 ミリ秒、0 は無効化            | 10000 ミリ秒、1–2147483647 の整数      |
| `queueLimit`     | 未対応                              | 1000、待機リクエスト数の上限、正の整数 |

PostgreSQL で `pool` を省略した場合は pg の既定値を使用します。保持と回収の仕様は [pg.Pool](https://node-postgres.com/apis/pool) を参照してください。MySQL の SQL、DDL、CRUD、バッチ、トランザクションは共通の有限 FIFO 待機キューを使います。待機と接続確立に一つの期限を適用し、超過時は `TIMEOUT`、満杯時は `POOL_EXHAUSTED` を返します。期限切れ項目は削除し、遅れて取得した接続は SQL を実行せず解放します。確立処理が完了するまで容量枠を保持します。受領時と処理開始前にも期限を確認しますが、開始済み SQL/トランザクションの実行時間は制限しません。

MySQL の `close()` は新規・待機リクエストを直ちに拒否し、借用接続、トランザクション、接続確立の完了後にプールを閉じます。`connectTimeout` にも同じ値を使うため、その期限や既存処理を待つ場合があります。アプリはトランザクションを終了してください。環境変数は `HAI_DB_POOL_*` です。`MIN` / `IDLETIMEOUT` は PostgreSQL 専用で、MySQL の `QUEUELIMIT` は待機総数を制限します。

MySQL は `mysql://` の `url` だけでも接続でき、URL がなければ `database` が必須です。URL の host/port/database/user/password を優先し、競合する個別フィールドは接続に使用しません。`pool`、`mysql.charset`、`ssl`、`operationLog` は独立して適用します。query/fragment は拒否し、URL 内の隠れた設定で TLS やプールを変更できません。接続ログの URL は機密情報を伏せます。以下は `HAI_DB_URL` の設定を前提とします：

```ts
const initialized = await reldb.init({ type: 'mysql', url: process.env.HAI_DB_URL, pool: { max: 10, acquireTimeout: 5000, queueLimit: 100 } })
if (!initialized.success)
  throw new Error(initialized.error.message)
```

MySQL の空 `url`（空の環境変数を含む）は host/port/database/user/password を使用します。空でない URL は厳密に検証します。

#### MySQL TLS

`ssl` を省略するか `false` にすると TLS を使用しません。有効化には厳密なオブジェクトを指定し、空オブジェクトの既定値は `{ rejectUnauthorized: true, verifyIdentity: true }` です。`ca` は信頼する CA の PEM 内容で、省略時は Node の信頼ストアを使います。任意のクライアント `cert` / `key` も PEM 内容で、必ず対で指定します。未知の TLS フィールド、`true`、PostgreSQL の文字列モードは拒否し、任意の設定やコールバックは透過しません。

[mysql2 3.24.5 の主機名検証](https://github.com/sidorares/node-mysql2/blob/v3.24.5/lib/base/connection.js)は DNS servername に依存します。証明書と名前の両方を検証する場合、IP 接続先は `CONFIG_ERROR` とし、証明書の DNS SAN に一致するホスト名を使います。明示的な `verifyIdentity: false` は証明書チェーンのみを検証します。`rejectUnauthorized: false` はサーバー認証を放棄し、暗号化だけでは相手の身元を確認できません。どちらかの検証を無効にすると固定のリスク警告を記録し、安全な構成とは扱いません。

```ts
// trustedCaPem は配置時の信頼設定から供給し、任意の接続先証明書をそのまま信頼しません。
const initialized = await reldb.init({ type: 'mysql', host: 'db.example.com', database: 'app', ssl: { ca: trustedCaPem } })
if (!initialized.success)
  throw new Error(initialized.error.message)
```

TLS テストには OpenSSL（Windows は Git 同梱版も可）とローカルのコンテナー転送が必要です。各実行で CA/秘密鍵を生成・削除し、信頼済み DNS、誤った CA/主機名の拒否、`REQUIRE X509` 認証、実際の `Ssl_cipher` を検証します。検証無効の接続を認証済み TLS の証拠にはしません。

#### SQLite の実行方式（非同期 worker）

better-sqlite3 は同期ドライバーなので、クエリは Node のメインイベントループをブロックします。WAL は DB ロックの並行性を改善しますが、同期呼び出しによるブロックは解消しません。専用 worker スレッドで SQLite を実行して処理を移せます（単一接続、任意設定、既定は `sync`）：

```ts
await reldb.init({
  type: 'sqlite',
  database: './data.db',
  sqlite: {
    executor: 'worker', // 'sync'（默认）| 'worker'
    walMode: true, // 默认 true
    workerConnectTimeoutMs: 10000, // worker 打开连接超时，默认 10000
  },
})
```

worker モードではクエリ、書き込み、トランザクションを worker スレッドで順番に実行します。公開 API と戻り値は同期モードと同じです。

#### 操作ログ

DB 設定の `operationLog` で SQL 操作ログを有効にできます。ログは reldb provider-base の DML 層で出力され、`reldb-main.ts` や各 raw provider で重複してラップしません。

```yaml
# config/_db.yml
type: sqlite
database: ./data/app.db
operationLog:
  read: false # query / get / queryPage
  write: false # DDL, execute / batch, tx.begin / tx.commit / tx.rollback
  maxLength: 1000 # 安全な件数サマリーの最大長。0は省略。SQL本文と値は記録しない
  level: debug # info | debug | trace，默认 debug
```

`core.config.load('db', ...)` で読み込む場合、`HAI_DB_TYPE`、
`HAI_DB_DATABASE`、`HAI_DB_OPERATIONLOG_LEVEL` などの規約に沿う変数が YAML より優先されます。

```ts
await reldb.init({
  type: 'sqlite',
  database: './data.db',
  operationLog: {
    read: true,
    write: true,
    maxLength: 500,
    level: 'debug',
  },
})
```

操作ログには固定の操作名、SQL 長、パラメーター数、バッチ件数を記録します。失敗時は、エラーコード、traceId、許可リストに含まれるマスキング済みのドライバーメッセージとスタックも保持します。SQL 全文、バインド値、接続設定をそのまま記録することはありません。

### トランザクション

3 種類の使用方法：

#### wrap（自動コミット/ロールバック）

コールバックが正常に戻ると、失敗した HaiResult を返した場合もコミットされます。各操作の結果を確認し、失敗時は例外を投げてロールバックしてください。wrap は TRANSACTION_FAILED を返します。元の業務エラーを保つ場合は下記の手動トランザクションを使用します。各例は初期化が成功し、users テーブルが作成済みであることを前提とします。

```ts
const result = await reldb.tx.wrap(async (tx) => {
  for (const name of ['Alice', 'Bob']) {
    const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', [name])
    if (!inserted.success)
      throw new Error(inserted.error.message, { cause: inserted.error })
  }
  return 'ok'
})
// 回调正常返回 → 自动提交；抛异常 → 自动回滚
```

#### begin + commit（手動コミット）

```ts
// 放在 async 业务函数内，失败时向调用方返回 HaiResult。
const txResult = await reldb.tx.begin()
if (!txResult.success)
  return txResult
const tx = txResult.data
try {
  for (const name of ['Alice', 'Bob']) {
    const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', [name])
    if (!inserted.success) {
      const rolledBack = await tx.rollback()
      return rolledBack.success ? inserted : rolledBack
    }
  }
  return await tx.commit()
}
catch (error) {
  const rolledBack = await tx.rollback()
  if (!rolledBack.success)
    return rolledBack
  throw error // 只传播非业务异常，由宿主边界处理。
}
```

#### begin + rollback（手動ロールバック）

```ts
// 独立脚本：试写后回滚，不保留用户数据。
const txResult = await reldb.tx.begin()
if (!txResult.success)
  throw new Error(txResult.error.message, { cause: txResult.error })
const tx = txResult.data
// 两个 API 均返回 HaiResult；同时失败时保留执行和回滚两份原因。
const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', ['Alice'])
const rolledBack = await tx.rollback()
if (!inserted.success && !rolledBack.success)
  throw new AggregateError([inserted.error, rolledBack.error], rolledBack.error.message)
if (!inserted.success)
  throw new Error(inserted.error.message, { cause: inserted.error })
if (!rolledBack.success)
  throw new Error(rolledBack.error.message, { cause: rolledBack.error })
```

#### トランザクション内での batch / queryPage

```ts
await reldb.tx.wrap(async (tx) => {
  const inserted = await tx.batch([
    { sql: 'INSERT INTO users (name) VALUES (?)', params: ['Alice'] },
    { sql: 'INSERT INTO users (name) VALUES (?)', params: ['Bob'] },
  ])
  if (!inserted.success)
    throw new Error(inserted.error.message, { cause: inserted.error })

  const page = await tx.queryPage<{ id: number, name: string }>({
    sql: 'SELECT id, name FROM users ORDER BY id',
    pagination: { page: 1, pageSize: 10 },
  })
  if (!page.success)
    throw new Error(page.error.message, { cause: page.error })
  return page.data
})
```

### Crud

`reldb.crud.table()` で単一テーブルの CRUD リポジトリーを作成できます。SQL の記述は不要です：

```ts
const userCrud = reldb.crud.table<{ id: number, name: string, email: string }>({
  table: 'users',
  idColumn: 'id', // 主键列，默认 'id'
  select: ['id', 'name', 'email'], // 查询列，默认 '*'
  createColumns: ['name', 'email'], // 允许插入的列
  updateColumns: ['name', 'email'], // 允许更新的列
  dbType: 'sqlite', // 数据库类型
})
```

#### create / createMany

```ts
// 单条插入
const result = await userCrud.create({ name: '张三', email: 'test@example.com' })
// result.data → { changes: 1, lastInsertRowid: 1 }

// 批量插入
await userCrud.createMany([
  { name: '用户A', email: 'a@test.com' },
  { name: '用户B', email: 'b@test.com' },
])
```

#### createOrUpdate

主キーが存在すれば更新し、存在しなければ作成します（upsert）：

```ts
const userCrud = reldb.crud.table<{ id: number, name: string, email: string }>({
  table: 'users',
  idColumn: 'id',
  createColumns: ['id', 'name', 'email'],
  updateColumns: ['name', 'email'],
  dbType: 'sqlite',
})

await userCrud.createOrUpdate({ id: 1, name: '张三', email: 'test@example.com' })
// 不存在 → 插入；已存在 → 更新 name、email
```

`BaseReldbCrudRepository` は `dbType` を自動取得するため、手動指定は不要です。

#### findById / getById / findAll / findPage

```ts
// 主键查找（不存在时返回 null）
const user = await userCrud.findById(1)
// user.data → { id: 1, name: '张三', email: 'test@example.com' } | null

// 主键获取（不存在时返回 RECORD_NOT_FOUND 错误）
const user2 = await userCrud.getById(1)
// user2.data → { id: 1, name: '张三', email: 'test@example.com' }

// 条件查询（where + params 占位符）
const actives = await userCrud.findAll({
  where: 'name LIKE ?',
  params: ['%张%'],
  orderBy: 'id DESC',
  limit: 10,
  offset: 0,
})

// 分页查询
const page = await userCrud.findPage({
  where: 'name LIKE ?',
  params: ['%张%'],
  orderBy: 'id DESC',
  pagination: { page: 1, pageSize: 20 },
})
// page.data → { items: [...], total: 100, page: 1, pageSize: 20 }
```

#### updateById / deleteById

```ts
await userCrud.updateById(1, { name: '李四' })
await userCrud.deleteById(1)
```

#### count / exists / existsById

```ts
const total = await userCrud.count({ where: 'name LIKE ?', params: ['%张%'] })
// total.data → 5

const has = await userCrud.exists({ where: 'email = ?', params: ['test@example.com'] })
// has.data → true

const found = await userCrud.existsById(1)
// found.data → true
```

#### トランザクション内での Crud

すべてのメソッドに `tx` を渡すことができ、対応するトランザクションのコンテキストへ自動的に切り替わります：

```ts
await reldb.tx.wrap(async (tx) => {
  const created = await userCrud.create({ name: 'Alice', email: 'alice@example.com' }, tx)
  if (!created.success)
    throw new Error(created.error.message, { cause: created.error })
  if (created.data.lastInsertRowid === undefined)
    throw new Error('Insert did not return an ID')
  const updated = await userCrud.updateById(created.data.lastInsertRowid, { name: 'Alice Smith' }, tx)
  if (!updated.success)
    throw new Error(updated.error.message, { cause: updated.error })
  const user = await userCrud.findById(created.data.lastInsertRowid, tx)
  if (!user.success)
    throw new Error(user.error.message, { cause: user.error })
  return user.data
})
```

### BaseReldbCrudRepository

業務リポジトリーは `BaseReldbCrudRepository` を継承し、`fields` でフィールドの対応を定義します。テーブル作成と型変換は自動です：

Unix ミリ秒には `BIGINT`（SQLite では 64 ビット INTEGER、PostgreSQL/MySQL では BIGINT）を使用します。PostgreSQL/MySQL の通常の INTEGER では現在のミリ秒値を保存できません。生 SQL/CRUD と基底リポジトリーは BIGINT のドライバー型（number/string/bigint）を保持します。number が必要な業務リポジトリーは変換時に安全な整数であることを検証し、精度の損失を防いでください。基底リポジトリーは TIMESTAMP を Date として読み取ります。

```ts
import type { DmlWithTxOperations, ReldbCrudFieldDefinition } from '@h-ai/reldb'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'

interface UserRow {
  id: number
  name: string
  email: string
  createdAt: Date
  updatedAt: Date
}

const USER_FIELDS: ReldbCrudFieldDefinition[] = [
  { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
  { fieldName: 'name', columnName: 'name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
  { fieldName: 'email', columnName: 'email', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
  { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
  { fieldName: 'updatedAt', columnName: 'updated_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
]

class UserRepository extends BaseReldbCrudRepository<UserRow> {
  constructor() {
    super(reldb, { table: 'users', idColumn: 'id', fields: USER_FIELDS })
  }

  /** 自定义查询方法 */
  async findByEmail(email: string) {
    return this.findAll({ where: 'email = ?', params: [email], limit: 1 })
  }

  /** 自定义方法中使用 this.sql(tx) 自动路由到事务 */
  async insertRaw(data: { name: string, email: string }, tx?: DmlWithTxOperations) {
    // 自定义原始写操作应先确保表已就绪（避免刚建库/建表较慢时的竞态）
    const ready = await this.ensureReady()
    if (!ready.success)
      return ready
    const now = Date.now()
    return this.sql(tx).execute(
      'INSERT INTO users (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [data.name, data.email, now, now],
    )
  }
}

// 使用
const repo = new UserRepository()
await repo.create({ name: '张三', email: 'test@example.com' })
const user = await repo.findById(1)

// 创建或更新（upsert）
await repo.createOrUpdate({ id: 1, name: '李四', email: 'test@example.com' })
// id=1 已存在 → 更新 name；不存在 → 插入新记录

// 跨仓库事务
const txResult = await reldb.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  await repo.create({ name: '用户A', email: 'a@test.com' }, tx)
  await repo.create({ name: '用户B', email: 'b@test.com' }, tx)
  await tx.commit()
}
```

### JSON パス操作

`reldb.json` で、複数のデータベースに共通する JSON パス操作の SQL 式を作成します。

パスは SQL/JSON Path（`$.key` / `$.key.subkey` / `$[0]`）に従い、各 DB の関数・演算子に自動変換されます。

| 操作      | SQLite         | PostgreSQL     | MySQL              |
| --------- | -------------- | -------------- | ------------------ |
| `extract` | `json_extract` | `#>` (text[])  | `JSON_EXTRACT`     |
| `set`     | `json_set`     | `jsonb_set`    | `JSON_SET`         |
| `insert`  | `json_insert`  | `jsonb_insert` | `JSON_INSERT`      |
| `remove`  | `json_remove`  | `#-` (text[])  | `JSON_REMOVE`      |
| `merge`   | `json_patch`   | `\|\| ::jsonb` | `JSON_MERGE_PATCH` |

すべてのメソッドは `{ sql, params }` の断片を返し、`reldb.sql.query` / `reldb.sql.execute` に直接組み込めます。

#### extract — JSON フィールド値の取得

```ts
// 用于 WHERE 条件
const { sql, params } = reldb.json.extract('settings', '$.theme')
const rows = await reldb.sql.query(
  `SELECT * FROM users WHERE ${sql} = ?`,
  [...params, '"dark"'],
)

// 用于 SELECT 列
const { sql, params } = reldb.json.extract('profile', '$.name')
const result = await reldb.sql.query(
  `SELECT id, ${sql} as display_name FROM users`,
  params,
)
```

#### set — JSON パスの設定（作成または置換）

```ts
const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
await reldb.sql.execute(
  `UPDATE users SET settings = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

#### insert — JSON パスへの挿入（未存在の場合のみ）

```ts
const { sql, params } = reldb.json.insert('data', '$.firstSeen', new Date().toISOString())
await reldb.sql.execute(
  `UPDATE events SET data = ${sql} WHERE id = ?`,
  [...params, eventId],
)
```

#### remove — JSON パスの削除

```ts
const { sql, params } = reldb.json.remove('settings', '$.deprecated')
await reldb.sql.execute(
  `UPDATE users SET settings = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

#### merge — JSON オブジェクトのマージ（RFC 7396 Merge Patch）

```ts
// 覆盖已有键、保留未提及键、将 null 键删除
const { sql, params } = reldb.json.merge('profile', {
  bio: '新简介',
  avatar: null, // 传入 null 表示删除该键
})
await reldb.sql.execute(
  `UPDATE users SET profile = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

`json.merge(column, patch)` は三つのバックエンドで RFC 7396 のオブジェクトパッチを実装します。未変更の入れ子キーを保持し、null が指定したキーを削除し、配列を全体置換します。PostgreSQL はパラメーター化した再帰 CTE を単一 SQL 内で適用し、関数の事前インストールやアプリ側の読み取り後の書き戻しを必要としません。パッチのルートは JSON シリアライズ可能なオブジェクトに限ります。列式は開発者の静的 SQL で、パスと値はパラメーターです。[RFC 7396](https://www.rfc-editor.org/rfc/rfc7396)・[PostgreSQL JSON 演算](https://www.postgresql.org/docs/16/functions-json.html)。

#### 完全な使用例

```ts
// 建表（含 JSON 列）
await reldb.ddl.createTable('products', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  meta: { type: 'JSON' },
})

// 插入初始 JSON
await reldb.sql.execute(
  `INSERT INTO products (meta) VALUES (?)`,
  [JSON.stringify({ status: 'draft', tags: ['new'], version: 1 })],
)

// 设置字段
const { sql: setSql, params: setParams } = reldb.json.set('meta', '$.status', 'published')
await reldb.sql.execute(`UPDATE products SET meta = ${setSql} WHERE id = ?`, [...setParams, 1])

// 提取字段（用于过滤）
const { sql: exSql, params: exParams } = reldb.json.extract('meta', '$.status')
const published = await reldb.sql.query(
  `SELECT * FROM products WHERE ${exSql} = ?`,
  [...exParams, '"published"'],
)

// 合并更新
const { sql: mSql, params: mParams } = reldb.json.merge('meta', { version: 2, reviewer: 'admin' })
await reldb.sql.execute(`UPDATE products SET meta = ${mSql} WHERE id = ?`, [...mParams, 1])

// 删除字段
const { sql: rmSql, params: rmParams } = reldb.json.remove('meta', '$.reviewer')
await reldb.sql.execute(`UPDATE products SET meta = ${rmSql} WHERE id = ?`, [...rmParams, 1])
```

### エラー処理

すべての操作は `HaiResult<T>` を返し、`result.success` で成功・失敗を判定します。

```ts
import { HaiReldbError, reldb } from '@h-ai/reldb'

const result = await reldb.sql.query('SELECT * FROM users')
if (!result.success) {
  switch (result.error.code) {
    case HaiReldbError.NOT_INITIALIZED.code:
      // 请先调用 reldb.init()
      break
    case HaiReldbError.QUERY_FAILED.code:
      // SQL 执行错误
      break
    case HaiReldbError.CONSTRAINT_VIOLATION.code:
      // 约束违反（如唯一约束、外键等）
      break
  }
}
```

主なエラーコード：

| エラーコード                         | code            | 説明                       |
| ------------------------------------ | --------------- | -------------------------- |
| `HaiReldbError.NOT_INITIALIZED`      | `hai:reldb:010` | 未初期化                   |
| `HaiReldbError.CONNECTION_FAILED`    | `hai:reldb:001` | 接続に失敗                 |
| `HaiReldbError.QUERY_FAILED`         | `hai:reldb:002` | 検索に失敗                 |
| `HaiReldbError.CONSTRAINT_VIOLATION` | `hai:reldb:003` | 制約違反                   |
| `HaiReldbError.TRANSACTION_FAILED`   | `hai:reldb:004` | トランザクションに失敗     |
| `HaiReldbError.DDL_FAILED`           | `hai:reldb:020` | DDL 操作に失敗             |
| `HaiReldbError.CONFIG_ERROR`         | `hai:reldb:013` | 設定エラー                 |
| `HaiReldbError.TIMEOUT`              | `hai:reldb:009` | MySQL 接続取得の期限超過   |
| `HaiReldbError.POOL_EXHAUSTED`       | `hai:reldb:011` | MySQL 接続待機キューが満杯 |

`BaseReldbCrudRepository` の派生クラスで独自 SQL を実行する前に `await this.ensureReady()` を確認します。構築時に建表を開始するだけなので、サービス init は候補の準備完了後に公開します。PostgreSQL の自動コミットによる単一の `CREATE TABLE/INDEX IF NOT EXISTS` は、`23505/pg_class_relname_nsp_index`（建表は `pg_type_typname_nsp_index` も対象）の競合、または建表時にサーバー routine が `heap_create_with_catalog` / `TypeCreate` である `42710` の行型競合に限り、DDL/SQL の両入口で一度だけ再実行します。再試行も失敗した場合はエラーを返します。トランザクション、業務の一意制約、その他の失敗は再試行しません。初期接続確認の一時 DNS エラー `EAI_AGAIN` は 250/500 ms 間隔で最大三回試行し、業務 SQL は再送しません。

## 本番の共有状態

本番は PostgreSQL/MySQL が必須です。ファイルを含む SQLite は開発・明示的テスト用であり、ホスト間の共有状態を保証しません。 NODE_ENV または HAI_CORE_ENV が production の場合、初期化成功前に検証します。明示的な HAI_E2E=1/HAI_E2E_MOCK=1 テストのみ除外します。 [状態・並行制御・復旧範囲（中国語）](../../.agents/instructions/distributed-state.md)。

## モジュールのスキーマ移行

`schemaColumns(reldb, table, sql?)` は実際の列を読み取ります。`migrateSchema(reldb, module, steps, { dryRun: true })` は台帳を作成しません。各モジュールが手順を所有し、`hai_schema_migrations` に版を記録します。SQLite/PostgreSQL はトランザクション、MySQL の暗黙 DDL コミットには再入可能な手順が必要です。失敗時は版を進めず、実構造を再確認して再試行します。新しい台帳へのダウングレードは拒否します。旧書込を停止し DB/セッションキャッシュをバックアップしてください。復旧は互換 DB とバイナリを一緒に戻します。[更新ガイド](../../docs/usage/README.ja.md)を参照。

## エラー表示とログの関連付け

一意制約違反は `HaiReldbError.DUPLICATE_ENTRY`（409）に統一し、タイムアウトや待機列満杯など既存のコードは保持します。翻訳済みメッセージやドライバー文字列ではなくコードで分岐してください。ログには code/schema/routine/constraint とスタック行番号を残し、数値のバインド値でこれらの診断識別子を隠しません。

HTTP エラーには安全な翻訳文と追跡番号を含めます。ToastContainer は番号を既定で非表示にし、調査情報のアイコンから表示・コピーできます。同じ ID を error.traceId と X-Trace-Id に返します。requestId を traceId として共有し、ブラウザーとサーバーのログを関連付けます。脱機密化した例外・スタック・操作情報はログに残し、内部 cause/ext は公開しません。項目検証は翻訳済みの項目名とメッセージだけを返します。

HTTP/UI 境界には core.error.toPublic(error, traceId?)、再翻訳後の表示には core.error.formatMessage(error) を使い、ID を重複追加しません。ログには完全な Error を渡してください。DB ログにはドライバーコード、脱機密化したメッセージ・スタック、表・列を残し、SQL 本文、バインド値と接続認証情報を記録しません。

## 開発とテスト

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL のテストには Docker が必要です。

ソースの JSDoc は[共通規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)に従います。公開例は実際の公開入口、内部例は元のモジュールスコープで型検査します。ビルド後に `pnpm check:jsdoc --package reldb` を実行してください。例の型検査は実バックエンドの動作検証の代わりにはなりません。

## ライセンス

Apache-2.0
