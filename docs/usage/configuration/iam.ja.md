# @h-ai/iam 設定

<!-- translation: partial -->

[原文（中国語）](iam.md) · [データ構造](../data/iam.ja.md) · [API リファレンス](../function/iam.ja.md)

## 設定の読み込み

RelDB と Cache を初期化してから `_iam.yml` の設定を `iam.init()` に渡します。IAM は初期化済みの Crypto を再利用し、必要に応じて初期化します。全体の順序は[依存関係](../function/iam.ja.md#module-dependencies)を参照してください。ログイン、登録、チャレンジ、権限、セッションは個別に設定します。ブラウザーにはフォームで使う公開項目だけを返します。

設定の検証に失敗すると、`iam.init()` は `CONFIG_ERROR` を返します。メッセージと `error.ext.fields` に問題のフィールドパスが入り、`error.cause` に元の検証エラーを保持します。サーバーログの `issues` 配列にはパス、エラーの種類と説明を記録し、設定全体は記録しません。

## 設定一覧

<a id="password"></a>

### パスワードポリシー

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `password.minLength`, `maxLength` | `8`, `128` | パスワードの長さの範囲。 |
| `password.requireUppercase`, `requireLowercase`, `requireNumber`, `requireSpecialChar` | `true`, `true`, `true`, `false` | 必須とする文字種。 |
| `password.minCharacterClasses`, `expirationDays`, `preventSamePassword`, `requireInitialChange` | `0`, `0`, `false`, `false` | 文字種数、有効期限、変更条件の任意設定。 |
| `otp.length`, `expiresIn`, `maxAttempts`, `resendInterval` | `6`, `300`, `3`, `60` | 桁数、有効秒数、試行上限、再送までの秒数。 |
| `reauthentication.enabled`, `operations`, `ttlSeconds` | `false`, `[]`, `300` | 指定した機密操作で再認証を要求。 |
| `initialCredentials.enabled`, `loginAccess.enabled` | `false`, `false` | 初期認証情報の手順またはアドレス・時間帯による制限を有効化。 |
| `accounts.dormantAfterDays`, `scanIntervalSeconds` | `0`, `3600` | 休眠の判定日数と確認間隔。 |
| `ldap`, `session`, `register`, `captcha` | バックエンドによる | ディレクトリ・セッション期限と範囲、公開登録、対話チャレンジを個別に設定。 |
| `ldap.directoryId` | LDAP 有効時は必須 | 同じディレクトリを使う全ノードで共通の ID。英小文字、数字、ピリオド、アンダースコア、ハイフンを 1–96 文字使い、英小文字か数字で始めます。 |
| `ldap.identityAttribute` | `entryUUID` | 不変のエントリー識別子。Active Directory では `objectGUID` を使用します。 |
| `ui.variant` | `card` | 公開ログインのレイアウトと任意のブランド項目。 |

<a id="session"></a>

### セッション

サーバーのセッション有効期間と上限は `session` で指定します。ブラウザーには期限や画面離脱時の公開設定だけを返します。ログアウト時はサーバー側のセッションも無効化します。

未翻訳：ログイン、パスワード、セッション、アカウントポリシーの全設定。[中国語の該当節](iam.md#configuration-fields)を参照してください。

## 設定例

```yaml schema=@h-ai/iam:IamConfigSchema
login:
  password: true
  otp: false
register:
  enabled: false
session:
  maxAge: 3600
```

### パスワードでログインし、30 分の無操作でセッションを終了する

`config/_iam.yml` に記述します。パスワードは最低 12 文字とし、自己登録を無効にします。両タイムアウトの単位は秒です。30 分の無操作、またはログインから 8 時間で再ログインが必要になります。既存のパスワードが自動で変更されることはありません。

```yaml schema=@h-ai/iam:IamConfigSchema
login:
  password: true
  otp: false
  ldap: false
register:
  enabled: false
password:
  minLength: 12
session:
  idleTimeout: 1800
  absoluteTimeout: 28800
```

### 社内の LDAP ディレクトリに接続する

接続 URL、バインド用アカウント、ユーザーの検索範囲を揃えて指定します。パスワードはサーバーの非公開環境変数から読み込みます。この例では通常のパスワードログインも残します。LDAP を使わない場合は `ldap` 節と `HAI_IAM_LDAP_*` 環境変数をすべて省略します。パスワード変数だけを残すと、不完全な設定となり起動できません。

```yaml schema=@h-ai/iam:IamConfigSchema
login:
  password: true
  ldap: true
ldap:
  url: ldaps://directory.example.com:636
  bindDn: cn=app-reader,ou=services,dc=example,dc=com
  bindPassword: ${HAI_IAM_LDAP_BINDPASSWORD}
  searchBase: ou=people,dc=example,dc=com
```
