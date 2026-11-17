# @h-ai/feedback API リファレンス

<!-- translation: partial -->

[原文（中国語）](feedback.md) · [設定](../configuration/feedback.ja.md) · [データ構造](../data/feedback.ja.md)

<a id="quick-start"></a>

ブラウザークライアントで上限付きの証跡を集め、下書きを送信します。所有権の割り当てと上限の強制はサーバーで行います。添付のダウンロードや出力前に結果を確認します。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `feedback.submit`, `list`, `get`, `getEvidence`, `setStatus`, `retry` | 報告の受理、許可済み報告・証跡の参照、処理状態の管理。 | `await feedback.get(context, id)` |
| `feedback.appendEvidence`, `completeCollection`, `uploadAttachment`, `getAttachment` | 報告の証跡を集め、添付オブジェクトを管理。 | `await feedback.completeCollection(input)` |
| `feedback.export`, `getExport`, `runJobs` | 出力を依頼・取得し、待機中のジョブを実行。 | `await feedback.runJobs()` |
| `feedbackClient.init`, `prepare`, `captureScreenshot`, `getDraft`, `getView`, `releasePreviews` | クライアントの準備、画面の記録、下書きの取得、プレビューの解放。 | `feedbackClient.getDraft()` |
| `feedbackClient.addFiles`, `annotate`, `record`, `submit`, `flush`, `exportDraft`, `saveDraft`, `pause`, `close` | 下書きと証跡の管理、送信・出力、収集の一時停止と終了。 | `feedbackClient.close()` |

追加の設定項目や利用例は[中国語リファレンス](feedback.md)に掲載しています。
