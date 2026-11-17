# @h-ai/feedback API リファレンス

<!-- translation: partial -->

[原文（中国語）](feedback.md) · [設定](../configuration/feedback.ja.md) · [データ構造](../data/feedback.ja.md)

<a id="quick-start"></a>

## クイックスタート

ブラウザークライアントで上限付きの証跡を集め、下書きを送信します。所有権の割り当てと上限の強制はサーバーで行います。添付のダウンロードや出力前に結果を確認します。

```ts
import type { FeedbackContext } from '@h-ai/feedback'
import { feedback } from '@h-ai/feedback'

// 为 orders 初始化反馈服务。本地开发通过日志查看受理状态。
const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  notificationMode: 'console',
  adminUrl: 'https://app.example.test/admin/feedback',
})
if (!initialized.success)
  throw new Error(initialized.error.message)

export async function submitFeedback(context: FeedbackContext, submissionId: string) {
  // 受理成功返回含编号的报告。遇到失败时，调用方读取 error。
  return feedback.submit({ appId: 'orders', submissionId }, context)
}
```

<a id="api-reference"></a>

## API 一覧

出力は成功時の HaiResult.data です。認証済みのサーバー側の情報から context を作り、success を確認します。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `feedback.init` | 必要な依存先でサービスを初期化 | `config, options?` | `void` | `await feedback.init(config)` |
| `feedback.close` | ワーカーを停止して状態を解放 | なし | `void` | `await feedback.close()` |
| `feedback.submit` | 範囲にひも付けて報告を受け付け後続作業を登録 | `input, context` | `FeedbackReport` | `await feedback.submit(reportInput, context)` |
| `feedback.list` | 絞り込んだ報告をページ取得 | `input, context` | `PaginatedResult<FeedbackReport>` | `await feedback.list({ page: 1, pageSize: 20 }, context)` |
| `feedback.get` | 報告、添付、履歴、タスクを取得 | `id, context` | `FeedbackDetail` | `await feedback.get(reportId, context)` |
| `feedback.getEvidence` | 報告の証拠をページ取得 | `input, context` | `PaginatedResult<FeedbackEvidence>` | `await feedback.getEvidence({ id: reportId, page: 1, pageSize: 20 }, context)` |
| `feedback.setStatus` | 報告の処理状態を更新 | `input, context` | `FeedbackReport` | `await feedback.setStatus(statusUpdate, context)` |
| `feedback.appendEvidence` | 証拠を追記し受領済み ID を返す | `input, context` | `{ acknowledged, evidenceRevision }` | `await feedback.appendEvidence(evidence, context)` |
| `feedback.completeCollection` | 現在の版の収集を完了 | `input, context` | `FeedbackReport` | `await feedback.completeCollection({ id: reportId, revision: 1 }, context)` |
| `feedback.uploadAttachment` | 認可された添付データを保存 | `input, context` | `FeedbackAttachment` | `await feedback.uploadAttachment(upload, context)` |
| `feedback.getAttachment` | 範囲内の非公開添付を取得 | `{ id, attachmentId }, context` | `FeedbackAttachmentData` | `await feedback.getAttachment({ id: reportId, attachmentId }, context)` |
| `feedback.retry` | 再試行できる失敗タスクを再登録 | `input, context` | `void` | `await feedback.retry(retryInput, context)` |
| `feedback.export` | 報告の版のエクスポートを予約または再利用 | `input, context` | `FeedbackJob` | `await feedback.export(exportInput, context)` |
| `feedback.getExport` | 期限内に完了済みエクスポートを取得 | `{ id, jobId }, context` | `FeedbackAttachmentData` | `await feedback.getExport({ id: reportId, jobId }, context)` |
| `feedback.runJobs` | ワーカーを手動で一回実行 | なし | `{ processed: number }` | `await feedback.runJobs()` |

収集完了は現在の収集を終える処理で、通知の完了までは待ちません。添付とエクスポートは権限を確認するサーバーのエンドポイントを通じて取得します。

未翻訳：証拠収集、非公開添付、エクスポート、再試行の詳しい手順。[中国語の該当節](feedback.md#api-reference)を参照してください。
