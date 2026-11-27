# @h-ai/iam API リファレンス

[简体中文](iam.md) · [English](iam.en.md)

IAM は Node.js サーバーで認証し、セッションを発行して現在の権限を取得します。アプリケーションは認証済みの主体について、操作の権限と対象リソースへのアクセスを確認します。

[README](../../../packages/iam/README.ja.md) · [設定](../configuration/iam.ja.md) · [データ構造](../data/iam.ja.md)

<a id="module-dependencies"></a>

## 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| Node.js | 認証と認可サービスを実行します。 | サーバーでは Node.js 22.23.4、24.22.1、26.12.1、または各メジャーバージョン内のそれ以降のリリースを使用します。 | 認証リクエストを受け付ける前に IAM を起動します。 |
| `@h-ai/reldb` | アカウント、ロール、権限を保存します。 | 必須です。 | `iam.init()` の前に初期化します。 |
| `@h-ai/cache` | セッション、ログイン失敗回数、ワンタイムコード、チケットを管理します。 | 必須です。 | `iam.init()` の前に初期化します。 |
| `@h-ai/core` | ログ、エラー、リクエストのコンテキストを提供します。 | IAM と一緒にインストールされます。 | ログ設定や共通設定を使う場合は先に Core を設定します。 |
| `@h-ai/crypto` | パスワードのハッシュ化などの暗号機能を提供します。 | IAM と一緒にインストールされます。 | `iam.init()` は初期化済みの Crypto を再利用し、必要に応じて初期化します。 |
| `@h-ai/audit` | IAM のセキュリティイベントを収集します。 | IAM と一緒にインストールされます。監査収集を有効にしたアプリで使います。 | 先に `capture` を有効にして Audit を起動し、その後 IAM を起動します。終了時は IAM を先に閉じます。 |
| `@h-ai/reach` | 標準テンプレートで確認コード、パスワード再設定、初回設定の招待を送信します。 | Reach で送信する場合にインストールします。アプリ独自の送信コールバックも使えます。 | Reach を初期化してから `iam.init({ ...config, reach })` に渡します。 |
| LDAP ディレクトリと `ldapts` | ディレクトリに接続して LDAP サインインを行います。 | LDAP を使う場合は接続可能なディレクトリが必要です。標準クライアントを使う場合は `ldapts` をインストールします。 | IAM の初期化時に接続設定を渡します。独自クライアントを使う場合は `ldapClientFactory` を渡します。 |
| `altcha`、`zod` | CAPTCHA チャレンジの生成と検証、設定と入力の検証を行います。 | IAM と一緒にインストールされます。ALTCHA は CAPTCHA を有効にしたときに使います。 | IAM が設定に応じて呼び出します。 |

<a id="quick-start"></a>

## クイックスタート

Node.js プロジェクトに次のパッケージを追加します。例を `src/iam-example.ts` に保存し、プロジェクトの TypeScript 実行環境で動かします。毎回、新しいメモリ内 SQLite データベースと Memory キャッシュを使います。本番のインスタンスは同じデータベースと Redis に接続します。

```sh
pnpm add @h-ai/iam @h-ai/reldb @h-ai/cache @h-ai/core @h-ai/crypto
```

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

async function run() {
  try {
    const db = await reldb.init({ type: 'sqlite', database: ':memory:' })
    if (!db.success) return db
    const store = await cache.init({ type: 'memory' })
    if (!store.success) return store
    const cryptography = await crypto.init()
    if (!cryptography.success) return cryptography
    const identity = await iam.init({ login: { otp: false } })
    if (!identity.success) return identity

    const account = { username: 'demo', password: 'ExampleOnly-123!' }
    const registered = await iam.user.register(account)
    if (!registered.success) return registered

    const login = await iam.auth.login({
      identifier: registered.data.user.username,
      password: account.password,
    })
    if (!login.success) return login

    const session = await iam.auth.verifyToken(login.data.tokens.accessToken)
    if (!session.success) return session

    const logout = await iam.auth.logout(login.data.tokens.accessToken)
    if (!logout.success) return logout
    return core.ok(session.data.userId)
  }
  finally {
    await iam.close()
    await crypto.close()
    const cacheClosed = await cache.close()
    if (!cacheClosed.success) core.logger.error('Cache shutdown failed', { code: cacheClosed.error.code })
    const dbClosed = await reldb.close()
    if (!dbClosed.success) core.logger.error('Database shutdown failed', { code: dbClosed.error.code })
  }
}

const result = await run()
if (!result.success) {
  core.logger.error('IAM example failed', { code: result.error.code })
  process.exitCode = 1
}
else {
  core.logger.info('IAM example authenticated a user', { userId: result.data })
}
```

成功ログに認証済みのユーザー ID が表示されます。ログアウトでセッションのアクセス用と更新用の認証情報が失効します。ブラウザーの Cookie と更新には HTTP の連携を使います。 [Kit のログイン](kit.ja.md#authorization-example) · [Serv の認証](serv.ja.md#authentication)

<a id="api-reference"></a>

## API リファレンス

以下では、起動済みのサーバーで `@h-ai/iam` から `iam` を、`@h-ai/core` から `core` と `HaiCommonError` をインポートします。表の型は、プロパティと明記した同期メソッドを除いて `HaiResult.data` を示します。成功時の `void` はデータなし、`null` は対象なしを表します。管理操作の前にアプリケーションで操作者の権限とアクセス範囲を確認します。

<a id="lifecycle"></a>

### IAM の起動と公開ポリシーの提供 · `iam`

リクエストを受け付ける前に IAM を起動します。終了時は IAM を閉じてから、ホストが所有する依存先を解放します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `iam.init(config)` | RelDB と Cache の起動後に IAM を初期化 | `config: IamConfigInput` は必須。空オブジェクトは既定値を使う。[構成リファレンス](../configuration/iam.ja.md)を参照。 | `void` | `await iam.init({})` |
| `iam.close()` | IAM の実行時リソースを解放 | 引数なし | `Promise<void>` | `await iam.close()` |
| `iam.getPublicConfig()` | 保存済み機密操作を含む公開方針を取得 | 引数なし | `IamPublicConfig` | `await iam.getPublicConfig()` |
| `iam.config` | 現在のマスク済み設定を取得 | 読み取り専用プロパティ、引数なし | `IamConfig \| null` | `iam.config` |
| `iam.publicConfig` | ファイルから構築した公開情報を読む | 読み取り専用 | `IamPublicConfig \| null` | `iam.publicConfig` |
| `iam.isInitialized` | 認証サービスの準備状態を確認 | 読み取り専用プロパティ、引数なし | `boolean` | `iam.isInitialized` |
| `iam.isRegisterEnabled` | 登録の設定を読む | 読み取り専用 | `boolean` | [`iam.isRegisterEnabled`](#users) |
| `iam.auth` | 認証操作 | 読み取り専用 | `AuthnOperations` | [`iam.auth`](#authentication) |
| `iam.user` | アカウント操作 | 読み取り専用 | `UserOperations` | [`iam.user`](#users) |
| `iam.authz` | 認可操作 | 読み取り専用 | `AuthzOperations` | [`iam.authz`](#authorization) |
| `iam.session` | セッション操作 | 読み取り専用 | `SessionOperations` | [`iam.session`](#sessions) |
| `iam.apiKey` | API キー操作 | 読み取り専用 | `ApiKeyOperations` | [`iam.apiKey`](#api-keys) |
| `iam.ticket` | ワンタイムチケット操作 | 読み取り専用 | `TicketOperations` | [`iam.ticket`](#tickets) |

##### オブジェクト引数と項目

| 型または項目 | 値と動作 |
| --- | --- |
| `IamConfigInput` | `IamConfigSchema` が受け付ける既定値省略可能な設定を渡します。`reach`、`ldapClientFactory`、`ldapSyncUser`、送信コールバックを追加できます。 |
| `IamPublicConfig` | ログイン、登録、チャレンジ、パスワード、再設定、再認証、規約、画面の公開項目。再認証が有効な場合、`getPublicConfig()` はファイルとデータベースのルールを統合します。 |
| `config / publicConfig / isRegisterEnabled` | 最初の二項目は初期化前に `null` です。登録フラグは初期化前に真を返すため、先に初期化状態を確認します。`config` は機密項目を除いたサーバー向け設定です。 |

ブラウザー入口はスキーマ、公開型、`HaiIamError` を公開します。`IamConfigSettingsInput` は設定ファイルの入力、`IamConfig` は解析後の設定を表します。

##### ホストから渡す実行時の依存先

| 項目 | 型 | 既定値と用途 |
| --- | --- | --- |
| `reach?` | `ReachFunctions` | Reach の追加、初期化、終了はアプリケーションが担当します。IAM は初期化済みのインスタンスでテンプレートを選び、明示したコールバックを優先します。どちらも利用できなければ対応する通知は利用できません。 |
| `ldapClientFactory?` | `(config: LdapConfig) => Promise<HaiResult<LdapClient>>` | LDAP が有効で省略した場合は、アプリケーションが追加した `ldapts` の既定クライアントを使います。独自ファクトリーは `bind`、`search`、`unbind` を持つクライアントを返し、失敗は `HaiResult` で返します。 |
| `ldapSyncUser?` | `boolean` | 既定の `true` ではローカル作成とプロフィール同期が有効です。`false` では、既存の紐付けがありログイン可能なアカウントだけを受け付けます。 |
| `onPasswordResetRequest?` | `(user: User, token: string, context: IamNotificationContext) => Promise<void>` | メールまたは SMS で再設定トークンを送信します。初期パスワード設定の招待にも使います。省略時は Reach の再設定テンプレートで実装できます。 |
| `onOtpSendEmail?` | `(email: string, code: string, context: IamNotificationContext) => Promise<void>` | メールの確認コードを送信します。省略時は Reach の `otp_email` テンプレートで実装できます。 |
| `onOtpSendSms?` | `(phone: string, code: string, context: IamNotificationContext) => Promise<void>` | SMS の確認コードを送信します。省略時は Reach の `otp_sms` テンプレートで実装できます。 |

送信コールバックには `IamNotificationContext` が渡されます。`expiresAt: Date` は認証情報の期限、`idempotencyKey: string` はこの発行の重複除去に使う安定したキーです。配信エラーやタイムアウトを IAM で処理できるよう、Promise を失敗させます。

<a id="detailed-workflow"></a>

#### 利用例：ログインページに現在のポリシーを返す

Kit や Serv の標準ハンドラーではクライアントから `client.iam.auth.publicConfig()` を呼びます。独自ハンドラーは次のように公開情報を読み取って返します。同じ規約に Markdown と URL がある場合、標準画面は Markdown を優先します。

```ts
async function publicSignInPolicy() {
  const result = await iam.getPublicConfig()
  if (!result.success) return result
  return core.ok(result.data)
}
```

<a id="authentication"></a>

### ログイン、所有確認、機密操作の再認証 · `iam.auth`

サーバーが有効にした方式を使います。認証情報が正しくても、IAM はアカウント状態、リクエストのポリシー、セッション上限を確認します。業務操作の認可はホストで行います。

保護されたリクエストには `iam.auth.verifyToken()` を使います。セッションを特定した後、アカウント状態、ロール、権限を一つの共有照会結果から読み取ります。ホストは返された権限で操作の可否を判定します。[アカウントと認可のキャッシュ](../data/iam.ja.md#cache-iam-result)

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `iam.auth.login(credentials, context?)` | パスワード認証でセッションを作成 | `credentials: PasswordCredentials`、`context?: AuthRequestContext` · パスワード認証情報を渡し、ホスト情報で認証ポリシーと追跡を補う · [オブジェクト引数](#authentication-arguments) | `AuthResult` | `await iam.auth.login({ identifier, password })` |
| `iam.auth.loginWithOtp(credentials, context?)` | ワンタイムコードで認証 | `credentials: OtpCredentials`、`context?: AuthRequestContext` · 識別子とワンタイムコード、ポリシーと追跡用のホスト情報 · [オブジェクト引数](#authentication-arguments) | `AuthResult` | `await iam.auth.loginWithOtp({ identifier, code })` |
| `iam.auth.loginWithLdap(credentials, context?)` | ディレクトリーで認証 | `credentials: LdapCredentials`、`context?: AuthRequestContext` · ディレクトリの認証情報と、ポリシーや追跡用のホスト情報 · [オブジェクト引数](#authentication-arguments) | `AuthResult` | `await iam.auth.loginWithLdap({ username, password })` |
| `iam.auth.loginWithApiKey(credentials, context?)` | API キーでスコープ付きセッションを作成 | `credentials: ApiKeyCredentials`、`context?: AuthRequestContext` · 発行済みのキーと、ポリシーや追跡用のホスト情報 · [オブジェクト引数](#authentication-arguments) | `AuthResult` | `await iam.auth.loginWithApiKey({ key: rawKey })` |
| `iam.auth.registerAndLogin(options, context?)` | 登録後に許可されたセッションを作成 | `options: RegisterOptions` 登録するアカウント、パスワード、プロフィールを指定します。`context` は新規セッションの端末とリクエスト情報です · [オブジェクト引数](#users-arguments) · `context?: AuthRequestContext` · [オブジェクト引数](#authentication-arguments) | `AuthResult` | `await iam.auth.registerAndLogin({ username, password })` |
| `iam.auth.createCaptcha(input)` | 操作に対応するチャレンジを作成 | `input: { operation: CaptchaOperation }` は必須。`login`、`register`、`sendOtp`、`passwordReset`、`renewPassword` のいずれかを指定 | `IamCaptchaChallenge` | `await iam.auth.createCaptcha({ operation: 'login' })` |
| `iam.auth.sendOtp(identifier, options?)` | 有効な経路にコードを送信 | `identifier: string` 有効な経路で使うアカウント識別子（メールアドレスや電話番号など） · `options?: { captcha?: string }` 必要に応じてチャレンジの証明を渡す | `{ expiresAt: Date; }` | `await iam.auth.sendOtp(identifier)` |
| `iam.auth.verifyToken(accessToken)` | トークンと現在の認証状態を検証 | `accessToken: string` 現在のセッションのアクセストークン | `Session` | `await iam.auth.verifyToken(accessToken)` |
| `iam.auth.logout(accessToken)` | 提示したアクセス・更新資格情報を失効 | `accessToken: string` 現在のセッションのアクセストークン | `void` | `await iam.auth.logout(accessToken)` |
| `iam.auth.reauthenticate(accessToken, password, operation)` | 再認証して操作用チケットを発行 | `accessToken: string` 現在のセッションのアクセストークン · `password: string` パスワードポリシーで検証する値 · `operation: string` サーバーで登録した機微操作名 | `IssuedTicket` | `await iam.auth.reauthenticate(accessToken, password, 'orders.cancel')` |
| `iam.auth.checkSensitiveOperation(accessToken, operation, ticket?)` | 操作の証明を検証・消費 | `accessToken: string` 現在のセッションのアクセストークン · `operation: string` サーバーで登録した機微操作名 · `ticket?: string` サーバーが発行した一回限りのチケット | `void` | `await iam.auth.checkSensitiveOperation(accessToken, 'orders.cancel', operationTicket)` |

<a id="authentication-arguments"></a>

##### オブジェクト引数と項目

| 型または項目 | 値と動作 |
| --- | --- |
| `PasswordCredentials / OtpCredentials / LdapCredentials` | パスワードは `identifier` と `password`、確認コードは連絡先 `identifier` と `code`、LDAP はディレクトリの `username` と `password` を使います。ALTCHA が有効なら `captcha` を送ります。信頼できるセッション回復では `expectedUserId` で元の主体に限定できます。 |
| `ApiKeyCredentials` | `key` は発行時に一度だけ返る平文です。権限は所有者の現在の権限とキーの範囲の共通部分です。 |
| `AuthRequestContext` | `terminalType` は `web`、`app`、`desktop`、`api` です。通常ログインは `web`、キーによるログインは `api` が既定です。`ip`、`userAgent`、`requestId` は信頼できるホストから渡します。 |
| `CaptchaOperation / captcha` | 操作は `login`、`register`、`sendOtp`、`passwordReset`、`renewPassword` です。発行結果は `id` と `challenge` です。`{ id, solution }` を JSON 文字列で送り、同じチャレンジの提出は一度です。 |
| `AuthResult` | 成功データには公開 `user`、`tokens`、ロールと権限コード、任意の `agreements` が含まれます。アクセス用と更新用のトークンは信頼できるサーバーの境界で管理します。 |

#### 利用例：登録後にワークスペースを開く

公開登録では、アカウントと既定ロールの確定後にセッションを作ります。初期状態、ログイン許可、容量の条件でログインできなくても、アカウントは作成済みの場合があります。失敗の種類に応じてログインや有効化待ちを案内します。標準クライアントは有効なチャレンジを先に解きます。

![ログインは認証情報とアカウント状態から、権限とセッション上限まで確認する](../images/function-iam-login.ja.svg)

```ts
import { type AuthRequestContext, type RegisterOptions, iam } from '@h-ai/iam'

async function registerWorkspace(input: RegisterOptions, context: AuthRequestContext) {
  const signedIn = await iam.auth.registerAndLogin(input, context)
  if (!signedIn.success) return signedIn
  return core.ok({ userId: signedIn.data.user.id, tokens: signedIn.data.tokens })
}
```

<a id="可选-ldap-与通知接入"></a>
<a id="使用可选-reach-自动发送"></a>

#### 利用例：メールの確認コードでログインする

`login.otp` と `otp.email` を有効にし、送信可能なメール経路を用意します。`onOtpSendEmail` を渡すか、Reach を `otp_email` テンプレート付きで初期化して IAM に渡します。SMS は `otp.sms` と `onOtpSendSms`、または `otp_sms` を使います。再設定と招待は `onPasswordResetRequest`、または Reach のメール用 `password_reset` と SMS 用 `password_reset_sms` を使います。確認コードのテンプレートは `{code}`、再設定は `{token}`、`{expiresAt}`、`{resetUrl}` を使えます。組み込み連携は即時送信を試み、機密通知のメタデータだけを保持します。 [Reach の通知時間帯](reach.ja.md#reach-quiet-hours)

フォームのメールアドレスを使って送信を要求し、有効期限を表示します。別のリクエストで利用者が受信したコードを送ります。チャレンジが有効なら操作ごとに証明を渡します。コールバックは認証情報の保存後に動き、第 3 引数に `idempotencyKey` と `expiresAt` が入ります。タイムアウト後は配送済みの場合があるため、再送を決める前に配信事業者の記録を確認します。

```ts
import { type AuthRequestContext, iam } from '@h-ai/iam'

async function sendEmailCode(email: string, captcha?: string) {
  const sent = await iam.auth.sendOtp(email, { captcha })
  if (!sent.success) return sent
  return core.ok({ expiresAt: sent.data.expiresAt })
}

async function signInWithEmailCode(email: string, code: string, context: AuthRequestContext, captcha?: string) {
  const login = await iam.auth.loginWithOtp({ identifier: email, code, captcha }, context)
  if (!login.success) return login
  return core.ok({ userId: login.data.user.id, tokens: login.data.tokens })
}
```

コードは発行時に特定したアカウントか未登録の連絡先に結び付いています。連絡先の付け替え後も、古いコードを新しい主体のログインに使えません。使用後にコードは失効し、再送の待機時間は続きます。公開登録 (`register.enabled`) が有効な場合はアカウントと既定ロールを一緒に確定します。 [確認コードのデータ](../data/iam.ja.md#cache-iam-otp)

#### 利用例：独自フォームで ALTCHA を使う

`captcha.enabled` を有効にします。サーバーが `login` 用チャレンジを発行し、ブラウザーの Altcha ソルバーが `solution` を計算します。ログイン時に認証情報と JSON 文字列 `{ id, solution }` を送ります。標準フォームはこの流れを自動で処理します。ログイン失敗や期限切れの後は新しいチャレンジを取得します。

フォームに返すのは `id` と `challenge` です。標準コンポーネントを使うか、独自フロントエンドに `altcha` を追加してソルバーを使います。

```ts
async function loginChallenge() {
  const challenge = await iam.auth.createCaptcha({ operation: 'login' })
  if (!challenge.success) return challenge
  return challenge
}

async function submitPassword(identifier: string, password: string, id: string, solution: object) {
  const login = await iam.auth.login({ identifier, password, captcha: JSON.stringify({ id, solution }) })
  if (!login.success) return login
  return core.ok({ userId: login.data.user.id, tokens: login.data.tokens })
}
```

#### 利用例：企業ディレクトリのアカウントでログインする

`login.ldap` を有効にし、接続先、検索ベース、`directoryId` と不変の識別属性を指定します。既定クライアントには `pnpm add ldapts` が必要です。独自クライアントは `ldapClientFactory` を渡します。LDAPS または `useTls: true` の StartTLS を利用します。OpenLDAP の例は `entryUUID`、Active Directory の例は `objectGUID` です。紐付いたエントリーの名称変更後も IAM ユーザー ID は変わりません。`ldapSyncUser: false` では既存の紐付けが必須です。競合する紐付けや複数一致は拒否されます。

[ディレクトリ設定](../configuration/iam.ja.md#ldap)

```ts
import { type AuthRequestContext, type LdapCredentials, iam } from '@h-ai/iam'

async function signInAtWork(credentials: LdapCredentials, context: AuthRequestContext) {
  const login = await iam.auth.loginWithLdap(credentials, context)
  if (!login.success) return login
  return core.ok({ userId: login.data.user.id, tokens: login.data.tokens })
}
```

<a id="ldap-identity-migration"></a>

#### 利用例：既存アカウントを確認済みのディレクトリエントリーに紐付ける

LDAP ログインを一時停止します。ディレクトリ管理者が対応関係を確認し、アプリケーションと同じディレクトリ識別子、ローカルユーザー ID、不変のエントリー識別子を `approved-bindings.json` に保存します。`private-db.json` は対象データベースの非公開設定です。

```json
{
  "directoryId": "company-directory",
  "identityAttribute": "entryUUID",
  "bindings": [
    { "entryId": "3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76", "userId": "user-42" }
  ]
}
```

```sh
node ./node_modules/@h-ai/iam/dist/ldap-bindings.js --database private-db.json --manifest approved-bindings.json
node ./node_modules/@h-ai/iam/dist/ldap-bindings.js --database private-db.json --manifest approved-bindings.json --apply
```

事前確認で `newBindings` と `existingBindings` を読み、照合後に `--apply` を追加します。競合時は全件を取り消し、同じ紐付けの再適用では既存レコードを維持します。再開前にディレクトリアカウントでログインし、元の IAM ユーザー ID を確認します。

#### 利用例：注文取消前に本人を再確認する

`orders.cancel` をファイルまたは RBAC ルールに登録します。アプリケーションはセッション、操作権限、注文の帰属を先に確認します。証明が必要なら現在のパスワードを求め、返されたチケットとともに再送します。標準 HTTP ヘッダーは `x-hai-reauthentication` です。証明は現在のユーザー、セッション、用途に結び付き、一度だけ使えます。

```ts
async function proveCancellation(accessToken: string, password: string) {
  const proof = await iam.auth.reauthenticate(accessToken, password, 'orders.cancel')
  if (!proof.success) return proof
  return core.ok({ ticket: proof.data.ticket, expiresAt: proof.data.expiresAt })
}

async function checkCancellationProof(accessToken: string, ticket: string) {
  const checked = await iam.auth.checkSensitiveOperation(accessToken, 'orders.cancel', ticket)
  if (!checked.success) return checked
  return core.ok(undefined)
}
```

<a id="users"></a>

### アカウント、プロフィール、パスワードの管理 · `iam.user`

本人の操作では認証済みのアクセストークンを使い、管理操作では認可済みの対象ユーザー ID を使います。プロフィールとロールを変更するときは一つのトランザクションで保存するメソッドを使います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `iam.user.createUser(options, management?)` | 管理者としてユーザーを作成 | `options: RegisterOptions` にアカウント情報と初期認証情報を渡す。`management.roleIds` でロールを指定できる。 [オブジェクト引数](#users-arguments) | `RegisterResult` | `await iam.user.createUser({ username, password }, { roleIds: [reviewerRoleId] })` |
| `iam.user.register(options)` | 一般登録方針で登録 | `options: RegisterOptions` · 公開登録するアカウントの情報とパスワード · [オブジェクト引数](#users-arguments) | `RegisterResult` | `await iam.user.register({ username, password })` |
| `iam.user.inviteUser(options, management?)` | ユーザーを作成しパスワード設定に招待 | `options: Omit<RegisterOptions, "password">` にアカウント情報と招待の送信先を渡す。`management.roleIds` でロールを指定できる。 [オブジェクト引数](#users-arguments) | `RegisterResult` | `await iam.user.inviteUser({ username, email }, { roleIds: [reviewerRoleId] })` |
| `iam.user.getUser(userId, options?)` | ID でユーザーを取得 | `userId: string` 対象ユーザー ID · `options?: { include?: 'roles'[] }` 必要に応じてロールも取得します · [オブジェクト引数](#users-arguments) | `User \| null` | `await iam.user.getUser(userId)` |
| `iam.user.getUsers(userIds, options?)` | ユーザーと指定した関連情報を一括取得 | `userIds: readonly string[]` まとめて読み取るユーザー ID · `options?: { include?: 'roles'[] }` 必要に応じてロールも取得します · [オブジェクト引数](#users-arguments) | `User[]` | `await iam.user.getUsers([userId], { include: ['roles'] })` |
| `iam.user.listUsers(options?)` | 絞り込んでユーザーをページ取得 | `options?: ListUsersOptions` · アカウントの範囲、順序、ページ、関連データを指定 · [オブジェクト引数](#users-arguments) | `PaginatedResult<User>` | `await iam.user.listUsers({ page: 1, pageSize: 20 })` |
| `iam.user.getCurrentUser(accessToken)` | 現在のトークン所有者の情報を取得 | `accessToken: string` 現在のセッションのアクセストークン | `User` | `await iam.user.getCurrentUser(accessToken)` |
| `iam.user.updateCurrentUser(accessToken, data)` | 現在のトークン所有者の情報を更新 | `accessToken: string` 現在のセッションのアクセストークン · `data: UpdateCurrentUserInput` · [オブジェクト引数](#users-arguments) | `User` | `await iam.user.updateCurrentUser(accessToken, { displayName: 'Alice' })` |
| `iam.user.updateUser(userId, data)` | ID でユーザー情報を更新 | `userId: string` 対象ユーザー ID · `data: Partial<User>` に管理者が変更する項目を渡す。この節の変更可能項目を参照 | `User` | `await iam.user.updateUser(userId, { displayName: 'Alice' })` |
| `iam.user.updateUserWithRoles(userId, input)` | 利用者情報とロールを同じトランザクションで保存 | `userId: string` · `input: UpdateUserWithRolesInput` | `User` またはロールバック後のエラー | `await iam.user.updateUserWithRoles(userId, { profile: { displayName: 'Alice' }, roleIds: [reviewerRoleId] })` |
| `iam.user.deleteUser(userId)` | 指定ユーザーを削除 | `userId: string` 対象ユーザー ID | `void` | `await iam.user.deleteUser(userId)` |
| `iam.user.adminResetPassword(userId, newPassword)` | 管理者としてパスワードを再設定 | `userId: string` 対象ユーザー ID · `newPassword: string` 現在のポリシーに従う新しいパスワード | `void` | `await iam.user.adminResetPassword(userId, newPassword)` |
| `iam.user.renewPassword(input)` | 元の資格情報で期限切れ・初期パスワードを更新 | `input` は必須。`identifier`、現在の `password`、`newPassword` と任意の `captcha` を指定 | `void` | `await iam.user.renewPassword({ identifier, password, newPassword })` |
| `iam.user.changePassword(userId, oldPassword, newPassword)` | 旧パスワード検証後に変更 | `userId: string` 対象ユーザー ID · `oldPassword: string` 現在のパスワード · `newPassword: string` 現在のポリシーに従う新しいパスワード | `void` | `await iam.user.changePassword(userId, oldPassword, newPassword)` |
| `iam.user.changeCurrentUserPassword(accessToken, oldPassword, newPassword)` | トークン所有者のパスワードを変更 | `accessToken: string` 現在のセッションのアクセストークン · `oldPassword: string` 現在のパスワード · `newPassword: string` 現在のポリシーに従う新しいパスワード | `void` | `await iam.user.changeCurrentUserPassword(accessToken, oldPassword, newPassword)` |
| `iam.user.requestPasswordReset(identifier, options?)` | 再設定通知を要求 | `identifier: string` 有効な経路で使うアカウント識別子（メールアドレスや電話番号など） · `options?: { captcha?: string }` 必要に応じてチャレンジの証明を渡す | `void` | `await iam.user.requestPasswordReset(identifier)` |
| `iam.user.confirmPasswordReset(token, newPassword)` | 再設定資格情報を消費して変更 | `token: string` ユーザーに渡した一回限りの再設定用認証情報 · `newPassword: string` 現在のポリシーに従う新しいパスワード | `void` | `await iam.user.confirmPasswordReset(resetToken, newPassword)` |
| `iam.user.validatePassword(password)` | パスワード方針を同期検証 | `password: string` パスワードポリシーで検証する値 | `void` | `iam.user.validatePassword(newPassword)` |
| `iam.user.scanInactiveAccounts()` | 休眠方針に従いアカウントを停止 | 引数なし | `number` | `await iam.user.scanInactiveAccounts()` |

<a id="users-arguments"></a>

##### オブジェクト引数と項目

| 型または項目 | 値と動作 |
| --- | --- |
| `RegisterOptions` | `username` と `password` が必須です。`email`、`phone`、`displayName`、`metadata`、公開登録の `captcha` は任意です。`accountType` の既定は `permanent` で、`temporary` には未来の `accountExpiresAt: Date` が必要です。`accountStatus` は `active`、`dormant`、`closed` のいずれかで、公開登録は `register.defaultAccountStatus` に従います。 |
| `management.roleIds / UpdateUserWithRolesInput` | 管理者の作成・招待では、割り当てるロール ID をすべて指定します。省略時は既定ロール、`[]` は割り当てなしです。更新時の `profile` は差分で、`roleIds` の省略は現在の割り当てを維持し、`[]` は全解除します。ロールで失敗すると更新全体が取り消されます。 |
| `UpdateCurrentUserInput` | 変更できるのは `username`、`email`、`phone`、`displayName`、`avatarUrl`、`metadata` です。省略した項目は維持されます。メールや電話の変更・削除時は該当の確認状態が解除され、旧セッションと再設定資格情報が失効します。表示名などの変更ではセッションを継続できます。 |
| `ListUsersOptions / include` | `page` は 1 始まりです。`pageSize` は既定 20、上限 200 です。`search` はユーザー名、メール、電話、表示名を検索します。`roleCode` はページ分割前に完全一致で絞り込み、`accountStatus` は状態で絞り込みます。`sortBy` は `username`、`email`、`displayName`、`accountStatus`、`createdAt`、`updatedAt`、`sortDirection` は `asc` または `desc` です。既定は作成日時の降順です。`include: ['roles']` でロールを取得します。一括取得は最大 1000 ID で、入力順に重複を除き、未検出項目は省きます。 |
| `User / RegisterResult` | `User` には公開プロフィール、アカウント状態、期限、連絡先の確認状態、時刻が含まれます。`RegisterResult` には任意の `agreements` が加わります。項目の開示もアプリケーションの権限判定に従います。 |

#### 利用例：レビュー担当者を招待してロールを確認する

管理者はレビュー担当ロールの割り当てを許可されています。`initialCredentials.enabled` と `passwordReset.enabled` を有効にし、通知経路を用意します。確認済みのロール ID を使います。アカウントとロールの確定後に一回限りの招待を送ります。配信が不明でも確定済みデータは保持されます。復旧操作の前に配信記録を確認します。

```ts
async function inviteReviewer(username: string, email: string, reviewerRoleId: string) {
  const invitation = await iam.user.inviteUser({ username, email }, { roleIds: [reviewerRoleId] })
  if (!invitation.success) return invitation

  const saved = await iam.user.getUser(invitation.data.user.id, { include: ['roles'] })
  if (!saved.success) return saved
  if (saved.data === null) return saved
  return core.ok(saved.data.roles ?? [])
}
```

#### 利用例：プロフィールとロールを一緒に変更する

管理者に操作が許されたアカウントとロールの ID を使い、表示名とロール集合を更新します。未知のロールがあれば全体を取り消します。成功後は既存セッションについても `iam.auth.verifyToken` が最新の権限を読みます。

```ts
async function moveToReview(userId: string, reviewerRoleId: string) {
  const updated = await iam.user.updateUserWithRoles(userId, {
    profile: { displayName: 'Alice' },
    roleIds: [reviewerRoleId],
  })
  if (!updated.success) return updated
  return core.ok({ id: updated.data.id, displayName: updated.data.displayName })
}
```

#### 利用例：メールアドレスの変更後に再ログインする

現在のセッションで新しいメールアドレスを送ります。保存に成功したら再ログインを案内します。既存のアクセス用と更新用のトークンは失効します。新しいアドレスを確認済みとして扱う前にアプリケーションの確認手順を行います。表示名だけの保存なら現在のセッションを継続できます。

```ts
async function updateEmail(accessToken: string, email: string) {
  const before = await iam.user.getCurrentUser(accessToken)
  if (!before.success) return before

  const saved = await iam.user.updateCurrentUser(accessToken, { email })
  if (!saved.success) return saved
  return core.ok({ email: saved.data.email, changed: before.data.email !== saved.data.email })
}
```

#### 利用例：届いた再設定リンクでアクセスを回復する

再設定の通知経路とページを用意します。最初に利用者が入力したメールまたは電話番号を渡します。成功応答からアカウントの有無は分かりません。再設定ページでリンクのトークンと新しいパスワードを送ります。使用したトークンは失効します。期限切れ、使用済み、試行回数超過、セキュリティ状態の変更時は再発行を求め、変更後に再ログインします。

```ts
async function requestReset(email: string, captcha?: string) {
  const request = await iam.user.requestPasswordReset(email, { captcha })
  if (!request.success) return request
  return core.ok(undefined)
}

async function finishReset(token: string, newPassword: string) {
  const changed = await iam.user.confirmPasswordReset(token, newPassword)
  if (!changed.success) return changed
  return core.ok(undefined)
}
```

ログイン中の利用者が現在のパスワードを入力した場合は `changeCurrentUserPassword` を使います。初回変更や期限切れでログインできなければ、元の認証情報で `renewPassword` を使います。管理者は再設定前に対象の操作権限を確認します。ホストは `scanInactiveAccounts` を方針に応じて実行し、休眠へ移した件数を受け取ります。

<a id="authorization"></a>

### ロールを割り当てて現在の権限を取得する · `iam.authz`

関連付けにはデータベース ID を使い、認可とガードには安定した業務コードを使います。管理操作の前に、操作者が管理できるアカウント、ロール、権限の範囲を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `iam.authz.getUserAuthorization(userId)` | ロールと権限をまとめて取得 | `userId: string` 対象ユーザー ID | `Pick<Session, "roles" \| "permissions">` | `await iam.authz.getUserAuthorization(userId)` |
| `iam.authz.checkPermission(userId, permission)` | ユーザー権限を検証 | `userId: string` 対象ユーザー ID · `permission: string` 確認する権限コード | `boolean` | `await iam.authz.checkPermission(userId, 'orders:read')` |
| `iam.authz.getUserPermissions(userId)` | ユーザー権限を取得 | `userId: string` 対象ユーザー ID | `Permission[]` | `await iam.authz.getUserPermissions(userId)` |
| `iam.authz.getUserRoles(userId)` | ユーザーロールを取得 | `userId: string` 対象ユーザー ID | `Role[]` | `await iam.authz.getUserRoles(userId)` |
| `iam.authz.getUserRolesForMany(userIds)` | 複数ユーザーのロールを取得 | `userIds: string[]` まとめて読み取るユーザー ID | `Map<string, Role[]>` | `await iam.authz.getUserRolesForMany([userId])` |
| `iam.authz.getRolePermissionsForMany(roleIds)` | 複数ロールの権限を取得 | `roleIds: string[]` 対象ロール ID の一覧 | `Map<string, Permission[]>` | `await iam.authz.getRolePermissionsForMany([roleId])` |
| `iam.authz.assignRole(userId, roleId, tx?)` | ユーザーにロールを付与 | `userId: string` 対象ユーザー ID · `roleId: string` ロール ID · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `void` | `await iam.authz.assignRole(userId, roleId)` |
| `iam.authz.removeRole(userId, roleId, tx?)` | ユーザーのロールを解除 | `userId: string` 対象ユーザー ID · `roleId: string` ロール ID · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `void` | `await iam.authz.removeRole(userId, roleId)` |
| `iam.authz.syncRoles(userId, roleIds, tx?)` | ユーザーのロール集合を置換 | `userId: string` 対象ユーザー ID · `roleIds: string[]` 対象ロール ID の一覧 · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `void` | `await iam.authz.syncRoles(userId, [roleId])` |
| `iam.authz.assignPermissionToRole(roleId, permissionId, tx?)` | ロールに権限を付与 | `roleId: string` ロール ID · `permissionId: string` 権限 ID · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `void` | `await iam.authz.assignPermissionToRole(roleId, permissionId)` |
| `iam.authz.removePermissionFromRole(roleId, permissionId, tx?)` | ロールの権限を解除 | `roleId: string` ロール ID · `permissionId: string` 権限 ID · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `void` | `await iam.authz.removePermissionFromRole(roleId, permissionId)` |
| `iam.authz.createRole(role, tx?)` | ロールを作成 | `role` 新しいロールのコード、名前、説明、システムロールのフラグを指定します · [オブジェクト引数](#authorization-arguments) · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `Role` | `await iam.authz.createRole({ code: 'editor', name: 'Editor', isSystem: false })` |
| `iam.authz.getRole(roleId)` | ID でロールを取得 | `roleId: string` ロール ID | `Role \| null` | `await iam.authz.getRole(roleId)` |
| `iam.authz.getRoleByCode(code)` | コードでロールを取得 | `code: string` ロールまたは権限の業務コード | `Role \| null` | `await iam.authz.getRoleByCode('editor')` |
| `iam.authz.getAllRoles(options?)` | 全ロールを取得 | `options?: PaginationOptionsInput` ページ番号、ページサイズ、並び順を指定します · [オブジェクト引数](#authorization-arguments) | `PaginatedResult<Role>` | `await iam.authz.getAllRoles({ page: 1, pageSize: 20 })` |
| `iam.authz.getRoleUserCounts(roleIds)` | ロール別ユーザー数を取得 | `roleIds: string[]` 対象ロール ID の一覧 | `Map<string, number>` | `await iam.authz.getRoleUserCounts([roleId])` |
| `iam.authz.updateRole(roleId, data, tx?)` | ロールを更新 | `roleId: string` ロール ID · `data` 更新するロールのフィールドを指定します。省略したフィールドは保持します · [オブジェクト引数](#authorization-arguments) · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `Role` | `await iam.authz.updateRole(roleId, { name: 'Editor' })` |
| `iam.authz.deleteRole(roleId, tx?)` | ロールを削除 | `roleId: string` ロール ID · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `void` | `await iam.authz.deleteRole(roleId)` |
| `iam.authz.createPermission(permission, tx?)` | 権限を作成 | `permission` 新しい権限のコード、表示名、分類を指定します · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `Permission` | `await iam.authz.createPermission({ code: 'orders:read', name: 'Read orders', type: 'api' })` |
| `iam.authz.getPermission(permissionId)` | ID で権限を取得 | `permissionId: string` 権限 ID | `Permission \| null` | `await iam.authz.getPermission(permissionId)` |
| `iam.authz.getPermissionByCode(code)` | コードで権限を取得 | `code: string` ロールまたは権限の業務コード | `Permission \| null` | `await iam.authz.getPermissionByCode('orders:read')` |
| `iam.authz.getAllPermissions(options?)` | 全権限を取得 | `options?: PermissionQueryOptions` ページ番号、ページサイズ、並び順と、権限の分類による絞り込みを指定します · [オブジェクト引数](#authorization-arguments) | `PaginatedResult<Permission>` | `await iam.authz.getAllPermissions({ page: 1, pageSize: 20 })` |
| `iam.authz.deletePermission(permissionId, tx?)` | 権限を削除 | `permissionId: string` 権限 ID · `tx?: DmlWithTxOperations` 呼び出し元が管理する RelDB トランザクション。省略時は通常の操作を使う | `void` | `await iam.authz.deletePermission(permissionId)` |
| `iam.authz.getRolePermissions(roleId)` | ロールの権限を取得 | `roleId: string` ロール ID | `Permission[]` | `await iam.authz.getRolePermissions(roleId)` |
| `iam.authz.getSensitiveOperations(operation?)` | 有効な機密操作規則を取得 | `operation?: string` サーバーで登録した機微操作名 | `string[]` | `await iam.authz.getSensitiveOperations('orders.cancel')` |
| `iam.authz.setPermissionSensitiveOperations(permissionId, operations)` | 権限に付随する機密操作規則を設定 | `permissionId: string` 権限 ID · `operations: string[]` 関連付ける機微操作名の一覧 | `void` | `await iam.authz.setPermissionSensitiveOperations(permissionId, ['orders.cancel'])` |

<a id="authorization-arguments"></a>

##### オブジェクト引数と項目

| 型または項目 | 値と動作 |
| --- | --- |
| `Role / permissionIds` | 作成には一意の `code` と `name` が必須です。`description` と `isSystem` は任意です。`permissionIds` は集合全体で重複除去されます。更新時の省略は既存維持、`[]` は全解除です。`expectedPermissionIds` に確認済みの既存集合を渡すと、変更済みの場合に更新を拒否します。 |
| `Permission / PermissionQueryOptions` | 作成には `code` と `name` が必須です。`type` は `menu`、`api`、`button` のいずれかです。`resource`、`action`、`description`、`sensitiveOperations` は任意です。`page` と `pageSize` でページ分割、`search` と `type` で絞り込みます。機密操作 ID は 128 文字まで、権限ごとに最大 1000 件です。`[]` はその権限上のルールを消し、ファイル設定は維持します。 |
| `tx` | 省略時は IAM が書き込みを管理します。渡した場合はホストがコミットまたはロールバックします。複合更新のいずれかが失敗したら取り消します。ホスト側で確定した後にセッションのスナップショットを更新する場合は最新の権限を取得します。 |

#### 利用例：レビュー担当者に注文の読み取り権限を設定する

信頼できる管理フローで実行します。権限コードを作り、そのデータベース ID を使って権限を含むロールを作成し、認可済みアカウントに割り当てます。メンバー数はロール ID をキーとし、取得に失敗したら管理画面に表示します。

```ts
async function createOrderReviewer(userId: string) {
  const permission = await iam.authz.createPermission({ code: 'orders:read', name: 'Read orders', type: 'api' })
  if (!permission.success) return permission

  const role = await iam.authz.createRole({
    code: 'order-reviewer',
    name: 'Order reviewer',
    permissionIds: [permission.data.id],
  })
  if (!role.success) return role

  const assigned = await iam.authz.assignRole(userId, role.data.id)
  if (!assigned.success) return assigned

  const members = await iam.authz.getRoleUserCounts([role.data.id])
  if (!members.success) return members
  return core.ok({ roleId: role.data.id, memberCount: members.data.get(role.data.id) ?? 0 })
}
```

`checkPermission(userId, code)` は主体の権限を確認し、設定された特権ロールのルールを適用します。保護された HTTP リクエストでは Kit または Serv のガードで `iam.auth.verifyToken` が返すセッション権限を確認し、対象の帰属も確認します。API キーの範囲は検証結果に含まれる権限で守ります。

#### 利用例：権限レコードに再認証が必要な操作を登録する

管理者は権限レコードに安定した操作 ID を設定します。再認証が有効なとき、IAM はファイルのルールと全権限レコードのルールを統合します。登録した操作はすべての利用者について再認証が必要です。操作と対象リソースの認可は引き続きホストがリクエストごとに行います。ルール取得に失敗したら操作を停止します。

```ts
async function configureOrderCancellationProof(permissionId: string) {
  const changed = await iam.authz.setPermissionSensitiveOperations(permissionId, ['orders.cancel'])
  if (!changed.success) return changed

  const rules = await iam.authz.getSensitiveOperations('orders.cancel')
  if (!rules.success) return rules
  return core.ok({ required: rules.data.includes('orders.cancel') })
}
```

<a id="sessions"></a>

### セッションのローテーション、確認、失効 · `iam.session`

通常は `iam.auth` のログインでセッションを作ります。確認、ローテーション、失効には以下のメソッドを使い、各結果を確認します。アクセス用と更新用のトークンはいずれも不透明な認証情報として扱います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `iam.session.create(options)` | セッションとトークン対を作成 | `options: CreateSessionOptions` · 信頼できる主体のセッション情報と期限を指定 · [オブジェクト引数](#sessions-arguments) | `Session` | `await iam.session.create(trustedSessionInput)` |
| `iam.session.get(accessToken)` | アクセストークンでセッションを取得 | `accessToken: string` 現在のセッションのアクセストークン | `Session \| null` | `await iam.session.get(accessToken)` |
| `iam.session.verifyToken(accessToken)` | セッショントークンを検証 | `accessToken: string` 現在のセッションのアクセストークン | `Session` | `await iam.session.verifyToken(accessToken)` |
| `iam.session.update(accessToken, data, expectedVersion)` | セッション情報を更新 | `accessToken: string` 現在のセッションのアクセストークン · `data: Partial<Session>` 更新可能なセッション項目を渡す。下の低レベルの例を参照 · `expectedVersion: string` 直前に取得したセッションのバージョン。古い書き込みを拒否するために使う | `void` | `await iam.session.update(accessToken, sessionPatch, expectedVersion)` |
| `iam.session.delete(accessToken)` | トークンのセッションを削除 | `accessToken: string` 現在のセッションのアクセストークン | `void` | `await iam.session.delete(accessToken)` |
| `iam.session.deleteByUserId(userId)` | ユーザーの全セッションを失効 | `userId: string` 対象ユーザー ID | `number` | `await iam.session.deleteByUserId(userId)` |
| `iam.session.refresh(refreshToken)` | 更新資格情報をローテーション | `refreshToken: string` 更新または取り消すリフレッシュトークン | `TokenPair` | `await iam.session.refresh(refreshToken)` |
| `iam.session.revokeRefresh(refreshToken)` | 指定更新資格情報を失効 | `refreshToken: string` 更新または取り消すリフレッシュトークン | `void` | `await iam.session.revokeRefresh(refreshToken)` |
| `iam.session.patchUserSessions(userId, updates)` | セッションのユーザー情報を更新 | `userId: string` 対象ユーザー ID · `updates: SessionFieldUpdates` · [オブジェクト引数](#sessions-arguments) | `void` | `await iam.session.patchUserSessions(userId, sessionFieldUpdates)` |

<a id="sessions-arguments"></a>

##### オブジェクト引数と項目

| 型または項目 | 値と動作 |
| --- | --- |
| `CreateSessionOptions` | `userId` はサーバー側の認証結果から取得します。`username`、`displayName`、`avatarUrl` と、信頼できる `roles`、`permissions`、`source`、`terminalType`、`data` は任意です。`maxAge` はアクセス期限の秒数を上書きします。`expectedCredentialVersion`、`apiKeyId`、`apiKeyScopes` はサーバーが確認した情報から設定します。 |
| `TokenPair / Session` | `TokenPair` にはアクセス用と更新用のトークン、秒数の `expiresIn`、`tokenType: 'Bearer'` が含まれます。`Session.version` は成功した直近の読み取り結果から取得します。`get` と下位の `verifyToken` はアカウントと認証情報を確認しますが、権限は保存時のスナップショットの場合があります。HTTP の認可には `iam.auth.verifyToken` の現在の権限を使います。 |
| `update / SessionFieldUpdates` | 更新できるのはプロフィール、権限、`source`、`expiresAt`、`lastActiveAt`、浅く結合する `data` です。バージョンが変わっていたら競合です。再試行を判断する前に読み直します。一括更新は `roles` と `permissions` が対象で、活動時刻と期限は維持します。 |

#### 利用例：トークンをローテーションして一組ごと保存する

信頼できる保存先から更新トークンを取得し、成功後にアクセス用と更新用を一組で差し替えます。古い更新トークンから作れる後継は一つだけです。失敗や応答の不明時には再ログインします。アクセス用の期限が過ぎても、更新用、アカウント、資格情報の世代、無操作期限、絶対期限が有効なら更新できます。更新自体は活動に数えません。ブラウザーは HttpOnly Cookie、ネイティブアプリは安全な TokenStorage を使います。[アクセス、更新、アイドル、絶対の各期限](../configuration/iam.ja.md#session-deadlines)

![更新に成功すると後継のトークンが一組だけ発行され、失敗時は再ログインする](../images/function-iam-refresh.ja.svg)

```ts
async function rotateSession(refreshToken: string) {
  const refreshed = await iam.session.refresh(refreshToken)
  if (!refreshed.success) return refreshed
  return core.ok(refreshed.data)
}
```

#### 利用例：最新バージョンでセッションの表示設定を保存する

サーバーで主体と書き込み範囲を先に確認します。この例はセッションを読み、表示設定を追加します。`null` なら再ログインを始め、競合時には最新バージョンを読み直します。

```ts
async function rememberListLayout(accessToken: string) {
  const current = await iam.session.get(accessToken)
  if (!current.success) return current
  if (current.data === null) return current

  const saved = await iam.session.update(accessToken, { data: { listLayout: 'compact' } }, current.data.version)
  if (!saved.success) return saved
  return core.ok({ saved: true })
}
```

#### 利用例：現在のセッションまたはアカウントの全セッションを失効させる

ログアウト時は利用者が保持するアクセストークンを使います。アクセストークンが期限切れでも、関連する更新トークンも失効します。対象への操作権限がある管理者は全セッションを失効させ、実件数を確認できます。ページ離脱時の送信は確約できないため、サーバーの期限設定も維持します。

```ts
async function revokeAccountSessions(userId: string) {
  const removed = await iam.session.deleteByUserId(userId)
  if (!removed.success) return removed
  return core.ok({ count: removed.data })
}
```

<a id="api-keys"></a>

### プログラム用認証情報の発行と失効 · `iam.apiKey`

`login.apikey` を有効にするとプログラム向けに発行できます。有効な権限はアカウントの現在の権限とキーの範囲の共通部分です。`verifyApiKey` はセッションを発行せずに使えます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `iam.apiKey.createApiKey(userId, options)` | 平文を一度だけ返す API キーを発行 | `userId: string` 対象ユーザー ID · `options: CreateApiKeyOptions` · キー名、期限、権限の範囲を指定 · [オブジェクト引数](#api-keys-arguments) | `CreateApiKeyResult` | `await iam.apiKey.createApiKey(userId, { name: 'reporting', scopes: ['orders:read'] })` |
| `iam.apiKey.listApiKeys(userId, options?)` | ユーザーの API キーをページ取得 | `userId: string` 対象ユーザー ID · `options?: ListApiKeysOptions` · ユーザーのキーを絞り込み、並べ替えてページ分割 · [オブジェクト引数](#api-keys-arguments) | `PaginatedResult<ApiKey>` | `await iam.apiKey.listApiKeys(userId, { page: 1, pageSize: 20 })` |
| `iam.apiKey.getApiKey(keyId)` | ID で安全な API キー情報を取得 | `keyId: string` API キーのメタデータ ID | `ApiKey \| null` | `await iam.apiKey.getApiKey(keyId)` |
| `iam.apiKey.revokeApiKey(keyId)` | API キーを失効 | `keyId: string` API キーのメタデータ ID | `void` | `await iam.apiKey.revokeApiKey(keyId)` |
| `iam.apiKey.verifyApiKey(rawKey)` | API キーと所有者を検証し、現在の権限を取得 | `rawKey: string` 発行時に一度だけ返る元の API キー | `VerifiedApiKey` | `await iam.apiKey.verifyApiKey(rawKey)` |

<a id="api-keys-arguments"></a>

##### オブジェクト引数と項目

| 型または項目 | 値と動作 |
| --- | --- |
| `CreateApiKeyOptions` | `name` は必須です。`expirationDays` は省略時に `apikey.defaultExpirationDays` に従い、`0` は期限なしです。`scopes` の既定値 `[]` は操作権限なしです。権限コード、名前空間 `:*`、全範囲の `*` を使えます。 |
| `ListApiKeysOptions` | `page` と `pageSize` でページ分割します。`search` は名前か接頭辞の部分一致、`enabled` は有効状態で絞ります。`sortBy` は `name`、`createdAt`、`lastUsedAt`、`expiresAt`、`sortDirection` は `asc` または `desc` です。既定は作成日時の降順です。 |
| `CreateApiKeyResult / VerifiedApiKey` | 発行時には `apiKey` と一度だけ表示される `rawKey` が返ります。`id` で取得するメタデータには `keyPrefix`、範囲、時刻などが含まれます。`verifyApiKey` は現在の `permissions` を返します。並行発行でもアカウントごとの上限があり、所有者が存在しなければ `USER_NOT_FOUND` を返します。 |

#### 利用例：レポートサービスに読み取り専用の認証情報を発行する

管理者は対象に発行でき、`orders:read` を委譲できるか先に確認します。生のキーは安全な経路で渡します。レポートサービスはリクエストのキーを確認し、有効な権限と検証済み `userId` で返すレコードを絞ります。明示した `*` はロールを維持し、それ以外の範囲ではキーによるセッションからロールを外します。失効後はキー自体の検証と派生セッションの検証・更新が拒否されます。

```ts
import { core, HaiCommonError } from '@h-ai/core'
import { iam } from '@h-ai/iam'

async function issueReportingKey(userId: string) {
  const issued = await iam.apiKey.createApiKey(userId, {
    name: 'Daily reports',
    scopes: ['orders:read'],
    expirationDays: 30,
  })
  if (!issued.success) return issued
  return core.ok({ keyId: issued.data.apiKey.id, rawKey: issued.data.rawKey })
}

async function verifyReportReader(rawKey: string) {
  const key = await iam.apiKey.verifyApiKey(rawKey)
  if (!key.success) return key
  if (!core.auth.matchPermission('orders:read', key.data.permissions)) {
    return core.err(HaiCommonError.FORBIDDEN, core.i18n.coreM('core_errorForbidden'))
  }
  return core.ok({ userId: key.data.userId })
}

async function revokeReportingKey(keyId: string) {
  const revoked = await iam.apiKey.revokeApiKey(keyId)
  if (!revoked.success) return revoked
  return core.ok(undefined)
}
```

<a id="tickets"></a>

### ワンタイムチケットの発行と消費 · `iam.ticket`

接続時に通常のアクセストークンを送れない場合は、認証済みリクエストから短期チケットを発行します。認可した操作だけに発行し、接続先で用途と業務権限を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `iam.ticket.issue(options)` | 用途と期限を持つチケットを発行 | `options: IssueTicketOptions` · 主体、用途、期限をひも付ける · [オブジェクト引数](#tickets-arguments) | `IssuedTicket` | `await iam.ticket.issue(ticketInput)` |
| `iam.ticket.consume(ticket, options?)` | 用途を照合しチケットを一度だけ消費 | `ticket: string` サーバーが発行した一回限りのチケット · `options?: ConsumeTicketOptions` · 必要に応じて用途を照合してから使用 · [オブジェクト引数](#tickets-arguments) | `ConsumedTicket` | `await iam.ticket.consume(operationTicket, ticketBinding)` |

<a id="tickets-arguments"></a>

##### オブジェクト引数と項目

| 型または項目 | 値と動作 |
| --- | --- |
| `IssueTicketOptions` | `subjectId` は認証済み主体、`purpose` は安定した用途、`grant` はアプリケーションが取り決める JSON 値のオブジェクトで既定は `{}` です。`ttlMs` は既定 30,000 ミリ秒です。発行結果は `ticket` と Unix ミリ秒の `expiresAt` です。 |
| `ConsumeTicketOptions / ConsumedTicket` | `purpose` を指定して用途を確認します。不一致なら保持し、一致時に原子的に消費します。並行リクエストでも成功は一つだけです。返された `subjectId`、`purpose`、`grant` を対象リソースと照合します。 |

#### 利用例：一回限りの音声文字起こし接続を認可する

ログインと文字起こし権限を確認してから、検証済み `userId` を `ai-audio` に結び付けます。接続先で用途を確認して権限を取得します。失敗、期限切れ、使用済みの場合は接続を開始しません。

```ts
async function issueAudioTicket(userId: string) {
  const issued = await iam.ticket.issue({
    subjectId: userId,
    purpose: 'ai-audio',
    grant: { operation: 'transcribe' },
  })
  if (!issued.success) return issued
  return core.ok({ ticket: issued.data.ticket, expiresAt: issued.data.expiresAt })
}

async function consumeAudioTicket(ticket: string) {
  const consumed = await iam.ticket.consume(ticket, { purpose: 'ai-audio' })
  if (!consumed.success) return consumed
  if (consumed.data.grant.operation !== 'transcribe') {
    return core.err(HaiCommonError.FORBIDDEN, core.i18n.coreM('core_errorForbidden'))
  }
  return core.ok(consumed.data.subjectId)
}
```

<a id="http-contract-extensions"></a>

### HTTP で IAM を組み込む

Serv は `serv.createIamProcedures({ iam })` で標準認証と管理操作を組み込みます。アカウントのキー管理やロール権限の一括置換が必要なら `serv.createIamManagementProcedures` も追加し、リソースの認可を渡します。Kit ではサーバーの認証ハンドラーとガードを使います。クライアントは公開設定から利用可能な機能を判断し、`HaiResult` を扱います。

[エンドポイントと項目](api-contract.ja.md#http-contract-extensions) · [Serv](serv.ja.md#iam-procedures-api) · [Kit](kit.ja.md#auth)

### 失敗時の処理

業務エラーは `HaiIamError` のコードで判定します。画面には公開可能な情報を返し、内部ログにはコードと利用可能なトレース ID を記録します。トークン、パスワード、確認コード、短期チケットはログに含めません。期限切れ後は再ログインします。CAS 競合時は読み直して再送を判断し、保存や配信が不明なら各フローに沿って状態を確認します。
