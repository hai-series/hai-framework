# @h-ai/feedback 設定

[简体中文](feedback.md) · [English](feedback.en.md) · [API リファレンス](../function/feedback.ja.md) · [データ構造](../data/feedback.ja.md)

## 設定の読み込み

アプリのサーバー側の設定ディレクトリに `config/_feedback.yml` を置きます。管理コンソールは起動時に Core でファイルを読み込み、`FeedbackConfigSchema` で検証します。独自に組み込む場合は RelDB に接続してから `feedback.init(config)` を呼びます。初期化の成功後に API で送信や参照ができます。アプリ ID、送信や収集の上限、保存期間を変更した後は Feedback を実行しているサービスを再起動します。

<a id="configuration-fields"></a>

## 設定一覧

| フィールド | 環境変数 | 型と範囲 | 必須 | 既定値 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `appId` | `HAI_FEEDBACK_APPID` | 前後の空白を除いて 1〜128 文字の文字列。NUL は不可 | はい | なし | 初回投稿の `app_id` に保存されます。一覧、詳細、メッセージ、添付ファイルの参照をこのアプリに限定します。 |

同じデータベースを使う別々のアプリには異なる `appId` を設定します。同じアプリの複数インスタンスがデータベースを共有する場合は同じ値を使います。たとえば `orders` と `inventory` はテーブルを共有しながら個別のフィードバック一覧を持てます。`orders` を `orders-v2` に変えると、新しいインスタンスは新しい ID で検索し、既存のレコードは `orders` に属したままです。

### 送信の上限

各項目は省略できます。初回投稿、返信、情報追加の依頼で同じ上限を使います。ファイル容量は Base64 への変換前のバイト数です。

| フィールド | 環境変数 | 既定値 | 範囲と用途 |
| --- | --- | --- | --- |
| `limits.maxBodyLength` | `HAI_FEEDBACK_LIMITS_MAXBODYLENGTH` | 5000 | UTF-16 のコード単位で 1〜20000。 |
| `limits.maxFiles` | `HAI_FEEDBACK_LIMITS_MAXFILES` | 5 | 手動で添付するファイル 1〜20 件。 |
| `limits.maxFileBytes` | `HAI_FEEDBACK_LIMITS_MAXFILEBYTES` | 5242880（5 MiB） | 添付または初回投稿の資料 1 ファイルにつき 1〜10485760 バイト。 |
| `limits.maxTotalFileBytes` | `HAI_FEEDBACK_LIMITS_MAXTOTALFILEBYTES` | 10485760（10 MiB） | 1〜25165824 バイト。1 ファイルの上限以上。手動添付と初回投稿の資料で共用します。 |

### 初回投稿の資料

各項目は省略できます。ログとリプレイのファイルには、1 ファイルの上限と送信時の残り容量も適用されます。録画時間はブラウザーが制御し、サーバーは録画ファイルの容量と型を確認します。

| フィールド | 環境変数 | 既定値 | 範囲と用途 |
| --- | --- | --- | --- |
| `capture.windowSeconds` | `HAI_FEEDBACK_CAPTURE_WINDOWSECONDS` | 300 | 1〜1800 秒。ブラウザーやサーバーのログと操作リプレイの対象期間。 |
| `capture.maxLogEntries` | `HAI_FEEDBACK_CAPTURE_MAXLOGENTRIES` | 1000 | ブラウザーやサーバーのログ 1 ファイルにつき 1〜5000 件。 |
| `capture.maxLogBytes` | `HAI_FEEDBACK_CAPTURE_MAXLOGBYTES` | 524288 | ログ 1 ファイルにつき 1〜2097152 バイト。 |
| `capture.maxReplayBytes` | `HAI_FEEDBACK_CAPTURE_MAXREPLAYBYTES` | 2097152 | 操作リプレイの 1〜8388608 バイト。 |
| `capture.maxReplayEvents` | `HAI_FEEDBACK_CAPTURE_MAXREPLAYEVENTS` | 2000 | 操作リプレイの 1〜10000 イベント。 |
| `capture.maxRecordingSeconds` | `HAI_FEEDBACK_CAPTURE_MAXRECORDINGSECONDS` | 60 | 1〜300 秒。時間上限に達したときや容量上限に近づいたときに録画を停止します。 |

### 保存期間

| フィールド | 環境変数 | 既定値 | 範囲と用途 |
| --- | --- | --- | --- |
| `retention.days` | `HAI_FEEDBACK_RETENTION_DAYS` | 0 | 0〜3650 の整数。0 は無期限です。正の値は直近のメッセージや状態変更から保持する日数で、初回は投稿時刻から数えます。 |

期限が過ぎた投稿は、状態にかかわらず一覧や詳細から取得できなくなります。起動時と毎時、アプリごとの期限切れ投稿を分割して削除し、同じ投稿のメッセージと添付も削除します。同じアプリのインスタンスでは同じ設定を使います。再起動後は既存の投稿にも新しい設定が適用されます。 [データの保持](../data/feedback.ja.md#retention)

<a id="configuration-ownership"></a>

## ホストへの組み込み

ホストは次の設定でデータベースに接続し、権限と業務スコープを決定してファイル転送を構成します。

| 層 | 設定場所 | 適用されるタイミング |
| --- | --- | --- |
| データベース | `reldb.init` に渡す接続設定。管理コンソールは `config/_db.yml` を読み込みます。 | Feedback の起動後、ホストが選んだ SQLite、PostgreSQL、MySQL のいずれかに 3 テーブルが用意されます。 |
| 利用者と業務スコープ | ホストは `resolveContext` で信頼できるセッションから `userId`、`scopeId`、権限を渡します。Core ログを関連付ける場合、業務リクエストの Core コンテキストにも同じスコープを設定します。 | API リクエストごとにセッションとスコープで権限を確認します。ロールの割り当てはホストが管理します。 |
| ブラウザーの資料 | ホストがログイン済みの `FeedbackModal` に `captureKey` を渡します。投稿者は資料の確認・削除、録画の許可、サーバーログの追加を選べます。 | コンポーネントをマウントするとページ内の記録を開始し、ダイアログを開くと一部の資料を確定します。利用者の選択はその送信に適用されます。 |
| HTTP トランスポート | Kit の `_kit.yml` または Serv の `_serv.yml` で `transport` を管理します。暗号化が有効な場合は `transport.routePlaintextBytes` でファイルを扱うルートの容量を宣言します。 | ホストが HTTP リクエストとレスポンスの容量をルートごとに検査します。 |
| 保存期間 | `_feedback.yml` の `retention.days` | 期限の過ぎた投稿は参照できなくなり、サービスが分割して削除します。 |

[RelDB の設定](reldb.ja.md) · [権限と初回投稿の資料](../function/feedback.ja.md#permissions) · [データの保持](../data/feedback.ja.md#retention)

## 設定例

### 固定のアプリ ID を設定する

注文アプリの `config/_feedback.yml` に次の内容を書き、先にデータベースへ接続します。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
```

起動後にフィードバックを送信すると、データベースの `hai_feedback_reports.app_id` で `orders` を確認できます。注文アプリの「自分のフィードバック」からその投稿を開きます。管理コンソールも同じ方法で `appId: admin-console` を使います。

### 環境ごとにアプリ ID を指定する

Core が `feedback` 設定を読み込むとき、`HAI_FEEDBACK_APPID` はファイルの `appId` に優先します。前の例の固定値も上書きできます。別の環境で `HAI_FEEDBACK_APPID=orders-staging` を設定して再起動すると、その環境の新規投稿は `orders-staging` に属します。

CLI テンプレートでは環境変数のプレースホルダーも記述し、生成先のプロジェクト名を代替値に使います。注文アプリの設定ファイルは次のようになります。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: ${HAI_FEEDBACK_APPID:orders}
```

環境変数を設定しなければ、この例では `orders` が使われます。ファイルで指定した代替値であり、`appId` 自体に既定値はありません。 [Core の環境設定](core.ja.md)

### 容量と保存日数を変更する

たとえば注文アプリで 1 回につき 12 MiB まで送信でき、最終更新から 90 日間保持する設定です。省略した項目は既定値になります。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
limits:
  maxFileBytes: 6291456
  maxTotalFileBytes: 12582912
capture:
  windowSeconds: 180
  maxRecordingSeconds: 45
retention:
  days: 90
```

変更後は Feedback のサービスを再起動し、ページを更新します。ホストは認証済みの `GET /feedback/limits` から `limits` と `capture` を取得し、投稿と会話の入力欄で使えます。縮小した上限は新規送信に適用し、既存の投稿と添付は期限まで取得できます。

<a id="transport-budget"></a>

### ファイル用ルートの平文容量

ホストでトランスポート暗号化を有効にする場合、`apiContract.feedbackTransportRoutes(apiPrefix, maxTotalFileBytes)` を `transport.routePlaintextBytes` にマージします。プレフィックスには実際のマウント先を渡します。Kit の `/api` や、`/console` 配下へデプロイする場合の `/console/api` が例です。`/api` の場合、補助関数は次のルールを生成します。既定では 16 MiB です。合計の上限を引き上げると投稿とメッセージの容量枠も増えます。添付の読み込みは既存ファイルに対応する 16 MiB のままです。

| パス | 対象 |
| --- | --- |
| `/api/feedback/reports` | 初回投稿と資料の送信。 |
| `/api/feedback/reports/*/messages` | 返信、情報追加の依頼とそれらの添付ファイルの送信。 |
| `/api/feedback/reports/*/attachments/*` | 個別ファイルを Base64 で取得。 |

10 MiB のファイルを Base64 に変換すると約 13.33 MiB になり、JSON とトランスポートの包みによる増分も発生します。実際の `limits.maxTotalFileBytes` を渡すと、シリアライズ済みデータに対応する平文枠を計算できます。ファイルの上限は元のバイト数で計算します。リバースプロキシやホスティング環境に別のリクエストサイズ制限があれば、エンコード済みリクエストを通せるようにします。管理コンソールはフィードバック用ルートの既定値を読み込んだ後、ホストが明示したルートの値を適用します。

[Kit のトランスポート](kit.ja.md) · [Serv のトランスポート](serv.ja.md) · [フィードバックの運用](../operations/feedback.ja.md)
