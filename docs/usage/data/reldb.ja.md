# @h-ai/reldb データ構造

[原文（中国語）](reldb.md) · [設定](../configuration/reldb.ja.md) · [API リファレンス](../function/reldb.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### アプリが定義する注文表

対応する構造：`application table: orders`。

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

## 項目・保存・削除のリファレンス

テーブル、インデックス、列の既定値は呼び出し側のアプリやモジュールが定義します。RelDB が管理するのは接続または接続プールとトランザクションです。固有のキャッシュキーは作成しません。
