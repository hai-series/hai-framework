# @h-ai/feedback 設定

[简体中文](feedback.md) · [English](feedback.en.md)

## 設定の入口

アプリはサーバーの `_feedback.yml` を読み、RelDB を初期化してから `feedback.init(config)` に渡します。初期化時にフィードバック用テーブルを用意し、信頼できる利用者、範囲、リクエスト ID 付きの Core ログをメモリに保持します。収集と送信の上限は[主な制限](../function/feedback.ja.md#feedback-limits)で確認できます。

<a id="configuration-fields"></a>

## 設定一覧

| パス | 型 | 必須 | 既定値 | 用途 |
| --- | --- | --- | --- | --- |
| `appId` | 1〜128 文字の文字列 | はい | なし | 共有 DB 内でアプリを区別する固定 ID。 |

1 回に手動で 5 ファイルまで、各ファイルは 5 MiB までです。手動の添付と最初の投稿の資料は合計 10 MiB までです。暗号化転送を使う場合、ホストの `routePlaintextBytes` に `apiContract.feedbackTransportRoutes(apiPrefix)` を結合し、対象パスで平文 16 MiB を許可します。他のルートの容量はホストで設定します。 [API リファレンス](../function/feedback.ja.md)

## 設定例

注文アプリの `config/_feedback.yml` に置き、フィードバック API を公開するサーバーで読み込みます。このアプリの提出は `orders` の範囲に保存されます。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
```
