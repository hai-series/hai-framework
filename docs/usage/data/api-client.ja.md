# @h-ai/api-client データ構造

[简体中文](api-client.md) · [English](api-client.en.md)

[データ構造一覧](README.ja.md) · [モジュールの設定](../configuration/api-client.ja.md) · [API リファレンス](../function/api-client.ja.md)

クライアントは、アプリが選んだ `TokenStorage` にログインの資格情報を書き込み、API の応答を呼び出し元に返し、リクエストの概要を購読者に渡します。独自のデータベーステーブル、キャッシュキー、データファイルは作成しません。サーバーのセッションは [IAM](iam.ja.md) が保存し、業務レコードは各業務モジュールが保存します。API の結果とリクエストの概要を残すかどうかはアプリが決めます。

<a id="browser-storage"></a>

## 資格情報ストレージ

`auth: {}` を渡すと既定の Cookie モードが有効になります。`auth.storage` で別のアダプターも選択できます。`apiClient.createAuthActions(client)` でのログインや自動更新に成功すると、サーバーが発行したトークンが選択済みのストレージに書き込まれます。ログイン操作を直接呼び出した場合は、成功結果のトークンを `client.auth.setTokens(tokens)` で保存します。初期化済みのクライアントの資格情報を更新、削除するときは `client.auth` を使います。[認証操作](../function/api-client.ja.md#auth-actions)を参照してください。

| 保存先 | データ | 保持と削除 |
| --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | アダプターはアクセストークンをメモリーに保持します。サーバーが `Set-Cookie` で設定する HttpOnly の更新用 Cookie はブラウザーが保持します。ページの JavaScript からその中のトークンを読み取ることはできません。 | ページの再読み込みで旧実行環境のメモリーが破棄されます。ブラウザーは Cookie の属性に従って保持、送信、削除します。アダプターの `clear()` が削除するのはアダプター内の状態です。 |
| `apiClient.tokenStorage.memory()` | 利用可能なアクセストークンと更新用トークンをアダプターごとのメモリーに保持します。 | 新しいアダプターは空です。明示的に削除するか、実行環境とともにアダプターが破棄されるまで保持します。SSR ではリクエストごとに専用のクライアントとストレージを作ります。 |
| アプリが渡す `TokenStorage` | 2 種類のトークンを非同期に読み書きし、削除する処理を実装します。ネイティブアプリでは [Capacitor のセキュアストレージ](capacitor.ja.md)を利用できます。 | 保持範囲はアダプターが決めます。永続化するアダプターはアプリ再起動後に資格情報を読み戻せます。ブラウザーの更新用資格情報には HttpOnly モードを使います。 |

ログアウトするには、`client.iam.auth.logout({})` などアプリのサーバー側ログアウトエンドポイントを呼びます。成功結果でセッションの無効化を確認します。Cookie モードでは、サーバーが応答で更新用 Cookie を削除します。サーバーの結果にかかわらず `client.auth.clear()` でローカルの資格情報を削除します。`client.close()` は進行中のストレージ処理の完了を待ち、クライアントの実行時状態と監視の購読を解放します。注入したストレージは引き続きアプリが管理します。[資格情報の更新](../function/api-client.ja.md#credentials)、[クライアントのライフサイクル](../function/api-client.ja.md#client-lifecycle)、[Serv のセッションと Cookie](serv.ja.md)を参照してください。

読み書きの契約とメモリーの例は、[ストレージのメソッド](../function/api-client.ja.md#token-storage-methods)を参照してください。

<a id="example-data"></a>

### クライアントが持つ認証情報

以下は、信頼されたクライアントがサーバーの応答本文で受け取る `TokenPair` の例です。トークン値は伏せています。`accessToken` は `Authorization: Bearer ...` リクエストヘッダーで送り、`expiresIn` はその有効期間（秒）を示します。`tokenType` は `"Bearer"` 固定です。`refreshToken` は省略可能で、サーバーが HttpOnly の更新用 Cookie を使う場合は本文に含まれません。

```json
{
  "accessToken": "<access-token:redacted>",
  "refreshToken": "<refresh-token:redacted>",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

<a id="response-data"></a>

## リクエストと応答のデータ

パス変数、クエリ、リクエスト本文、応答の構造は操作ごとに契約が定めます。クライアントは操作の定義に従って送信し、業務レコードはサーバーが保存します。フレームワークの業務操作は通常 `HaiResult<T>` を返します。まず `success` を確認します。成功時は `data` を読み、失敗時は `error.code` に応じて処理します。`error.message` は診断に、`error.traceId` はリクエストの関連付けに使えます。

独自の操作では、ラップされていない JSON 値または SSE ストリームを宣言できます。成功時は値または反復可能なストリームを直接受け取ります。失敗時は `HaiResult` の失敗分岐が返ることがあるため、値の利用やストリームの読み取りに先立って失敗分岐を判定します。[独自の応答](../function/api-client.ja.md#custom-response-results)を参照してください。

### 1回の API 呼び出し結果

ログイン後に `client.iam.auth.currentUser()` が成功すると、プロフィール、ロール、権限が返ります。日付は ISO 文字列で、アプリで利用者のタイムゾーンに変換して表示できます。

```json
{
  "success": true,
  "data": {
    "id": "u-42",
    "username": "alice",
    "accountStatus": "active",
    "createdAt": "2026-05-20T10:00:00.000Z",
    "updatedAt": "2026-05-20T10:15:00.000Z",
    "roles": ["member"],
    "permissions": []
  }
}
```

初期化前に呼び出すと失敗分岐が返ります。`success` を確認してから、`error.code` で初期化に関する問題を特定できます。メッセージはクライアントの言語設定に応じて変わります。

```json
{
  "success": false,
  "error": {
    "code": "hai:api-client:010",
    "message": "内部エラー (traceId: request-42)",
    "traceId": "request-42",
    "httpStatus": 500,
    "system": "hai",
    "module": "api-client"
  }
}
```

<a id="request-records"></a>

## リクエストの監視記録

`client.observeRequests(observer)` は、論理的な呼び出しごとに読み取り専用の `ApiRequestRecord` を 1 件渡します。更新や再試行は元の呼び出しに含まれます。SSE ではストリームを返した時点で概要を渡します。保存先と保存期間は購読者が決めます。[リクエスト監視 API](../function/api-client.ja.md#transport-observation)を参照してください。

| フィールド | 型 | 意味 |
| --- | --- | --- |
| `requestId` | `string` | 現在のリクエストコンテキストの関連 ID を使います。ID がなければクライアントが生成します。サーバーから有効な関連 ID を受け取ると更新されることがあります。 |
| `procedure` | `string` | `reports.get` など、契約内の操作パス。 |
| `timestamp`、`duration` | `number` | 開始時刻は Unix ミリ秒、経過時間の単位はミリ秒。 |
| `success`、`errorCode` | `boolean`、省略可能な `string` | 呼び出し結果と、取得できた場合のエラーコード。HTTP 200 でも業務上の失敗は `success: false` になります。 |
| `attempts` | `number` | 元のリクエストを送信した回数。再試行を含み、未送信なら 0 です。トークン更新と鍵交換は含みません。 |
| `method`、`url` | 省略可能な `string` | HTTP メソッドとサニタイズ済みの URL。入力が展開された実際のパスは残り、クエリ文字列とフラグメントは除かれます。 |
| `status` | 省略可能な `number` | 受信した HTTP 応答のステータスコード。 |

例えば `reports.get` が初回で成功すると、次のような概要を取得できます。記録にリクエストや応答のヘッダーと本文は含まれません。概要を転送する前に、URL 内の業務識別子がアプリのログ規則に沿っているかを確認できます。

```json
{
  "requestId": "request-42",
  "procedure": "reports.get",
  "timestamp": 1779271200000,
  "duration": 18,
  "success": true,
  "attempts": 1,
  "method": "GET",
  "url": "https://app.example.com/api/v1/reports/r-42",
  "status": 200
}
```
