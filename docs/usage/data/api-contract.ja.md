# @h-ai/api-contract データ構造

[简体中文](api-contract.md) · [English](api-contract.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/api-contract.ja.md) · [API リファレンス](../function/api-contract.ja.md)

ログインフォームは契約で送信項目を確認し、公開設定の応答から利用可能なログイン方式を読み込みます。エンドポイント定義はアプリのコードに含まれ、セッションと業務記録は各モジュールが保存します。

<a id="response-data"></a>

## リクエストと応答のデータ

契約はエンドポイントのメタデータをコードに保持します。データベースの列、キャッシュ、セッションは業務モジュールが管理します。リクエストの既定値は省略したリクエスト項目に適用されます。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| エンドポイント | HTTP メソッド、パステンプレート、パス・クエリ引数、リクエストとレスポンスのスキーマ。 |
| `HaiResult<T>` | 成功データまたは失敗エラーを判別できる形式。 |

<a id="example-data"></a>

### エンドポイントが返す業務データ

契約で成功応答の項目をそろえます。

```json
{
  "success": true,
  "data": {
    "id": "order-42",
    "totalCents": 1200
  }
}
```

order-42 と totalCents:1200 を返す例で、金額は補助単位、DB の全行ではありません。

<a id="public-settings"></a>

### 公開設定レスポンス

契約はアプリのコードです。共通のエンドポイントスキーマを契約パッケージに置き、利用するドメインを `apiContract.create()` に渡します。IAM の公開レスポンスにはフォームで使う設定を含めます。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `captcha` | `{ enabled: false }` | CAPTCHA を表示し、証明を送信するか。 |
| `reauthentication`, `initialCredentials` | 省略可 | 再認証が必要な操作と初期認証情報の表示設定。 |
| `password`, `register`, `login` | 必須 | 公開のパスワード要件、登録可否、ログイン方式。 |
| `passwordReset`, `otp` | 必須 | 再設定の可否・方式、OTP の桁数と再送間隔。 |
| `agreements`, `ui` | 必須 | 規約とプライバシー文面または URL、カード・分割レイアウト。 |
| `session` | 必須 | `maxAge` はセッションの有効期間（秒）。`endOnPageHide` の既定値は `false`。 |
| `session.maxAge`, `session.endOnPageHide` | `endOnPageHide: false` | 公開のセッション有効期間とページ離脱時の終了設定。 |

<a id="ログイン画面に公開する方針"></a>

#### 例 · ログイン画面に公開する方針

公開してよい方針だけを画面に返し、登録や認証方法の表示を決めます。

```json
{
  "captcha": {
    "enabled": false
  },
  "register": {
    "enabled": true
  },
  "login": {
    "password": true,
    "otp": false,
    "ldap": false,
    "email": true,
    "sms": false
  },
  "session": {
    "maxAge": 86400,
    "endOnPageHide": false
  }
}
```

登録とパスワード認証が有効、CAPTCHA は無効の抜粋です。サーバー側の制限は別途必要です。
