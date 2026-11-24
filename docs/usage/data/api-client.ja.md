# @h-ai/api-client データ構造

[简体中文](api-client.md) · [English](api-client.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/api-client.ja.md) · [API リファレンス](../function/api-client.ja.md)

アクセス令牌の期限が切れると、API Client は更新用の資格情報で新しいトークンを取得し、リクエストを再試行します。資格情報は選択したアダプターが管理し、業務の応答は呼び出し元が利用します。

<a id="browser-storage"></a>

## 資格情報ストレージ

クライアントはローカルの認証情報を管理し、サーバーのセッションは IAM が永続化します。

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

success を確認してから結果を読みます。

```json
{
  "success": true,
  "data": {
    "id": "order-42",
    "status": "created"
  }
}
```

例では order-42 が作成済みです。キャッシュ記録ではなく、再読み込み後に自動保持されません。
