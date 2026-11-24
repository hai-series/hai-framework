# @h-ai/reldb データ構造

[简体中文](reldb.md) · [English](reldb.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/reldb.ja.md) · [API リファレンス](../function/reldb.ja.md)

アプリが注文を照会すると、RelDB は現在の接続で SQL を実行し、アプリが定義した列を返します。テーブル、制約、保持期間はテーブルを定義したアプリやモジュールが管理します。

<a id="database-connections"></a>

## テーブル・接続・トランザクション

RelDB は接続や接続プールと、現在のプロセスで取得したトランザクションハンドルを管理します。[IAM](iam.ja.md)、[Runner](runner.ja.md)、[Scheduler](scheduler.ja.md)、[Audit](audit.ja.md) などのモジュールは独自のテーブルを定義して作成します。RelDB 自体が作成する業務テーブルとキャッシュキーはどちらも 0 件です。

| データ | 管理者 | アクセスと保持 |
| --- | --- | --- |
| 業務テーブルとインデックス | テーブルを定義するアプリまたはモジュール | `reldb.ddl` でスキーマを管理し、`reldb.sql` やリポジトリでレコードを読み書きします。永続データの保持と移行は呼び出し側が決めます。 |
| SQLite データベースのファイル | アプリまたはデプロイ環境 | 設定のパスに保存します。開発時に `:memory:` で作成したデータベースは接続を閉じると解放されます。 |
| 接続・プール・トランザクションハンドル | 現在のプロセスの RelDB インスタンス | `reldb.init()` が接続またはプールを開きます。トランザクションは、アプリがコミットまたはロールバックするまで取得した接続を保持します。`reldb.close()` が接続リソースを解放します。 |

<a id="example-data"></a>

### アプリが定義する注文表

アプリが定義した注文テーブルから取得した 4 列の例です。注文 `order-42` は顧客 `user-42` に紐づき、金額は補助単位で 1200、人民元で 12 元です。`note` の `null` は、まだ備考がないことを示します。

```json
[
  {
    "id": "order-42",
    "user_id": "user-42",
    "total_cents": 1200,
    "note": null
  }
]
```

<a id="result-examples"></a>

### 注文の照会と更新の結果

アプリが 21 件の注文を一定の順序でページに分けて取得します。1 ページが 10 件のとき、第 3 ページには `order-42` だけが残ります。`reldb.sql.queryPage()` は成功時に次のオブジェクトを返します。`total` は条件に一致した全件数、`items` は現在のページに含まれるレコードです。

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "order-42",
        "user_id": "user-42",
        "total_cents": 1200,
        "note": null
      }
    ],
    "total": 21,
    "page": 3,
    "pageSize": 10
  }
}
```

アプリがパラメーター付きの `UPDATE` で注文に備考を追加すると、`reldb.sql.execute()` はドライバーが報告する影響行数を返します。この例は成功結果の `success` と `data.changes` を抜粋したものです。トランザクション内で更新した場合、備考の保存はコミットの成功を待って確認します。

```json
{
  "success": true,
  "data": { "changes": 1 }
}
```

[ページ検索](../function/reldb.ja.md#sql) · [トランザクションとコミット結果](../function/reldb.ja.md#transactions)

<a id="schema-migration-checks"></a>

### 既存の SQLite テーブルの主キーを確認する

既存の SQLite の注文テーブルでは、`PRAGMA table_info(orders)` でテキスト列 `id` の `pk` と `notnull` を確認し、`SELECT COUNT(*) AS total FROM orders WHERE id IS NULL` で既存のレコードを調べます。`primaryKey: true, notNull: true` を指定した新しいテキスト列では、どちらの値も 1 になります。旧版で作成したテーブルには空値を許すものがあります。制約を再構築する前に該当レコードの扱いを決め、移行後にデータを読み戻して確認します。

### 既存の MySQL 制約と PostgreSQL 部分インデックスを点検する

旧版の MySQL で `addColumn()` を使って注文明細に `order_id` を追加した場合は、`SHOW CREATE TABLE order_items` で外部キーが `orders(id)` を参照しているか、削除・更新時の動作が定義どおりかを確認します。制約が欠けている場合は、対応する注文が存在しない明細がないかを調べてから、アプリケーションの移行で制約を追加します。同名のインデックスを使用する可能性のあるテーブルでは、`SHOW INDEX FROM order_items` と `SHOW INDEX FROM orders` を個別に実行し、所属テーブル、キー列の順序、一意性を確認します。

PostgreSQL では、`SELECT pg_get_indexdef(to_regclass('public.orders_pending_idx'))` で既存のインデックス定義と `WHERE` 句を確認できます。実際の条件を現在の `prepareSchema()` の定義と照合します。条件を変更する場合は、インデックスを明示的に移行してからスキーマ準備を再実行します。
