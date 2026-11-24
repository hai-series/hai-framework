# @h-ai/reldb データ構造

[简体中文](reldb.md) · [English](reldb.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/reldb.ja.md) · [API リファレンス](../function/reldb.ja.md)

アプリが注文を照会すると、RelDB は現在の接続で SQL を実行し、アプリが定義した列を返します。テーブル、制約、保持期間はテーブルを定義したアプリやモジュールが管理します。

<a id="database-connections"></a>

## テーブル・接続・トランザクション

テーブル、インデックス、列の既定値は呼び出し側のアプリやモジュールが定義します。RelDB が管理するのは接続または接続プールとトランザクションです。固有のキャッシュキーは作成しません。

<a id="example-data"></a>

### アプリが定義する注文表

RelDB は DB アクセスを提供し、注文の項目はアプリが決めます。

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

user-42 の注文は1200通貨補助単位で、note の null は備考なしです。自動生成される組み込み表ではありません。
