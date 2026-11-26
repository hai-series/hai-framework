# @h-ai/kit データ構造

[简体中文](kit.md) · [English](kit.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/kit.ja.md) · [API リファレンス](../function/kit.ja.md) · [注文運用コンソールのチュートリアル](../getting-started/kit.ja.md)

注文運用コンソールがレポートを読み込むと、Kit は認証済みの監査担当者とリクエスト ID を SvelteKit のサーバーページや API に渡します。取引先向けレポートへのリクエストは、レート制限が有効なときに集計します。

<a id="runtime-data"></a>

## リクエストコンテキスト

`kit.createHandle()` は SvelteKit の `event.locals` にリクエストコンテキストを書き込みます。サーバーの load、action、API ガードがリクエストの処理中に読み取ります。

| フィールド | 読み取る場面と意味 |
| --- | --- |
| `event.locals.requestId` | レスポンスの `X-Request-Id` と照合できる追跡 ID。匿名リクエストにも付きます。 |
| `event.locals.session` | 共通の `HttpSession` を使用します。`userId`、`roles`、`permissions` は必須です。`username`、`displayName`、`avatarUrl`、アプリ固有の `data` は任意です。未認証の場合は省略されます。 |
| `event.getClientAddress()` | 信頼済みプロキシの規則で解決した接続元アドレスを返します。事前レンダリング中や信頼できるアドレスが得られない場合は例外になることがあります。 |
| `event.locals.accessToken` | 検証済みのアクセストークン。サーバー側で使用します。 |

Serv の `ServSession` と Kit の `SessionData` は、どちらも `@h-ai/core` の `HttpSession` を使います。認証に成功すると、ホストは `data._tokenPair` を除いた項目を現在のリクエストに渡します。セッションの保存、更新、取り消しは引き続き IAM が管理します。 [IAM のセッションデータ](iam.ja.md)

以下はサーバー側データの抜粋です。

```json
{
  "requestId": "request-42",
  "session": {
    "userId": "user-42",
    "roles": ["auditor"],
    "permissions": ["reports:read"]
  }
}
```

`request-42` はレスポンスの `X-Request-Id` と照合できます。匿名のリクエストにも番号が付きます。ブラウザーには表示に必要な項目だけを返し、`locals.accessToken` はサーバーに保持します。 [リクエスト処理](../function/kit.ja.md#hooks)

## データベース

Kit が作成するデータベーステーブルは 0 件です。注文やレポートはアプリが保存し、IAM を有効にした場合は [IAM](iam.ja.md) がセッションを管理します。

A2A を有効にした場合、ホストが HTTP を処理し、AI モジュールがタスクイベントとメッセージを保存します。 [A2A のタスクとメッセージ](ai.ja.md#table-hai-ai-a2a-journal)

<a id="cache"></a>

## キャッシュ

Redis でレート制限を有効にすると、Serv と Kit は次の 1 種類のキーを使います。計数対象の `key` は、既定では信頼済みの接続元 IP で、アプリでも指定できます。`SHA-256(JSON.stringify([namespace, windowMs, key]))` の 16 進表現が `digest` になり、Cache が Redis キーに `keyPrefix` を付けます。Redis のデータベース、接頭辞、名前空間、時間枠、計数対象が一致するインスタンスは同じレコードに加算します。プロセス内ストアは個別に数え、Redis には書き込みません。鍵の登録と再送防止レコードは [Crypto](crypto.ja.md) が管理します。 [レート制限の組み込み](../getting-started/kit.ja.md#orders-console-access)

| キーまたは種類 | 用途 | 既定の期限と削除 |
| --- | --- | --- |
| [`hai:kit:ratelimit:{<digest>}`](#cache-kit-rate-limit) | 同じ利用者や業務範囲のリクエスト頻度を制限します。 | 最初の計数の書き込みが成功してから `windowMs` ミリ秒。加算時も期限を維持し、期限後の次回リクエストから数え直します。 |

<a id="cache-kit-rate-limit"></a>

### `hai:kit:ratelimit:{<digest>}`

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `count` | `integer` | — | この期間のリクエスト数。初回は `1`。既定の制限では上限を超えたリクエストも加算します。 | `2` |
| `resetAt` | `integer` | — | 初回の書き込みで計算した終了時刻の目安。単位は Unix ミリ秒です。共有ストアは Redis キーの実際の有効期限で判定します。 | `1794873660000` |

<a id="example-data"></a>

#### 例 · ある利用者の期間内アクセス数

2026 年 11 月 17 日 00:00:00 UTC に最初のリクエストを数え、60 秒の間に 2 回まで許可する例です。次は同じ接続元から 2 回目のリクエストが届いた時点の記録です。

```json
{
  "count": 2,
  "resetAt": 1794873660000
}
```

`count: 2` で上限に達しています。同じ時間枠で 3 回目のリクエストが届くと `3` に増え、既定では HTTP 429 を返します。`resetAt` の目安は 00:01:00 UTC のままです。Redis キーの期限後は次のリクエストを `1` から数えます。

キャッシュの `resetAt` はミリ秒単位です。レスポンスヘッダー `X-RateLimit-Reset` では Unix 秒に切り上げます。上限超過時の `Retry-After` は待機する秒数です。

<a id="browser-storage"></a>

## ブラウザーのストレージ

Cookie はブラウザーが保持し、リクエストと一緒に送ります。

| Cookie | 値と保持期限 |
| --- | --- |
| `hai_access_token` | 既定の `hai_access_token` はアクセストークンを保存し、名前を変更できます。`Path=/`、`HttpOnly`、`SameSite=Lax` を設定し、本番では `Secure` を使います。`Max-Age` は発行時の有効期間です。Bearer があればそちらを先に読みます。 |
| 暗号化の対象にしたアプリの Cookie | 暗号文は `enc:v2:` で始まり、期限は元の Cookie から引き継ぎます。鍵と通信状態は [Crypto](crypto.ja.md) を参照してください。 |

### ブラウザー要求のアクセス Cookie

ログイン時に発行されたアクセストークンを書き込み、以降のリクエストは認証フックで検証します。ログアウト時はサーバーでの失効処理に失敗した場合も、同じ名前とパスの Cookie を削除します。呼び出し元はログアウトの結果から失効処理の失敗を確認できます。

```http
Set-Cookie: hai_access_token=<redacted>; Path=/; Max-Age=900; HttpOnly; SameSite=Lax; Secure
```

値を伏せた本番 HTTPS レスポンスの例です。`Max-Age` は例では 900 秒、実際はログイン結果の `tokens.expiresIn` です。

### 暗号化対象の一般 Cookie

通常 Cookie の内容を隠し、改ざんを検証します。

```json
"enc:v2:<iv>:<ciphertext>:<mac>"
```

`enc:v2:` は形式を示します。続く 3 つはランダムな IV、暗号文、認証コードのプレースホルダーです。Kit は認証コードで Cookie 名とエンベロープを検証します。改ざんされた値や復号できない値は `undefined` が返ります。アプリは `event.cookies.get("order_preferences")` で検証済みの平文を読み取ります。
