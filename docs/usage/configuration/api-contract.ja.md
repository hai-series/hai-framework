# @h-ai/api-contract 設定

[原文（中国語）](api-contract.md) · [データ構造](../data/api-contract.ja.md) · [API リファレンス](../function/api-contract.ja.md)

契約はアプリのコードです。共通のエンドポイントスキーマを契約パッケージに置き、利用するドメインを `apiContract.create()` に渡します。IAM の公開レスポンスにはフォームで使う設定を含めます。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `apiContract.create(domains)` | 必須 | ドメイン名と契約の対応。除外する場合は `false`。 |
| `captcha` | `{ enabled: false }` | CAPTCHA を表示し、証明を送信するか。 |
| `reauthentication`, `initialCredentials` | 省略可 | 再認証が必要な操作と初期認証情報の表示設定。 |
| `password`, `register`, `login` | 必須 | 公開のパスワード要件、登録可否、ログイン方式。 |
| `passwordReset`, `otp` | 必須 | 再設定の可否・方式、OTP の桁数と再送間隔。 |
| `agreements`, `ui` | 必須 | 規約とプライバシー文面または URL、カード・分割レイアウト。 |
| `session.maxAge`, `session.endOnPageHide` | `endOnPageHide: false` | 公開のセッション有効期間とページ離脱時の終了設定。 |
