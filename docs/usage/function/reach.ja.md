# @h-ai/reach API リファレンス

<!-- translation: partial -->

[原文（中国語）](reach.md) · [設定](../configuration/reach.ja.md) · [データ構造](../data/reach.ja.md)

<a id="quick-start"></a>

Reach と設定済みバックエンドを初期化します。プロバイダーと信頼できる宛先を指定して送信します。キュー配送を再試行するかは記録された状態から判断します。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `reach.send` | メッセージを送信、または配送キューに登録。 | `await reach.send(message)` |
| `reach.template.resolve`, `save`, `saveBatch`, `remove`, `list`, `render` | テンプレートの解決、保存、列挙、変数を使った描画。 | `await reach.template.list()` |
| `reach.queue.get`, `list`, `requeueDead`, `resolveUnknown` | 配送状態を読み取り、キューの復旧や結果の照合を行う。 | `await reach.queue.get(queueId)` |

追加の設定項目や利用例は[中国語リファレンス](reach.md)に掲載しています。
