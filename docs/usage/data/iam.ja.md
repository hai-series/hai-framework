# @h-ai/iam データ構造

[简体中文](iam.md) · [English](iam.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/iam.ja.md) · [API リファレンス](../function/iam.ja.md)

ユーザーのログインや保護対象へのアクセス時に、IAM はデータベースでアカウント、ロール、権限を確認します。セッション、確認コード、読み取り結果は有効期限付きでキャッシュし、権限更新後は新しいバージョンで判定します。

<a id="database"></a>

## データベース

認証データは RelDB に保存し、取り消し可能なセッション状態は本番環境で Cache を共有します。認証情報と権限状態はサーバーに保持します。

IAM のテーブルは全部で 7 つです。LDAP と API Key の各テーブルは、その機能が有効な場合に作成します。

| テーブル | 用途 |
| --- | --- |
| [`hai_iam_users`](#table-hai-iam-users) | アカウントの情報、状態、認証情報のハッシュ、ログイン保護の状態を保存します。 |
| [`hai_iam_roles`](#table-hai-iam-roles) | アカウントに付与できるロールを定義します。 |
| [`hai_iam_permissions`](#table-hai-iam-permissions) | アプリが判定する個別の権限を定義します。 |
| [`hai_iam_user_roles`](#table-hai-iam-user-roles) | 利用者に付与されたロールを検索します。 |
| [`hai_iam_role_permissions`](#table-hai-iam-role-permissions) | ロールが付与する権限を検索します。 |
| [`hai_iam_api_keys`](#table-hai-iam-api-keys) | プログラム用認証情報の所有者、ハッシュ、許可範囲を確認します。 |
| [`hai_iam_ldap_identities`](#table-hai-iam-ldap-identities) | ディレクトリの安定した識別子をローカルアカウントに紐付けます。 |

<a id="table-hai-iam-users"></a>

### `hai_iam_users`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 利用者の主キー。 | `user-42` |
| `username` | `TEXT` | 不可 | — | ログインに使う一意の利用者名。 | `example-user` |
| `email` | `TEXT` | 可 | — | メールアドレス。 | `null` |
| `phone` | `TEXT` | 可 | — | 電話番号。 | `NULL` |
| `display_name` | `TEXT` | 可 | — | 表示名。 | `Example User` |
| `avatar_url` | `TEXT` | 可 | — | アバターの URL。 | `https://images.example.invalid/user-42.png` |
| `email_verified` | `BOOLEAN` | 可 | `false` | メールアドレスの確認済みフラグ。 | `false` |
| `phone_verified` | `BOOLEAN` | 可 | `false` | 電話番号の確認済みフラグ。 | `false` |
| `password_hash` | `TEXT` | 可 | — | パスワードのハッシュ。ローカルパスワードがないアカウントは NULL の場合があります。 | `null` |
| `password_updated_at` | `TIMESTAMP` | 可 | — | パスワードの最終設定時刻。 | `NULL` |
| `login_failed_count` | `INTEGER` | 可 | `0` | ログイン失敗の回数。 | `0` |
| `first_login_failed_at` | `TIMESTAMP` | 可 | — | 現在の集計期間で最初にログインに失敗した時刻。 | `NULL` |
| `last_login_failed_at` | `TIMESTAMP` | 可 | — | 最後にログインに失敗した時刻。 | `NULL` |
| `locked_until` | `TIMESTAMP` | 可 | — | ログインロックの終了時刻。 | `NULL` |
| `metadata` | `JSON` | 可 | — | アプリが保存する追加情報。 | `{"department":"Support"}` |
| `created_at` | `TIMESTAMP` | 不可 | — | アカウントの作成時刻。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 不可 | — | アカウントの最終更新時刻。 | `2026-11-17T00:00:00Z` |
| `must_change_password` | `BOOLEAN` | 不可 | `false` | 次回ログイン後にパスワード変更が必要かどうか。 | `false` |
| `account_type` | `TEXT` | 不可 | `permanent` | アカウントの種類。 | `permanent` |
| `account_status` | `TEXT` | 不可 | `active` | アカウントの現在の状態。 | `active` |
| `account_expires_at` | `TIMESTAMP` | 可 | — | アカウントの利用期限。 | `NULL` |
| `last_login_at` | `TIMESTAMP` | 可 | — | 最後にログインに成功した時刻。 | `2026-11-17T00:00:00Z` |
| `credential_version` | `TEXT` | 不可 | `""` | 認証情報の変更時に更新し、古いセッションの無効化に使う値。 | `<credential-version>` |
| `reset_version` | `TEXT` | 不可 | `""` | 現在のパスワード再設定要求のバージョン。 | `<reset-version>` |
| `reset_hash` | `TEXT` | 可 | — | 再設定用認証情報のダイジェスト。 | `NULL` |
| `reset_expires_at` | `BIGINT` | 可 | — | 再設定用認証情報の期限。Unix ミリ秒。 | `1794874500000` |
| `reset_attempts` | `INTEGER` | 不可 | `0` | 現在の再設定用認証情報の検証試行回数。 | `0` |

<a id="example-data"></a>


#### 例 · 利用者のアカウント

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

<a id="table-hai-iam-roles"></a>

### `hai_iam_roles`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | ロールの主キー。 | `role-reader` |
| `code` | `TEXT` | 不可 | — | アプリが判定に使う一意のロールコード。 | `reader` |
| `name` | `TEXT` | 不可 | — | ロールの表示名。 | `Reader` |
| `description` | `TEXT` | 可 | — | ロールの用途の説明。 | `Can read orders` |
| `is_system` | `BOOLEAN` | 可 | `false` | システムロールかどうか。 | `false` |
| `created_at` | `TIMESTAMP` | 不可 | — | ロールの作成時刻。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 不可 | — | ロールの最終更新時刻。 | `2026-11-17T00:00:00Z` |

<a id="利用者に割り当てる役割"></a>

#### 例 · 利用者に割り当てる役割

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

<a id="table-hai-iam-permissions"></a>

### `hai_iam_permissions`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 権限の主キー。 | `permission-read` |
| `code` | `TEXT` | 不可 | — | 一意の権限コード。 | `orders.read` |
| `name` | `TEXT` | 不可 | — | 権限の表示名。 | `Read orders` |
| `description` | `TEXT` | 可 | — | 権限で許可する操作の説明。 | `Read order details` |
| `resource` | `TEXT` | 可 | — | 操作対象のリソース種別。 | `orders` |
| `action` | `TEXT` | 可 | — | 許可する操作。 | `read` |
| `type` | `TEXT` | 可 | — | アプリが分類に使う権限の種類。 | `NULL` |
| `sensitive_operations` | `JSON` | 可 | — | この権限に属する機微な操作の設定。 | `NULL` |
| `created_at` | `TIMESTAMP` | 不可 | — | 権限の作成時刻。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 不可 | — | 権限の最終更新時刻。 | `2026-11-17T00:00:00Z` |

<a id="アプリが確認する個別権限"></a>

#### 例 · アプリが確認する個別権限

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

<a id="table-hai-iam-user-roles"></a>

### `hai_iam_user_roles`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `TEXT` | 不可 | — | 付与先の利用者 ID。一意の組の一部で、検索用に索引があります。 | `user-42` |
| `role_id` | `TEXT` | 不可 | — | 付与したロール ID。`user_id` と一意の組になります。 | `role-reader` |

<a id="誰がどの役割を持つか"></a>

#### 例 · 誰がどの役割を持つか

利用者と役割を関連付けます。

```json
{
  "user_id": "user-42",
  "role_id": "role-reader"
}
```

user-42 に role-reader が割り当てられ、同じ組合せは一度だけ保存します。

<a id="table-hai-iam-role-permissions"></a>

### `hai_iam_role_permissions`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `role_id` | `TEXT` | 不可 | — | 権限を含むロール ID。一意の組の一部で、検索用に索引があります。 | `role-reader` |
| `permission_id` | `TEXT` | 不可 | — | ロールが付与する権限 ID。`role_id` と一意の組になります。 | `permission-read` |

<a id="役割に含まれる権限"></a>

#### 例 · 役割に含まれる権限

役割と個別権限を結び、最終的な操作可否を求めます。

```json
{
  "role_id": "role-reader",
  "permission_id": "permission-read"
}
```

前の利用者関連と合わせ、user-42 は orders.read を得ます。

<a id="table-hai-iam-api-keys"></a>

### `hai_iam_api_keys`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | API Key の主キー。 | `apikey-42` |
| `user_id` | `TEXT` | 不可 | — | API Key の所有者の利用者 ID。 | `user-42` |
| `name` | `TEXT` | 不可 | — | キーを識別する表示名。 | `Example API` |
| `key_hash` | `TEXT` | 不可 | — | API Key の検証用ハッシュ。 | `<hash:redacted>` |
| `key_prefix` | `TEXT` | 不可 | — | 表示用のキープレフィックス。 | `<prefix:redacted>` |
| `enabled` | `BOOLEAN` | 不可 | `true` | API Key が有効かどうか。 | `true` |
| `expires_at` | `TIMESTAMP` | 可 | — | API Key の利用期限。 | `null` |
| `created_at` | `TIMESTAMP` | 不可 | — | API Key の発行時刻。 | `2026-11-17T00:00:00Z` |
| `last_used_at` | `TIMESTAMP` | 可 | — | 最終利用時刻。 | `NULL` |
| `scopes` | `JSON` | 可 | — | API キーに設定された権限のスコープ。 | `["orders:read"]` |

<a id="プログラム用-api-認証情報"></a>

#### 例 · プログラム用 API 認証情報

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

<a id="table-hai-iam-ldap-identities"></a>

### `hai_iam_ldap_identities`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `directory_id` | `TEXT` | 不可 | — | LDAP ディレクトリを区別する ID。 | `company-directory` |
| `entry_id` | `TEXT` | 不可 | — | エントリーの安定した ID。`directory_id` と一意の組になります。 | `3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76` |
| `user_id` | `TEXT` | 不可 | — | ローカル利用者を参照し、`directory_id` と一意の組になります。利用者の削除時に紐付けも削除されます。 | `user-42` |

API Key の元の値は発行時だけ返ります。アカウント、ロール、権限の変更には `iam.user` や `iam.authz` などの公開 API を使います。IAM が関連するセッションやキャッシュを更新します。

`verifyApiKey` は所有アカウントを確認し、現在のアカウント権限とキースコープの共通部分を検証時に計算して `VerifiedApiKey.permissions` を返します。 [API キーによる認証](../function/iam.ja.md#api-keys)

<a id="ディレクトリエントリーをローカル利用者に関連付ける"></a>

#### 例 · ディレクトリエントリーをローカル利用者に関連付ける

`hai_iam_ldap_identities` は LDAP ログインとオフライン取り込みが参照する関連付けです。`directory_id` と `entry_id` の組は一意で、`user_id` はディレクトリ内で一意のローカル利用者を参照します。利用者を削除すると関連付けも削除されます。例のエントリーは名前を変更しても同じ `user-42` に対応します。

```json
{
  "directory_id": "company-directory",
  "entry_id": "3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76",
  "user_id": "user-42"
}
```

<a id="data-fields"></a>

<a id="cache"></a>

## キャッシュ

IAM は 6 種類のキャッシュに書き込みます。以下は論理キーです。`keyPrefix` があれば Redis で接頭辞が付きます。セッション、コード、チケット、権限情報はサーバー側に保持します。

| キーまたは種類 | 用途 | 既定の期限と削除 |
| --- | --- | --- |
| [`hai:iam:sessions:{<scope-digest>}`](#cache-iam-sessions) | 一つの利用者範囲のセッションと更新用認証情報をまとめて管理します。 | 最後に残るアクセス・更新認証情報の期限で削除します。セッションがなければ削除し、スライド延長はセッション設定に従います。 |
| [`hai:iam:otp:<identifier>`](#cache-iam-otp) | メールや電話番号の現在のコードを検証し、試行・再送を制限します。 | コードは既定 300 秒、再送待ちは 60 秒。遅い方の期限までキーを保持し、使用済み・試行上限ではコードを消します。 |
| [`hai:iam:captcha:<id>`](#cache-iam-captcha) | チャレンジの用途、解答、期限を検証します。 | `captcha.ttlSeconds` は既定で 120 秒。検証に成功すると削除し、期限後は新しいチャレンジを作ります。 |
| [`hai:iam:ticket:sha256:<digest>`](#cache-iam-ticket) | 用途を限定した短期チケットを一度だけ交換します。 | 既定で 30 秒。`ttlMs` で変更し、交換に成功するとアトミックに削除します。 |
| [`hai:iam:read_cache:revision`](#cache-iam-revision) | 利用できるアカウント・権限キャッシュの世代を示します。 | 自動期限はなく、書き込みで世代が変わります。 |
| [`hai:iam:read_cache:<epoch>:<query>`](#cache-iam-result) | 取得済みのアカウント情報や権限を短時間再利用します。 | 書き込み後 60 秒で期限切れ。世代が変わると旧キーは使われません。 |

<a id="cache-iam-sessions"></a>

### `hai:iam:sessions:{<scope-digest>}`

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `revision` | `string` | — | スナップショットの版。他の更新を上書きしないよう変更のたびに更新します。 | `revision-42` |
| `sessions` | JSON object | — | アクセストークンをキーに、この範囲のセッションを保持します。 | `{"<access-token:redacted>":{…}}` |
| `sessions.*.refreshToken` | `string` | — | 更新できるセッションの更新用認証情報。 | `<refresh-token:redacted>` |
| `sessions.*.refreshExpiresAt` | `number` | — | 更新用認証情報の期限。Unix ミリ秒。既定は発行から 7 日です。 | `1795478400000` |
| `sessions.*.session` | JSON object | — | 認証と認可に使うセッションのスナップショット。項目は下記のとおりです。 | `{"userId":"user-42",…}` |
| `session.userId` | `string` | — | ログイン中の利用者 ID。以下の `session.*` は一つのセッション内の項目です。 | `user-42` |
| `session.username` | `string` | — | 任意のログイン名。 | `example-user` |
| `session.displayName` | `string` | — | 任意の表示名。 | `Example User` |
| `session.avatarUrl` | `string` | — | 任意のアバター URL。 | `https://images.example.invalid/user-42.png` |
| `session.version` | `string` | — | 明示的な変更で更新し、スライド延長時は維持します。 | `session-version-42` |
| `session.credentialVersion` | `string` | — | 発行時の認証情報の版。パスワード変更後の旧セッションを拒否します。 | `credential-version-42` |
| `session.terminalType` | `string` | — | 発行時に保存する端末区分。ログイン時に省略すると `web` を保存します。 | `web` |
| `session.apiKeyId` | `string` | — | API Key から発行したセッションのキー ID。 | `apikey-42` |
| `session.apiKeyScopes` | `string[]` | — | API Key から発行したセッションの許可範囲。 | `["orders:read"]` |
| `session.roles` | `string[]` | — | セッションのロールコード。 | `["reader"]` |
| `session.permissions` | `string[]` | — | セッションの権限コード。 | `["orders.read"]` |
| `session.source` | `string` | — | 任意のログイン元。 | `pc` |
| `session.accessToken` | `string` | — | セッションのアクセス認証情報。 | `<access-token:redacted>` |
| `session.createdAt` | ISO date string | — | 今回の発行時刻。 | `2026-11-17T00:00:00.000Z` |
| `session.startedAt` | ISO date string | — | 初回の発行時刻。リフレッシュしても維持されます。 | `2026-11-17T00:00:00.000Z` |
| `session.lastActiveAt` | ISO date string | — | 最終活動時刻。無操作期限の判定に使います。 | `2026-11-17T00:00:00.000Z` |
| `session.expiresAt` | ISO date string | — | アクセスセッションの期限。 | `2026-11-18T00:00:00.000Z` |
| `session.maxAge` | `number` | `86400` | アクセスの有効期間。単位は秒。作成時に上書きでき、その後は発行時の値を使います。 | `86400` |
| `session.data` | JSON object | — | 任意の追加データ。 | `{"theme":"dark"}` |

<a id="利用者の有効なログイン状態"></a>

#### 例 · 利用者の有効なログイン状態

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

user-42 の例で、アクセスの期限は 2026-11-18 00:00 UTC です。更新用はより長く保持でき、`refreshExpiresAt` は Unix ミリ秒です。`revision` は変更ごとに更新します。トークンは伏せてあります。

<a id="cache-iam-otp"></a>

### `hai:iam:otp:<identifier>`

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `version` | `string` | — | 現在のコードの発行版。`identifier` は正規化したメールか電話番号です。 | `otp-version-42` |
| `code` | `string` / `null` | — | 現在のコード。使用済みまたは試行上限で空になります。 | `<otp:redacted>` |
| `attempts` | `integer` | — | 今回の発行に対する検証回数。初回は `0`。 | `0` |
| `expiresAt` | `number` | — | コードの期限。Unix ミリ秒。 | `1794873900000` |
| `cooldownUntil` | `number` | — | 再送できる最も早い時刻。Unix ミリ秒。 | `1794873660000` |

<a id="使い捨てコードと再送待ち"></a>

#### 例 · 使い捨てコードと再送待ち

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

2026-11-17 00:00 UTC に発行した例です。失敗はまだなく、5 分間有効で、再送は 60 秒待ちます。`expiresAt` と `cooldownUntil` は Unix ミリ秒です。コードは伏せてあり、成功後は再利用できません。

<a id="cache-iam-captcha"></a>

### `hai:iam:captcha:<id>`

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `operation` | `string` | — | 挑戦を使う操作。キーの `id` は発行側が生成します。 | `login` |
| `challenge` | JSON object | — | 解答を照合するためのチャレンジパラメーター。 | `{…}` |
| `signatureSecret` | `string` | — | チャレンジ署名用のサーバー秘密値。 | `<secret:redacted>` |
| `keySecret` | `string` | — | 派生キーの署名用のサーバー秘密値。 | `<secret:redacted>` |

<a id="今回の-captcha-の検証情報"></a>

#### 例 · 今回の CAPTCHA の検証情報

用途と一度限りの利用を確認するため、挑戦と秘密を保存します。

```json
{
  "operation": "login",
  "signatureSecret": "<secret:redacted>",
  "keySecret": "<secret:redacted>"
}
```

login 専用の例で、秘密と挑戦詳細は省略しています。記録全体を画面に送りません。

<a id="cache-iam-ticket"></a>

### `hai:iam:ticket:sha256:<digest>`

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `subjectId` | `string` | — | 発行時に確認した主体。キーの `digest` はクライアントに渡す元のチケットから計算します。 | `user-42` |
| `purpose` | `string` | — | 交換時に一致する必要がある用途。 | `ai-audio` |
| `grant` | JSON object | `{}` | 発行時に許可した操作、モデル、セッションなど。 | `{"operation":"transcribe"}` |
| `expiresAt` | `number` | — | チケットの期限。Unix ミリ秒。 | `1794873630000` |

<a id="短時間だけ使える一回券"></a>

#### 例 · 短時間だけ使える一回券

キーの構造は `hai:iam:ticket:sha256:<チケットのダイジェスト>` です。クライアントは元のチケットを保持します。IAM はチケットの SHA-256 十六進ダイジェストでキャッシュレコードを検索します。

用途と有効期限を確認し、一致した記録を原子的に削除してから、主体と権限の関連情報を返します。

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

user-42 の音声文字起こし用です。2026-11-17 00:00 UTC に発行した場合、30 秒後に期限切れになります。`expiresAt` は Unix ミリ秒です。同じチケットでの再接続は拒否します。

<a id="cache-iam-revision"></a>

### `hai:iam:read_cache:revision`

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `epoch` | `string` | — | 検索キャッシュのキーを組み立てる現在の世代。 | `epoch-42` |
| `writers` | `integer` | — | 完了未確認の書き込み数。初期値は `0`。 | `0` |

<a id="権限キャッシュが現在も使えるか"></a>

#### 例 · 権限キャッシュが現在も使えるか

権限などの変更中に古いキャッシュを使わないための共有印です。

```json
{
  "epoch": "epoch-42",
  "writers": 0
}
```

writers:0 は書き込み中なし、epoch-42 は世代で、この印自体は失効しません。

<a id="cache-iam-result"></a>

### `hai:iam:read_cache:<epoch>:<query>`

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `value` | JSON | — | 成功時の検索結果。キーの例は `hai:iam:read_cache:epoch-42:user:v2:user-42` です。 | `{"id":"user-42","username":"example-user"}` |

認証情報を変更したときは `credentialVersion` を比較し、古いセッションを拒否します。アカウントや権限の書き込み中はデータベースから読みます。新しい `epoch` に切り替わると旧キャッシュは使われず、もとの期限で削除されます。

<a id="取得した利用者情報の短期再利用"></a>

#### 例 · 取得した利用者情報の短期再利用

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
