# @h-ai/feedback 設定

[简体中文](feedback.md) · [English](feedback.en.md)

## 設定の入口

アプリはサーバーの `_feedback.yml` を読み、RelDB を初期化してから `feedback.init(config)` に渡します。変更はサービスを再起動すると反映されます。初期化ではフィードバック用のテーブルを準備します。

<a id="configuration-fields"></a>

## 設定一覧

| パス | 型 | 必須 | 既定値 | 用途 |
| --- | --- | --- | --- | --- |
| `appId` | 1〜128 文字の文字列 | はい | なし | 共有 DB 内でアプリを区別する固定 ID。 |

契約では 1 回に 5 ファイル、各 5 MiB、合計 10 MiB まで受け付けます。暗号化転送を使う場合、ホストの `routePlaintextBytes` に `feedbackTransportRoutes(apiPrefix)` を結合し、対象パスで平文 16 MiB を許可します。他のルートの容量はホストで設定します。 [API リファレンス](../function/feedback.ja.md)

## 設定例

注文アプリの `config/_feedback.yml` に置き、フィードバック API を公開するサーバーで読み込みます。このアプリの提出は `orders` の範囲に保存されます。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
```
