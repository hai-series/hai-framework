# @h-ai/api-contract データ構造

[简体中文](api-contract.md) · [English](api-contract.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/api-contract.ja.md) · [API リファレンス](../function/api-contract.ja.md)

API 契約は HTTP 操作とリクエスト・レスポンスのスキーマを共通コードに定義します。サーバーはこの定義を基にエンドポイントを実装し、クライアントは送信する値と返ってくる値を確認します。例えば、ファイル詳細画面はオブジェクトのキーを送り、サイズ、メディアタイプ、最終更新日時を取得します。

<a id="data-ownership"></a>

## データの管理元

このモジュールはデータベーステーブル、キャッシュキー、データファイルを作成しません。契約の定義はアプリと一緒にビルドされます。各 HTTP メッセージはホストと呼び出し元が扱い、永続化する業務データは各モジュールが管理します。

| データ | 管理元と取得方法 |
| --- | --- |
| ドメイン、操作、スキーマ | 共有の契約コード。サーバーが実装済みの操作を登録し、クライアントは同じ定義から入出力の型を推論します。 |
| HTTP メッセージ | サーバーがパス引数、クエリー引数、本文を受け取り、クライアントが HTTP ステータス、ヘッダー、本文を読み取ります。ログの保存期間はホストが管理します。 |
| ユーザー、セッション、権限 | IAM が管理し、アプリは認可された API から取得します。 [IAM のデータ構造](iam.ja.md) |
| ファイルの内容とメタデータ | Storage のバックエンドが保存し、アプリは Storage API からメタデータやダウンロード URL を取得します。 [Storage のデータ構造](storage.ja.md) |
| チャット、決済、フィードバック | 設定した AI ストレージ、決済サービス、フィードバックサービスが管理します。 [AI](ai.ja.md) · [Payment](payment.ja.md) · [Feedback](feedback.ja.md) |

<a id="contract-metadata"></a>

## 契約のメタデータ

契約では操作をドメインとリソースで分類します。末端のノードが一つの操作を表します。次の表は `apiContract.iam.users.get` のノードを例にしています。

| メタデータ | この操作での値 | 用途 |
| --- | --- | --- |
| HTTP メソッド | `GET` | ユーザーを一人取得します。 |
| パステンプレート | `/iam/users/{id}` | 呼び出し時に `{id}` を `user-42` などのパス引数に置き換えます。API プレフィックスはホスト側で設定します。 |
| 操作 ID | `iam.users.get` | 生成された OpenAPI 仕様で操作を識別します。 |
| 入力スキーマ | `IamUserIdInputSchema` | `id` を含むオブジェクトを受け付けます。 |
| 出力スキーマ | `apiContract.haiResultSchema(IamUserSchema.nullable())` | 成功時はユーザーまたは `null` を返し、失敗時は `error` を返します。 |

操作の定義、ドメインの組み合わせ、パスの取得にはそれぞれ専用の入口があります。 [ルートの定義](../function/api-contract.ja.md#declare-routes) · [ドメインの組み合わせ](../function/api-contract.ja.md#compose-domains) · [操作パスの取得](../function/api-contract.ja.md#read-route-path)

<a id="response-data"></a>

## リクエストと応答のデータ

<a id="example-data"></a>

### JSON リクエストと業務結果

`apiContract.storage.files.getMetadata` が定義する `POST /storage/files/metadata` を例にします。アプリはアクセス可能なファイルの `key` を本文に含めます。サーバーはセッションとオブジェクトの読み取り権限を確認します。

```json
{
  "key": "reports/summary.txt"
}
```

成功時の `data` にはファイルのメタデータが入ります。`size` の単位はバイトで、HTTP JSON の `lastModified` は ISO 日時文字列です。例ではオプションの `etag` と `metadata` を省略しています。

```json
{
  "success": true,
  "data": {
    "key": "reports/summary.txt",
    "size": 1200,
    "contentType": "text/plain",
    "lastModified": "2026-05-20T10:00:00.000Z"
  }
}
```

アクセスを拒否した場合は `success: false` の応答を返します。呼び出し元は `error.code` で種類を判別し、`traceId` があればサーバーログと対応づけられます。例の `httpStatus` は業務エラーに対応するステータスです。実際の HTTP ステータスはホストが決めます。

```json
{
  "success": false,
  "error": {
    "code": "hai:common:101",
    "message": "Forbidden",
    "httpStatus": 403,
    "traceId": "request-42"
  }
}
```

| 構造 | 項目と用途 |
| --- | --- |
| `HaiResult<T>` の成功 | `success: true` のときは定義された `data` を読み取ります。`voidResultSchema` を使う操作では成功時の業務データがありません。例えばファイル削除の成功時は `{ "success": true }` です。 |
| `HaiResult<T>` の失敗 | `success: false` のときは `error` を読み取ります。 |
| `HaiErrorSchema` | `code` は文字列または数値、`message` は文字列です。`traceId`（128 文字まで）、`httpStatus`、`system`、`module`、`cause`、`suggestion`、`ext` は省略可能です。どの診断値を応答に含めるかはホストが管理します。 |
| その他の応答 | アプリ独自の操作は値やストリームを直接返せます。Webhook の確認応答はチャネルごとの仕様に従います。例えば Alipay 通知の成功時はプレーンテキストの `success` を返します。 [クライアントの独自応答](../function/api-client.ja.md#custom-response-results) · [Alipay の確認応答](../function/payment.ja.md#alipay-notification-ack) |

<a id="paginated-data"></a>

### ページングのリクエストと結果

`PaginationQuerySchema` を使うリクエストは、省略可能な整数の `page`（1 以上）と `pageSize`（1〜100）を受け付けます。GET のクエリー文字列に含まれる数値は数値型に変換されます。省略時の既定値は処理側が決めます。Storage のファイル一覧など、カーソルを使う操作には個別の入出力スキーマがあります。

例えば `iam.users.read` 権限を持つ管理クライアントが `GET /iam/users?page=1&pageSize=1` を呼び出すと、成功時の `data` にページ情報が入ります。

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "user-42",
        "username": "alice",
        "accountStatus": "active",
        "createdAt": "2026-05-20T10:00:00.000Z",
        "updatedAt": "2026-05-20T10:15:00.000Z"
      }
    ],
    "total": 3,
    "page": 1,
    "pageSize": 1
  }
}
```

`items` はこのページのレコード、`total` は現在の絞り込み条件に一致する総件数です。`page` と `pageSize` は実際に返されたページ番号と件数設定です。例では一人分が返り、残り二人は後続ページで取得できます。IAM の必須日時項目（ユーザー、ロール、権限の `createdAt` と `updatedAt`、OTP 送信結果の `expiresAt`）は、有効な `Date`、またはタイムゾーン付きの ISO 日時文字列を受け付けます。`null` は検証エラーになり、HTTP JSON ではクライアントは文字列を受け取ります。

<a id="public-settings"></a>

### IAM の公開設定レスポンス

ログイン画面は `apiContract.iam.auth.publicConfig` が定義する `GET /auth/config` で、ログイン、登録、CAPTCHA、画面表示に使う公開設定を取得できます。成功時の `data` は `IamPublicConfigSchema` が定めるオプションを含み、`null` を返すこともあります。例えば `data.register.enabled` で登録リンクを表示するか判断し、登録リクエストは IAM が有効なポリシーで確認します。 [IAM の設定と既定値](../configuration/iam.ja.md) · [IAM エンドポイントの登録](../function/api-contract.ja.md#serv-iam-wiring)
