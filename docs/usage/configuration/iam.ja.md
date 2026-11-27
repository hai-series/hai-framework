# @h-ai/iam 設定

[简体中文](iam.md) · [English](iam.en.md) · [設定ガイド](README.ja.md) · [API リファレンス](../function/iam.ja.md) · [データ構造](../data/iam.ja.md)

## 設定の読み込み

IAM を有効にした生成プロジェクトでは、サーバーのワークスペースにある `config/_iam.yml` に設定を保存します。起動コードは `core.init({ configDir: './config', configSchemas: { iam: IamConfigSchema } })` でファイルをロードし、`core.config.getOrThrow('iam')` で取得した設定とランタイム依存先を `iam.init()` に渡します。RelDB と Cache を先に初期化します。Crypto は初期化済みのものを再利用し、必要に応じて IAM が初期化します。変更後はサービスを再起動し、初期化に成功してから認証リクエストを受け付けます。[依存関係と起動順序](../function/iam.ja.md#module-dependencies)

本番環境で IAM を初めて起動する前に、共有 Redis に権限読み取りキャッシュの世代を初期化します。[初期化と復旧手順](../data/iam.ja.md#iam-read-cache-recovery)

Core は YAML を読み取り、`HAI_IAM` の JSON または `HAI_IAM_*` の個別変数で上書きします。同じ設定元ではオブジェクト全体を適用してから個別の項目を適用します。例えば `HAI_IAM_SESSION_MAXAGE=1800` は `session.maxAge` を 1800 秒に設定します。その後、残っている `${VAR}` を展開し、型を検証します。プロセスの環境変数は環境ファイルより優先されます。LDAP のバインド資格情報はサーバーの非公開環境に保存します。[設定元と優先順位（中国語）](runtime.md#配置从哪里来)

`iam.init()` のスキーマ検証に失敗すると `CONFIG_ERROR` が返ります。`error.ext.fields` で該当項目のパスを、サーバーログの `issues` 配列でエラーの詳細を確認できます。ブラウザーは 初期化済みクライアントの `client.iam.auth.publicConfig()` を通じて、利用可能なログイン方式と画面用設定を取得します。保護されたルートでは引き続きホストがセッションと権限を確認します。[公開設定と認証](../function/iam.ja.md#authentication)

<a id="configuration-fields"></a>

## 設定一覧

以下はフレームワークの既定値です。既定値がある項目は省略できます。`password` または `session` 節を省略しても、表の既定値を使用します。CLI が生成する値は異なる場合があります。標準テンプレートでは、例えば OTP ログインとアカウントロックを無効にし、パスワードの文字種条件を緩和します。対象サービスのファイルと環境変数を確認してください。

<a id="設定例"></a>

使う設定例をサーバーの `config/_iam.yml` に取り込み、サービスを再起動して実際の動作を確認します。

### `login`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `login.password` | 真偽値 | `true` | 通常のパスワードログインを有効にします。 |
| `login.otp` | 真偽値 | `true` | OTP ログインを有効にします。`otp` オブジェクトと利用可能な送信経路が一つ以上必要です。 |
| `login.ldap` | 真偽値 | `false` | ディレクトリログインを有効にします。完全な `ldap` 設定とクライアントが必要です。 |
| `login.apikey` | 真偽値 | `false` | API キーの検証、ログイン、管理を有効にします。管理操作の権限はアプリケーションが確認します。 |

### `register`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `register.enabled` | 真偽値 | `true` | セルフサービスの新規登録と OTP による初回登録を許可します。既存ユーザーのログインと管理者による作成は独立しています。 |
| `register.defaultAccountStatus` | `active` または `dormant` | `active` | セルフサービス登録、OTP の初回登録、LDAP 同期で作成するアカウントの初期状態です。休眠アカウントは管理者が有効化してからログインできます。 |

<a id="password"></a>

### パスワードポリシー

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `password.minLength` | 1 から `password.maxLength` までの整数 | `8` | 新しいパスワードの最小長です。JavaScript の文字列長で数えます。 |
| `password.maxLength` | `password.minLength` から 256 までの整数 | `128` | 新しいパスワードの最大長です。 |
| `password.requireUppercase` | 真偽値 | `true` | 新しいパスワードに ASCII の英大文字を必須にします。 |
| `password.requireLowercase` | 真偽値 | `true` | 新しいパスワードに ASCII の英小文字を必須にします。 |
| `password.requireNumber` | 真偽値 | `true` | 新しいパスワードに 0–9 の数字を必須にします。 |
| `password.requireSpecialChar` | 真偽値 | `false` | `!` や `#` など、ポリシーが対象とする記号を必須にします。 |
| `password.minCharacterClasses` | 整数、0–4 | `0` | 大文字、小文字、数字、特殊文字のうち必要な文字種の最小数です。個別項目の条件と同時に適用します。 |
| `password.expirationDays` | 0 以上の整数、日 | `0` | 前回パスワードを設定した時点からの有効日数です。0 は無期限です。期限切れ後はパスワードを更新してからログインします。 |
| `password.preventSamePassword` | 真偽値 | `false` | 現在のパスワードの再利用を拒否します。有効期限や初回変更を必須にした場合も再利用を拒否します。 |
| `password.requireInitialChange` | 真偽値 | `false` | 管理者が作成または再設定したパスワードに初回変更を要求します。変更後にセッションを作成できます。 |

### `otp`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `otp` | オブジェクト | OTP ログインを使う場合に必須。`{}` を指定できます。 | OTP 認証方式を組み立てます。 |
| `otp.email` | 真偽値 | `true` | `onOtpSendEmail` または Reach の `otp_email` テンプレートを使うメール送信を許可します。 |
| `otp.sms` | 真偽値 | `true` | `onOtpSendSms` または Reach の `otp_sms` テンプレートを使う SMS 送信を許可します。 |
| `otp.length` | 整数、4–8 桁 | `6` | 数字コードの桁数です。 |
| `otp.expiresIn` | 整数、60 秒以上 | `300` | 発行からコードが無効になるまでの時間です。 |
| `otp.maxAttempts` | 正の整数 | `3` | 一つの発行コードを検証できる回数です。上限に達したら新しいコードが必要です。 |
| `otp.resendInterval` | 整数、30 秒以上 | `60` | 同じ正規化済み連絡先への最短再送間隔です。コードの使用後も待ち時間が続きます。 |

メールコードの送信と初回パスワード設定を併用するには、[メールコードと招待の設定例](#example-email-otp-invite)を参照してください。

### `ldap`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `ldap` | オブジェクト | `login.ldap: true` の場合に必須 | 組織のディレクトリに接続し、安定したディレクトリ ID からローカルユーザーを特定します。 |
| `ldap.url` | `ldap://` または `ldaps://` の URL | `ldap` を指定する場合に必須 | ディレクトリのアドレスです。LDAPS は接続時から TLS を使います。 |
| `ldap.bindDn` | 文字列 | `ldap` を指定する場合に必須 | ディレクトリを検索するサービスアカウントの DN です。 |
| `ldap.bindPassword` | 文字列 | `ldap` を指定する場合に必須 | サービスアカウントのパスワードです。既定クライアントは空のパスワードを拒否します。 |
| `ldap.searchBase` | 文字列 | `ldap` を指定する場合に必須 | ユーザー検索のベース DN です。 |
| `ldap.directoryId` | 英小文字、数字、`.`、`_`、`-` の 1–96 文字。先頭は英小文字または数字 | LDAP ログインを有効にする場合に必須 | 同じディレクトリを利用する全ノードで共通の安定した ID です。 |
| `ldap.identityAttribute` | `entryUUID` または `objectGUID` | `entryUUID` | エントリーの不変 ID です。Active Directory では `objectGUID` を使います。 |
| `ldap.searchFilter` | 文字列 | `(uid={{username}})` | 検索フィルターです。IAM がプレースホルダーをエスケープ済みのユーザー名に置き換えます。 |
| `ldap.usernameAttribute` | 文字列 | `uid` | ローカルアカウント作成時に読み取るユーザー名の属性です。 |
| `ldap.emailAttribute` | 文字列 | `mail` | メールアドレスの同期に使う属性です。 |
| `ldap.displayNameAttribute` | 文字列 | `cn` | 表示名の同期に使う属性です。 |
| `ldap.useTls` | 真偽値 | `false` | 既定クライアントで `ldap://` 接続の StartTLS を有効にします。 |
| `ldap.connectTimeout` | 整数、1000 ミリ秒以上 | `5000` | 既定クライアントの接続と LDAP 操作のタイムアウトです。 |

<a id="example-ldap"></a>

#### 社内の LDAP ディレクトリに接続する

IAM サーバーのワークスペースに `ldapts` をインストールするか、起動コードで独自クライアントを渡します。URL、DN、ディレクトリ ID を実際の値に置き換えます。すべてのノードで同じディレクトリ ID を使い、`HAI_IAM_LDAP_BINDPASSWORD` はサーバーの非公開環境に保存します。LDAP を使わない環境では、`ldap` 節と関連する環境変数をすべて省略します。バインドパスワードの環境変数だけが残ると、不完全な設定になります。

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, ldap: true }
ldap:
  url: ldaps://directory.example.invalid:636
  bindDn: cn=app-reader,ou=services,dc=example,dc=invalid
  bindPassword: ${HAI_IAM_LDAP_BINDPASSWORD}
  searchBase: ou=people,dc=example,dc=invalid
  directoryId: company-directory
  identityAttribute: entryUUID
```

本番環境と同等の環境で証明書の信頼設定、サービスアカウントの検索権限、ログインルートを確認します。専用のディレクトリテストアカウントで、ログイン成功、誤ったパスワードの拒否、初回ログイン後のローカルロールを確認します。既存ユーザーの移行では ID の関連付けを先に検証します。[LDAP ID の関連付けを移行する](../function/iam.ja.md#ldap-identity-migration)

### `apikey`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `apikey.maxKeysPerUser` | 正の整数 | `10` | 一人のユーザーが保存できるキーの上限です。 |
| `apikey.defaultExpirationDays` | 0 以上の整数、日 | `0` | キーを作成する際の既定の有効日数です。0 は無期限です。 |
| `apikey.prefix` | 文字列 | `hai_` | 新規キーの平文の接頭辞です。アプリケーション識別子を指定できます。 |

### `passwordReset` と `initialCredentials`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `passwordReset.enabled` | 真偽値 | `true` | パスワード再設定を有効にします。独自の送信コールバックまたは対応する Reach テンプレートが必要です。 |
| `passwordReset.mode` | `email` または `phone` | `email` | 既定の送信処理はアカウントのメールまたは電話番号を使い、`password_reset` または `password_reset_sms` を選びます。 |
| `passwordReset.resetUrl` | HTTP(S) の絶対 URL | 省略可 | 既定の送信処理が `token` クエリパラメーターを追加します。省略時はテンプレート変数 `resetUrl` にトークン自体が入ります。 |
| `passwordReset.tokenExpiresIn` | 整数、300 秒以上 | `3600` | 再設定と初回パスワード設定の招待に使うトークンの有効期間です。 |
| `passwordReset.maxAttempts` | 正の整数 | `3` | 有効なトークンを使った送信の上限です。パスワードポリシーの検証失敗も一回に数えます。 |
| `initialCredentials.enabled` | 真偽値 | `false` | 管理者が一回限りのパスワード設定の招待を送れるようにします。再設定の有効化と、対象アカウントの受信経路が必要です。 |

<a id="example-email-otp-invite"></a>

#### メールコードでログインし、パスワード設定の招待を送信する

Reach のメールプロバイダーと `otp_email`、`password_reset` テンプレートを設定し、初期化済みの Reach を IAM に渡します。既存のメール送信サービスを使う場合は、対応する送信コールバックを渡します。

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, otp: true }
register: { enabled: false }
otp: { email: true, sms: false, expiresIn: 300, resendInterval: 60 }
initialCredentials: { enabled: true }
passwordReset: { enabled: true, mode: email, resetUrl: https://app.example.invalid/auth/reset-password }
```

再設定 URL をアプリケーションの実際のページに置き換えます。公開設定でメール OTP、再設定、招待が有効であることを確認します。一つのテストアカウントだけに登録したメールでコードを受け取り、ログインします。次に、権限のある管理機能でテストユーザーを招待し、受信者が初期設定ページを開いてトークンを一度だけ使えることを確認します。[OTP と通知の接続](../function/iam.ja.md#authentication)

### `captcha` と `security`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `captcha.enabled` | 真偽値 | `false` | パスワード、OTP、LDAP によるログイン、自己登録、コード送信、再設定リクエスト、パスワード更新時に ALTCHA の計算チャレンジを有効にします。 |
| `captcha.ttlSeconds` | 整数、1–600 秒 | `120` | 一度だけ使えるチャレンジの有効期間です。 |
| `captcha.cost` | 整数、100–50000 | `5000` | ALTCHA の計算一回あたりの負荷を設定します。 |
| `captcha.maxCounter` | 整数、1–2000 | `100` | ALTCHA の解を探す乱数カウンターの上限です。 |
| `security.lockoutEnabled` | 真偽値 | `true` | アカウント単位の認証失敗回数と一時ロックを有効にします。無効時は過去のロックを適用しません。 |
| `security.failureWindow` | 整数、1–31536000 秒 | `86400` | 最初の認証失敗から始まる固定の集計期間です。 |
| `security.maxLoginAttempts` | 正の整数 | `5` | 期間内にロックに達する失敗回数です。パスワード、LDAP、発行済み OTP の誤った試行に同じアカウントポリシーを使います。 |
| `security.lockoutDuration` | 整数、60 秒以上 | `900` | 上限に達した後のアカウントロック期間です。 |

各ノードは Redis でアカウントのロック状態を共有します。この状態を読み書きできない場合、ロックポリシーの対象となる認証は失敗します。本番環境では全ノードで同じ Redis を使用し、信頼できる永続化と `noeviction` を設定します。[失敗回数、ロック、パスワード再設定の例](../data/iam.ja.md#cache-iam-login-failures)

### `loginAccess`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `loginAccess.enabled` | 真偽値 | `false` | 新規ログインセッションの作成を制限します。ログイン後の各リクエストには Serv または Kit ホストでアクセス条件を設定します。 |
| `loginAccess.allowIps` | IPv4、IPv6、CIDR の文字列配列、最大 1000 項目 | `[]` | 空でなければ、一覧に一致する信頼済みアドレスのみ許可します。 |
| `loginAccess.denyIps` | IPv4、IPv6、CIDR の文字列配列、最大 1000 項目 | `[]` | 一致するアドレスを拒否します。許可リストより優先します。どちらかのリストを設定すると、信頼できる接続元アドレスが必要です。 |
| `loginAccess.timezone` | IANA タイムゾーン文字列 | `UTC` | サーバーの時計を使ってログイン時間帯を判定します。 |
| `loginAccess.windows` | オブジェクト配列、最大 100 項目 | `[]` | ログインを許可する時間帯です。空なら全時間帯を許可します。 |
| `loginAccess.windows[].days` | 1–7 個の整数、各値は 1–7 | 時間帯ごとに必須 | 時間帯の開始曜日です。月曜が 1、日曜が 7 です。 |
| `loginAccess.windows[].start` | `HH:mm`、00:00–23:59 | 時間帯ごとに必須 | この開始時刻を含みます。 |
| `loginAccess.windows[].end` | `HH:mm`、00:00–23:59。`start` と異なる値 | 時間帯ごとに必須 | この終了時刻を含みません。開始より早い値は翌日までの時間帯を表します。 |

<a id="example-login-access"></a>

#### 社内ネットワークと勤務時間に新規ログインを制限する

例のサブネットを実際の接続元に置き換え、ホストの信頼済みプロキシ設定を確認します。ログイン済みセッションからのアクセスには、別途ホストのポリシーを適用できます。

```yaml schema=@h-ai/iam:IamConfigSchema
loginAccess:
  enabled: true
  allowIps: [192.0.2.0/24]
  denyIps: [192.0.2.20]
  timezone: Asia/Shanghai
  windows:
    - { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
```

平日の午前中に許可された接続元からログインします。拒否された接続元や時間帯の外で再度試すと、`LOGIN_ACCESS_DENIED` が返ります。同じテストアカウントで境界も確認します。この例の時間帯は 09:00 を含み、18:00 を含みません。[ログインとホストのアクセスポリシー（中国語）](identity.md)

### `reauthentication`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `reauthentication.enabled` | 真偽値 | `false` | 指定した機微操作の再認証を有効にします。現在のセッションの本人がパスワードを確認し、一回限りのチケットを取得します。 |
| `reauthentication.operations` | 文字列配列、最大 1000 項目。各文字列は前後の空白を除いて 1–128 文字 | `[]` | ファイルで指定する操作 ID です。実際の一覧には RBAC データベースから参照した機微操作も含まれます。 |
| `reauthentication.ttlSeconds` | 整数、1–900 秒 | `300` | 現在のセッション、ユーザー、および操作に紐付いたチケットの有効期間です。 |

<a id="example-sensitive-operation"></a>

#### ユーザーを削除する前に管理者のパスワードを確認する

`iam.users.delete` ガードに接続したアプリケーションを使います。サーバーのガードとクライアントの再認証手順で、同じ操作 ID を指定します。

```yaml schema=@h-ai/iam:IamConfigSchema
reauthentication:
  enabled: true
  operations: [iam.users.delete]
  ttlSeconds: 120
```

削除権限のあるテスト管理者がテストユーザーを操作します。チケットがなければリクエストは拒否されます。管理者が自身のパスワードを確認してチケットを取得すると、二分以内にその操作で一度だけチケットを使えます。業務上の権限がないリクエストは引き続きホストが拒否します。[再認証 API](../function/iam.ja.md#authentication)

<a id="session"></a>

### セッション

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `session.maxAge` | 整数、60 秒以上 | `86400` | 新規セッションのアクセス有効期間です。信頼できるサーバーコードは作成時に変更できます。延長やトークン更新には、セッションごとの値を使います。 |
| `session.refreshTokenMaxAge` | 整数、3600 秒以上 | `604800` | 発行ごとの更新トークン有効期間です。他の期限内であれば、アクセス期限が切れた後も更新できます。 |
| `session.sliding` | 真偽値 | `true` | 活動に応じたアクセス期限の延長を有効にします。 |
| `session.touchMinInterval` | 0 以上の整数、秒 | `5` | 延長時の書き込みの最小間隔です。`sliding: true` かつ `idleTimeout: 0` の場合のみ適用されます。0 にすると活動時刻が変わるたびに書き込みます。 |
| `session.singleDevice` | 真偽値 | `false` | 一つのアカウントで有効なセッションを一つに制限します。 |
| `session.singleDeviceMode` | `replace` または `reject` | `replace` | 単一セッション設定時に、既存セッションを置き換えるか、既存セッションを維持して新規ログインを拒否します。 |
| `session.maxSessions` | 整数、0–10000 | `0` | ユーザーごとの有効セッション総数です。更新できるセッションも数えます。0 は無制限です。 |
| `session.terminalLimits` | キーが `web`、`app`、`desktop`、`api` のオブジェクト。各値は 1–10000 の整数 | `{}` | 端末種別ごとの上限です。空なら種別ごとの制限を無効にします。空でなければ未指定の種別は新規作成できません。通常ログインの既定種別は `web`、API キーログインは `api` です。 |
| `session.terminalLimitMode` | `reject` または `replace` | `reject` | 複数セッション設定時、端末上限に達したら、新規ログインを拒否するか、同じ種別で最も古いセッションを置き換えます。総数上限も適用します。 |
| `session.idleTimeout` | 整数、0–31536000 秒 | `0` | アイドル期限です。0 は無効です。アクセス検証で活動を記録します。自動更新ではアイドル期限を延長しません。 |
| `session.absoluteTimeout` | 整数、0–31536000 秒 | `0` | 最初のログインからの絶対期限です。0 は無効です。更新時も開始時刻を引き継ぎます。 |
| `session.endOnPageHide` | 真偽値 | `false` | ブラウザーに画面離脱時のベストエフォートのログアウト設定を公開します。アプリで離脱処理を接続すると有効になります。サーバーの期限が補完します。 |

書き込み間隔には `touchMinInterval` とセッション自身の `maxAge` の 10 分の 1 のうち短い方を使います。例えば、サーバーが有効期間 10 秒のセッションを作成すると、既定の設定では間隔は 1 秒です。間隔内も共有セッションの状態を検証し、最後に保存した活動時刻と有効期限を返します。有効なアクセストークンの期限が近い場合はすぐに延長できます。

<a id="session-deadlines"></a>

#### セッションの 3 種類の期限

- `refreshTokenMaxAge` はリフレッシュトークン 1 本の有効期間です。トークンの更新に成功すると、新しいリフレッシュトークンはその発行時刻から数え直します。
- `idleTimeout` は最後の利用から何分間そのままにできるかを決めます。ログインとアクセストークンの検証成功を利用として数えます。バックグラウンドリクエストでの検証も対象です。トークンの更新だけを行う処理やロール・権限の同期では、アイドル期限は延びません。
- `absoluteTimeout` は 1 回のログインを継続できる上限です。最初のログインから数え、アクセスやトークン更新を続けても期限は変わりません。

各トークンは、固有の期限、アイドル期限、絶対期限のうち最も早い時刻に失効します。アクセストークン固有の期限が切れても、有効なリフレッシュトークンで更新できます。リフレッシュトークンが先に切れても、有効なアクセストークンは使えます。アイドル期限と絶対期限は個別に `0` で無効にできます。`sliding` が無効でも、アクセスの検証に成功すれば有効なアイドル期限は延びます。`TokenPair.expiresIn` は発行時のアクセス有効秒数です。アイドル期限や絶対期限が先に来る場合もあります。

<a id="example-password-session"></a>

#### パスワードログインと 30 分のアイドル期限を設定する

次の設定をアプリの `config/_iam.yml` に追加します。管理者が用意したテストアカウントでログインします。画面にはパスワードログインだけが表示され、セルフ登録は拒否されます。

```yaml schema=@h-ai/iam:IamConfigSchema
login: { password: true, otp: false, ldap: false, apikey: false }
register: { enabled: false }
password: { minLength: 12 }
session:
  maxAge: 7200
  sliding: false
  refreshTokenMaxAge: 3600
  idleTimeout: 1800
  absoluteTimeout: 28800
```

いずれの場合も、09:00 に別々にログインしたとします。アクセストークン固有の有効期間は 2 時間、リフレッシュトークン固有の有効期間は 1 時間です。どの期限が先に来るかをケースごとに確認できます。

| 先に来る期限 | 操作と結果 |
| --- | --- |
| リフレッシュトークン固有の期限 | 09:20 と 09:40 にアクセスし、トークンは更新しません。10:00 には発行から 1 時間経過しているため、更新が失敗します。アクセストークンは引き続き使えます。アクセストークン固有の期限は 11:00 で、更新を試した時点のアイドル期限は 10:10 です。 |
| アイドル期限 | 09:20 にアクセスし、09:35 はトークンの更新だけを行います。その後アクセストークンは使いません。新しいリフレッシュトークン固有の期限は 10:35 ですが、アイドル期限は 09:50 のままです。09:50 に両方のトークンが無効になり、再ログインが必要です。 |
| 絶対期限 | ログイン後、20 分ごとにアクセスし、40 分ごとにトークンを更新します。最後の更新は 16:20 で、16:40 のアクセスによりアイドル期限は 17:10 になります。新しいリフレッシュトークン固有の期限は 17:20 です。17:00 に最初のログインから 8 時間に達し、両方のトークンが無効になります。 |

[セッションの検証と更新](../function/iam.ja.md#sessions)

<a id="example-terminal-session-limit"></a>

#### 端末別に同時セッション数を制限する

ブラウザーとモバイルで同時にログインできるアプリケーション向けです。ホストはセッションの作成時に端末種別を設定します。この例では Web セッションを最大二つ、アプリのセッションを最大一つ許可します。

```yaml schema=@h-ai/iam:IamConfigSchema
session:
  maxSessions: 3
  terminalLimits: { web: 2, app: 1 }
  terminalLimitMode: reject
```

同じテストアカウントで Web セッション二つとアプリセッション一つを作成します。その後の Web ログインと `desktop` ログインでは `SESSION_LIMIT_EXCEEDED` が返り、既存セッションは引き続き利用できます。同じ種別の端末を入れ替える場合は `replace` に変更し、三回目の Web ログインが最も古い Web セッションを置き換えることを確認します。[セッション設定](#session)

### `accounts`、`rbac`、初期データ

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `accounts.dormantAfterDays` | 整数、0–36500 日 | `0` | 最後の成功ログインまたは作成からこの期間が経過した有効アカウントを、定期処理で休眠にします。0 は無効です。 |
| `accounts.scanIntervalSeconds` | 整数、60–86400 秒 | `3600` | 自動休眠が有効な場合の確認間隔です。 |
| `rbac.enabled` | 真偽値 | `true` | IAM のロールベース権限確認を有効にします。無効時は `iam.authz.checkPermission()` が許可を返します。ホストの HTTP とセッションのガードは引き続き適用されます。 |
| `rbac.superAdminRole` | 文字列 | `super_admin` | スーパー管理者の判定に使うロールコードです。必要に応じて作成、割り当てます。 |
| `rbac.defaultRole` | 文字列 | `user` | ロール指定のない新規アカウントに適用する既存ロールのコードです。空文字列で既定ロールの割り当てを省略します。 |
| `seedDefaultData` | 真偽値 | `true` | 起動時に `admin`、`user`、`guest` と基本権限を初期化します。独自の初期データを使う場合は、参照する既定ロールを用意します。 |

### `agreements` と `ui`

| パス | 型と制約 | 既定値・必須条件 | 効果 |
| --- | --- | --- | --- |
| `agreements.userAgreementMarkdown` | 空でない文字列 | 省略可 | 利用規約の Markdown 本文です。利用規約 URL より優先します。 |
| `agreements.privacyPolicyMarkdown` | 空でない文字列 | 省略可 | プライバシーポリシーの Markdown 本文です。ポリシー URL より優先します。 |
| `agreements.userAgreementUrl` | HTTP(S) の絶対 URL | 省略可 | 利用規約のリンクです。 |
| `agreements.privacyPolicyUrl` | HTTP(S) の絶対 URL | 省略可 | プライバシーポリシーのリンクです。 |
| `agreements.showOnRegister` | 真偽値 | `true` | 設定した規約を登録時に表示します。 |
| `agreements.showOnLogin` | 真偽値 | `false` | 設定した規約をログイン時に表示します。 |
| `ui.variant` | `card` または `split` | `card` | 認証画面のカード表示と分割表示を切り替えます。 |
| `ui.title` | 文字列 | 省略可 | 認証パネルのタイトルです。 |
| `ui.subtitle` | 文字列 | 省略可 | 認証パネルのサブタイトルです。 |
| `ui.brandTitle` | 文字列 | 省略可 | ブランド領域のタイトルです。 |
| `ui.brandText` | 文字列 | 省略可 | ブランド領域の説明文です。 |
| `ui.logoUrl` | HTTP(S) アドレスまたは一つの `/` で始まるサイト内パス | 省略可 | ブランドロゴです。 |
| `ui.illustrationUrl` | HTTP(S) アドレスまたは一つの `/` で始まるサイト内パス | 省略可 | 認証画面のイラストです。 |

### 起動コードで渡すランタイム依存先

サーバーの起動コードから `iam.init()` に、初期化済みの Reach、送信コールバック、独自の LDAP クライアントを渡せます。既定の LDAP クライアントを使用する場合は、サーバーワークスペースに `ldapts` が必要です。LDAP の新規アカウントとプロフィールは既定で同期します。`ldapSyncUser: false` を渡すと、既存の有効な関連付けを持つユーザーだけがログインできます。[LDAP と通知の接続](../function/iam.ja.md#authentication)
