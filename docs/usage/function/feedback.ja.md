# @h-ai/feedback API リファレンス

<!-- translation: partial -->

[原文（中国語）](feedback.md) · [設定](../configuration/feedback.ja.md) · [データ構造](../data/feedback.ja.md)

<a id="quick-start"></a>

## クイックスタート

Core、RelDB、非公開 Storage の後に Feedback を初期化します。Reach 通知を使う場合は Reach も先に準備します。このサーバー例は信頼できる context と再送時に共用する submissionId を受け取ります。依存サービスを閉じる前に feedback.close() の結果を確認します。

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

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。value は HaiResult.success を確認し元エラーを保持します。独立したテストデータと明示した後片付けを使います。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="service"></a>

### サービスと採取処理の準備：`feedback`

共有 DB・ストレージ・信頼する文脈を使って受付・採取・通知・期限管理を行います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedback.init` | 必要な依存先でサービスを初期化 | 先按快速开始连接数据库并准备依赖；`config` 必填，`options?` 可选 | `void` | `await feedback.init(config)` |
| `feedback.close` | ワーカーを停止して状態を解放 | 共享依赖由应用关闭；无 | `void` | `await feedback.close()` |
| `feedback.runJobs` | 実行可能なバックグラウンド処理を実行 | 无参数 | `{ processed: number }` | `await feedback.runJobs()` |

#### 利用例：サービスと採取処理の準備

```ts
const jobs = value(await feedback.runJobs()) // this round's processed count
```

init の入力は入門例の通りで、成功時の業務データはありません。runJobs は引数なしで今回の結果を返し、close はこのインスタンスの処理を停止します。

出力は成功時の HaiResult.data です。認証済みのサーバー側の情報から context を作り、success を確認します。

収集完了は現在の収集を終える処理で、通知の完了までは待ちません。添付とエクスポートは権限を確認するサーバーのエンドポイントを通じて取得します。

未翻訳：証拠収集、非公開添付、エクスポート、再試行の詳しい手順。[中国語の該当節](feedback.md#api-reference)を参照してください。

[引数と手順の詳細](feedback.md#service)

<a id="reports"></a>

### 報告の提出・照会・処理：`feedback`

受付 ID を保存し、権限のある担当者が現場を調べ、版を確認して状態を更新します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedback.submit` | フィードバックを受け付け | input, context | `FeedbackReport` | `await feedback.submit(reportInput, context)` |
| `feedback.list` | 絞り込んでページ取得 | input, context | `PaginatedResult<FeedbackReport>` | `await feedback.list({ page: 1, pageSize: 20 }, context)` |
| `feedback.get` | 詳細を取得 | id, context | `FeedbackDetail` | `await feedback.get(reportId, context)` |
| `feedback.getEvidence` | 診断証拠をページ取得 | input, context | `PaginatedResult<FeedbackEvidence>` | `await feedback.getEvidence({ id: reportId, page: 1, pageSize: 20 }, context)` |
| `feedback.setStatus` | 版を照合して処理状態を更新 | input, context | `FeedbackReport` | `await feedback.setStatus(statusUpdate, context)` |
| `feedback.retry` | 指定した失敗処理を再投入 | input, context | `void` | `await feedback.retry(retryInput, context)` |

#### 利用例：報告の提出・照会・処理

create/read/process を認可されたサーバーコンテキストを使います。ID は submit、expectedVersion は直前の詳細から取得します。再通知は復旧可能な失敗に対して行い、受理は既読を意味しません。

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function processReport(context: FeedbackContext, submissionId: string) {
  const report = value(await feedback.submit({ appId: 'orders', submissionId }, context))
  const page = value(await feedback.list({ page: 1, pageSize: 20 }, context)) // authorized report page
  const detail = value(await feedback.get(report.id, context))
  const evidence = value(await feedback.getEvidence({ id: report.id, page: 1, pageSize: 20 }, context))
  const handled = value(await feedback.setStatus({ id: report.id, status: 'handled', expectedVersion: detail.report.version }, context))
  return { report, page, evidence, handled } // same report ID; handled has the new version
}

async function retryNotification(id: string, context: FeedbackContext) {
  return feedback.retry({ id, target: 'notify' }, context) // HaiResult<void>, caller checks success
}
```

<a id="evidence"></a>

### 資料の追加と添付の読取：`feedback`

追加入力も元の報告と主体に結び、添付の型・バイト数・要約値を検査します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedback.appendEvidence` | 診断証拠を追加 | input, context | `{ acknowledged, evidenceRevision }` | `await feedback.appendEvidence(evidence, context)` |
| `feedback.completeCollection` | 証拠収集の完了を記録 | input, context | `FeedbackReport` | `await feedback.completeCollection({ id: reportId, revision: 1 }, context)` |
| `feedback.uploadAttachment` | 許可した添付をアップロード | input, context | `FeedbackAttachment` | `await feedback.uploadAttachment(upload, context)` |
| `feedback.getAttachment` | 許可した添付を取得 | input, context | `FeedbackAttachmentData` | `await feedback.getAttachment({ id: reportId, attachmentId }, context)` |

#### 利用例：資料の追加と添付の読取

受理済み報告 ID と同じ帰属のコンテキストを使います。証拠は安定した id/source/sequence を持ちます。アップロードは宣言済み添付のバイト列で、ID の変更で制限を回避できません。

```ts
import type { FeedbackContext, FeedbackUploadInput } from '@h-ai/feedback'

async function appendMaterials(context: FeedbackContext, upload: FeedbackUploadInput) {
  const id = upload.id
  const receipt = value(await feedback.appendEvidence({ id, evidence: [{
    id: 'event-demo-1', source: 'browser', sequence: 1, kind: 'business',
    timestamp: Date.now(), data: { state: 'checkout-failed' },
  }] }, context)) // acknowledged IDs and evidenceRevision
  const attachment = value(await feedback.uploadAttachment(upload, context)) // saved attachment metadata
  const bytes = value(await feedback.getAttachment({ id, attachmentId: upload.attachmentId }, context))
  const completed = value(await feedback.completeCollection({ id, missing: [] }, context)) // updated report
  return { receipt, attachment, bytes, completed }
}
```

<a id="exports"></a>

### 診断包の出力と参照：`feedback`

証拠の版を固定して出力タスクを作り、完了後に ZIP を得ます。閲覧で業務を再実行しません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedback.export` | 指定証拠版のオフラインパッケージを要求 | input, context | `FeedbackJob` | `await feedback.export(exportInput, context)` |
| `feedback.getExport` | 完成した出力を取得 | input, context | `FeedbackAttachmentData` | `await feedback.getExport({ id: reportId, jobId }, context)` |

#### 利用例：診断包の出力と参照

認可済み管理者が報告 ID を指定すると export はジョブ ID を返します。この例は一度照会します。未完了の CONFLICT は空 ZIP ではなく、有界待機後に再照会します。

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function requestArchive(id: string, context: FeedbackContext) {
  const job = value(await feedback.export({ id }, context)) // persistent job receipt
  return feedback.getExport({ id, jobId: job.id }, context) // HaiResult<FeedbackAttachmentData>
}
```

<a id="browser-capture"></a>

### ブラウザの現場と下書き：`createFeedbackClient`

製品セッションごとにインスタンスを作り、画面を開く前に現場を固定し、プレビューと主体の下書きを解放します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedbackClient.init` | ブラウザー証拠収集を開始 | `FeedbackClientConfig` | `Promise<HaiResult<void>>` | `await feedbackClient.init(config)` |
| `feedbackClient.prepare` | 今回のフィードバック証拠を準備 | `—` | `Promise<HaiResult<FeedbackDraft>>` | `await feedbackClient.prepare()` |
| `feedbackClient.captureScreenshot` | ページの画面を取得 | `attachmentId?: string` | `Promise<HaiResult<void>>` | `await feedbackClient.captureScreenshot()` |
| `feedbackClient.getDraft` | 現在の下書きを取得 | `—` | `FeedbackDraft \| undefined` | `feedbackClient.getDraft()` |
| `feedbackClient.getView` | 表示用状態を取得 | `—` | `FeedbackDraftView` | `feedbackClient.getView()` |
| `feedbackClient.releasePreviews` | 一時プレビューを解放 | `—` | `void` | `feedbackClient.releasePreviews()` |
| `feedbackClient.addFiles` | 選択したファイルを追加 | `files: readonly File[], removedAttachmentIds?: readonly string[]` | `Promise<HaiResult<void>>` | `await feedbackClient.addFiles(files, removedAttachmentIds)` |
| `feedbackClient.annotate` | 画像に注釈・マスクを反映 | `attachmentId: string, FeedbackImageAnnotation` | `Promise<HaiResult<void>>` | `await feedbackClient.annotate(attachmentId, annotation)` |
| `feedbackClient.record` | アプリの診断情報を記録 | `kind, data; requestId?, errorId?` | `void` | `feedbackClient.record({ kind: 'business', data: { state: 'ready' } })` |
| `feedbackClient.submit` | 現在の下書きを送信 | `FeedbackClientSubmitInput?` | `Promise<HaiResult<FeedbackReport>>` | `await feedbackClient.submit({ description: 'Checkout failed' })` |
| `feedbackClient.flush` | 未確認の証拠を送信 | `—` | `Promise<HaiResult<void>>` | `await feedbackClient.flush()` |
| `feedbackClient.exportDraft` | ローカル診断パッケージを生成 | `—` | `Promise<HaiResult<Uint8Array>>` | `await feedbackClient.exportDraft()` |
| `feedbackClient.saveDraft` | ローカル下書きを保存 | `—` | `Promise<HaiResult<FeedbackSaveResult>>` | `await feedbackClient.saveDraft()` |
| `feedbackClient.pause` | 収集を一時停止 | `—` | `void` | `feedbackClient.pause()` |
| `feedbackClient.close` | 収集を終了して解放 | `{ discard?: boolean }` | `Promise<void>` | `await feedbackClient.close({ discard: true })` |

#### 利用例：ブラウザの現場と下書き

prepare で現場を固定して確認し、submit で確実に送信します。受理後もブラウザーの追加転送とサーバー収集は続く場合があります。

![フィードバック：現場固定・受理・後続の収集](../images/function-feedback-collection.ja.svg)

初回送信で内容を固定し、再試行も同じ ID・内容を使います。受理は添付・業務証拠・通知の完了ではなく、収集状態を確認します。独立 Webhook は complete／partial／failed を待ち、収集失敗でも動作します。close は録画・監視・プレビューを解放します。

```ts
import type { FeedbackClientConfig } from '@h-ai/feedback/client'
import { createFeedbackClient } from '@h-ai/feedback/client'
export async function capture(config: FeedbackClientConfig) {
  const feedbackClient = createFeedbackClient()
  value(await feedbackClient.init(config))
  try {
    feedbackClient.record({ kind: 'business', data: { state: 'ready' } })
    const draft = value(await feedbackClient.prepare())
    const current = feedbackClient.getDraft() // current draft or undefined
    const view = feedbackClient.getView() // preview URLs, evidence and missing materials
    value(await feedbackClient.captureScreenshot()) // refreshes the screenshot attachment
    value(await feedbackClient.addFiles([new File(['demo log'], 'demo.txt', { type: 'text/plain' })]))
    const receipt = value(await feedbackClient.submit({ description: 'Checkout failed' })) // accepted report ID/number
    value(await feedbackClient.flush()) // resumes pending evidence upload
    const archive = value(await feedbackClient.exportDraft()) // Uint8Array ZIP
    const saved = value(await feedbackClient.saveDraft()) // inspect saved.status; cancelled is not a saved file
    feedbackClient.releasePreviews() // releases generated object URLs
    feedbackClient.pause() // pauses active collection while retaining the draft
    return { draft, receipt, archive, saved }
  }
  finally {
    await feedbackClient.close({ discard: true })
  }
}
```

config.actions はアプリの型付き HTTP 適合処理です。撮影・ファイル・注釈・送信・保存の入出力は以下を参照してください。保存の成功結果でも利用者取消の場合があります。

[引数と手順の詳細](feedback.md#browser-capture)

annotation は画像上の選択領域、attachmentId は同じ下書きから取得します。submit 前に呼び、成功後は getView を更新します。

```ts
import type { FeedbackBrowserClient } from '@h-ai/feedback/client'

async function redactImage(client: FeedbackBrowserClient, attachmentId: string,
  annotation: Parameters<FeedbackBrowserClient['annotate']>[1]) {
  const changed = await client.annotate(attachmentId, annotation)
  if (!changed.success)
    return changed
  return client.getView() // refreshed preview and attachment state
}
```
