# @h-ai/iam データ構造

[简体中文](iam.md) · [English](iam.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/iam.ja.md) · [API リファレンス](../function/iam.ja.md)

注文を閲覧する利用者 `user-42` を例にします。ログイン可否はアカウント行で、注文を読めるかはロールの割り当てで決まります。ログイン後、IAM は共有キャッシュにセッションを記録します。パスワード、連絡先の紐付け、アカウント状態が変わると認証情報のバージョンが進み、以前のセッションでは認証できなくなります。以下は同一の架空の利用者、ロール、権限を使った抜粋で、秘密値は伏せています。

<a id="database"></a>

## データベース

アカウントと認可の正本は [RelDB](reldb.ja.md) にあります。更新に IAM のユーザー・認可操作を使うと、関連行と読み取りキャッシュも管理されます。表の型は RelDB の論理型です。SQL 既定値の「—」は明示的な既定値がないことを示します。NULL を許す列は、アプリとデータベースのどちらも値を指定しなければ `NULL` になります。

IAM のテーブルは 7 つです。基本の 5 テーブルは `iam.init()` で準備します。API Key の表は `login.apikey` を有効にすると準備します。LDAP の表は `login.ldap` を有効にしてディレクトリを設定した場合、または信頼済みの LDAP ID をインポートする場合に準備します。

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

`id` は主キーで、`username` にはデータベースの一意制約があります。メールと電話番号には列単体の一意制約がありません。アカウント操作が業務ルールに従って重複を確認し、OTP はチャネル内で正規化した連絡先が 1 件に定まる場合に使えます。SQLite は `TIMESTAMP` を Unix ミリ秒、`BOOLEAN` を整数、`JSON` をテキストで保持します。PostgreSQL は `TIMESTAMP`、`BOOLEAN`、`JSONB` を使います。MySQL は論理型 `TEXT` を `VARCHAR(255)` に対応させ、`DATETIME`、`TINYINT(1)`、`JSON` を使用します。例では共通の意味を ISO 8601 日時、真偽値、JSON で表します。

作成時に IAM が ID、作成時刻、更新時刻を設定します。セルフ登録では通常 `permanent` と `register.defaultAccountStatus` を書き込みます。管理者は種類、状態、期限を指定でき、一時アカウントには期限が必要です。パスワード登録ではハッシュと設定時刻を書き込み、連絡先の確認フラグは両方 `false` から始まります。OTP や LDAP のみのアカウントにはローカルパスワードがない場合があります。SQL が認証情報と再設定のバージョンを `""` で初期化し、その後のセキュリティ操作が新しいバージョンを書き込みます。

データベースの `login_lockout_version` は、アカウントの現在の[ログイン失敗レコード](#cache-iam-login-failures)を指定します。利用者がパスワード再設定を確定すると、新しいパスワードと新しい UUID を同じ SQL で保存します。以降の認証は新しい版を参照し、以前のキーは元の期限で失効します。通常のプロフィール更新や管理者によるパスワード変更では、ロック期限はそのままです。

再設定の申請で `reset_attempts` は `0` に戻り、現在有効なトークンを確認すると 1 回を消費します。期限切れまたは上限に達したら再発行が必要です。再設定に成功するとハッシュと期限を消去し、認証情報のバージョンを進めます。`accounts.dormantAfterDays` に該当する有効アカウントはスキャンで `dormant` になり、認証情報のバージョンも進みます。期限切れや休眠の行は管理者が削除するまで残ります。

| 項目 | 型 | NULL | SQL 既定値 | 用途 | 例 |
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
| `login_lockout_version` | `TEXT` | 不可 | `initial` | 現在のログイン失敗レコードを指定します。パスワード再設定の確定時に新しい UUID を保存します。 | `initial` |
| `metadata` | `JSON` | 可 | — | アプリが保存する追加情報。 | `{"department":"Support"}` |
| `created_at` | `TIMESTAMP` | 不可 | — | アカウントの作成時刻。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 不可 | — | アカウントの最終更新時刻。 | `2026-11-17T00:00:00Z` |
| `must_change_password` | `BOOLEAN` | 不可 | `false` | 次回ログイン後にパスワード変更が必要かどうか。 | `false` |
| `account_type` | `TEXT` | 不可 | `permanent` | `permanent` または `temporary`。 | `permanent` |
| `account_status` | `TEXT` | 不可 | `active` | `active`、`dormant`、`closed` のいずれか。 | `active` |
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
  "email": "reader@example.invalid",
  "password_hash": "<hash:redacted>",
  "account_type": "permanent",
  "account_status": "active",
  "must_change_password": false,
  "login_lockout_version": "initial"
}
```

`user-42` は有効な長期アカウントです。メールアドレスは架空で、パスワードのハッシュは伏せています。ロールと権限のコードは後述の関連行から取得します。

<a id="table-hai-iam-roles"></a>

### `hai_iam_roles`

`id` は主キーで、`code` は一意です。作成時に IAM が ID と 2 つの日時を書き込みます。ロールを削除すると、IAM が利用者や権限との関連行も削除します。システムロールの削除には制限があります。

| 項目 | 型 | NULL | SQL 既定値 | 用途 | 例 |
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

`role-reader` のコードは `reader`、表示名は Reader です。`is_system` は `false` です。

<a id="table-hai-iam-permissions"></a>

### `hai_iam_permissions`

`id` は主キーで、`code` は一意です。作成時に IAM が ID と 2 つの日時を書き込みます。IAM で権限を削除すると、ロールとの関連行も削除します。`type` は `menu`、`api`、`button` のいずれかです。`sensitive_operations` は、再認証を求めるかの判断に使う操作名の配列です。

| 項目 | 型 | NULL | SQL 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 権限の主キー。 | `permission-read` |
| `code` | `TEXT` | 不可 | — | 一意の権限コード。 | `orders:read` |
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
  "code": "orders:read",
  "name": "Read orders",
  "resource": "orders",
  "action": "read"
}
```

`orders:read` は注文の閲覧です。`resource` は `orders`、`action` は `read` です。権限の付与にはロールとの関連行が必要です。

<a id="table-hai-iam-user-roles"></a>

### `hai_iam_user_roles`

一意インデックス `idx_user_role_user_role` が `(user_id, role_id)` を制約し、`idx_user_role_user` は利用者での検索に使います。各列は利用者 ID とロール ID を参照し、いずれかを削除すると IAM が関連行を削除します。

| 項目 | 型 | NULL | SQL 既定値 | 用途 | 例 |
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

`user-42` に `role-reader` を割り当てます。この組み合わせは 1 回だけ保存します。

<a id="table-hai-iam-role-permissions"></a>

### `hai_iam_role_permissions`

一意インデックス `idx_role_perm_role_perm` が `(role_id, permission_id)` を制約し、`idx_role_perm_role` はロールでの検索に使います。各列はロール ID と権限 ID を参照し、いずれかを削除すると IAM が関連行を削除します。

| 項目 | 型 | NULL | SQL 既定値 | 用途 | 例 |
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

`role-reader` は `permission-read` を含みます。直前のロール割り当てと合わせて、`user-42` に `orders:read` が付与されます。

<a id="table-hai-iam-api-keys"></a>

### `hai_iam_api_keys`

`id` は主キーです。`user_id` は認証時に確認する所有アカウントを示します。`key_prefix` で候補を絞った後、ハッシュを照合します。発行時に IAM が ID、作成時刻、`enabled: true`、`last_used_at: NULL` を書き込みます。許可範囲を省略すると空配列を保存します。期限の指定がなく、既定の期限設定なら `expires_at` は `NULL` です。利用者ごとの上限は既定で 10 行で、無効または期限切れのキーも数えます。キーを取り消すと行を削除します。所有アカウントを削除すると認証できなくなります。キーの行に対するカスケード削除はありません。

`verifyApiKey` は認証時にアカウントの現在の権限とキーの許可範囲の共通部分を返します。行に保存するのはキー自体の範囲です。[プログラム用の認証情報](../function/iam.ja.md#api-keys)

| 項目 | 型 | NULL | SQL 既定値 | 用途 | 例 |
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
    "orders:read"
  ]
}
```

`apikey-42` は `user-42` が所有し、`orders:read` に制限されます。例では `key_hash` と `key_prefix` を伏せています。

<a id="table-hai-iam-ldap-identities"></a>

### `hai_iam_ldap_identities`

一意インデックス `idx_ldap_identity_entry` と `idx_ldap_identity_user` はそれぞれ `(directory_id, entry_id)` と `(directory_id, user_id)` を制約します。外部キー `user_id` は `hai_iam_users.id` を参照し、アカウントの削除時に関連行も削除します。ディレクトリ ID は `ldap.directoryId` またはインポート入力、エントリー ID はディレクトリの安定した識別子です。紐付け時にアプリが 3 つの ID を保存します。ディレクトリのログイン名や DN が変わっても紐付けは維持されます。

| 項目 | 型 | NULL | SQL 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `directory_id` | `TEXT` | 不可 | — | LDAP ディレクトリを区別する ID。 | `company-directory` |
| `entry_id` | `TEXT` | 不可 | — | エントリーの安定した ID。`directory_id` と一意の組になります。 | `3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76` |
| `user_id` | `TEXT` | 不可 | — | ローカル利用者を参照し、`directory_id` と一意の組になります。利用者の削除時に紐付けも削除されます。 | `user-42` |

<a id="ディレクトリエントリーをローカル利用者に関連付ける"></a>

#### 例 · ディレクトリエントリーをローカル利用者に関連付ける

会社のディレクトリの安定したエントリー ID を `user-42` に紐付けます。ディレクトリで名前を変更した後も、この紐付けを使います。

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

IAM はサーバー側で 7 種類のキャッシュを更新します。本番のノードは同じ Redis と論理名前空間を共有します。開発・テストでは単一プロセスの Memory を使えます。[Cache](cache.ja.md) の `keyPrefix` を設定した場合は、Redis 上のキーにその接頭辞も付きます。キャッシュ表の既定値は IAM が新しいレコードに書き込む値です。

| キーまたは種類 | 用途 | 既定の期限と削除 |
| --- | --- | --- |
| [`hai:iam:sessions:{<scope-digest>}`](#cache-iam-sessions) | 一つの利用者範囲のセッションと更新用認証情報をまとめて管理します。 | 最後に残るアクセス・更新認証情報の期限で削除します。セッションがなければ削除し、スライド延長はセッション設定に従います。 |
| [`hai:iam:login_failures:<userId>:<lockoutVersion>`](#cache-iam-login-failures) | 失敗回数とロック期限をノード間で共有します。 | ロック前は固定集計期間の終了時、ロック中はロック期限に失効します。 |
| [`hai:iam:otp:<identifier>`](#cache-iam-otp) | 正規化した連絡先のコードと発行時に特定したアカウントを保存し、試行・再送を制限します。 | コードは既定 300 秒、再送待ちは 60 秒。遅い方の期限までキーを保持し、使用済み・試行上限ではコードを消します。 |
| [`hai:iam:captcha:<id>`](#cache-iam-captcha) | チャレンジの用途、解答、期限を検証します。 | `captcha.ttlSeconds` は既定で 120 秒。検証に成功すると削除し、期限後は新しいチャレンジを作ります。 |
| [`hai:iam:ticket:sha256:<digest>`](#cache-iam-ticket) | 用途を限定した短期チケットを一度だけ交換します。 | 既定で 30 秒。`ttlMs` で変更し、交換に成功するとアトミックに削除します。 |
| [`hai:iam:read_cache:revision`](#cache-iam-revision) | 利用できるアカウント・権限キャッシュの世代を示します。 | 自動期限はなく、書き込みで世代が変わります。 |
| [`hai:iam:read_cache:<epoch>:<query>`](#cache-iam-result) | 取得済みのアカウント情報や権限を短時間再利用します。 | 書き込み後 60 秒で期限切れ。世代が変わると旧キーは使われません。 |

<a id="cache-iam-sessions"></a>

### `hai:iam:sessions:{<scope-digest>}`

アクセストークンとリフレッシュトークンの形式は `s1.<scope-digest>.<random>` です。最後の乱数はトークンごとに生成します。`scope-digest` は利用者 ID の SHA-256 十六進ダイジェストです。リクエストを受けると、IAM はトークンからこの 64 文字を取り出してセッション文書を探します。トークンから利用者 ID への索引を別途照会する手間が省けます。文書内のセッションを特定するには、**トークン全体**を照合します。

例えば `user-42` をハッシュ化すると、次の Redis キーになります。既定のキー名では、Redis Cluster は波括弧内の内容でスロットを選びます。同じ利用者のアクセス用と更新用の資格情報は一つの文書に入り、単一キーの比較交換で原子的に更新します。

```text
hai:iam:sessions:{6d894aa3ee802549d7f340e7c1cf0d1c1cb14cd84f768d92ffaa6785337c4997}
```

アカウントと権限のキャッシュを読む時点では、IAM はすでに利用者 ID を取得しています。それより前にセッションを探す段階では、現在のトークンに含まれるダイジェストを使います。セッションキーに利用者 ID を直接使うなら、エンコードした ID をトークンに含めるか、ID を求める照会を追加する必要があります。ダイジェストでトークンの検索用部分の長さと文字種を固定し、利用者 ID はセッション文書内に保存します。

新規発行の既定は access が 86,400 秒、refresh が 604,800 秒です。access のスライド更新は既定で有効です。access が期限切れでも有効な refresh で両方を再発行でき、初回発行時刻は維持されます。アイドル期限と絶対期限を設定すると両方に適用します。自動更新やロールの同期では利用者の活動時刻を更新しません。 [セッションの期限と設定例](../configuration/iam.ja.md#session-deadlines)

アイドル期限を設定していない場合、`session.touchMinInterval` でスライド更新の書き込みをまとめます。セッションの取得・検証では Redis に確定した活動時刻と期限が返ります。

上限は利用者と現在の認証情報バージョンごとの有効セッションを数えます。access の期限切れ後も refresh が有効なら数に含まれます。`maxSessions` の既定 `0` は上限なしです。`terminalLimits` の既定は `{}` で、設定した場合は記載のない端末区分で新規ログインできません。単一端末は既定で無効です。有効時の `replace` は同じ認証情報バージョンのセッションを置き換え、`reject` は重複ログインを拒否します。明示的なログアウトで両方のトークンを削除し、refresh だけを取り消す場合は access を維持します。空の文書は削除し、レコードがある場合は access または refresh のうち最後の保持期限に TTL を合わせます。期限切れの行は後続の書き込みで掃除します。

表の `sessions.*` は任意の access キーに対応するエントリーです。検証ではリクエストの完全な access トークンでエントリーを探し、そのキーを戻り値の `Session.accessToken` に設定します。更新では `refreshToken` でエントリーを特定し、対応する access キーで旧セッションを削除して新しいセッションを原子的に保存します。`iam.session.create()` は今回発行したトークン対を戻り値の `data._tokenPair` に含め、ログイン処理に渡します。Redis には access キーと、そのエントリーの `refreshToken` を保存します。

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
| `session.terminalType` | `string` | `web` / `api` | `web`、`app`、`desktop`、`api` のいずれかです。省略時は通常のログインが `web`、API Key ログインが `api` になります。 | `web` |
| `session.apiKeyId` | `string` | — | API Key から発行したセッションのキー ID。 | `apikey-42` |
| `session.apiKeyScopes` | `string[]` | — | API Key 由来のセッションを発行する際に保存する任意の許可範囲。 | `["orders:read"]` |
| `session.roles` | `string[]` | `[]` | 認可処理または作成時に指定した値です。省略時は `[]` を保存します。 | `["reader"]` |
| `session.permissions` | `string[]` | `[]` | 認可処理または作成時に指定した値です。省略時は `[]` を保存します。 | `["orders:read"]` |
| `session.source` | `string` | — | 任意のログイン元。 | `pc` |
| `session.createdAt` | ISO date string | — | 今回の発行時刻。 | `2026-11-17T00:00:00.000Z` |
| `session.startedAt` | ISO date string | — | 初回の発行時刻。リフレッシュしても維持されます。 | `2026-11-17T00:00:00.000Z` |
| `session.lastActiveAt` | ISO date string | — | 最終活動時刻。無操作期限の判定に使います。 | `2026-11-17T00:00:00.000Z` |
| `session.expiresAt` | ISO date string | — | アクセスセッションの期限。 | `2026-11-18T00:00:00.000Z` |
| `session.maxAge` | `number` | `86400` | アクセスの有効期間。単位は秒。作成時に上書きでき、その後は発行時の値を使います。 | `86400` |
| `session.data` | JSON object | — | 任意の追加データ。 | `{"theme":"dark"}` |

<a id="利用者の有効なログイン状態"></a>

#### 例 · 利用者の有効なログイン状態

以下は `user-42` のログイン後に Redis へ保存されたセッションです。両方のトークンは伏せています。検証、更新、ログアウトは同じ利用者レコードを使います。

```json
{
  "revision": "revision-42",
  "sessions": {
    "<access-token:redacted>": {
      "session": {
        "version": "session-version-42",
        "credentialVersion": "credential-version-42",
        "terminalType": "web",
        "userId": "user-42",
        "username": "example-user",
        "roles": [
          "reader"
        ],
        "permissions": [
          "orders:read"
        ],
        "createdAt": "2026-11-17T00:00:00.000Z",
        "startedAt": "2026-11-17T00:00:00.000Z",
        "lastActiveAt": "2026-11-17T00:00:00.000Z",
        "expiresAt": "2026-11-18T00:00:00.000Z",
        "maxAge": 86400
      },
      "refreshExpiresAt": 1795478400000,
      "refreshToken": "<refresh-token:redacted>"
    }
  }
}
```

例の access は 2026-11-18 00:00 UTC に失効します。`refreshExpiresAt` は 2026-11-24 00:00 UTC に当たります。

<a id="cache-iam-login-failures"></a>

### `hai:iam:login_failures:<userId>:<lockoutVersion>`

`userId` は `hai_iam_users.id`、`lockoutVersion` は同じ行の `login_lockout_version` です。`security.lockoutEnabled` が有効な場合、対象となる認証失敗は共有 Redis にだけ記録します。最初の失敗で固定の集計期間が始まり、その後の失敗で終了時刻は延びません。集計期間は既定で 86,400 秒、5 回の失敗で 900 秒間ロックします。ロック前のレコードは集計期間の終了時、ロック中は `lockedUntil` に失効します。失効後、次に集計対象の失敗が起きた時点で 1 から数え直します。

Redis の原子的な比較と更新で各ノードの失敗を集計し、上限に達したときにロックを設定します。認証情報を確認できた場合も、同じ原子的な比較でレコードを消去します。別のノードがすでにアカウントをロックしていれば、認証は失敗します。ポリシーが無効な場合はこのレコードを参照しません。Redis に障害がある間は、ポリシー対象の認証が失敗し、データベースやローカルメモリーへの切り替えは行いません。本番 Redis で有効なロックを保持するため、信頼できる永続化と `noeviction` を使います。

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `revision` | `string` | 作成時にランダム生成 | 現在のレコードの版。原子的な比較で並行更新を検出します。 | `failure-revision-42` |
| `count` | `number` | `1` | 固定集計期間内に数えた失敗回数。 | `5` |
| `firstFailedAt` | `number` | 最初の失敗時刻 | 固定集計期間の開始時刻。Unix ミリ秒。 | `1794873600000` |
| `lastFailedAt` | `number` | 最初の失敗時刻 | 最後に数えた失敗の時刻。Unix ミリ秒。 | `1794873780000` |
| `lockedUntil` | `number` / `null` | `null` | ロック期限。Unix ミリ秒。未ロック時は `null`。 | `1794874680000` |

<a id="失敗上限に達したときのロックレコード"></a>

#### 例 · 二つのノードがロック期限を共有する

`user-42` の版は `initial` です。2026-11-17 00:00 UTC に最初の失敗を記録し、00:03 に別のノードが 5 回目を記録しました。どのノードも `hai:iam:login_failures:user-42:initial` を読み、00:18 UTC までロックされていることを確認します。

```json
{
  "revision": "failure-revision-42",
  "count": 5,
  "firstFailedAt": 1794873600000,
  "lastFailedAt": 1794873780000,
  "lockedUntil": 1794874680000
}
```

レコードは 00:18 UTC に失効します。利用者が先にパスワード再設定を確定した場合、IAM は新しい版を参照するため、古いキーの期限はその後の認証に影響しません。

<a id="cache-iam-otp"></a>

### `hai:iam:otp:<identifier>`

`identifier` は選択したチャネルで正規化したメールアドレスまたは電話番号です。発行時に版、主体、コード、`attempts: 0`、2 つの期限を保存します。現在のチャレンジの検証は原子的に回数を加算し、正解または `otp.maxAttempts` の上限でコードを消去します。既定の上限は 3 回です。現在のチャレンジへの誤入力は、別途管理されるアカウントのログイン失敗回数にも影響することがあります。再発行はチャレンジを置き換え、試行回数をリセットします。再送待ち時間中はエラーになります。消費後も再送待ち時間は維持し、有効期間と再送待ち時間の両方が終わるとキーが失効します。全ノードでレコードを共有します。

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `version` | `string` | — | 現在のコードの発行版。`identifier` は正規化したメールか電話番号です。 | `otp-version-42` |
| `subject` | `{ userId: string, credentialVersion: string }` / `null` | — | 発行時のユーザー ID と認証情報の世代。`null` は新規登録専用です。この項目のない旧レコードはログインに使えません。 | `{ "userId": "user-42", "credentialVersion": "credential-17" }` |
| `code` | `string` / `null` | — | 現在のコード。使用済みまたは試行上限で空になります。 | `<otp:redacted>` |
| `attempts` | `integer` | `0` | 今回の発行に対する検証回数。初回は `0`。 | `0` |
| `expiresAt` | `number` | — | コードの期限。Unix ミリ秒。 | `1794873900000` |
| `cooldownUntil` | `number` | — | 再送できる最も早い時刻。Unix ミリ秒。 | `1794873660000` |

<a id="使い捨てコードと再送待ち"></a>

#### 例 · 使い捨てコードと再送待ち

連絡先の現在のコード、発行時に特定したアカウント、失敗回数、再送可能時刻を保存します。

```json
{
  "version": "otp-version-42",
  "subject": { "userId": "user-42", "credentialVersion": "credential-17" },
  "code": "<otp:redacted>",
  "attempts": 0,
  "expiresAt": 1794873900000,
  "cooldownUntil": 1794873660000
}
```

2026-11-17 00:00 UTC に発行した場合、00:01 から再送でき、00:05 に期限切れになります。使用時は、連絡先が依然として `user-42` だけに対応し、認証情報のバージョンが `credential-17` であることを確認します。

<a id="cache-iam-captcha"></a>

### `hai:iam:captcha:<id>`

`id` は発行結果のチャレンジ ID です。用途、ALTCHA チャレンジ、検証用の情報を既定の 120 秒 TTL で保存します。用途と回答が一致して削除が成功した検証だけが通ります。誤入力では更新せず、個別の試行回数も持ちません。ノードは共有キャッシュで同じチャレンジを検証します。

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `operation` | `string` | — | `login`、`register`、`sendOtp`、`passwordReset`、`renewPassword` のいずれかです。 | `login` |
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

`operation` が `login` のためログイン専用です。抜粋では公開用の `challenge` を省略し、署名用の秘密を伏せています。

<a id="cache-iam-ticket"></a>

### `hai:iam:ticket:sha256:<digest>`

`digest` は元のチケットの SHA-256 十六進ダイジェストです。発行時に主体、用途、許可内容、期限を保存します。`grant` の省略時は `{}`、期限の既定は 30,000 ミリ秒です。使用に成功すると原子的にレコードを削除し、用途の不一致ではチケットを保持します。再認証にも同じ形式を使い、操作名、セッションのバージョン、認証情報のバージョンを許可内容に関連付けます。

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `subjectId` | `string` | — | 発行時に確認した主体。キーの `digest` はクライアントに渡す元のチケットから計算します。 | `user-42` |
| `purpose` | `string` | — | 交換時に一致する必要がある用途。 | `ai-audio` |
| `grant` | JSON object | `{}` | 発行時に許可した操作、モデル、セッションなど。 | `{"operation":"transcribe"}` |
| `expiresAt` | `number` | — | チケットの期限。Unix ミリ秒。 | `1794873630000` |

<a id="短時間だけ使える一回券"></a>

#### 例 · 短時間だけ使える一回券

このレコードは用途を `ai-audio` に限定します。受信サービスは、許可内容から操作名を取得します。

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

このチケットは `user-42` に `transcribe` 操作を許可します。例の期限は 2026-11-17 00:00:30 UTC です。

<a id="cache-iam-revision"></a>

### `hai:iam:read_cache:revision`

二つのサービスノードが `user-42` の権限を調べ、この利用者が注文を閲覧できることをキャッシュしています。管理者がノード A で権限を取り消すと、IAM はこの共有マーカーを使い、ノード B がいつキャッシュの利用を止め、いつ新しい結果を保存できるかを判断します。アカウント状態、機密操作のルール、API キーの照会結果にも同じマーカーを使います。

<a id="権限キャッシュが現在も使えるか"></a>

#### 例 · 権限キャッシュが現在も使えるか

ノード B が `user-42` の注文閲覧リクエストを処理している間に、管理者がノード A でこの利用者の `orders:read` を取り消します。

1. **取り消し前**は、ノード B がキャッシュにある権限を使えます。返す直前にも、読み取り中にマーカーが変わっていないことを確認します。
2. **トランザクション中**は、ノード A がデータベースを更新する前に書き込みを登録します。ノード B はキャッシュの利用を止め、データベースに問い合わせます。取り消しが確定するまでは、ノード B から見える確定済みの権限に `orders:read` が含まれることがあります。
3. **コミット後**は、ノード A が書き込みの完了を確認し、両ノードが新しいキーで照会結果を保存できるようになります。ノード B が次にデータベースから取得する権限には `orders:read` が含まれません。

例えば、古いキー `hai:iam:read_cache:epoch-42:user_access:user-42` に「注文を読める」という結果が最長 60 秒残ります。コミット後の権限確認は `hai:iam:read_cache:epoch-44:user_access:user-42` だけを参照するため、古い結果は使われません。

ロールバックした場合は権限が残り、その後の照会でその状態をキャッシュできます。書き込みの登録に失敗したらデータベースの更新は行いません。マーカーを読めない場合や、コミット後に書き込み完了を記録できない場合、読み取りはデータベースを使い続けます。このマーカーに有効期限はなく、書き込み中に手動で削除しないでください。

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `epoch` | `string` | 初期化時にランダムに生成 | 現在のキャッシュキーの組を識別します。書き込みの開始と終了で変わります。 | `epoch-42` |
| `writers` | `integer` | `0` | 登録済みで完了をまだ確認できていない書き込みの数。`0` より大きい場合はデータベースを参照します。 | `0` |
| `activeWriters` | JSON array | `[]` | 処理中の各書き込みの ID と登録時刻 `startedAt`。時刻は Unix ミリ秒です。解除には ID を使い、時刻は診断に使います。 | `[{"id":"writer-a","startedAt":1794873600000}]` |

次は取り消し前のマーカーの値です。

```json
{
  "epoch": "epoch-42",
  "writers": 0,
  "activeWriters": []
}
```

<a id="iam-read-cache-recovery"></a>

#### 残った書き込み登録の復旧

アカウントと権限のキャッシュは、共有データベースのプライマリと Redis を使います。データベースが完了を確認すると、IAM は ID で登録を解除します。Redis の応答が失われた場合は同じ ID で再試行します。ノードが停止した場合やコミット・ロールバックの結果が不明な場合は登録が残り、各ノードはデータベースを参照します。登録が長時間残ると警告を出します。

**書き込み中と復旧後**

権限の取り消しで登録が一件増え、両ノードがデータベースを参照します。安全に復旧すると世代が変わり、登録は空になります。

```json
{
  "epoch": "epoch-43",
  "writers": 1,
  "activeWriters": [{ "id": "writer-a", "startedAt": 1794873600000 }]
}
```

本番環境で初めて有効にするときは IAM ノードを起動する前にマーカーを作成します。Redis のバックアップを復元した場合は、IAM のトラフィックを再開する前に世代を切り替えます。登録が残ったときは、関連する IAM の書き込み口、バックグラウンドジョブ、外部トランザクションの呼び出し元を止め、データベースのプライマリで旧トランザクションがすべて終了したことを確認します。確認できるまでデータベースの参照を続けます。

アプリと同じ Redis Cache の設定を非公開の `private-cache.json` に用意します。Redis のプライマリ、論理データベース、`keyPrefix` を揃えます。事前確認では現在の `epoch`、`writers` と登録一覧が返ります。例では `epoch-43` を使います。初回は事前確認で返る `missing` を指定します。書き込みが完了したことを確認してから適用します。

```sh
node ./node_modules/@h-ai/iam/dist/read-cache-maintenance.js --cache private-cache.json
node ./node_modules/@h-ai/iam/dist/read-cache-maintenance.js --cache private-cache.json --apply --expect-epoch epoch-43 --writers-drained
```

適用コマンドは取得したマーカー全体を比較し、新しいランダムな `epoch` を設定します。`success: true`、新しい世代、`writers: 0` を確認してからトラフィックを再開します。比較が失敗した場合や結果が不明な場合は、メンテナンス状態のままトランザクションを確認して再度事前確認を実行します。旧結果は元の TTL で期限切れになります。マーカーが欠けているか無効な場合、本番環境の読み取りはデータベースを参照し、保護対象の書き込みは登録できません。

<a id="cache-iam-result"></a>

### `hai:iam:read_cache:<epoch>:<query>`

アカウント `user-42` を例に、`revision.epoch` が `epoch-42` だとします。IAM が読むキーは次のとおりです。

```text
hai:iam:read_cache:epoch-42:user_access:user-42
```

- **`<epoch>` は現在のキャッシュ世代です。** IAM は `hai:iam:read_cache:revision` の `epoch` を読み取ります。例では `epoch-42` としていますが、実際はランダムな UUID です。データベース書き込みの開始時と終了時に切り替わります。
- **`<query>` は世代 ID の後ろに続く部分全体です。** この例では `user_access:user-42` です。`user_access` はアカウント状態と認可を表し、`user-42` は対象アカウントを指定します。

旧キー `user:v2:user-42` の `v2` は、キャッシュに保存するアカウント項目の形式を区別するバージョンでした。`enabled` を `accountStatus` などのライフサイクル項目に置き換えた際に追加しました。現在は `user_access:user-42` にまとめて保存します。旧キーは書き込み時に設定された 60 秒の期限で失効します。

書き込み中の処理がない場合に現在の世代を使います。キャッシュに結果がある場合は世代を再確認し、結果がなければデータベースを検索します。成功した結果は書き込みから 60 秒で失効します。失敗した照会結果は保存しません。

| 値の項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `value` | object / `string[]` / `null` | — | このフィールドで包んで保存する正常な照会結果。 | `{"account":null,"authorization":{"roles":[],"permissions":[]}}` |

| 照会サフィックス | 変数の出所と結果 |
| --- | --- |
| [`user_access:<userId>`](#取得した利用者情報の短期再利用) | `userId` はアカウント ID です。`value.account` はアカウント状態で、存在しない場合は `null` です。`value.authorization` は重複を除いた `roles: string[]` と `permissions: string[]` です。 |
| [`sensitive:<operation>`](#cache-iam-query-sensitive) | `operation` は操作名で、`*` は全件です。機密操作名の配列 `string[]` を返します。 |
| [`apikey:<apiKeyId>`](#cache-iam-query-apikey) | `apiKeyId` は派生セッションから取得します。`userId: string`、`enabled: boolean`、`expiresAt: number \| null`、`scopes: string[]` を返します。キーがなければ `null` です。 |
| [`verified_apikey:<fingerprint>`](#cache-iam-query-verified-apikey) | `fingerprint` は元のキーの SHA-256 十六進ダイジェストです。`id`、`userId`、`name`、`keyPrefix`、`enabled`、`expiresAt`、`createdAt`、`lastUsedAt`、`scopes` を保存します。 |

`account` は `username`、`accountType`、`accountStatus`、`accountExpiresAt`、`credentialVersion`、`mustChangePassword`、`hasPassword`、`passwordUpdatedAt`、任意の `displayName` と `avatarUrl` を含みます。トークンの検証では現時刻で期限を確認し、既存セッションの認証情報の世代を `credentialVersion` と照合します。

キャッシュ内の数値の日時は Unix ミリ秒です。検証済み API キーの日時が設定されていない場合は `null` になります。各項目は `iam.apiKey` が返すメタデータと同じ意味です。

<a id="取得した利用者情報の短期再利用"></a>

#### 例 · アカウント状態と権限をまとめて読む

次は `hai:iam:read_cache:epoch-42:user_access:user-42` の値全体です。一度の読み取りで、アカウントの検証に使う `account` と、`orders:read` の確認に使う `authorization` を取得します。

```json
{
  "value": {
    "account": {
      "username": "example-user",
      "displayName": "Example User",
      "accountType": "permanent",
      "accountStatus": "active",
      "accountExpiresAt": null,
      "credentialVersion": "credential-17",
      "mustChangePassword": false,
      "hasPassword": true,
      "passwordUpdatedAt": 1794873600000
    },
    "authorization": {
      "roles": [
        "reader"
      ],
      "permissions": [
        "orders:read"
      ]
    }
  }
}
```

`hasPassword` はローカルパスワードの有無を示します。パスワードハッシュ、トークン、再設定資格情報はそれぞれの保存先で管理します。

<a id="cache-iam-query-sensitive"></a>

#### 例 · 再認証が必要な操作を調べる

`hai:iam:read_cache:epoch-42:sensitive:orders.cancel` には、権限レコードに `orders.cancel` が登録されているかを調べた結果が入ります。登録されていなければ空の配列になります。

```json
{
  "value": [
    "orders.cancel"
  ]
}
```

`hai:iam:read_cache:epoch-42:sensitive:*` には、権限レコードに登録された機密操作がすべて入ります。この例では `profile.update` も登録されています。

```json
{
  "value": [
    "orders.cancel",
    "profile.update"
  ]
}
```

<a id="cache-iam-query-apikey"></a>

#### 例 · セッションの発行に使った API キーを確認する

`apikey-42` から発行したセッションを検証するとき、IAM は `hai:iam:read_cache:epoch-42:apikey:apikey-42` を読み取ります。この値から、`user-42` が所有する有効なキーで、有効期限がなく、スコープが `orders:read` だと分かります。正常に照会でき、キーが見つからなかった場合は `{"value":null}` を保存します。

```json
{
  "value": {
    "userId": "user-42",
    "enabled": true,
    "expiresAt": null,
    "scopes": [
      "orders:read"
    ]
  }
}
```

<a id="cache-iam-query-verified-apikey"></a>

#### 例 · API キーの検証結果を再利用する

次は検証に成功した API キーのメタデータです。IAM は受け取ったキーからフィンガープリントを計算します。例のフィンガープリントは架空の 16 進数 64 桁です。

```text
hai:iam:read_cache:epoch-42:verified_apikey:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

```json
{
  "value": {
    "id": "apikey-42",
    "userId": "user-42",
    "name": "Example API",
    "keyPrefix": "<prefix:redacted>",
    "enabled": true,
    "expiresAt": null,
    "createdAt": 1794873600000,
    "lastUsedAt": null,
    "scopes": [
      "orders:read"
    ]
  }
}
```

<a id="file-and-runtime-data"></a>

## ファイルと実行時データ

IAM 固有のデータファイルはありません。SQLite を使う場合、アプリが RelDB の設定でファイルを指定します。Redis と本番データベースはデプロイ先で管理します。IAM は検証済み設定、リポジトリへの参照、任意の休眠スキャンを実行時に保持します。IAM を閉じるとスキャンとローカル参照を解放します。コミットしたデータベース行と Redis のレコードには、それぞれの期限や取り消し条件が適用され続けます。[モジュール設定](../configuration/iam.ja.md)

アプリはサーバー側の `iam.user`、`iam.authz`、`iam.session`、`iam.apiKey` からデータを読み取ります。通知や監査の記録はホストが有効にしたモジュールに保存します。[Reach のデータ構造](reach.ja.md)と [Audit のデータ構造](audit.ja.md)を参照してください。

<a id="public-responses"></a>

## 公開 API のレスポンス

以下は成功した `HaiResult` の抜粋です。最初に `success` を確認し、失敗時は `error.code` を読み取ります。TypeScript の `Date` は JSON で ISO 8601 の文字列になり、Unix ミリ秒として定義された値は数値のままです。アクセストークン、リフレッシュトークン、一回限りのチケット、新規発行したキーは、対象の信頼済み呼び出し元にだけ渡してください。公開ページには表示に必要な項目を選びます。

<a id="response-login"></a>

### ログインと権限

`iam.auth.login()` は利用者、トークン対、ログイン時に使ったロールと権限を返します。後続の保護された要求では `iam.auth.verifyToken()` で現在の認可を取得します。例の `expiresIn` は発行された access の有効秒数です。アイドル期限や絶対期限も認証を制限します。

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-42",
      "username": "example-user",
      "accountStatus": "active"
    },
    "tokens": {
      "accessToken": "<access-token:redacted>",
      "refreshToken": "<refresh-token:redacted>",
      "expiresIn": 86400,
      "tokenType": "Bearer"
    },
    "roles": [
      "reader"
    ],
    "permissions": [
      "orders:read"
    ]
  }
}
```

<a id="response-refresh"></a>

### セッション更新

`iam.session.refresh()` は新しいトークン対を返します。成功したら access と refresh を置き換えます。以前の値は使えなくなります。

```json
{
  "success": true,
  "data": {
    "accessToken": "<new-access-token:redacted>",
    "refreshToken": "<new-refresh-token:redacted>",
    "expiresIn": 86400,
    "tokenType": "Bearer"
  }
}
```

<a id="response-user"></a>

### プロフィールの取得と更新

`iam.user.getUser()` は `User | null` を返します。成功時の `data: null` はアカウントが存在しないことを示します。このプロフィール項目は取得または `iam.user.updateCurrentUser()` の成功時に得られます。連絡先が実際に変わると更新後のプロフィールを返し、古いセッションを無効にします。

```json
{
  "success": true,
  "data": {
    "id": "user-42",
    "username": "example-user",
    "email": "reader@example.invalid",
    "displayName": "Example User",
    "accountType": "permanent",
    "accountStatus": "active",
    "createdAt": "2026-11-17T00:00:00.000Z",
    "updatedAt": "2026-11-17T00:00:00.000Z"
  }
}
```

<a id="response-api-key"></a>

### API Key の発行

`iam.apiKey.createApiKey()` は公開メタデータと、この発行時だけ取得できる `rawKey` を返します。`listApiKeys()` と `getApiKey()` に元のキーやハッシュは含まれません。

```json
{
  "success": true,
  "data": {
    "apiKey": {
      "id": "apikey-42",
      "userId": "user-42",
      "name": "Example API",
      "keyPrefix": "<prefix:redacted>",
      "enabled": true,
      "expiresAt": null,
      "createdAt": "2026-11-17T00:00:00.000Z",
      "lastUsedAt": null,
      "scopes": [
        "orders:read"
      ]
    },
    "rawKey": "<api-key:redacted>"
  }
}
```

<a id="response-ticket"></a>

### チケットと CAPTCHA チャレンジ

`iam.ticket.issue()` は元のチケットと Unix ミリ秒の期限を返します。`iam.ticket.consume()` に成功すると、サーバーが紐付けた `subjectId`、`purpose`、`grant` を返します。音声の文字起こしでは、信頼済みサービスがこの結果から許可操作と主体を取得します。`iam.auth.createCaptcha()` の公開結果は `id` と `challenge` です。画面から回答を送り、検証用の秘密はサーバーのキャッシュに保持します。

```json
{
  "success": true,
  "data": {
    "ticket": "<one-time-ticket:redacted>",
    "expiresAt": 1794873630000
  }
}
```

<a id="response-public-config"></a>

### 認証画面の設定

`iam.getPublicConfig()` は公開用の設定を返します。機密操作の一覧にはデータベースの設定を反映します。画面では `login` と `passwordReset` から表示するログイン方法と再設定方法を選びます。キャッシュの内容、認証情報、接続先はサーバーに保持します。

```json
{
  "success": true,
  "data": {
    "captcha": {
      "enabled": true
    },
    "login": {
      "password": true,
      "otp": true,
      "ldap": false,
      "email": true,
      "sms": false
    },
    "passwordReset": {
      "enabled": true,
      "mode": "email"
    },
    "session": {
      "maxAge": 86400,
      "endOnPageHide": false
    }
  }
}
```
