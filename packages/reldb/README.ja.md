# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

共通の `reldb` オブジェクトで SQLite、PostgreSQL、MySQL を操作するリレーショナルデータベースモジュールです。

## クイックスタート

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

PostgreSQL の複数ノードでスキーマを準備する場合は `reldb.prepareSchema(key, ({ ddl, sql }) => ...)` を使用します。コールバックはロック付きトランザクションで実行され、失敗時にロールバックされます。コールバック内では渡された操作を使用し、外部処理はトランザクションの外で実行します。

## 設定一覧

生成プロジェクトは `config/_db.yml` を使用します。アプリで設定を取り込む入口は `reldb.init(config)` です。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/reldb.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/reldb.md)（中国語）を参照してください。

- `init` / `close` / `config` / `isInitialized` — データベース接続のライフサイクル管理
- `ddl` / `schemaColumns` / `prepareSchema` — テーブル構造の定義・準備・確認
- `sql` / `crud` / `tx` / `pagination` / `json` — SQL、CRUD、トランザクション、ページング、JSON パスの利用

## データ構造

モジュール独自のデータベーステーブルは作成しません。

接続プール、アプリテーブル、DDL の規約、トランザクション状態については[データ構造](../../docs/usage/data/reldb.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL のテストには Docker が必要です。

ソースの JSDoc は[共通規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)に従います。公開例は実際の公開入口、内部例は元のモジュールスコープで型検査します。ビルド後に `pnpm check:jsdoc --package reldb` を実行してください。例の型検査は実バックエンドの動作検証の代わりにはなりません。

## ライセンス

Apache-2.0
