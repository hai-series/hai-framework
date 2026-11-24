# @h-ai/kit データ構造

[原文（中国語）](kit.md) · [設定](../configuration/kit.ja.md) · [API リファレンス](../function/kit.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### ある利用者の期間内アクセス数

対応する構造：`rate-limit cache value`。

利用者や範囲ごとの頻度を制限し、複数ノードでも枠を共有します。

```json
{
  "count": 2,
  "resetAt": 1794873660000
}
```

count:2 は2回、resetAt は Unix ミリ秒の期間終了時刻です。この例の期間は60秒で、更新しても延長しません。

### ブラウザー要求のアクセス Cookie

対応する構造：`hai_access_token`。

Kit が検証してから身元を処理側に渡します。

```json
"<access-token:redacted>"
```

値は秘匿、既定は HttpOnly・Lax・Path=/ で、有効時間は認証結果に従います。

### 暗号化対象の一般 Cookie

対応する構造：`encrypted application cookie`。

通常 Cookie の内容を隠し、改ざんを検証します。

```json
"enc:v2:<encrypted-content>"
```

enc:v2: は形式で、後続は実際に復号できない例です。リクエスト番号や期限の変更ではありません。

## 項目・保存・削除のリファレンス

### データベース

Kit は SQL テーブルを作りません。セッション、監査、オブジェクトは [IAM](iam.ja.md)、[Audit](audit.ja.md)、[Storage](storage.ja.md) が管理します。

### キャッシュキー

アプリが共有レート制限ストアを選んだ場合、Kit は 1 種類のキーを使います。`digest` は名前空間、`windowMs`、制限対象から得る SHA-256 です。Redis は Cache の `keyPrefix` を加えます。共有 Redis なら同じ計数を参照し、プロセス内ストアでは個別に数えます。

| キーまたは種類 | 用途 | 既定の期限と削除 |
| --- | --- | --- |
| [`hai:kit:ratelimit:{<digest>}`](#cache-kit-rate-limit) | 同じ利用者や業務範囲のリクエスト頻度を制限します。 | 最初のリクエストから `windowMs` ミリ秒。加算時も期限を維持し、期限後の次回リクエストから数え直します。 |

<a id="cache-kit-rate-limit"></a>

#### `hai:kit:ratelimit:{<digest>}`

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `count` | `integer` | — | この期間のリクエスト数。初回は `1`。 | `2` |
| `resetAt` | `number` | — | 初回の時刻に期間を足した Unix ミリ秒。応答ヘッダーの残り時間の見積もりに使います。 | `1794873660000` |

### Cookie

Cookie はブラウザーが保持し、リクエストと一緒に送ります。

| Cookie | 値と保持期限 |
| --- | --- |
| `hai_access_token` | 既定の `hai_access_token` はアクセストークンを保存し、名前を変更できます。`Path=/`、`HttpOnly`、`SameSite=Lax` を設定し、本番では `Secure` を使います。`Max-Age` は発行時の有効期間です。Bearer があればそちらを先に読みます。 |
| 暗号化の対象にしたアプリの Cookie | 暗号文は `enc:v2:` で始まり、期限は元の Cookie から引き継ぎます。鍵と通信状態は [Crypto](crypto.ja.md) を参照してください。 |
