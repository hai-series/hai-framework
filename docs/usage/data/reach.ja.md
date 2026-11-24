# Reach のデータ構造

[简体中文](reach.md) · [English](reach.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/reach.ja.md) · [API リファレンス](../function/reach.ja.md)

Reach はアプリの再起動後も必要なメッセージや、繰り返し使う文面をデータベースに保存します。アプリは元の受付番号で、待ち行列に入ったメッセージの進み具合を確認できます。キャッシュが使える場合は有効期限の短いロックを取り、複数のプロセスが同じ待ち行列を同時に調べるのを減らします。

## データベース

Reach は `@h-ai/reldb` で接続したアプリのデータベースに **2 つのテーブル**を使います。テンプレートや遅延配信を使う場合は、先にデータベースに接続してから Reach を初期化します。

| テーブル | 保存するもの | 利用する場面 |
| --- | --- | --- |
| [`hai_reach_send_log`](#send-log) | 即時送信の履歴と送信待ちのメッセージ | メッセージが待機中か、チャネルが受け付けたか、人による照合が必要かを確認する |
| [`hai_reach_template`](#template-table) | 繰り返し使う件名、本文、既定の送信チャネル | 注文通知などの文面を共用し、送信のたびに実際の注文番号を入れる |

<a id="send-log"></a>

### 送信記録

**キューの一件はテーブルの一行に対応します。** `reach.send()` の `queueId` は `hai_reach_send_log.queue_id` に対応します。配信が進むと元の行を更新します。即時送信でチャネルが返した `messageId` は、履歴を書き込むときに `message_id` に入ります。

[SMS の確認コード](#sms-code-record)も[日中の API への即時送信](#direct-api-record)も、チャネル受付後に履歴の書き込みを試みます。[夜間の API 通知](#example-data)は先に保存し、配信後に同じ行を更新します。

`id` は主キーです。キューに入れたメッセージの `queue_id` は一意です。即時送信では空になります。`template` は使用したテンプレート名です。外部キーはありません。`hai_reach_send_log_status_lock_idx` で状態と処理権限の期限、`hai_reach_send_log_status_created_idx` で状態と作成順を検索できます。

`created_at`、`updated_at`、`locked_until`、`next_attempt_at` は Unix 時刻のミリ秒です。`retry_delay_ms` と `max_retry_delay_ms` は待機時間をミリ秒で表します。

| 項目 | 型 | NULL 可 | 既定値 | 意味 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 不可 | 自動採番 | データベース内の行番号 | `42` |
| `queue_id` | `TEXT` | 可 | `NULL` | キューの照会番号。値がある場合は一意で、`queueId` として返る | `00000000-0000-4000-8000-000000000042` |
| `provider` | `TEXT` | 不可 | — | `_reach.yml` に設定したチャネルの `name` | `warehouse-webhook` |
| `to_addr` | `TEXT` | 不可 | — | 実際の宛先 | `warehouse` |
| `subject` | `TEXT` | 可 | `NULL` | 送信に使う件名 | `Order received` |
| `body` | `TEXT` | 可 | `NULL` | 変数を置き換えた後の本文。待ち行列に入れた時点の内容があとで送られる | `Order order-42 was received.` |
| `template` | `TEXT` | 可 | `NULL` | 送信に使ったテンプレート名 | `order-received` |
| `vars_json` | `TEXT` | 可 | `NULL` | テンプレート変数を JSON 文字列にしたもの | `{"orderId":"order-42"}` |
| `extra_json` | `TEXT` | 可 | `NULL` | チャネル固有の追加パラメーターを JSON 文字列にしたもの | `{"event":"order.received","orderId":"order-42"}` |
| `status` | `TEXT` | 不可 | — | 現在の状態。各値の意味は表の下を参照 | `pending` |
| `message_id` | `TEXT` | 可 | `NULL` | SMS の受付番号など、チャネルが返した番号 | `provider-order-43` |
| `processing_owner` | `TEXT` | 可 | `NULL` | メッセージを引き受けた処理の内部 ID。結果を確定するときにデータベースが照合する | `reach:<ノード番号>:<走査番号>` |
| `locked_until` | `BIGINT` | 可 | `NULL` | キュー項目を取得した処理担当の期限 | `1795479000000` |
| `attempt_count` | `BIGINT` | 不可 | `0` | 待ち行列で使った試行回数。引き受け時に 1 増え、外部送信前に戻すとその 1 回が戻る | `0` |
| `max_attempts` | `BIGINT` | 不可 | `5` | 最初の試行を含め、待ち行列の 1 件に許される試行回数 | `5` |
| `retry_delay_ms` | `BIGINT` | 不可 | `60000` | 最初の失敗後に待つ時間 | `60000`（1 分） |
| `max_retry_delay_ms` | `BIGINT` | 不可 | `3600000` | 再試行までの待機時間の上限 | `120000`（2 分） |
| `next_attempt_at` | `BIGINT` | 不可 | `0` | 次に試行できる最も早い時刻。`0` は再試行の待ち時間がないことを示す。通知を控える時間帯は引き続き適用される | `1795478460000` |
| `last_failure` | `TEXT` | 可 | `NULL` | 待ち行列で最後に記録した失敗の理由 | `provider_unavailable`（チャネルが利用できない） |
| `retry_safe` | `BOOLEAN` | 不可 | `false` | 結果が不明でも安全に再試行できるか。`idempotent: true` を設定し、受信側が実際に重複を防ぐ API で使う | `false` |
| `created_at` | `BIGINT` | 不可 | — | 送信記録を作成した時刻 | `1795446600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最後に更新した時刻。失敗したメッセージを戻す際に、呼び出し元が最新状態を読んだかも確認できる | `1795446600000` |

#### 送信状態の読み方

- `pending` は送信待ちです。
- `processing` は処理担当がメッセージを引き受けた状態です。
- `sending` はチャネルへの送信中または結果待ちです。
- `sent` はチャネルが受け付けたか、運用担当者が確認して結果を登録した状態です。受信者に届いたかはチャネル側の配信記録で確認します。
- `dead` は、試行回数を使い切った場合など、自動処理が止まった状態です。原因を解消したあと、待ち行列に戻せます。
- `unknown` は、結果の照合が必要な状態です。運用担当者は確認後に `sent` または `discarded` を登録できます。
- `discarded` は、運用担当者が結果を確認して処理を終了した状態です。

照会、照合、再開の手順は[キュー API](../function/reach.ja.md#queue)を参照してください。

<a id="sms-code-record"></a>

#### 受け付けた確認コードの SMS を履歴へ記録する

ユーザーがコードを要求したら、[SMS の例](../function/reach.ja.md#reach-sms-code)のように `reach.send()` を呼びます。`otp_sms` の `{code}` に発行したコードが入り、`ignoreDnd: true` で今回の送信を夜間にも試みます。発行と照合はアプリまたは [IAM](iam.ja.md) が担当します。

SMS チャネルが受け付け、`BizId` に `aliyun-42` を返したときの `data` は `{"success":true,"messageId":"aliyun-42"}` です。データベースがあれば Reach は非同期で一行の書き込みを試みます。以下は書き込み後の抜粋です。

```json
{
  "id": 41,
  "queue_id": null,
  "provider": "sms",
  "to_addr": "13900000000",
  "body": "Your verification code is 123456.",
  "template": "otp_sms",
  "vars_json": "{\"code\":\"123456\"}",
  "status": "sent",
  "message_id": "aliyun-42"
}
```

SMS チャネルと `message_id` で照会すると、宛先と送信内容が分かります。`body` は置換後の本文、`vars_json` はテンプレートに渡したコードです。

```sql
SELECT to_addr, body, vars_json
FROM hai_reach_send_log
WHERE provider = 'sms' AND template = 'otp_sms' AND message_id = 'aliyun-42';
```

<a id="direct-api-record"></a>

#### 日中に倉庫 API へ直接送信する

`09:00` は通知を控える時間帯の外です。アプリは[倉庫通知の例](../function/reach.ja.md#reach-api-notification)のように `order-received` テンプレートで注文 `order-43` の作成を知らせます。倉庫が受け付けて `{"messageId":"provider-order-43"}` を返すと、Reach は `result.data.messageId` を返し、非同期で送信履歴の書き込みを試みます。

以下は書き込みに成功した行の抜粋です。`queue_id` は空で、`message_id` に倉庫の番号が入ります。この行には、変数を置換した本文と注文の情報が残ります。

```json
{
  "id": 43,
  "queue_id": null,
  "provider": "warehouse-webhook",
  "to_addr": "warehouse",
  "subject": "Order received",
  "body": "Order order-43 was received.",
  "template": "order-received",
  "vars_json": "{\"orderId\":\"order-43\"}",
  "extra_json": "{\"event\":\"order.received\",\"orderId\":\"order-43\"}",
  "status": "sent",
  "message_id": "provider-order-43",
  "created_at": 1795482000000
}
```

`data` は `{"success":true,"messageId":"provider-order-43"}` です。この番号で倉庫に確認できます。キューの照会には `queue_id` を使います。本文のない HTTP `204` も受付扱いになり、`message_id` は空です。送信履歴の書き込みに失敗しても、チャネルに受理された即時送信は成功として返ります。データベースを使わない即時送信でもチャネルの結果は返り、テーブルに行は追加されません。

<a id="example-data"></a>

#### 23:10 の注文通知を待ち行列に入れる

別の注文 `order-42` も倉庫に通知します。[倉庫通知の設定](../configuration/reach.ja.md#reach-example-warehouse)では、通知を控える時間帯を `22:00` から翌朝 `08:00` までとして `delay` を選んでいます。`2026-11-23 23:10:00`（UTC+08:00）にアプリが送信を呼ぶと、Reach は本文と変数を `pending` の行に保存します。倉庫へのリクエストは待機中なので、`attempt_count` は `0`、`message_id` は空です。以下は登録直後の行の全項目です。

```json
{
  "id": 42,
  "queue_id": "00000000-0000-4000-8000-000000000042",
  "provider": "warehouse-webhook",
  "to_addr": "warehouse",
  "subject": "Order received",
  "body": "Order order-42 was received.",
  "template": "order-received",
  "vars_json": "{\"orderId\":\"order-42\"}",
  "extra_json": "{\"event\":\"order.received\",\"orderId\":\"order-42\"}",
  "status": "pending",
  "message_id": null,
  "processing_owner": null,
  "locked_until": null,
  "attempt_count": 0,
  "max_attempts": 5,
  "retry_delay_ms": 60000,
  "max_retry_delay_ms": 120000,
  "next_attempt_at": 0,
  "last_failure": null,
  "retry_safe": false,
  "created_at": 1795446600000,
  "updated_at": 1795446600000
}
```

登録成功時の `data` は `{"success":true,"deferred":true,"queueId":"00000000-0000-4000-8000-000000000042"}` です。`reach.queue.get(queueId)` で同じ行を照会すると、以下の状態と試行回数を取得できます。

```json
{
  "queueId": "00000000-0000-4000-8000-000000000042",
  "provider": "warehouse-webhook",
  "status": "pending",
  "updatedAt": 1795446600000,
  "attemptCount": 0,
  "maxAttempts": 5,
  "nextAttemptAt": 0
}
```

翌朝 `08:00` 以降に、バックグラウンド処理がこの行の `queue_id` を `Idempotency-Key` に入れて倉庫に送ります。初回で受け付けられた場合の抜粋を以下に示します。`id` と `queue_id` は同じで、`status`、`message_id`、`attempt_count` に送信結果が反映されます。元の `queueId` で照会すると `sent` が返ります。

```json
{
  "id": 42,
  "queue_id": "00000000-0000-4000-8000-000000000042",
  "status": "sent",
  "message_id": "warehouse-42",
  "attempt_count": 1
}
```

通知を控える時間帯に `strategy: discard` が設定されている場合や、今回の呼び出しで `deferPolicy: 'reject'` を渡した場合、通常の API 通知には `DND_BLOCKED` が返ります。書き込む行は **0 行**で、倉庫へのリクエストも発生しません。

送信時の本文と変数が履歴に入ります。履歴の保存期間はアプリ側で決めます。旧バージョンの `[REDACTED]` の行には当時保存したデータが残ります。送信待ちの行は再起動後も処理できます。

<a id="template-table"></a>

### 通知テンプレート

よく送る通知の文面は `hai_reach_template` に保存します。起動時に Reach は `_reach.yml` のテンプレートを `name` ごとに保存します。アプリから `reach.template` で管理することもできます。編集した内容は以降に作るメッセージに反映され、待ち行列に入っているメッセージはその時点で保存した本文を使います。`reach.template.remove()` で削除できます。`_reach.yml` に同じ設定が残っている場合は次回の初期化で再び保存されます。`id` が主キー、`name` が一意で、外部キーはありません。`provider` は設定にあるチャネル名です。

| 項目 | 型 | NULL 可 | 既定値 | 意味 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 不可 | 自動採番 | データベース内の行番号 | `1` |
| `name` | `TEXT` | 不可 | — | 送信時にアプリが指定する一意のテンプレート名 | `order-received` |
| `provider` | `TEXT` | 不可 | — | 既定のチャネル。アプリが `provider` を指定した場合はそのチャネルが優先される | `warehouse-webhook` |
| `subject` | `TEXT` | 可 | `NULL` | 件名のひな形。`{変数名}` を使える | `Order received` |
| `body` | `TEXT` | 不可 | — | 本文のひな形。送信時に `{変数名}` を実際の値に置き換える | `Order {orderId} was received.` |
| `created_at` | `TIMESTAMP` | 不可 | — | テンプレートを最初に保存した時刻 | `2026-11-23T14:00:00+08:00` |
| `updated_at` | `TIMESTAMP` | 不可 | — | テンプレートを最後に保存した時刻 | `2026-11-23T14:00:00+08:00` |

#### 注文通知のテンプレート

このテンプレートは一度だけ保存されたため、作成時刻と最終更新時刻が同じです。上の待機メッセージで `orderId` に `order-42` を渡すと、送信記録の本文は `Order order-42 was received.` になります。

```json
{
  "id": 1,
  "name": "order-received",
  "provider": "warehouse-webhook",
  "subject": "Order received",
  "body": "Order {orderId} was received.",
  "created_at": "2026-11-23T14:00:00+08:00",
  "updated_at": "2026-11-23T14:00:00+08:00"
}
```

## キャッシュ

Reach は `@h-ai/cache` を通じて **1 種類のキャッシュキー**を使います。最初にロックを取得したノードが待ち行列を確認し、使用中だと分かったほかのノードはその回の確認を見送ります。同じ Redis と `keyPrefix` を使うノードがロックを共有できます。メモリーキャッシュのロックは同じプロセス内で有効です。

| 項目 | 論理キー | 保存するもの | 利用する場面 |
| --- | --- | --- | --- |
| [待ち行列の走査ロック](#queue-scan-lock) | `hai:reach:flush-pending` | その回の走査に使うロックトークン | 遅延キューが有効で送信できる時刻に Cache が初期化されている場合、重複する問い合わせを減らす |

<a id="queue-scan-lock"></a>

### 待ち行列の走査ロック

| 項目 | 型 | 既定値 | 意味 | 例 |
| --- | --- | --- | --- | --- |
| 論理キー | 文字列 | 固定 `hai:reach:flush-pending` | Reach が `cache.lock` に渡す名前 | `hai:reach:flush-pending` |
| 保存キー | 文字列 | `__lock:hai:reach:flush-pending` | Cache が `__lock:` を付ける。Redis の `keyPrefix` を設定した場合はさらに先頭に付く | `orders:__lock:hai:reach:flush-pending` |
| 値 | 文字列 | 取得時に生成する UUID | その回の走査で使うトークン。値が一致する場合だけロックを解除できる | `<lock-token:redacted>` |
| 有効期間 | 秒 | 固定 `300` | 取得時から計測する。Reach は延長せず、走査が中断されると 5 分で期限が切れる | `300` |

Redis の `keyPrefix` が `orders:` のとき、ロックを取得すると `orders:__lock:hai:reach:flush-pending` に以下の値が入ります。実際には UUID が入るため、例では伏せています。残りの有効期間は Redis がキーの付帯情報として別に管理します。

```json
"<lock-token:redacted>"
```

走査が終わると Reach はロックの解除を試みます。Cache が使えない場合や、ロックを取得する操作に失敗した場合でも、データベースを使って処理を続けられます。どの処理がメッセージを送信できるかは、データベースの処理担当 ID と期限で決まります。[Cache の設定](../configuration/cache.ja.md)を参照してください。
