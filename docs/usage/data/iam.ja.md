# @h-ai/iam データ構造

<!-- translation: partial -->

[原文（中国語）](iam.md) · [設定](../configuration/iam.ja.md) · [API リファレンス](../function/iam.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

まず用途と例を読み、必要に応じて後半の項目・保存規則を確認してください。ID と業務内容は架空で、秘密は隠しています。時刻は 2026-11-17 00:00 UTC を起点とし、単位は各説明に記します。

DB・ファイルの例は関連項目の抜粋で、そのまま完全な書き込みデータには使えません。省略項目が任意とは限らず、例ごとに異なる段階を示す場合があります。

### 利用者のアカウント

対応する構造：`hai_iam_users`。

身元と利用可否を保存し、認証・認可時に確認します。

```json
{
  "id": "user-42",
  "username": "example-user",
  "email": null,
  "password_hash": null,
  "account_type": "permanent",
  "account_status": "active",
  "must_change_password": false,
  "login_failed_count": 0
}
```

user-42 は有効な常設アカウントです。メールとハッシュの null は未登録で、空パスワード認証を許す意味ではありません。

### 利用者に割り当てる役割

対応する構造：`hai_iam_roles`。

複数利用者に共通の権限を配るための役割です。

```json
{
  "id": "role-reader",
  "code": "reader",
  "name": "Reader",
  "is_system": false
}
```

role-reader のコードは reader、表示名は Reader で、システム役割ではありません。

### アプリが確認する個別権限

対応する構造：`hai_iam_permissions`。

保護する操作に安定した権限コードを付けます。

```json
{
  "id": "permission-read",
  "code": "orders.read",
  "name": "Read orders",
  "resource": "orders",
  "action": "read"
}
```

orders.read は注文参照です。この行を作るだけでは誰にも付与されません。

### 誰がどの役割を持つか

対応する構造：`hai_iam_user_roles`。

利用者と役割を関連付けます。

```json
{
  "user_id": "user-42",
  "role_id": "role-reader"
}
```

user-42 に role-reader が割り当てられ、同じ組合せは一度だけ保存します。

### 役割に含まれる権限

対応する構造：`hai_iam_role_permissions`。

役割と個別権限を結び、最終的な操作可否を求めます。

```json
{
  "role_id": "role-reader",
  "permission_id": "permission-read"
}
```

前の利用者関連と合わせ、user-42 は orders.read を得ます。

### プログラム用 API 認証情報

対応する構造：`hai_iam_api_keys`。

スクリプトなどに限定した操作を許し、検証用ダイジェストを保存します。

```json
{
  "id": "apikey-42",
  "user_id": "user-42",
  "name": "Example API",
  "key_hash": "<hash:redacted>",
  "key_prefix": "<prefix:redacted>",
  "enabled": true,
  "expires_at": null,
  "scopes": [
    "orders.read"
  ]
}
```

user-42 の注文参照専用です。秘匿した値から元のキーは復元できません。

### ディレクトリエントリーをローカル利用者に関連付ける

`hai_iam_ldap_identities` は LDAP ログインとオフライン取り込みが参照する関連付けです。`directory_id` と `entry_id` の組は一意で、`user_id` はディレクトリ内で一意のローカル利用者を参照します。利用者を削除すると関連付けも削除されます。例のエントリーは名前を変更しても同じ `user-42` に対応します。

```json
{
  "directory_id": "company-directory",
  "entry_id": "3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76",
  "user_id": "user-42"
}
```

### 利用者の有効なログイン状態

対応する構造：`hai:iam:sessions:{<scope-digest>}`。

検証・更新・ログアウトで共通利用し、古い状態の復活を防ぎます。

```json
{
  "revision": "revision-42",
  "sessions": {
    "<access-token:redacted>": {
      "session": {
        "userId": "user-42",
        "username": "example-user",
        "roles": [
          "reader"
        ],
        "permissions": [
          "orders.read"
        ],
        "createdAt": "2026-11-17T00:00:00.000Z",
        "expiresAt": "2026-11-18T00:00:00.000Z"
      },
      "refreshExpiresAt": 1795478400000,
      "refreshToken": "<refresh-token:redacted>"
    }
  }
}
```

user-42 の例で、アクセスは翌日まで、更新用はより長く保持します。revision は変更ごとに更新します。

### 使い捨てコードと再送待ち

対応する構造：`hai:iam:otp:example@example.invalid`。

現在のコード・失敗回数・再送可能時刻を保存します。

```json
{
  "version": "otp-version-42",
  "code": "<otp:redacted>",
  "attempts": 0,
  "expiresAt": 1794873900000,
  "cooldownUntil": 1794873660000
}
```

未失敗で、有効5分、再送待ち60秒です。成功後は使い回せません。

### 今回の CAPTCHA の検証情報

対応する構造：`hai:iam:captcha:<id>`。

用途と一度限りの利用を確認するため、挑戦と秘密を保存します。

```json
{
  "operation": "login",
  "signatureSecret": "<secret:redacted>",
  "keySecret": "<secret:redacted>"
}
```

login 専用の例で、秘密と挑戦詳細は省略しています。記録全体を画面に送りません。

### 短時間だけ使える一回券

対応する構造：`hai:iam:ticket:<ticket:redacted>`。

主体と用途を確認して一度だけ使う臨時許可です。

```json
{
  "subjectId": "user-42",
  "purpose": "ai-audio",
  "grant": {
    "operation": "transcribe"
  },
  "expiresAt": 1794873630000
}
```

user-42 の音声文字起こし用で30秒有効、同じ券での再接続は拒否します。

### 権限キャッシュが現在も使えるか

対応する構造：`hai:iam:read_cache:revision`。

権限などの変更中に古いキャッシュを使わないための共有印です。

```json
{
  "epoch": "epoch-42",
  "writers": 0
}
```

writers:0 は書き込み中なし、epoch-42 は世代で、この印自体は失効しません。

### 取得した利用者情報の短期再利用

対応する構造：`hai:iam:read_cache:epoch-42:user:v2:user-42`。

短期間の同じ読み取りを再利用し、変更後の古い世代は使いません。

```json
{
  "value": {
    "id": "user-42",
    "username": "example-user"
  }
}
```

value は user-42 の抜粋で、既定60秒、epoch の一致も必要です。

## 項目・保存・削除のリファレンス

認証データは RelDB に保存し、取り消し可能なセッション状態は本番環境で Cache を共有します。認証情報と権限状態はサーバーに保持します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_iam_users` | ユーザー ID、ログイン名、パスワードハッシュ、状態とプロフィール項目。 |
| `hai_iam_roles`, `hai_iam_permissions` | 名前付きロールと権限定義。 |
| `hai_iam_user_roles`, `hai_iam_role_permissions` | ユーザーとロール、ロールと権限の対応。 |
| `hai_iam_api_keys` | API キーの状態と所有者。キー素材はハッシュ化して保存。 |
| Cache / キャッシュ | 利用者のセッションと索引、トークン検証・失効、OTP の試行、チャレンジと一回用チケット。期限と削除は認証方式・ポリシーによる。 |

未翻訳：アカウントの全項目、キャッシュキーと認証情報の有効期限。[中国語の該当節](iam.md#data-fields)を参照してください。
