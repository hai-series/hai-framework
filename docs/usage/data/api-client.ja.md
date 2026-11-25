# @h-ai/api-client データ構造

[简体中文](api-client.md) · [English](api-client.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/api-client.ja.md) · [API リファレンス](../function/api-client.ja.md)

アプリで `auth` を有効にすると、クライアントは更新用の資格情報で期限切れのアクセストークンを更新できます。ローカルの資格情報は選択した `TokenStorage` で管理し、業務の結果は API の応答で確認します。

<a id="browser-storage"></a>

## 資格情報ストレージ

クライアントは SQL テーブルや Redis キーを作成しません。サーバー側のセッションは [IAM](iam.ja.md) が永続化します。`client.close()` はクライアントのリソースを解放します。渡したストレージは引き続きアプリが管理します。ログアウト API はサーバー側のセッションを取り消し、応答でブラウザーの更新 Cookie を削除します。その後、`client.auth.clear()` でローカルの資格情報を消去します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | 既定のアダプター。アクセス用の値は初期状態で空、再読み込みで消失。更新 Cookie はブラウザーが送信。 |
| `apiClient.tokenStorage.memory()` | 両方のトークンは初期状態で空。削除またはインスタンス破棄まで保持。SSR のリクエストごとに分離。 |
| `TokenStorage` | アプリ指定のアダプター。ネイティブでは OS の安全なストレージを利用可能。Web の既定は localStorage を使わない。 |

<a id="example-data"></a>

### クライアントが持つ認証情報

access token で認証し、必要時に refresh token で更新します。

```json
{
  "accessToken": "<access-token:redacted>",
  "refreshToken": "<refresh-token:redacted>"
}
```

値は秘匿した表示例です。ブラウザー既定の refresh token は HttpOnly Cookie にあり、ページから読んだり localStorage に保存したりしません。

<a id="response-data"></a>

## リクエストと応答のデータ

### 1回の API 呼び出し結果

アクセストークンの保存後、ログイン画面は `client.iam.auth.currentUser()` でアカウントを読み込めます。`success` を確認し、成功時は `data` でプロフィールを表示し、失敗時は `error` を処理します。

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

この抜粋は現在のユーザーのプロフィール、ロール、権限を示します。クライアントは検証後も ISO 日付文字列を保持し、アプリで利用者のタイムゾーンに変換して表示できます。ページを再読み込みしたらプロフィールを再取得し、権限はリクエストごとにサーバーが確認します。独自のエンドポイントは JSON 値や SSE を返せます。利用する前に `HaiResult` の失敗分岐を確認します。[独自のレスポンス](../function/api-client.ja.md#custom-response-results)を参照してください。
