# @h-ai/iam 設定

<!-- translation: partial -->

[原文（中国語）](iam.md) · [データ構造](../data/iam.ja.md) · [API リファレンス](../function/iam.ja.md)

データベースと認証の依存先の初期化後に `_iam.yml` を読み込みます。ログイン、登録、チャレンジ、権限、セッションは個別に設定します。ブラウザーにはフォームで使う公開項目だけを返します。

```yaml schema=@h-ai/iam:IamConfigSchema
login:
  password: true
  otp: false
register:
  enabled: false
session:
  maxAge: 3600
```

<a id="password"></a>

## パスワードポリシー

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

## セッション

サーバーのセッション有効期間と上限は `session` で指定します。ブラウザーには期限や画面離脱時の公開設定だけを返します。ログアウト時はサーバー側のセッションも無効化します。

未翻訳：ログイン、パスワード、セッション、アカウントポリシーの全設定。[中国語の該当節](iam.md#configuration-fields)を参照してください。
