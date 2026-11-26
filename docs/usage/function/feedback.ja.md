# @h-ai/feedback API リファレンス

[简体中文](feedback.md) · [English](feedback.en.md) · [設定](../configuration/feedback.ja.md) · [データ構造](../data/feedback.ja.md)

<a id="feedback-workflow"></a>

## 全体の流れ

ログインした利用者と処理権限を持つ担当者は、同じ問題票でやり取りします。「自分のフィードバック」で返信と処理結果を確認できます。担当者は権限に基づく共通一覧を使います。

![利用者の提出から担当者の返信と追加情報の依頼、利用者の補足、処理完了まで](../images/function-feedback-collection.ja.svg)

<a id="feedback-steps"></a>

## 手順

1. **資料を確認して提出。** ログインしたページで「フィードバック」を開き、現在のスクリーンショット、直前のブラウザーログ、操作リプレイを確認します。撮り直し、資料の除外、無音の画面録画ができます。説明やファイルを追加し、必要ならサーバーログを選択して送信します。資料は問題票と一緒に保存され、状態は「未処理」になります。
2. **確認。** 「自分のフィードバック」で問題票を開き、最初の投稿の画像、ログ、リプレイ、録画を確認します。担当者は共通の管理一覧から同じ問題票を開きます。
3. **返信と追加情報の依頼。** 双方の返信に画像やファイルを添付できます。担当者は追加情報の依頼にも添付できます。依頼を送ると「利用者の補足待ち」になります。
4. **補足。** 同じ問題票で返信します。画像やファイルだけでも送信できます。「利用者の補足待ち」の問題票に提出者が返信すると「未処理」に戻ります。
5. **処理結果を記録。** 担当者は結果を返信し、必要に応じて「処理済み」にします。通常の返信では状態を維持します。処理済みの問題票にも返信でき、担当者は「未処理」に戻せます。

<a id="feedback-limits"></a>

## 主な制限

| 項目 | 動作 |
| --- | --- |
| 収集と送信 | ログイン後、現在のページのメモリに直近のログと操作リプレイを保持します。フォームを開くと、その時点までの資料を確定して表示中のページを撮影します。選んだ資料は最初の投稿と一緒に送ります。返信と追加情報の依頼では、そのメッセージの本文と手動で添付した画像やファイルを送ります。 |
| ブラウザーログとリプレイ | 対象は直近の最大 5 分です。Core のログと未捕捉エラーの概要は最大 1000 件、512 KiB です。操作リプレイは最大 2 MiB です。ページの文字と入力値を隠し、iframe と非公開領域を除外します。再読み込み後は新しいバッファーを使います。 |
| サーバーログ | 選択した場合、送信時に同じ利用者、範囲、サービスインスタンスの直近 5 分の Core リクエストログを最大 1000 件、512 KiB 付けます。ホストが信頼できる `scopeId`、`userId`、`requestId` を設定します。再起動や別のインスタンスでは資料を取得できない場合があります。 |
| スクリーンショットと録画 | スクリーンショットではフォームの値と `data-feedback-private` の領域を隠します。録画は利用者が共有する画面を選び、最大 60 秒、5 MiB の無音動画を取得します。送信前に表示内容を確認してください。 |
| 1 回あたり | 本文は 5000 文字まで、手動で選ぶファイルは 5 個まで、各 5 MiB です。最初の投稿の資料と手動ファイルの合計は 10 MiB です。返信と補足依頼の添付も合計 10 MiB です。本文、ファイル、保存可能な資料のうち一つ以上を送信します。 |
| ファイルへのアクセス | 一覧はメタデータを返します。問題票を閲覧できる利用者は、ファイル、ログ、操作リプレイを個別に取得できます。 |
| 権限 | ログイン済みで `feedback:create` を持つ利用者が提出できます。提出者は自分の問題票を確認・返信できます。`feedback:read` は同じ範囲の問題票の閲覧権限です。閲覧権限と `feedback:process` を持つ担当者が処理、返信、追加情報の依頼を行えます。利用者、範囲、権限は信頼できるサーバー側セッションで決定します。 |
| 保存と再送 | 本文、添付、操作に伴う状態変更を 1 トランザクションで保存します。提出や返信の UUID は呼び出し側で生成します。応答を受け取れなかった場合、同じ ID で再送すると保存した記録を取得できます。 |

<a id="module-dependencies"></a>

## 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| `@h-ai/reldb` | 問題票、メッセージ、添付を保存 | サーバー | RelDB を先に初期化 |
| `@h-ai/kit` または `@h-ai/serv` | 認証付きルートを公開 | HTTP サービス | Feedback の初期化後、信頼できるセッション解決関数を渡す |
| `@h-ai/ui` | 入力フォーム、一覧、会話の表示 | Svelte の画面 | 認証付き API をコールバックとして渡す |

<a id="quick-start"></a>

## クイックスタート

DB に接続してから Feedback を起動します。下の `author` はサーバーが認証済みセッションから取得し、`feedback:create` を持ちます。

```ts
import type { FeedbackContext } from '@h-ai/feedback'
import { feedback } from '@h-ai/feedback'

const started = await feedback.init({ appId: 'orders' })
if (!started.success)
  throw new Error(started.error.message)

export async function submitIssue(author: FeedbackContext, id: string) {
  // 呼び出し側が提出前に UUID を作る。成功時は保存した問題票を返す。
  return feedback.submit({ id, body: '注文一覧を開けません' }, author)
}
```

SvelteKit は `kit.createFeedbackHandler({ feedback, resolveContext })` を GET、POST、PATCH に割り当てます。Serv は `serv.createFeedbackProcedures({ feedback, resolveContext })` で `apiContract.feedback` を公開します。暗号化転送では `apiContract.feedbackTransportRoutes(apiPrefix)` の各ルート設定を結合すると、提出、会話、添付のパスに最大 16 MiB の平文を許可します。RelDB の終了前に `await feedback.close()` を呼びます。 [Kit の接続](kit.ja.md#protocol-integrations) · [設定](../configuration/feedback.ja.md)

<a id="feedback-capture"></a>

### 最初の投稿の資料

ログイン後のページに `FeedbackModal` を配置します。`captureKey` にセッションまたは利用者の固定識別子を渡し、アカウントが変わったら入れ替え、ログアウト時にコンポーネントを外します。フォームを開くと資料を準備し、ホストの `onsubmit` で送ります。独自クライアントは `reports.submit` の `capture` に次の項目を渡せます。

| 項目 | 用途 |
| --- | --- |
| `screenshot?` | 自動で撮影した、または撮り直した画面。 |
| `browserLogs?` | 直近のブラウザーログの JSON。 |
| `replay?` | 完全なスナップショットを含む、マスク済み操作リプレイの JSON。 |
| `recording?` | 利用者が許可した WebM または MP4 動画。 |
| `includeServerLogs?` | `true` の場合、認証済みの提出者に対応する Core ログを追加します。 |

最初の四項目は通常の添付と同じ `name`、`contentType`、`dataBase64` を使います。添付メタデータの `kind` で資料の種類を判別します。ホストはフィードバックの認可と同じ範囲を信頼できるリクエストコンテキストの `scopeId` に設定します。Kit では `core.context.run({ scopeId: 'orders' }, next)` を使い、Serv では `createContext` から範囲を返せます。

<a id="api-reference"></a>

## API 参照

<a id="service"></a>
<a id="reports"></a>

### 問題票の参照、返信、処理

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedback.init(config)` | テーブルの初期化 | `{ appId }` | `HaiResult<void>` | `await feedback.init({ appId: 'orders' })` |
| `feedback.close()` | 新しい呼び出しを停止し、実行中の処理を待つ | なし | `HaiResult<void>` | `await feedback.close()` |
| `feedback.submit(input, context)` | 問題票を提出 | UUID の `id`、`body`、任意の `attachments` と `capture` | 保存した問題票 | `await feedback.submit({ id, body }, author)` |
| `feedback.listMine(query, context)` | 自分の問題票を取得 | `status?`、`page?`、`pageSize?` | 問題票のページ | `await feedback.listMine({}, author)` |
| `feedback.list(query, context)` | 権限内の問題票を取得 | `listMine` と同じ | 問題票のページ | `await feedback.list({ status: 'pending' }, staff)` |
| `feedback.get(id, context)` | 本文と最初の添付を取得 | 問題票の UUID | 問題票の詳細 | `await feedback.get(id, author)` |
| `feedback.listMessages(query, context)` | 新しい順に会話を取得 | `id`、`page?`、`pageSize?`。既定は 1 ページ目、20 件 | メッセージと添付メタデータのページ | `await feedback.listMessages({ id }, staff)` |
| `feedback.addMessage(input, context)` | 返信または追加情報の依頼 | 問題票 `id`、UUID の `messageId`、`kind: 'reply' \| 'request_info'`、`body`、任意の `attachments` | 保存したメッセージ | `await feedback.addMessage({ id, messageId, kind: 'reply', body }, author)` |
| `feedback.setStatus(input, context)` | 未処理または処理済みに変更 | `id`、`status: 'pending' \| 'handled'` | 更新後の問題票 | `await feedback.setStatus({ id, status: 'handled' }, staff)` |
| `feedback.getAttachment(input, context)` | 添付を 1 件取得 | 問題票の `id`、`attachmentId` | `name`、`contentType`、`dataBase64` | `await feedback.getAttachment({ id, attachmentId }, author)` |

`success` を確認してから結果を使います。権限のある利用者と担当者が問題票や添付を読めます。一覧は最後の更新の新しい順で、各ページの上限は 20 件です。

#### 利用例：スクリーンショットを依頼する

アプリの非同期関数内で、登録済みの問題票の `id`、閲覧・処理権限を持つ `staff`、再送時に使い回す `messageId` を渡します。

```ts
const request = await feedback.addMessage({
  id,
  messageId,
  kind: 'request_info',
  body: 'エラー画面の画像を添付してください。',
  attachments: [{ name: 'steps.txt', contentType: 'text/plain', dataBase64: 'U3RlcHM=' }],
}, staff)
if (!request.success)
  return request
return request.data
```

添付は `name`、`contentType`、Base64 形式の内容を指定します。提出者の返信も同じ形式で、`kind` に `reply` を使います。提出者は自分の問題票で依頼を読み、担当者は詳細を更新して補足を確認できます。
