# @h-ai/runner API リファレンス

[原文（中国語）](runner.md) · [設定](../configuration/runner.ja.md) · [データ構造](../data/runner.ja.md)

<a id="quick-start"></a>

データベースの後に Runner を初期化します。API からジョブを登録できますが、ハンドラーを実行するのは実行ノードだけです。登録の結果が不明なら、同じスコープと冪等キーで既存ジョブを調べます。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `runner.init(config)`, `close()`, `isExecutor`, `environment(id)` | 初期化・終了と、実行役割・設定済み環境の確認。 | `runner.environment('documents')` |
| `runner.register(kind, handler)`, `registerWarmPool(pool)` | ワーカーに信頼できるハンドラーまたは予熱プールを登録。 | `runner.register(kind, handler)` |
| `runner.submit(request)`, `find(scope, kind, key)`, `get(scope, id)` | ジョブを登録し、重複防止キーまたは ID で取得。 | `await runner.get(scope, id)` |
| `runner.cancel(scope, id)`, `events(scope, id, after?, limit?)` | キャンセルを依頼、または位置指定でイベントを取得。 | `await runner.events(scope, id, 0, 50)` |
| `runner.reconcileUnknown(scope, id, review)` | 結果不明のジョブを確認した記録を保存。再実行の前に外部処理の結果を確認。 | `await runner.reconcileUnknown(scope, id, review)` |
