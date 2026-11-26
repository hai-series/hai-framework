# @h-ai/serv データ構造

[简体中文](serv.md) · [English](serv.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/serv.ja.md) · [API リファレンス](../function/serv.ja.md) · [注文運用コンソールのチュートリアル](../getting-started/serv.ja.md)

注文運用コンソールがレポートを読み込むと、Serv は認証済みの監査担当者とリクエスト ID をハンドラーに渡します。ログインや更新に成功すると、ブラウザーに次回の更新に使う Cookie を設定できます。

<a id="runtime-data"></a>

## リクエストコンテキスト

`ServContext` は業務リクエストの処理中だけ保持されます。ハンドラーは次の項目で利用者や権限を確認し、レスポンスとログを照合します。

| フィールド | 読み取る場面と意味 |
| --- | --- |
| `requestId` | レスポンスの `X-Request-Id` と照合できる追跡 ID。匿名リクエストにも付きます。 |
| `session` | 共通の `HttpSession` を使用します。`userId`、`roles`、`permissions` は必須です。`username`、`displayName`、`avatarUrl`、アプリ固有の `data` は任意です。未認証の場合は省略されます。 |
| `ip` | 信頼済みプロキシの規則で解決した接続元アドレス。信頼できるアドレスを取得できない場合は省略されます。 |
| `locale` | このリクエストに適用する言語。 |
| `terminalType`、`userAgent` | 端末種別と任意の User-Agent。既定のコンテキストは不明な端末種別を `web` として扱います。この項目は業務処理とログの参考にします。 |
| `scopeId` | 所属組織などの任意の業務範囲。ホストの信頼済みコンテキストファクトリーで設定します。既定のコンテキストはリクエストヘッダーから読み取りません。 |
| `request`、`logger` | 処理や調査に使用する、現在のリクエストとサーバー側のロガー。 |
| `accessToken` | Bearer ヘッダーから取得したアクセストークン。サーバー側で使用し、認証の結果は `session` で確認します。 |

Serv の `ServSession` と Kit の `SessionData` は、どちらも `@h-ai/core` の `HttpSession` を使います。認証に成功すると、ホストは `data._tokenPair` を除いた項目を現在のリクエストに渡します。セッションの保存、更新、取り消しは引き続き IAM が管理します。 [IAM のセッションデータ](iam.ja.md)

<a id="example-data"></a>

### 処理関数に渡す利用者情報とリクエスト番号

処理関数が利用者・権限・調査対象を知るための情報です。

```json
{
  "requestId": "request-42",
  "locale": "zh-CN",
  "ip": "192.0.2.42",
  "terminalType": "web",
  "session": {
    "userId": "user-42",
    "roles": [
      "auditor"
    ],
    "permissions": [
      "reports:read"
    ]
  }
}
```

request-42 が追跡番号で、認証済みの user-42 はレポートを参照できます。Request と logger は省略し、自己申告の権限は採用しません。

## データベース

Serv が作成するデータベーステーブルは 0 件です。注文やレポートはアプリが保存し、IAM を有効にした場合は [IAM](iam.ja.md) がセッションを管理します。

A2A を有効にした場合、ホストが HTTP を処理し、AI モジュールがタスクイベントとメッセージを保存します。 [A2A のタスクとメッセージ](ai.ja.md#table-hai-ai-a2a-journal)

<a id="cache"></a>

## キャッシュ

Redis でレート制限を有効にすると、Serv と Kit は次の 1 種類のキーを使います。計数対象の `key` は、既定では信頼済みの接続元 IP で、アプリでも指定できます。`SHA-256(JSON.stringify([namespace, windowMs, key]))` の 16 進表現が `digest` になり、Cache が Redis キーに `keyPrefix` を付けます。Redis のデータベース、接頭辞、名前空間、時間枠、計数対象が一致するインスタンスは同じレコードに加算します。プロセス内ストアは個別に数え、Redis には書き込みません。鍵の登録と再送防止レコードは [Crypto](crypto.ja.md) が管理します。 [レート制限の組み込み](../getting-started/serv.ja.md#orders-console-access)

| キーまたは種類 | 用途 | 既定の期限と削除 |
| --- | --- | --- |
| [`hai:kit:ratelimit:{<digest>}`](#cache-http-rate-limit) | 同じ利用者や業務範囲のリクエスト頻度を制限します。 | 最初の計数の書き込みが成功してから `windowMs` ミリ秒。加算時も期限を維持し、期限後の次回リクエストから数え直します。 |

<a id="cache-http-rate-limit"></a>

### `hai:kit:ratelimit:{<digest>}`

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `count` | `integer` | — | この期間のリクエスト数。初回は `1`。既定の制限では上限を超えたリクエストも加算します。 | `2` |
| `resetAt` | `integer` | — | 初回の書き込みで計算した終了時刻の目安。単位は Unix ミリ秒です。共有ストアは Redis キーの実際の有効期限で判定します。 | `1794873660000` |

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

| キー | 書き込む条件と保持期間 |
| --- | --- |
| `hai_refresh_token` | 有効時にサーバーが更新用 Cookie を API の更新パスに設定。既定は 30 日、HttpOnly、SameSite=Strict。Secure は環境または明示設定に従う。 |
| Cookie の削除 | 明示的なログアウトが成功すると、同じ名前とパスに `Max-Age=0` を設定して削除します。更新に失敗した場合は現在の Cookie を保持します。 |

### ブラウザーの認証更新 Cookie

ブラウザーの更新用 Cookie を有効にすると、ログイン・登録・更新の成功時に新しい更新トークンを Cookie に設定し、該当レスポンス本文から取り除きます。クライアントが更新ルートを呼び出したとき、ブラウザーが Cookie の属性に従って送信します。

```http
Set-Cookie: hai_refresh_token=<redacted>; Path=/api/v1/auth/refresh; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure
```

既定の API 接頭辞を使う本番 HTTPS レスポンスの例です。値は伏せています。接頭辞を変更すると更新ルートと Cookie のパスも変わります。Cookie の保持期限とサーバー側のトークン期限は個別に判定します。

信頼済みネイティブ端末は認証レスポンスからトークンを受け取れます。端末での保存方法は [Capacitor](capacitor.ja.md) を参照してください。

<a id="report-audio-data"></a>

## レポートの音声データ

HTTP の音声エンドポイントは、設定済みのモデルに入力を渡し、同じリクエストのレスポンスで結果を返します。Serv のメディアルートは録音、合成ファイル、文字起こしをアプリのデータベースに保存しません。監査メモを残す場合は、利用者が確認した文章をアプリ側で保存します。

| 操作 | 入力 | 結果 |
| --- | --- | --- |
| レポートを読み上げる | JSON の `text` と任意の `format` | 成功すると WAV または MP3 ファイル。例は `speech.mp3`（`audio/mpeg`）。 |
| 監査メモを文字起こしする | multipart の `audio` ファイル。WAV または MP3、最大 8 MiB | JSON の `data.text`。モデルによって `language` とミリ秒単位の `durationMs` も返ります。 |

```json
{
  "success": true,
  "data": { "text": "Quarterly summary", "language": "en", "durationMs": 1250 }
}
```

文字起こし結果の例です。ページは `data.text` をメモ欄に反映できます。リアルタイムの WebSocket 音声を使う場合、接続認可用の短時間・一回限りのチケットは IAM が管理します。 [HTTP 音声のチュートリアル](../getting-started/serv.ja.md#orders-console-audio) · [IAM のチケットレコード](iam.ja.md#cache-iam-ticket)

リアルタイム用チケットのレスポンスは `ticket` と UNIX 時刻をミリ秒で表す `expiresAt` を含みます。有効期間の既定値は 30 秒です。チケットはアカウントと操作にひも付き、接続時にアトミックに消費されます。`serv.createIamAudio()` は IAM 権限を再確認し、接続の認可はセッションが続く間だけ保持します。
