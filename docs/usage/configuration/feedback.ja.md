# @h-ai/feedback 設定

[简体中文](feedback.md) · [English](feedback.en.md) · [API リファレンス](../function/feedback.ja.md) · [データ構造](../data/feedback.ja.md)

## 設定の読み込み

アプリのサーバー側の設定ディレクトリに `config/_feedback.yml` を置きます。管理コンソールは起動時に Core でファイルを読み込み、`FeedbackConfigSchema` で検証します。独自に組み込む場合は RelDB に接続してから `feedback.init(config)` を呼びます。初期化の成功後に API で送信や参照ができます。アプリ ID を変更した後は Feedback を実行しているサービスを再起動します。

<a id="configuration-fields"></a>

## 設定一覧

| フィールド | 環境変数 | 型と範囲 | 必須 | 既定値 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `appId` | `HAI_FEEDBACK_APPID` | 前後の空白を除いて 1〜128 文字の文字列。NUL は不可 | はい | なし | 初回投稿の `app_id` に保存されます。一覧、詳細、メッセージ、添付ファイルの参照をこのアプリに限定します。 |

同じデータベースを使う別々のアプリには異なる `appId` を設定します。同じアプリの複数インスタンスがデータベースを共有する場合は同じ値を使います。たとえば `orders` と `inventory` はテーブルを共有しながら個別のフィードバック一覧を持てます。`orders` を `orders-v2` に変えると、新しいインスタンスは新しい ID で検索し、既存のレコードは `orders` に属したままです。

<a id="configuration-ownership"></a>

## モジュールの設定が一つである理由

`_feedback.yml` はデータの所属先を指定するファイルで、デプロイ時に指定する項目は `appId` です。アプリへの組み込みでは、次の設定も使います。

| 層 | 設定場所 | 適用されるタイミング |
| --- | --- | --- |
| データベース | ホストの `config/_reldb.yml`、または `reldb.init` に渡す接続設定 | Feedback の起動後、ホストが選んだ SQLite、PostgreSQL、MySQL のいずれかに 3 テーブルが用意されます。 |
| 利用者と業務スコープ | ホストは `resolveContext` で信頼できるセッションから `userId`、`scopeId`、権限を渡します。Core ログを関連付ける場合、業務リクエストの Core コンテキストにも同じスコープを設定します。 | API リクエストごとにセッションとスコープで権限を確認します。ロールの割り当てはホストが管理します。 |
| ブラウザーの資料 | ホストがログイン済みの `FeedbackModal` に `captureKey` を渡します。投稿者は資料の確認・削除、録画の許可、サーバーログの追加を選べます。 | コンポーネントをマウントするとページ内の記録を開始し、ダイアログを開くと一部の資料を確定します。利用者の選択はその送信に適用されます。 |
| HTTP トランスポート | Kit の `_kit.yml` または Serv の `_serv.yml` で `transport` を管理します。暗号化が有効な場合は `transport.routePlaintextBytes` でファイルを扱うルートの容量を宣言します。 | ホストが HTTP リクエストとレスポンスの容量をルートごとに検査します。 |
| 保存期間 | ホストのデータ保持ポリシー | 保存されたレコードはリレーショナルデータベースにあり、ホストのポリシーに従って削除します。 |

[RelDB の設定](reldb.ja.md) · [権限と初回投稿の資料](../function/feedback.ja.md#permissions) · [データの保持](../data/feedback.ja.md#retention)

### 送信と収集の固定上限

ブラウザーとサーバーは共通のフィードバック契約に従います。1 回の投稿またはメッセージにつき、本文は UTF-16 のコード単位で 5000、手動添付は 5 件、1 ファイルは 5 MiB、全ファイルの合計は 10 MiB までです。初回投稿の資料は 10 MiB に、手動添付は 5 件に含まれます。ログとリプレイは最大 5 分前までを対象にします。短い画面録画は 60 秒までで、1 ファイルの上限も適用されます。モジュールは送信単位で上限を検査します。利用者ごとの累積クォータや設定可能な保存期限はありません。

[上限の詳細](../function/feedback.ja.md#feedback-limits)

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

環境変数を設定しなければ、この例では `orders` が使われます。ファイルで指定した代替値であり、モジュールのスキーマ自体に既定値はありません。 [Core の環境設定](core.ja.md)

<a id="transport-budget"></a>

### ファイル用ルートの平文容量

ホストでトランスポート暗号化を有効にする場合、`apiContract.feedbackTransportRoutes(apiPrefix)` を `transport.routePlaintextBytes` にマージします。プレフィックスには実際のマウント先を渡します。Kit の `/api` や、`/console` 配下へデプロイする場合の `/console/api` が例です。`/api` の場合、補助関数は次のルールを生成します。いずれも 16 MiB（16777216 バイト）です。

| パス | 対象 |
| --- | --- |
| `/api/feedback/reports` | 初回投稿と資料の送信。 |
| `/api/feedback/reports/*/messages` | 返信、情報追加の依頼とそれらの添付ファイルの送信。 |
| `/api/feedback/reports/*/attachments/*` | 個別ファイルを Base64 で取得。 |

10 MiB のファイルを Base64 に変換すると約 13.33 MiB になり、JSON とトランスポートの包みによる増分も発生します。16 MiB の平文枠はフィードバックルートのシリアライズ済みデータに適用されます。ファイルの上限は元のバイト数で計算します。リバースプロキシやホスティング環境に別のリクエストサイズ制限があれば、エンコード済みリクエストを通せるようにします。管理コンソールはフィードバック用ルートの既定値を読み込んだ後、ホストが明示したルートの値を適用します。

[Kit のトランスポート](kit.ja.md) · [Serv のトランスポート](serv.ja.md) · [フィードバックの運用](../operations/feedback.ja.md)
