# @h-ai/serv API リファレンス

[中文](serv.md) · [English](serv.en.md) · [モジュール README](../../../packages/serv/README.ja.md) · [設定](../configuration/serv.ja.md) · [データ構造](../data/serv.ja.md)

Serv は共有 HTTP 契約とハンドラーを Node アプリにまとめます。ホストはセッションガード、CORS、トランスポート暗号化、IAM・Storage・AI・Feedback・Audit・Payment の組み込みルートを登録できます。

<a id="module-dependencies"></a>

## 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| Node.js | Serv を実行し、HTTP 待ち受けと WebSocket アップグレードを処理 | ルートエントリと Fetch アダプターの両方にパッケージ指定の Node バージョンが必要 | アプリを作成してから待ち受けを開始するか、Node 互換ホストに渡す |
| `@h-ai/api-contract` / `zod` | 共有ルートと入出力スキーマを定義 | Serv と一緒に導入。アプリが直接インポートする場合はアプリでも依存を宣言 | HTTP パスとデータ構造を定義してからハンドラーを登録 |
| `@h-ai/core` | リクエストコンテキスト、ログ、設定、`HaiResult` | Serv と一緒に導入。直接インポートするアプリでも依存を宣言 | ホストが設定を読み込む場合やログ設定を行う場合は先に Core を初期化 |
| `@h-ai/audit` | リクエストや業務の監査イベントを記録し、監査ルートを提供 | Serv と一緒に導入。監査の記録やルートを有効にする場合に初期化 | RelDB など必要なサービスを先に初期化してから Audit を初期化 |
| `@h-ai/crypto` / `@h-ai/cache` | 暗号化 HTTP の鍵リング、クライアント鍵の登録、リプレイ記録を提供 | Crypto は依存に含まれる。暗号化を有効にする場合は Cache を追加し、本番では共有 Redis を使用 | Crypto と Cache を初期化し、鍵リングとキーストアを注入 |
| `@h-ai/iam` / `@h-ai/storage` / `@h-ai/ai` / `@h-ai/feedback` / `@h-ai/payment` | 選択した業務サービスとルートを提供。IAM はセッションを検証し、AI は音声を提供 | 必要な機能に応じて導入する任意の peer 依存 | 各モジュールと依存サービスを初期化してからファクトリーへ渡す。停止時は待ち受けを閉じ、依存を初期化と逆順で解放 |

型付きクライアントでストリームを利用する場合は `@h-ai/api-client` を追加します。

## クイックスタート

状態確認エンドポイントが HTTP 200 と `data.status: "ready"` を返すことを確かめ、注文プレビュー、認可、レート制限、通信暗号化、音声を順に追加します。 [注文運用コンソールのチュートリアル](../getting-started/serv.ja.md#quick-start)

<a id="api-reference"></a>

## API リファレンス

インターフェース一覧で、オプション、既定値、戻り値、失敗時の挙動を確認できます。利用例では注文運用コンソールの処理を使います。

<a id="host-capabilities"></a>

### Serv と Kit が共用する HTTP 機能

| 機能 | 両ホストの接続方法 |
| --- | --- |
| 取引先向け A2A | 両ホストに `ai.a2a.createHttpHandler()` の処理器を渡します。既定では無効です。 |
| アクセス・頻度制限・CORS | `http.access`、`http.trustedProxies`、`http.rateLimit`、`cors` を共用します。 |
| 認証と通信暗号化 | `auth.iam` または `auth.verifyToken` でセッションを検証し、`transport` で鍵交換と暗号化を行います。 |
| 契約 API と OpenAPI | Serv は契約を内部で処理します。Kit は `contract` に `serv.createContractHandler()` を渡し、既存の SvelteKit ルートも使用します。 |
| 単発とリアルタイム音声 | 単発操作は共通契約で提供します。リアルタイム WebSocket はゲートウェイから `serv.listen()` に転送します。 |

[Kit の契約と A2A の例](kit.ja.md#kit-contract)

<a id="http-app"></a>

### `serv.createApp` · HTTP アプリを組み立ててリクエストを処理する

HTTP 契約と業務ハンドラーを組み合わせて Fetch アプリを作ります。デプロイ先の要件に応じて認証、アクセス制御、通信暗号化、ファイル、リアルタイム音声を追加します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createApp(options)` | HTTP アプリを構成 | `options.contract` と `procedures` が必須。[ファクトリー設定](#host-options)を参照。 | `ServHttpApp`。設定不正や構成に必要な依存がない場合は同期的に例外。 | `serv.createApp({ contract, procedures })` |
| `app.request(input, init?)` | プロセス内のテストリクエストを処理 | 相対パスを含む `RequestInfo` または `URL` と任意の `RequestInit`。 | `Response` またはその Promise。HTTP ステータスと本文で失敗を確認。 | `await app.request("/health")` |
| `app.fetch(request, metadata?)` | ホストが受信したリクエストと接続情報をアプリに渡す | 標準の `Request`。ホストは接続から任意の `metadata.remoteAddress` を取得し、IP によるアクセス制御とレート制限に使う。 | `Response` またはその Promise。 | `await app.fetch(request, { remoteAddress })` |

<a id="host-options"></a>

##### アプリファクトリーの設定

| フィールド | 型・既定値・利用条件 | 動作 | 接続手順 |
| --- | --- | --- | --- |
| `contract` / `procedures` | 契約ツリーと対応するルーターが必須 | 業務パスと入出力を定義し、選択したノードの実装を登録。 | [状態確認とプレビュー](../getting-started/serv.ja.md#orders-console-validation) |
| `http` | 任意。既定は `/api/v1`、プローブは `/health` と `/ready`、OpenAPI とドキュメントは無効 | パス、信頼するプロキシ、アクセスルールを設定。[設定](../configuration/serv.ja.md)を参照。 | [デプロイ・プローブ・上限](../getting-started/serv.ja.md#orders-console-access) |
| `middlewares` | 任意の `{ middleware, path? }[]`、既定は空。`path` を省略すると全リクエストに適用 | 通常のミドルウェアは復号とアクセス検査の後、ルーティング前に実行。早期レスポンスも暗号化を通過。組み込み CORS は外側でヘッダーを付加。 | [ゲートウェイと別オリジン](../getting-started/serv.ja.md#orders-console-access) |
| `auth.iam` / `auth.verifyToken` / `createContext` | 省略可。検証関数は `HaiResult` を返します。 | `createContext`、独自検証、IAM の順に優先。IAM は Cookie 更新にも利用します。 | [IAM を接続](../getting-started/serv.ja.md#orders-console-auth) |
| `cors` | 省略可。既定で無効 | ブラウザーのオリジンと資格情報を設定。 | [CORS 設定](../configuration/serv.ja.md#cors) |
| `a2a` | 省略可。既定で無効 | 発見と JSON-RPC をマウント。 | [注文アシスタント](#shared-a2a-http) |
| `refreshCookie` | 任意の `RefreshCookieConfig`、既定は無効 | HttpOnly Cookie による更新と、任意の信頼済みネイティブ経路を処理。[更新設定](#refresh-cookie)を参照。 | [アカウントの更新](../getting-started/serv.ja.md#orders-console-iam) |
| `transport` | 任意の `ServTransportConfig`、既定は無効 | Crypto、管理対象の鍵リング、共有キーストアを渡す。[暗号化の構成](#transport-example)を参照。 | [通信暗号化](../getting-started/serv.ja.md#orders-console-transport) |
| `transportRoutes` | 任意の `ServTransportRoute[]`、既定ではファイルや SSE の登録なし | 認証付きエンドポイント単位で multipart・ファイル・SSE を有効化。[トランスポートルート](#http-contract-extensions)を参照。 | [レポートの添付](../getting-started/serv.ja.md#orders-console-files) |
| `audio` | 任意の `ServAudioConfig`、既定では音声エンドポイントなし | WebSocket のリアルタイム音声と使い捨てチケットの検証を設定。[音声設定](#audio-options)を参照。 | [リアルタイム音声に接続](#audio-ticket-example) |

`http.rateLimit` にアトミックなストアを渡すと、アクセス規則を通過したリクエストを信頼済み IP ごとに数えます。[レート制限の利用例](#rate-limit-example)を参照してください。

<a id="serv-contract-handler"></a>

### `serv.createContractHandler()` · Kit に注文 API をマウントする

ホストに渡す契約ハンドラーを作成します。SvelteKit のフックで接続しても、既存のページとファイルルートを引き続き処理します。契約、ガード、検証、SSE とファイル上限は独立した Serv と共用します。

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createContractHandler(options)` | マウント可能な契約ハンドラーを作成 | `contract` と `procedures` が必須。任意の `http.apiPrefix` は既定 `/api/v1`。`http.openapi`、`http.docs`、`transportRoutes` は省略可。 | `HttpContractHandler`。対象外はホストの処理へ戻ります。 | `serv.createContractHandler({ contract, procedures })` |

注文コンソールの例では状態 API と OpenAPI を提供し、既存ページも引き続き表示します。 [同じ API を Kit に提供する](kit.ja.md#kit-contract)

<a id="shared-a2a-http"></a>

#### 利用例：取引先から独立サービスの注文アシスタントを呼び出す

同じ注文アシスタントを独立した Serv でも公開できます。AI と IAM を初期化し、Kit の例と同じ Agent Card と実行処理を使用します。既存のアプリに `a2a` を渡してから、同じコマンドで発見と呼び出しを確認します。 [Kit の契約と A2A の例](kit.ja.md#kit-a2a)

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { type ServContext, serv } from '@h-ai/serv'

const contract = apiContract.create({})
const procedures = serv.implement(contract).context<ServContext>().build()
export const app = serv.createApp({
  contract,
  procedures,
  a2a: ai.a2a.createHttpHandler({
    authenticate: { verifyApiKey: key => iam.apiKey.verifyApiKey(key) },
  }),
})
```

<a id="refresh-cookie"></a>

##### 更新 Cookie の設定

| フィールド | 型・既定値・利用条件 | 動作 |
| --- | --- | --- |
| `cookieName` / `maxAge` | `string` と `number`。既定は `hai_refresh_token`、2592000 秒 | ブラウザー Cookie の名前と保存期間を設定。認証情報の有効期間は IAM が引き続き確認。 |
| `secure` | 任意の boolean。`HAI_SERV_REFRESH_COOKIE_SECURE` より優先。本番での既定値は true | 直接指定時の本番既定は `NODE_ENV` または `HAI_CORE_ENV` に従う。 |
| `onRefresh` | 既定は `iam.session.refresh`。Cookie 更新を有効にするにはいずれかが必要 | 古い refresh token を受け取り `Promise<HaiResult<RefreshTokenPair>>` を返す。成功時にローテーション。 |
| `nativeTokenTransport.isRequest` | 任意の `(request: Request) => boolean`。省略時はブラウザーモードのみ | 明示的なオリジンとクライアント種別で信頼済みネイティブリクエストを識別。一致した更新では 16 KiB までの JSON 本文からトークンを取得。 |

<a id="audio-options"></a>

##### 音声接続の設定

| フィールド | 型・既定値・利用条件 | 動作 |
| --- | --- | --- |
| `ai` / `verifyTicket` | 初期化済み AI 音声機能とチケット検証関数が必須。 | 用途と有効期限を確認してチケットをアトミックに消費し、信頼済み `session` と任意の `grant` を `HaiResult<AudioTicketVerification>` で返す。 |
| `authorize(session, request, grant?)` | 任意の非同期コールバック。 | 操作・モデル・プラン・同時実行を確認し、承認済み引数を返す。省略時はチケットの操作を照合し、束縛済みまたはプロバイダー既定モデルを使い、クライアント指定のモデル・音色・指示は無視。 |
| `onSessionEnd(session, request)` | 任意の同期または非同期コールバック。 | 成功した認可について最大一回実行してリソースを解放。切断後に認可が成功する場合も対象。 |
| `path` | 既定は `${http.apiPrefix}/ai/audio`。変更時は完全なリクエストパスを指定します。 | ゲートウェイとクライアントの WebSocket URL を合わせます。 |
| `maxMessageBytes` | 既定は 1 MiB。1～2147483647 バイトの整数。 | WebSocket 受信側で一つの完全なメッセージを制限。不正な設定はアプリ作成時に例外。 |
| `maxBufferedBytes` / `maxTextBytes` | 接続ごとに音声 10 MiB、テキスト 1 MiB が既定。 | いずれかの累計上限を超えるとセッションを終了。 |
| `maxSessionMs` / `preAuthTimeoutMs` | 既定は 300000 / 5000 ミリ秒。 | セッション全体の期限と、認証して `start` を処理する期限は別々に計る。 |
| `maxPendingMessages` / `maxSendBufferBytes` | 既定は 256 件 / 8 MiB。 | 処理待ちタスク数と合成音声フレームの送信バッファーを制限。 |

<a id="request-access-example"></a>

#### 利用例：取引先ネットワークに外部レポートを公開する

同じアプリでプロキシ、転送先の IP、パスと拒否の結果を確認します。 [手順 5](../getting-started/serv.ja.md#orders-console-access)

<a id="rate-limit-example"></a>

#### 利用例：送信元ごとに制限して再開時間を確認する

手順 5 で、2 回の成功、3 回目の HTTP 429、ウィンドウの終了後の回復を確認します。複数ノードで同じ Redis、名前空間、ウィンドウと上限を使います。信頼できる接続元がなければ `unknown`、カウンター障害は 503 です。ヘルスプローブと CORS プリフライトは枠を消費しません。 [手順 5](../getting-started/serv.ja.md#orders-console-access)

<a id="refresh-browser-session-example"></a>

#### 利用例：トークンの有効期限後もアカウント画面を利用する

アカウント画面はステップ 4 の IAM と `refreshCookie` を使用します。アクセストークンの期限が切れた後に `apiClient.iam.auth.currentUser()` を呼ぶと、クライアントは HttpOnly Cookie で更新し、新しいトークンを保存してアカウントの取得を再試行します。`success` を確認し、成功時はプロフィールを表示し、更新できなければログイン画面に戻ります。 [手順 4](../getting-started/serv.ja.md#orders-console-iam)

<a id="transport-example"></a>

#### 利用例：鍵を交換して起動確認リクエストを暗号化する

手順 6 では同じ契約を使って、ブラウザーで鍵交換と状態レスポンスの復号を確認します。平文と認証に失敗したリクエストには、設定したパス規則が適用されます。 [手順 6](../getting-started/serv.ja.md#orders-console-transport)

<a id="audio-ticket-example"></a>

#### 利用例：ブラウザーから使い捨てチケットでリアルタイム音声に接続する

ブラウザーがマイク音声を継続的に送信する場合や、対応モデルの生成した音声を順次受信する場合は、Serv の WebSocket と使い捨てチケットを利用できます。リアルタイム機能の対応はモデルによって異なります。まず[レポート音声のチュートリアル](../getting-started/serv.ja.md#orders-console-audio)で AI、IAM、レポートの権限を設定します。以下では設定済みの `report-tts` を使い、チケット発行、接続、合成、再生を確認します。通常の読み上げと録音ファイルの書き起こしにはチュートリアルの HTTP エンドポイントを使います。

##### チケットと WebSocket のやり取り

ブラウザーは HTTPS の JSON リクエストでチケットを取得し、WSS で音声フレームを受信します。

| 手順 | 参加者 | 処理内容 |
| --- | --- | --- |
| 取得 | レポート画面 → Serv | アクセストークン付きで `POST /api/v1/ai/audio/tickets` を呼び出します。 |
| 発行 | Serv → IAM → レポート画面 | セッションのロールと権限を確認し、30 秒有効で要求された操作にだけ使えるチケットを返します。 |
| 接続 | レポート画面 → Serv → IAM | `GET /api/v1/ai/audio?ticket=…` をアップグレードし、チケットをアトミックに消費して現在の権限を確認します。 |
| 合成 | レポート画面 → Serv → 音声合成モデル | ブラウザーが要約を送信します。Serv は指定のモデルと音色を使って音声チャンクと完了イベントを返します。 |
| 再生 | レポート画面 → ブラウザーのプレーヤー | `end` を受信したら、完成した MP3 をプレーヤーに渡します。 |

共通の契約を `voice-contract.mts` に保存します。この段階で追加する JSON 操作は一つです。クライアントも同じノードからチケットを取得します。

```ts
import { apiContract } from '@h-ai/api-contract'

export const voiceContract = {
  ai: { audio: { issueTicket: apiContract.extensions.ai.audio.issueTicket } },
}
```

以下を `voice-server.mts` に保存します。IAM は発行時に `reports:read` を確認し、接続時にはチケットをアトミックに消費して現在のアカウントと権限を再確認します。チケットは取得時に指定した操作にだけ使えます。音声合成ではチュートリアルで既定の合成モデルに設定した `report-tts` を使います。

```ts
import { ai } from '@h-ai/ai'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const voice = serv.createIamAudio({
  ai,
  iam,
  config: { path: '/api/v1/ai/audio' },
  permission: 'reports:read',
})

// HTTP の合成・書き起こしを維持したまま、既存の ai.audio に追加します。
export const voiceProcedures = { ai: { audio: { issueTicket: voice.issueTicket } } }
export const voiceAudio = voice.config
```

`serv.createApp({ audio: voiceAudio, … })` に `voiceAudio` を渡します。`voiceContract.ai.audio` と `voiceProcedures.ai.audio` を既存の `contract.ai.audio` と `procedures.ai.audio` にそれぞれ追加し、`transportRoutes` を維持します。`serv.listen(app, …)` で起動し、公開 HTTPS ゲートウェイで `Upgrade` を転送します。ブラウザーは `wss:` で接続します。チケット取得は手順 6 の HTTP 暗号化を使います。アップグレードは HTTPS と使い捨てチケットで認証します。`audio.path` を変更したらブラウザーにも同じサイト絶対パスを設定します。

##### ブラウザーで接続して再生する

`report-reader.mts` をブラウザーのソースに保存します。ログイン中のアクセストークンと共通 HTTP 契約で短期チケットを取得し、音声クライアントに渡します。アクセストークンは HTTP の Authorization ヘッダーで送ります。呼び出すたびに新しいチケットを受け取り、チケットやそれを含む WebSocket URL がアプリのログへ入らないようにします。

```ts
import { ai } from '@h-ai/ai/client'
import { type ApiClientConfig, apiClient } from '@h-ai/api-client'
import { voiceContract } from './voice-contract.mts'

export async function makeReportAudio(
  summary: string,
  http: Pick<ApiClientConfig, 'baseUrl' | 'headers' | 'transport'>,
  signal?: AbortSignal,
): Promise<Blob> {
  const client = apiClient.create(voiceContract)
  // baseUrl 含 API 前缀，headers 提供当前会话的 Bearer access token。
  const started = await client.init(http)
  if (!started.success)
    throw new Error(started.error.message)

  try {
    const socketUrl = new URL(http.baseUrl, window.location.origin)
    socketUrl.pathname = socketUrl.pathname.replace(/\/$/, '') + '/ai/audio'
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'

    const reader = ai.createAudioClient({
      url: socketUrl.href,
      async getTicket(request) {
        // 每次合成先走一次已登录的 HTTP 请求，返回票据才开始建连。
        const issued = await client.ai.audio.issueTicket(request, { signal })
        if (!issued.success)
          throw new Error(issued.error.message)
        return issued.data.ticket
      },
    })

    // SDK が start、text、done を送り、すべての音声を受信したら接続を閉じます。
    const result = await reader.synthesize({ text: summary, signal })
    if (result.format !== 'mp3')
      throw new Error('Unexpected report audio format')
    return new Blob([new Uint8Array(result.data)], { type: 'audio/mpeg' })
  }
  finally {
    await client.close()
  }
}
```

同じブラウザー用ディレクトリに `report-playback.mts` を置きます。ボタンクリックで音声を生成し、結果をブラウザーのプレーヤーへ渡します。画面を離れる際に呼び出す解放関数も返します。

```ts
import { type ApiClientConfig } from '@h-ai/api-client'
import { makeReportAudio } from './report-reader.mts'

export function bindReportReader(
  button: HTMLButtonElement,
  player: HTMLAudioElement,
  summary: string,
  http: Pick<ApiClientConfig, 'baseUrl' | 'headers' | 'transport'>,
  onError: (cause: unknown) => void,
) {
  const lifetime = new AbortController()
  let url: string | undefined
  async function generate() {
    button.disabled = true
    try {
      // 生成完毕后为 <audio controls> 设置来源，由用户按播放键。
      const blob = await makeReportAudio(summary, http, lifetime.signal)
      if (lifetime.signal.aborted)
        return
      if (url)
        URL.revokeObjectURL(url)
      url = URL.createObjectURL(blob)
      player.src = url
    }
    catch (error) {
      if (!lifetime.signal.aborted)
        onError(error)
    }
    finally {
      if (!lifetime.signal.aborted)
        button.disabled = false
    }
  }

  button.addEventListener('click', generate)
  return () => {
    // 页面卸载时终止请求与播放，并回收当前 Blob URL。
    lifetime.abort()
    button.removeEventListener('click', generate)
    player.pause()
    player.removeAttribute('src')
    player.load()
    if (url)
      URL.revokeObjectURL(url)
  }
}
```

生成用の `<button type="button">` と `<audio controls>` を画面に置きます。要素、認可済みレポートの要約 `report.summary`、現在のアクセストークンと既存のエラー処理を渡します。以下は同一オリジンのゲートウェイを使う例です。API のホストを分ける場合は `/api/v1` までを含む HTTPS API アドレスを設定します。

```html
<button type="button" id="generate-report-audio">レポート音声を生成する</button>
<audio controls id="report-audio"></audio>
```

この例では手順 6 で初期化したブラウザーの Crypto を使います。通常の HTTPS で確認する場合は `transport` と関連インポートを省略します。

```ts
import { crypto } from '@h-ai/crypto'
import { bindReportReader } from './report-playback.mts'
import { keyExchangePath } from './status-client.mts'

const readReportButton = document.querySelector<HTMLButtonElement>('#generate-report-audio')
const reportAudioElement = document.querySelector<HTMLAudioElement>('#report-audio')
if (!readReportButton || !reportAudioElement)
  throw new Error('Report audio controls are missing')

const dispose = bindReportReader(
  readReportButton,
  reportAudioElement,
  report.summary,
  {
    baseUrl: '/api/v1',
    headers: { Authorization: 'Bearer ' + accessToken },
    transport: { crypto, keyExchangePath },
  },
  showReportAudioError,
)
```

画面を離れるときに `dispose()` を呼びます。生成ボタンを押し、プレーヤーの準備ができたら再生します。Network では `POST /api/v1/ai/audio/tickets` の成功、GET Upgrade（101）、WebSocket の音声フレームを順に確認できます。チケット取得が失敗すれば接続前に停止します。期限切れ、使用済み、認可の不一致では WebSocket の `error` を受けて切断し、途中の音声を成功として返しません。ログイン後にレポート権限を取り消し、発行済みのチケットで接続します。Serv は音声モデルを呼び出す前に拒否します。

<a id="listen-api"></a>

### `serv.listen` · Node で HTTP リクエストを受け付ける

アドレスとポートを指定して Node で待ち受けます。リスナーはソケットから接続元を読み、アクセス制御とレート制限に渡します。音声用の WebSocket がある場合はアップグレードも処理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `ServConfigSchema` | アプリが読み込む `_serv.yml` を検証 | 入力は `ServConfigInput`、`server`・`http`・`cors`・`transport` は任意 | `safeParse` は解析済みの `ServConfig` または Zod の検証エラーを返す。 | `ServConfigSchema.safeParse({ server: { port: 3001 } })` |
| `serv.listen(app, options?)` | Node の待ち受けを開始 | `app: ServHttpApp` が必須。[待ち受け設定](#listen-options)は任意。 | `server` と `address` を含む `ServNodeServer`。非同期のバインド失敗は Node の `error` イベントで通知。 | `const handle = serv.listen(app, { port: 0 })` |
| `handle.close()` | 待ち受けを停止し、ストリーム接続を終了 | 引数なし。同時呼び出しは同じ結果を共有。 | `Promise<void>`。待ち受けの失敗や音声の解放タイムアウトで拒否。 | `await handle.close()` |

<a id="listen-options"></a>

##### Node 待ち受け設定

| フィールド | 型・既定値・利用条件 | 動作 |
| --- | --- | --- |
| `host` | `string`、既定は `127.0.0.1` | 外部から接続する場合はインターフェースまたは `0.0.0.0` を明示。 |
| `port` | `number`、既定は `3000` | 直接呼び出しで `0` を指定可能。`handle.address` はバインド前は指定値、待ち受け開始後は実際のホストとポートを返す。 |
| `onListening` | 任意の `(info: AddressInfo) => void` | Node がバインドに成功した後に実行。 |
| `onClose` | 任意の `() => Promise<void>`。省略時はホストがシグナルを処理 | `SIGINT` または `SIGTERM` で新規受付を止め、SSE と WebSocket に 1 秒の終了猶予を与える。音声接続の終了後は認可・解放を最大 5 秒待ち、処理済みの通常 HTTP リクエストの完了を待ってコールバックを呼ぶ。直接閉じた場合は呼び出し元が業務リソースを解放。 |

#### 利用例：結合テストで空きポートを使って実際の HTTP リクエストを送る

[クイックスタート](../getting-started/serv.ja.md#quick-start)の `app` を待ち受け関数に渡します。複数のテストを並行実行するときは、`port: 0` で Node に空きポートを選ばせます。以下ではローカルの状態確認ルートを HTTP 経由でテストします。デプロイ時は [`config/_serv.yml`](../configuration/serv.ja.md) を解析した `server` を明示的に渡します。`HOST` と `PORT` の上書きはスキーマ解析時に反映されます。

```ts
import { once } from 'node:events'
import { ServConfigSchema, type ServHttpApp, serv } from '@h-ai/serv'

export async function checkListener(app: ServHttpApp, rawConfig: unknown) {
  // ホストが読み込んだ設定を検証します。解析に失敗した場合はフィールドエラーが返り、起動を中止します。
  const parsed = ServConfigSchema.safeParse(rawConfig)
  if (!parsed.success)
    throw parsed.error

  // 解析した待ち受け設定を使い、動作確認用にループバックの空きポートを割り当てます。
  const handle = serv.listen(app, { ...parsed.data.server, host: '127.0.0.1', port: 0 })
  try {
    // Node の待ち受け完了後に割り当てられたポートを読みます。バインド失敗時は待機が拒否されます。
    if (!handle.server.listening)
      await once(handle.server, 'listening')
    // 割り当てられたポートに状態確認を送ります。成功以外の HTTP ステータスは検査の失敗です。
    const status = await fetch('http://' + handle.address.host + ':' + handle.address.port + '/api/v1/status')
    if (!status.ok)
      throw new Error('Unexpected status: ' + status.status)
    return await status.json()
  }
  finally {
    // 待ち受けを停止し、完了まで待ちます。状態確認が失敗した場合も解放します。
    await handle.close()
  }
}
```

`await checkListener(app, {})` を呼び出すとクイックスタートと同じ成功レスポンスが得られます。実際の業務サービスを使う場合は、ハンドルを閉じてからそれらを解放します。

<a id="fetch-api"></a>

### `serv.toFetch` · 標準 Fetch を使う呼び出し元にアプリを渡す

API Client の `fetch` オプションなど、標準 Fetch 関数を受け取る場所に `serv.toFetch(app)` の戻り値を渡します。この関数は `input` と `init` を受け取り、同じプロセス内でアプリを呼び出します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.toFetch(app)` | クライアントの標準 Fetch 関数としてアプリを渡す | `app: ServHttpApp` が必須。戻り値の関数は `RequestInfo` または `URL` と任意の `RequestInit` を受け取る。 | `ServFetchHandler`。リクエスト生成の失敗、キャンセル、下流の例外で Promise が拒否される。 | `await serv.toFetch(app)("http://localhost/health")` |

<a id="in-process-client-example"></a>

#### 利用例：HTTP サーバーを起動せずに API Client をテストする

手順 1 の `check.mts` の末尾にこのコードを追加します。ファイルの先頭に `app.mts` から `contract` のインポートも加えて、同じコンソールをテストします。依存は `pnpm add @h-ai/api-client` で追加します。

```ts
import { apiClient } from '@h-ai/api-client'
import { serv } from '@h-ai/serv'

// ページと同様に、状態確認用の契約からリクエストを組み立てる API Client を作ります。
const client = apiClient.create(contract)
try {
  // /api/v1 を API プレフィックスとし、fetch の呼び出しをテストプロセス内の app に渡します。
  const ready = await client.init({
    baseUrl: 'http://service.test/api/v1',
    fetch: serv.toFetch(app),
  })
  if (!ready.success)
    throw new Error(ready.error.message)

  // 状態確認ルートを呼び出し、クライアントが ready を読み取ったことを確認します。通信はプロセス内で完結します。
  const status = await client.status()
  assert.equal(status.success, true)
  if (status.success)
    assert.equal(status.data.status, 'ready')
}
finally {
  // アサーションが失敗した場合も、このクライアントを解放します。
  await client.close()
}
```

`node check.mts` を実行すると、アサーションに成功してプロセスが終了します。`service.test` はリクエスト URL を組み立てるためのホスト名です。`serv.toFetch(app)` は `AbortSignal` に対応する標準の `fetch(input, init?)` 関数を返します。接続元アドレスは渡されません。

既存の HTTP ホストが `Request` を受信し、Serv がアクセス制御やレート制限にクライアント IP を使う場合は、ホストが取得した接続元を `app.fetch(request, { remoteAddress })` に渡します。渡し方は次の例で確認できます。`serv.listen(app)` を使う場合、Serv の Node リスナーがソケットから接続元を読み取ります。

<a id="authentication"></a>

### `serv.implement` · 契約にハンドラーとルートガードを登録する

公開の状態確認には通常のハンドラーを登録します。保護されたレポートを読む場合は、信頼できる検証処理でセッションを確立し、ロールと権限のガードを組み合わせます。ドット区切りのキーは HTTP パスを宣言した契約ノードを指します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.implement(contract)` | 共有契約の実装を開始 | 型付き契約ツリーが必須。 | `ServImplementer` | `const implementation = serv.implement(contract)` |
| `implementation.context<TContext>()` | procedure のコンテキスト型を指定 | `ServContext` またはその拡張型を指定。実行時引数なし。拡張フィールドはホストが提供。 | `ServRouterBuilder` | `implementation.context<ServContext>()` |
| `builder.route(path, handler?)` | 契約キーに実装を登録 | `path` はノードキーまたはドット区切りキー。通常の `handler` は `{ input, context }` を受け取り、対応する `HaiResult` を返す。 | ハンドラー付きならビルダー、省略時はガードを登録できるオブジェクト。不正または重複登録は例外。 | `builder.route("reports.read")` |
| `route.auth()` | 検証済みセッションを要求 | 引数なし。 | ガード付き登録を返す。セッションのないリクエストはステータス 401 の業務エラー。 | `builder.route("reports.read").auth()` |
| `route.permission(permission)` | 指定した権限を要求 | `reports:read` などの権限名が必須。認証も要求する。 | ガード付き登録を返す。認証済みでも権限がない場合は 403 の業務エラー。 | `route.permission("reports:read")` |
| `route.role(role)` | 指定したロールを要求 | ロール名と認証が必須。指定されたロールと権限のすべてを満たす必要がある。 | ガード付き登録を返す。認証済みでも指定ロールがない場合は 403 の業務エラー。 | `route.role("auditor")` |
| `route.handle(handler)` | 通常の JSON ハンドラーを登録 | ノードの入力と `HaiResult` 出力に合うハンドラーが必須。ガード通過後に呼び出す。 | 次のビルダーを返す。ガードと業務エラーの応答は[レスポンスの境界](#error-handling)を参照。 | `route.handle(({ context }) => core.ok(context.session.userId))` |
| `route.handleTransport(handler)` | multipart・File・SSE の操作を登録 | 先に認証・権限・ロールのガードを指定。契約に合うハンドラーを登録し、ホストでルートを有効にする。 | 次のビルダーを返す。トランスポート失敗は HTTP ステータスで返せる。 | `route.handleTransport(() => new File(["report"], "report.txt"))` |
| `builder.build()` | ルーターを同期的に完成 | 引数なし。選んだ契約ノードすべてにハンドラーが必要。 | 枝を選択できる通常のルーター。未実装ルートは型の `missingRoutes` で確認でき、型を回避して呼び出すと例外。 | `const procedures = builder.build()` |
| `serv.WILDCARD_PERMISSION` | 信頼済みセッションですべての権限要件を満たす | 定数 `"*"`。検証済みセッションにのみ付与。`domain:*` はそのドメインの権限に一致。 | `string` | `const permissions = [serv.WILDCARD_PERMISSION]` |
| `serv.WILDCARD_ROLE` | 信頼済みセッションですべてのロール要件を満たす | 定数 `"*"`。検証済みセッションにのみ付与。 | `string` | `const roles = [serv.WILDCARD_ROLE]` |
| `serv.guard.requireSensitive(iam, context, operation)` | 機密操作の証明を検証 | 初期化済み IAM、現在のコンテキスト、サーバー定義の操作名を指定。 | `Promise<HaiResult<void>>`。設定した操作の証明を検証して消費します。 | `await serv.guard.requireSensitive(iam, context, "orders.cancel")` |

<a id="http-contract-extensions"></a>

##### トランスポートの登録設定

| フィールド | 型・既定値・利用条件 | 動作 |
| --- | --- | --- |
| `procedure` | 必須。アプリ契約で選択したエンドポイントオブジェクトそのものを渡す。 | HTTP メソッド、固定パス、認証ガードが必要。明示登録していないトランスポート操作は拒否。 |
| `maxRequestBytes` | 非負の安全な整数が必須。本文のない GET は 0。 | デコード前のリクエストをバイト単位で制限。multipart の境界とメタデータ分を確保。超過時は 413。 |

[ルートビルダー](#authentication) で実装した File・multipart・SSE にトランスポートの許可を追加します。本番ではホストの HTTPS 入口から公開します。フレームワークのトランスポート暗号化を使う場合は、各エンドポイントの正確なメソッドとパスを `http.access` に設定し、`encryption: "disabled"` を明示します。

<a id="authorization-example"></a>

手順 3 で同じコンソールのプレビューとレポートにロール・権限を追加します。通常の JSON は既定で HTTP 200 を使い、拒否理由は `error.httpStatus` に入ります。 [ガードの手順](../getting-started/serv.ja.md#orders-console-auth)

<a id="serv-sensitive-guard"></a>

#### 利用例：注文の取り消し時に本人確認を行う

ルートで `orders:cancel` 権限を確認し、対象の注文をデータベースから取得します。取得した注文と取り消し関数を下の処理に渡します。`orders.cancel` の再認証を有効にした場合は証明を `X-Hai-Reauthentication` に設定します。証明がない場合や再利用した場合は失敗した `HaiResult` を返し、注文の状態は更新されません。 [Kit の監査ログアーカイブでの再認証例](kit.ja.md#kit-sensitive-guard)

```ts
import { core, HaiCommonError, type HaiResult } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { type AuthenticatedServContext, serv } from '@h-ai/serv'

export async function cancelOwnOrder(
  context: AuthenticatedServContext,
  order: { id: string, ownerId: string },
  cancel: (id: string) => Promise<HaiResult<{ cancelled: boolean }>>,
) {
  if (order.ownerId !== context.session.userId)
    return core.err(HaiCommonError.FORBIDDEN)

  const proof = await serv.guard.requireSensitive(iam, context, 'orders.cancel')
  if (!proof.success)
    return proof

  return cancel(order.id)
}
```

<a id="wildcard-guards-example"></a>

#### 利用例：当番の監査担当者に一時的なレポート閲覧を許可する

ID サービスは当番アカウントを検証し、チーム横断の監査権限を付与できます。`serv.WILDCARD_PERMISSION` は権限のチェック、`serv.WILDCARD_ROLE` はロールのチェックに適用されます。どちらも値は `"*"` で、セッションのどのフィールドに入っているかで意味が決まります。`reports:*` は `reports:` の権限だけに一致します。付与はサーバーが管理します。

手順 3 の契約と処理でレポートのガードだけをテストします。以下を `check-guard.mts` に保存します。待ち受けは不要で、既存のコンソールルートもそのままです。

```ts
import assert from 'node:assert/strict'
import { core, HaiCommonError } from '@h-ai/core'
import { type ServSession, serv } from '@h-ai/serv'
import { reportContract, reportProcedures } from './reports.mts'

// ID サービスの記録を再現します。当番には両方のワイルドカード、通常の監査担当者にはレポート用の権限を与えます。
const sessions = new Map<string, ServSession>([
  ['permission-only', { userId: '1', permissions: [serv.WILDCARD_PERMISSION], roles: [] }],
  ['on-call-auditor', { userId: '2', permissions: [serv.WILDCARD_PERMISSION], roles: [serv.WILDCARD_ROLE] }],
  ['report-auditor', { userId: '3', permissions: ['reports:*'], roles: ['auditor'] }],
])

// テスト ID に対応するサーバーセッションを返します。未知の ID は未認証として拒否します。
const app = serv.createApp({
  contract: reportContract,
  procedures: reportProcedures,
  async verifyToken(token) {
    const session = sessions.get(token)
    return session ? core.ok(session) : core.err(HaiCommonError.UNAUTHORIZED)
  },
})

// レポートを要求して HaiResult を読みます。ロールと権限の両方を満たすセッションだけにレポートが返ります。
for (const [token, expected] of [['permission-only', 403], ['on-call-auditor', 200], ['report-auditor', 200]] as const) {
  const response = await app.request('/api/v1/reports/current', { headers: { Authorization: 'Bearer ' + token } })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.success ? 200 : result.error.httpStatus, expected)
}
```

最初のセッションにはロールがないので、結果に 403 が入ります。当番とレポート権限を持つ監査担当者は通過します。本番では ID サービスが権限を付与し、ハンドラーもテナントとリソースのアクセスを確認します。

<a id="authenticated-file-example"></a>

手順 7 では既存の JSON ルートを残し、ログイン済み監査担当者のレポートを添付ファイルにします。 [ファイルの手順](../getting-started/serv.ja.md#orders-console-files)

<a id="auth-context-api"></a>

### `serv.buildAuthContextFactory` · トークン検証からセッションを作る

IAM 以外の認証サービスを使う場合は、トークン検証処理をリクエスト単位のコンテキストファクトリーに変換します。リクエスト ID、ロケール、IP アドレスのみが必要なら [serv.parseRequestContext](#parse-context-api) を使います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.buildAuthContextFactory(verifyToken)` | リクエスト単位の検証処理を構成 | `(token: string) => Promise<HaiResult<ServSession>>` が必須。Bearer がある場合に実行。 | `CreateServContext`。トークンなし、または検証結果が 4xx の場合は匿名。例外や依存先障害で Promise が拒否される。 | `serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))` |

#### 利用例：既存のアクセストークン検証処理を使う

社内のトークン検証処理を `serv.buildAuthContextFactory` に渡します。チュートリアルのステップ 3 の `reports.mts` と `orders-test-identity.mts` を再利用して、保護されたレポートをローカルで確認します。サンプルの検証処理はテスト用の識別子 `local-auditor` を受け付けます。 [ステップ 3 のファイル](../getting-started/serv.ja.md#orders-console-auth)

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'
import { verifyToken } from './orders-test-identity.mts'
import { reportContract, reportProcedures } from './reports.mts'

// 既存の検証処理を登録し、セッションありとなしで同じレポートを取得する。
const createContext = serv.buildAuthContextFactory(verifyToken)
const app = serv.createApp({ contract: reportContract, procedures: reportProcedures, createContext })
const allowed = await app.request('/api/v1/reports/current', {
  headers: { Authorization: 'Bearer local-auditor' },
})
assert.equal(allowed.status, 200)
const report = await allowed.json()
assert.equal(report.success, true)
assert.equal(report.data.owner, 'auditor-1')

// 匿名のリクエストはガードで拒否される。通常の JSON ルートでは業務エラーが 401 を示す。
const anonymous = await app.request('/api/v1/reports/current')
assert.equal(anonymous.status, 200)
const denied = await anonymous.json()
assert.equal(denied.success, false)
assert.equal(denied.error.httpStatus, 401)
```

ロールと権限のガードがセッションをどう使うかは、[レポートの例](#authorization-example)を参照してください。

<a id="parse-context-api"></a>

### `serv.parseRequestContext` · 認証前にリクエストのメタデータを読む

診断リクエストのリクエスト ID、接続元 IP、ロケールを認証前に読み取れます。`createApp` が解決した `ip` を引き継ぐか、ホストが接続を管理する場合は観測した接続元を `remoteAddress` として渡します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.parseRequestContext(input)` | リクエストメタデータを抽出 | `input.request: Request` が必須。信頼済み `remoteAddress` または解決済み `ip` は任意。 | リクエスト ID・言語・未検証の Bearer を含む `ServContext`。セッションは作成しない。 | `serv.parseRequestContext({ request })` |

#### 利用例：診断リクエストからリクエスト ID を読む

ホストが受け取った `Request` を渡します。例ではリクエスト ID ヘッダーを含むリクエストと、接続元 `192.0.2.10` を再現します。

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'

const request = new Request('https://api.example.com/api/v1/status', {
  headers: { 'x-request-id': 'req-diagnostic-42', 'x-hai-locale': 'ja-JP' },
})
// リクエスト ID、接続元、ロケールを取得する。この時点でセッションは設定されない。
const context = serv.parseRequestContext({ request, remoteAddress: '192.0.2.10' })
assert.equal(context.requestId, 'req-diagnostic-42')
assert.equal(context.ip, '192.0.2.10')
assert.equal(context.locale, 'ja-JP')
assert.equal(context.session, undefined)
```

検証に成功したら `context.requestId` を使って同じリクエストの診断記録を関連付けられます。

<a id="runtime-security-api"></a>

### `serv.createRuntimeSecurityPolicy` · Web とネイティブアプリのオリジンを検証する

本番起動時に、Web フロントエンドと信頼するネイティブアプリのオリジンを検証します。`policy.allowOrigin` は [serv.cors](#cors-api) に渡せます。`policy.isNativeOrigin` はホストでネイティブアプリを判定するときのオリジン確認に使います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createRuntimeSecurityPolicy(input)` | デプロイのオリジンと既定のセキュリティ設定を確認 | `ServRuntimeSecurityPolicyInput` が必須。[環境とオリジン](#runtime-security-options)は任意。 | `allowOrigin`、`isNativeOrigin`、`secureRefreshCookie`、`exposeApiDocs`。設定不正や本番の明示オリジン不足で例外。 | `serv.createRuntimeSecurityPolicy({ environment: "production", corsOrigin: "https://app.example.com" })` |
| `policy.allowOrigin(origin)` | CORS オリジンを判定 | ブラウザーの Origin ヘッダーから得た `origin: string`。 | `boolean` | `policy.allowOrigin("https://app.example.com")` |
| `policy.isNativeOrigin(origin)` | 設定済みネイティブオリジンを確認 | `origin: string`。クライアント種別はホストでも確認。 | `boolean` | `policy.isNativeOrigin("capacitor://localhost")` |

<a id="runtime-security-options"></a>

##### 環境とオリジン設定

| フィールド | 型・既定値・利用条件 | 動作 |
| --- | --- | --- |
| `input.environment` / `corsOrigin` / `nativeOrigins` | 任意の文字列。本番は明示的な HTTP(S) Web オリジンが必須。 | カンマ区切り。ネイティブは `capacitor:` と `tauri:` も可。本番では既定で Secure Cookie とドキュメント非公開を選び、ホストが HTTP 設定へ反映。 |

#### 利用例：別オリジンの Web とネイティブアプリが使う API を起動する

Web フロントエンドは `https://app.example.com`、Capacitor アプリは `capacitor://localhost` を使います。待ち受けを始める前に、デプロイ設定で両方を検証します。

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'

// 本番の Web とネイティブのオリジンを検証する。不正な設定は同期的に例外になる。
const policy = serv.createRuntimeSecurityPolicy({
  environment: 'production',
  corsOrigin: 'https://app.example.com',
  nativeOrigins: 'capacitor://localhost',
})
// 両方のオリジンを確認し、本番の更新 Cookie に Secure が選ばれることを確認する。
assert.equal(policy.allowOrigin('https://app.example.com'), true)
assert.equal(policy.isNativeOrigin('capacitor://localhost'), true)
assert.equal(policy.allowOrigin('https://other.example.com'), false)
```

本番の既定は `secureRefreshCookie: true` です。[serv.createApp の更新 Cookie](#refresh-cookie) に適用します。

<a id="cors-api"></a>

### `serv.cors` · 別オリジンからのブラウザーアクセスを設定する

Web フロントエンドと API のスキーム、ホスト、ポートのいずれかが異なるときに CORS ミドルウェアを登録します。ブラウザーはレスポンスヘッダーからページがデータを読めるか判定します。サーバー側ではセッション、権限、アクセス規則を引き続き確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.cors(config?)` | ブラウザーのプリフライトと CORS レスポンスヘッダーを処理 | 任意の `ServCorsConfig`。[設定](#serv-middleware-options)を参照。 | `ServMiddleware`。プリフライトは HTTP 204、アクセス方針で拒否されると 403。通常の OPTIONS はルーティングを継続。 | `serv.cors({ origin: policy.allowOrigin, credentials: true })` |

<a id="serv-middleware-options"></a>

##### CORS の設定

| フィールド | 型・既定値・利用条件 | 動作 |
| --- | --- | --- |
| `cors.origin` | 文字列、文字列配列、または判定関数。既定は `"*"`。 | `Access-Control-Allow-Origin` を返すオリジンを決めます。 |
| `cors.credentials` | boolean、既定は `false`。 | 許可するオリジンに `Access-Control-Allow-Credentials: true` を返します。Cookie を使う場合は具体的なオリジンとクライアント側の `credentials: "include"` を指定します。 |
| `cors.methods` | メソッドの一覧。既定は GET、HEAD、PUT、PATCH、POST、DELETE、OPTIONS。 | プリフライトで許可する HTTP メソッドをブラウザーに伝えます。 |
| `cors.allowedHeaders` | 任意のリクエストヘッダー一覧。 | 明示した一覧を使います。省略時はプリフライトの要求ヘッダー一覧を反映し、一覧がなければ組み込み値を使います。 |
| `cors.exposedHeaders` | 追加レスポンスヘッダーの一覧。既定は空です。 | 許可するオリジンの JavaScript が `Retry-After` などを読めるようにします。`X-Request-Id` と `X-Trace-Id` は既定で含まれます。 |
| `cors.maxAge` | 既定は 86400 秒です。 | プリフライト結果をキャッシュできる時間をブラウザーに伝えます。 |

組み込みの要求ヘッダーは `Authorization`・`Content-Type`・`X-Requested-With`・`X-Hai-Reauthentication`・`X-Hai-Terminal` です。

`_serv.yml` を `ServConfigSchema` で解析したら、得られた `config.cors` を `serv.cors(config.cors)` に渡し、`serv.createApp({ middlewares })` に登録します。 [設定例](../configuration/serv.ja.md#cors-example)

<a id="cors-account-example"></a>

#### 利用例：別オリジンのアカウント画面で残り回数を読み、セッションを更新する

アカウント画面は `https://app.example.com`、Serv は `https://api.example.com` に配置します。同じサイトの別オリジンです。API Client でプロフィールを読み、利用回数の上限に達したら画面に待ち時間を表示します。[セッションの自動更新](#refresh-browser-session-example)に従って IAM と更新 Cookie を設定し、クライアントの `baseUrl` を `https://api.example.com/api/v1` にします。サーバーに次のミドルウェアを追加します。

```ts
import { serv } from '@h-ai/serv'

// アカウント画面のオリジンを許可します。資格情報付きレスポンスを許可し、回数制限のヘッダーを JavaScript に公開します。
export const accountCors = serv.cors({
  origin: 'https://app.example.com',
  credentials: true,
  exposedHeaders: ['Retry-After', 'X-RateLimit-Remaining'],
})
```

アカウントサービスの `middlewares` に `{ middleware: accountCors }` を追加します。

`credentials: true` は `Access-Control-Allow-Credentials: true` を返します。Cookie モードのクライアントは `credentials: "include"` を使い、ブラウザーが Domain、Path、Secure、SameSite に従って Cookie の送信を判断します。資格情報付きリクエストには具体的なオリジンを指定します。アプリが設定する Bearer `Authorization` はプリフライトで `allowedHeaders` によって扱います。

`exposedHeaders` は `Access-Control-Expose-Headers` を返します。[レート制限](#rate-limit-example)を有効にすると、ブラウザーの診断コードで 429 の `response.headers.get("Retry-After")` や、残り回数の `X-RateLimit-Remaining` を読めます。これらのヘッダーはレート制限機能が生成します。CORS は別オリジンのスクリプトが読めるヘッダーを指定します。`X-Request-Id` と `X-Trace-Id` は既定で公開され、`Set-Cookie` へのスクリプトアクセスはブラウザーが制限します。未許可のオリジンからは画面でレスポンスを読み取れません。

ブラウザーの診断ページで次を実行します。ログインした画面から accessToken を渡します。

```ts
export async function inspectAccountLimit(accessToken: string) {
  // 現在のアクセストークンでアカウント API を呼び、残り回数と HTTP 429 時の待ち時間を読み取ります。
  const response = await fetch('https://api.example.com/api/v1/auth/me', {
    credentials: 'include',
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  return {
    status: response.status,
    remaining: response.headers.get('X-RateLimit-Remaining'),
    retryAfter: response.headers.get('Retry-After'),
  }
}
```

<a id="storage-assets-api"></a>

### `serv.storageAssets` · オブジェクトストレージから公開ファイルを配信する

ストアの販促画像など、公開可能と確認済みのオブジェクトを固定パスで配信します。キーと MIME タイプが許可条件に一致する必要があります。非公開ファイルの配信には[認証付きファイルルート](#http-contract-extensions)を利用します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.storageAssets(config)` | 公開リソースを読み取り専用で配信 | `ServStorageAssetsConfig` が必須。登録パスは `middlewares` で指定。 | `ServMiddleware`。GET/HEAD を受け付け、ETag 一致は 304、キー・MIME の不正、容量超過、読み取り失敗は 404。 | `serv.storageAssets(assetOptions)` |

<a id="storage-assets-options"></a>

##### 公開ファイルの設定

| フィールド | 型・既定値・利用条件 | 動作 |
| --- | --- | --- |
| `asset.storage` / `pathPrefix` | Storage または `file.head` と `file.getStreamWithMetadata` を提供するアダプターと絶対パス接頭辞が必須。 | URL の接頭辞を取り除いてキーを取得。HEAD はメタデータのみ、GET はヘッダーと本文を同じ読み取りから取得。 |
| `asset.keyPattern` / `allowedContentTypes` | キー全体を照合する `RegExp` と MIME 許可リストが必須。 | 一致するオブジェクトのみ配信。実際の読み取り上限は 5 MiB。 |
| `asset.cacheControl` / `crossOriginResourcePolicy` | 既定は `no-store`、追加のリソース方針なし。 | リソース方針は `same-origin`・`same-site`・`cross-origin` を指定可能。 |

#### 利用例：公開レポートの表紙を Canvas に描画する

`https://app.example.com` の注文運用コンソールのパートナーページから別オリジンにあるレポートの表紙を取得し、Canvas 上のピクセルを読み取ります。Storage を初期化し、公開画像 `public/report-cover.webp` を MIME タイプ `image/webp` で登録します。手順 5 の `app.mts` で `middlewares` を更新します。通信暗号化を有効にした場合は `/assets/public/report-cover.webp` を `transport.excludePaths` に追加します。

```ts
import { storage } from '@h-ai/storage'

middlewares: [
  // 注文運用コンソールのパートナーページから画像と ETag を読めるようにする。公開画像なので認証情報は不要。
  { middleware: serv.cors({ ...settings.cors, allowedHeaders: [...settings.cors.allowedHeaders, 'If-None-Match'], exposedHeaders: [...settings.cors.exposedHeaders, 'ETag'] }) },
  {
    path: '/assets/*',
    // 許可された WebP だけを配信する。対象が存在しないか条件外なら 404 を返す。
    middleware: serv.storageAssets({
      storage,
      pathPrefix: '/assets/',
      keyPattern: /^public\/report-cover\.webp$/,
      allowedContentTypes: ['image/webp'],
      cacheControl: 'public, max-age=3600',
      crossOriginResourcePolicy: 'cross-origin',
    }),
  },
],
```

注文運用コンソールのパートナーページで次のコードを実行します。

```ts
// 注文運用コンソールのパートナーページから認証情報なしで画像を取得する。取得できなければプレビューを中止する。
const image = await fetch('https://api.example.com/assets/public/report-cover.webp', { credentials: 'omit' })
if (!image.ok)
  throw new Error('Report cover request failed: ' + image.status)
const etag = image.headers.get('ETag')

// ビットマップを描画し、左上のピクセルを読み取る。
const bitmap = await createImageBitmap(await image.blob())
const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
const drawing = canvas.getContext('2d')
if (!drawing)
  throw new Error('2D canvas unavailable')
drawing.drawImage(bitmap, 0, 0)
const firstPixel = drawing.getImageData(0, 0, 1, 1).data
bitmap.close()
```

先頭のピクセルが読み取れ、`etag` はサーバーが付けた値になります。 `Access-Control-Allow-Origin` により、注文運用コンソールのパートナーページが別オリジンのレスポンスを読み取れます。`Cross-Origin-Resource-Policy: cross-origin` は別オリジンからの埋め込みを許可します。ここでは JavaScript が読めるよう `ETag` も公開します。同じ値を `If-None-Match` で送ると 304 が返り、キャッシュを再利用できます。`HEAD` はメタデータだけを返します。

<a id="validation-locales"></a>

### `serv.validateInputOrFail` · ハンドラー内で入力を検証する

契約で基本的な入力を確認した後、業務固有の条件をハンドラーで検証し、項目別のエラーを返せます。注文プレビューでは、前後の空白を取り除いたタイトルが空でないことを確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.validateInputOrFail(schema, input, locale?)` | ハンドラー内でデータを検証 | Zod の `schema` と `input` が必須。`locale: string` の既定は `zh-CN`。 | `HaiResult<TOutput>`。成功は解析済みデータ、失敗は `error.cause` に翻訳済みフィールド一覧。 | `serv.validateInputOrFail(schema, input, context.locale)` |

<a id="validation-example"></a>

#### 利用例：注文タイトルが未指定の場合と空白の場合を確認する

チュートリアルのステップ 2 のサービスを起動し、タイトルを省いた注文プレビューと、空白だけのタイトルを送信します。

```sh
curl -i http://127.0.0.1:3000/api/v1/orders/preview \
  -H 'Content-Type: application/json' --data '{}'
curl -i http://127.0.0.1:3000/api/v1/orders/preview \
  -H 'Content-Type: application/json' --data '{"title":"  "}'
```

タイトルを省くと契約で HTTP 400 を返します。空白だけの値は契約の文字列検査を通った後に処理関数でトリムされ、HTTP 200 と `success: false` を返します。フィールドエラーは `error.cause` に入ります。 [注文プレビューの全手順](../getting-started/serv.ja.md#orders-console-validation)

<a id="request-locale-api"></a>

### `serv.resolveRequestLocale` / `serv.m` · リクエストのロケールで Serv メッセージを読む

組み込みの通知や検証エラーを表示する前に、リクエストのロケールを解決します。プロセスの既定ロケールはそのままです。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.resolveRequestLocale(headers)` | リクエストの言語を解決 | `Headers` または文字列マップが必須。空でない `x-hai-locale` を優先し、なければ `Accept-Language`。 | 一覧の順に対応言語を選択し、`q=0` は除外。`zh-CN`・`en-US`・`ja-JP` に正規化し、既定は `zh-CN`。 | `serv.resolveRequestLocale(request.headers)` |
| `serv.m(key, options?)` | Serv の翻訳メッセージを取得 | 登録済みメッセージキーが必須。`locale` と埋め込み用 `params` は任意。省略時は現在の Core 言語。 | `string`。言語の上書きはこの呼び出しにのみ適用。 | `serv.m("serv_errorForbidden", { locale: "en-US" })` |

#### 利用例：日本語ページに権限エラーを返す

日本語のクライアントが `x-hai-locale: ja-JP` を送信した場合を再現します。リクエストのロケールを解決し、Serv の組み込み権限メッセージを取得します。

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'

const headers = new Headers({ 'x-hai-locale': 'ja-JP' })
// 今回のリクエストのロケールを ja-JP と判定する。
const locale = serv.resolveRequestLocale(headers)
assert.equal(locale, 'ja-JP')
// 今回の権限メッセージを日本語で取得する。
const message = serv.m('serv_errorForbidden', { locale })
assert.notEqual(message, serv.m('serv_errorForbidden', { locale: 'en-US' }))
```

同じメッセージキーが日本語で表示されます。ほかのリクエストはそれぞれのロケールで取得できます。

<a id="generate-spec-api"></a>

### `serv.generateSpec` · 共有の契約から OpenAPI を生成する

結合テストや取引先向けに OpenAPI 3.1 文書を書き出します。HTTP リスナーは不要です。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.generateSpec(contract, options?)` | 共有契約から OpenAPI 3.1 を生成 | `contract` が必須。`title`（既定 `hai-framework API`）、`version`（既定 `0.1.0`）、`description`、`apiPrefix` は任意。 | `Promise<OpenAPI.Document>`。スキーマ変換で失敗すると拒否。 | `await serv.generateSpec(contract, { title: "Orders", apiPrefix: "/api/v1" })` |

#### 利用例：注文プレビュー API の仕様を連携チームへ渡す

[手順 2](../getting-started/serv.ja.md#orders-console-validation)の `orders.mts` から注文の契約を読み込みます。以下を `export-spec.mts` に保存し、プロジェクトのルートで `node export-spec.mts` を実行します。

```ts
import { writeFile } from 'node:fs/promises'
import { serv } from '@h-ai/serv'
import { orderContract } from './orders.mts'

// servers[0].url に /api/v1 を含む OpenAPI 3.1 を生成する。スキーマの変換に失敗すると Promise が拒否される。
const spec = await serv.generateSpec(orderContract, {
  title: 'Orders API',
  version: '1.0.0',
  apiPrefix: '/api/v1',
})
// 連携チームが読み込める JSON ファイルに書き出す。
await writeFile('orders-openapi.json', JSON.stringify(spec, null, 2) + '\n')
```

生成した `orders-openapi.json` の `paths` に `/orders/preview` が入ります。クライアントは `servers[0].url` の `/api/v1` を付けて呼び出します。HTTP で公開する場合は `http.openapi` を設定し、ドキュメントのページは `http.docs.requireAuth` で保護できます。

Serv と Kit は契約の HTTP メソッドごとに操作を照合します。同じパスに GET と HEAD を宣言した場合、HEAD は自身の操作を実行し、そのステータスとヘッダーを本文なしで返します。HEAD 操作でクエリーパラメーターやリクエストヘッダーが必要な場合は、`inputStructure: 'detailed'` を指定し、入力スキーマに `query` または `headers` を宣言します。

<a id="iam-procedures-api"></a>

### `serv.createIamProcedures` · ログイン、アカウント、管理ルートを公開する

各ファクトリーは契約に対応するルーターを返します。公開するノードを選び、`contract` と `procedures` のキーをそろえます。`serv` と必要な型を `@h-ai/serv` からインポートします。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createIamProcedures(deps)` | 標準 IAM ログイン・アカウント・管理ルートを構成 | 初期化済みの `deps.iam` が必須。 | `apiContract.iam` 用のルーター。通常の呼び出しは `HaiResult`、管理操作は権限を確認。 | `serv.createIamProcedures({ iam })` |

#### 利用例：コンソールにログインしてセッションを復元する

手順 4 の `serv.createIamProcedures({ iam })` で、ログイン、プロフィール取得、ログアウトを登録します。[IAM ログインと更新](../getting-started/serv.ja.md#orders-console-iam) · [認証と認可](#authentication)

チュートリアルに従ってログインし、ローカルサービスを起動します。以降のコマンドは Bash、curl、jq を使います。ログイン時に返されたアクセストークンを `ORDERS_ACCESS_TOKEN` に設定します。

```sh
set -o pipefail
ORDERS_API_ROOT='http://127.0.0.1:3000/api/v1'
curl -sS "$ORDERS_API_ROOT/auth/me" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" |
  jq -e 'if .success then {id: .data.id, roles: .data.roles} else error(.error.message) end'
```

現在のサーバーセッションのユーザー ID とロールが表示されます。ファイルの例ではこの ID を `ORDERS_USER_ID` として使います。未ログイン時は失敗結果の `error.httpStatus` を確認します。

<a id="storage-procedures-api"></a>

### `serv.createStorageProcedures` · ファイルのアクセス URL を発行する

利用する契約ノードを選び、ファクトリーが返すルーターから対応する実装を取り出します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createStorageProcedures(deps)` | 署名付き URL・一覧・メタデータ・削除を構成 | `storage` と `authorize({ operation, context, keys })` が必須。同期または非同期で明示的に true を返すと許可。 | `apiContract.storage` 用のルーター。未許可のキーが一つでもある場合はバッチ全体を拒否。 | `serv.createStorageProcedures({ storage, authorize: canUseKeys })` |

#### 利用例：ログインしたユーザーに個人ファイルのダウンロード URL を発行する

Storage を初期化し、`authorize` で完全なオブジェクトキーを検証します。たとえば `users/<検証済みのユーザー ID>/` の範囲に限ります。`POST /api/v1/storage/presigned-urls/download` に自分のキーを渡すとダウンロード URL が返り、別ユーザーのキーは `FORBIDDEN` になります。 アプリの初期化で準備した依存関係を次の関数に渡し、HTTP アプリを作成します。 [Storage の入出力](storage.ja.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type StorageProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createFileLinkApp(deps: StorageProcedureDeps, iam: ServIam) {
  // このアプリで公開する操作と、それに対応する実装を選ぶ。
  const routes = serv.createStorageProcedures(deps)
  const contract = { presignedUrls: { createDownload: apiContract.storage.presignedUrls.createDownload } }
  const procedures = { presignedUrls: { createDownload: routes.presignedUrls.createDownload } }
  // 契約とハンドラーを登録する。初期化済みの IAM がリクエストトークンを検証する。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

署名ルートを登録したサービスを起動し、現在の利用者のファイル一覧にある実際のキーを使います。この例はコンソールの四半期レポートです。署名の成功を確認し、短時間だけ有効な URL からファイルを取得します。ダウンロード要求にはアクセストークンを付けません。

```sh
report_key="users/$ORDERS_USER_ID/reports/quarterly-orders.csv"
download_url="$(
  jq -nc --arg key "$report_key" '{key: $key, expiresIn: 60}' |
    curl -sS "$ORDERS_API_ROOT/storage/presigned-urls/download" \
      -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' --data-binary @- |
    jq -er 'if .success then .data.url else error(.error.message) end'
)" && curl -fsS --output quarterly-orders.download.csv "$download_url"
```

認証と認可の動作は [serv.implement](#authentication) を参照してください。

<a id="ai-procedures-api"></a>

### `serv.createAiProcedures` · チャットと記憶のルートを登録する

利用する契約ノードを選び、ファクトリーが返すルーターから対応する実装を取り出します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createAiProcedures(deps)` | 非ストリーミングのチャット・履歴・セッション・メモリ読み取りを構成 | `ai` が必須。`authorizeObject` は任意。別の主体にアクセスするには明示的な許可が必要。 | `apiContract.ai` 用のルーター。既定で `objectId` をセッションユーザーに結び付ける。 | `serv.createAiProcedures({ ai })` |

#### 利用例：ログインしたユーザーがチャットを開始する

AI のチャット機能を初期化し、単一の回答を生成するエンドポイントを公開します。ログインしたユーザーは `POST /api/v1/ai/chats/completions` にメッセージを送ります。`objectId` を省略するとセッションユーザーの範囲が使われ、成功時にチャットの回答が返ります。 アプリの初期化で準備した依存関係を次の関数に渡し、HTTP アプリを作成します。 [チャットの入力とツール呼び出し](ai.ja.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type AiProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createChatApp(deps: AiProcedureDeps, iam: ServIam) {
  // このアプリで公開する操作と、それに対応する実装を選ぶ。
  const routes = serv.createAiProcedures(deps)
  const contract = { chats: { createCompletion: apiContract.ai.chats.createCompletion } }
  const procedures = { chats: { createCompletion: routes.chats.createCompletion } }
  // 契約とハンドラーを登録する。初期化済みの IAM がリクエストトークンを検証する。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

サービスを起動し、ログイン済みの利用者として次の要求を送ります。入力は注文照合の質問で、最初の回答の本文が表示されます。業務エラーの場合は jq が処理を中止してサーバーのメッセージを表示します。

```sh
curl -sS "$ORDERS_API_ROOT/ai/chats/completions" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"Which fields should I check when reconciling quarterly orders?"}]}' |
  jq -e 'if .success then .data.choices[0].message.content else error(.error.message) end'
```

認証と認可の動作は [serv.implement](#authentication) を参照してください。

<a id="feedback-procedures-api"></a>

### `serv.createFeedbackProcedures` · フィードバックと返信を受け付ける

利用する契約ノードを選び、ファクトリーが返すルーターから対応する実装を取り出します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createFeedbackProcedures(deps)` | フィードバックの提出・一覧・返信・添付と、認証済み利用者向けの送信制限を登録する | 初期化済みの `deps.feedback` と、認証済みセッションをフィードバックの範囲に対応付ける `deps.resolveContext(context)` が必須。主体が null または無効の場合は拒否する。 | `apiContract.feedback` に対応するルーター。アプリが公開する操作を選びます。 | `serv.createFeedbackProcedures({ feedback, resolveContext })` |

アプリケーション層の暗号化を有効にする場合は、実際に適用される `limits.maxTotalFileBytes` から書き込みルートの通信上限を計算し、`routePlaintextBytes` に追加します。添付の取得は 16 MiB です。 [フィードバックの通信上限](api-contract.ja.md#feedback-budget)

#### 利用例：注文のエクスポートで選択した行が欠けたことを報告する

ログインしたユーザーが、注文のエクスポートに選択した行が含まれないことに気づきます。送信ごとに UUID の `id` を生成し、「選択した行がエクスポートされません」を `body` として `POST /api/v1/feedback/reports` に送ります。起動時に Feedback を初期化し、検証済みセッションとアプリの設定からユーザーとフィードバックの範囲を決め、次のファクトリーに `deps` を渡します。成功時の `data.id` は報告の ID、`data.status` は `pending` です。信頼できる範囲を取得できなければ拒否します。 [フィードバックの入力と返信](feedback.ja.md)

#### 利用例：ログインしたユーザーからフィードバックを受け付ける

Feedback を初期化します。`resolveContext` で、検証済みユーザーとデプロイ設定または信頼できるテナント情報を対応付けます。`POST /api/v1/feedback/reports` に送信すると、ユーザーと範囲が有効な場合に受け付けられます。範囲を判定できない場合は拒否されます。 アプリの初期化で準備した依存関係を次の関数に渡し、HTTP アプリを作成します。 [フィードバックの入力と返信](feedback.ja.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type FeedbackProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createFeedbackApp(deps: FeedbackProcedureDeps, iam: ServIam) {
  // このアプリで公開する操作と、それに対応する実装を選ぶ。
  const routes = serv.createFeedbackProcedures(deps)
  const contract = { reports: { submit: apiContract.feedback.reports.submit } }
  const procedures = { reports: { submit: routes.reports.submit } }
  // 契約とハンドラーを登録する。初期化済みの IAM がリクエストトークンを検証する。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

起動済みサービスに実際に保存できる報告を送ります。新しい UUID を作り、行が欠けた状況を送信します。結果には同じ ID と `pending` が含まれます。後で開くために ID を控えておきます。

```sh
report_id="$(node -p 'crypto.randomUUID()')"
jq -nc --arg id "$report_id" '{id: $id, body: "The export omitted my selected rows."}' |
  curl -sS "$ORDERS_API_ROOT/feedback/reports" \
    -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' --data-binary @- |
  jq -e 'if .success then {id: .data.id, status: .data.status} else error(.error.message) end'
```

認証と認可の動作は [serv.implement](#authentication) を参照してください。

<a id="audit-procedures-api"></a>

### `serv.createAuditProcedures` · 監査ログを検索する

利用する契約ノードを選び、ファクトリーが返すルーターから対応する実装を取り出します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createAuditProcedures(deps)` | 監査ログの一覧・統計・バックアップを構成 | `audit`・`resolveReadScope`・`authorizeBackup` が必須。読み取りスコープは `{ scopeId }`、明示的な `{ global: true }`、または null。バックアップ方針は `audit.backup` に結び付いた再認証を確認。 | `apiContract.extensions.audit` 用のルーター。スコープまたは再認証が一致しなければ拒否。 | `serv.createAuditProcedures({ audit, resolveReadScope, authorizeBackup })` |

#### 利用例：監査担当者が自テナントのログを読む

Audit を初期化し、`resolveReadScope` で `{ scopeId: "tenant-a" }` などの範囲を信頼できる情報から取得します。`audit:read` を持つユーザーが `GET /api/v1/audit/logs` を呼ぶと、そのテナントのログがページ単位で返ります。範囲が一致しない場合は `FORBIDDEN` です。 アプリの初期化で準備した依存関係を次の関数に渡し、HTTP アプリを作成します。 [監査ログ](audit.ja.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type AuditProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createAuditApp(deps: AuditProcedureDeps, iam: ServIam) {
  // このアプリで公開する操作と、それに対応する実装を選ぶ。
  const routes = serv.createAuditProcedures(deps)
  const contract = { logs: { list: apiContract.extensions.audit.logs.list } }
  const procedures = { logs: { list: routes.logs.list } }
  // 契約とハンドラーを登録する。初期化済みの IAM がリクエストトークンを検証する。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

注文操作の実際のレスポンスヘッダー `X-Request-Id` を `ORDERS_REQUEST_ID` に設定し、監査担当者のトークンで検索します。現在のテナントの該当レコードが配列で返ります。該当がなければ空配列になります。

```sh
curl -sS --get "$ORDERS_API_ROOT/audit/logs" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" --data-urlencode "requestId=$ORDERS_REQUEST_ID" |
  jq -e 'if .success then .data.items | map({requestId, action, resource}) else error(.error.message) end'
```

認証と認可の動作は [serv.implement](#authentication) を参照してください。

<a id="iam-management-procedures-api"></a>

### `serv.createIamManagementProcedures` · ロール権限と API キーを管理する

利用する契約ノードを選び、ファクトリーが返すルーターから対応する実装を取り出します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createIamManagementProcedures(deps)` | API キーとロール・権限の関連付けを構成 | 対象ユーザーまたはロールを確認する `authorize` と `iam` が必須。 | `apiContract.extensions.iam` 用のルーター。組み込み権限とホストの検査の両方に合格する必要がある。 | `serv.createIamManagementProcedures({ iam, authorize })` |

#### 利用例：管理者がロールの権限を確認する

IAM を初期化し、`authorize` で対象ロールを閲覧できるか確認します。実在するロール ID を指定して `GET /api/v1/iam/roles/{id}/permissions` を呼びます。組み込み権限とアプリの認可に成功すると権限一覧が返ります。 アプリの初期化で準備した依存関係を次の関数に渡し、HTTP アプリを作成します。 [IAM 管理ルート](iam.ja.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type IamManagementProcedureDeps, serv } from '@h-ai/serv'

export function createRolePermissionApp(deps: IamManagementProcedureDeps) {
  // このアプリで公開する操作と、それに対応する実装を選ぶ。
  const routes = serv.createIamManagementProcedures(deps)
  const contract = { roles: { listPermissions: apiContract.extensions.iam.roles.listPermissions } }
  const procedures = { roles: { listPermissions: routes.roles.listPermissions } }
  // 契約とハンドラーを登録する。初期化済みの IAM がリクエストトークンを検証する。
  return serv.createApp({ contract, procedures, auth: { iam: deps.iam } })
}
```

管理画面で選択したロールのレコードから `ORDERS_ROLE_ID` を取得します。`iam.roles.read` があり、そのロールへのアクセスを許可された管理者のトークンで実行すると、ロールに直接付与された権限コードが表示されます。

```sh
role_id="$(jq -nr --arg id "$ORDERS_ROLE_ID" '$id | @uri')"
curl -sS "$ORDERS_API_ROOT/iam/roles/$role_id/permissions" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" |
  jq -e 'if .success then .data | map(.code) else error(.error.message) end'
```

認証と認可の動作は [serv.implement](#authentication) を参照してください。

<a id="ai-streaming-procedures-api"></a>

### `serv.createAiStreamingProcedures` · チャットの返信をストリーミングする

生成中の返信をページに表示する場合に使います。アプリから公開する契約ノードだけを選びます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createAiStreamingProcedures(deps)` | チャット補完のイベントストリームを登録 | `AiStreamingProcedureDeps` には `ai` が必須。ストリーミングには `ai.llm.chatStream` を使用します。任意の `authorizeObject` で別の主体へのアクセスを許可できます。 | `apiContract.extensions.ai.chats` に対応する `chats.streamCompletion` を返します。機能が未設定なら 503、許可されていない主体へのアクセスは 403。SSE は `transportRoutes` で登録します。 | `serv.createAiStreamingProcedures({ ai })` |

<a id="ai-stream-example"></a>

#### 利用例：レポートの要約を順次表示し、途中で止める

注文運用コンソールは、利用者に閲覧権限のあるレポートを読み込み済みです。「レポートを要約」を押すと、その内容をアシスタントへのメッセージに含め、回答を順次表示します。IAM とストリーミング対応の AI を初期化し、既存の Serv アプリに次のノードを登録してサーバーを起動します。同一オリジンで接続し、公開時は HTTPS を使います。

契約を `report-chat-contract.mts` に保存し、サーバーと画面で共有します。

```ts
import { apiContract } from '@h-ai/api-contract'

const streamCompletion = apiContract.extensions.ai.chats.streamCompletion
export const reportChatContract = apiContract.create({ ai: { chats: { streamCompletion } } })
```

サーバーで同じ契約を読み込みます。例はストリーミングチャットだけを登録します。既存のアプリでは契約、実装、SSE ルートをそれぞれ追加します。

```ts
import { ai } from '@h-ai/ai'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { reportChatContract } from './report-chat-contract.mts'

// 初期化済みの AI を使い、リクエスト本文を 64 KiB に制限する。
const routes = serv.createAiStreamingProcedures({ ai })
export const app = serv.createApp({
  auth: { iam },
  contract: reportChatContract,
  procedures: { ai: { chats: { streamCompletion: routes.chats.streamCompletion } } },
  transportRoutes: [{
    procedure: reportChatContract.ai.chats.streamCompletion,
    maxRequestBytes: 64 * 1024,
  }],
})
```

`@h-ai/api-client` をインストールし、ブラウザーモジュールを `report-chat-client.mts` に保存します。

```ts
import { apiClient } from '@h-ai/api-client'
import { reportChatContract } from './report-chat-contract.mts'

export async function streamReportSummary(
  baseUrl: string,
  accessToken: string,
  reportText: string,
  appendText: (text: string) => void,
  signal: AbortSignal,
) {
  // ログイン済みの画面から受け取ったアクセストークンで、今回のリクエスト用クライアントを作成する。
  const client = apiClient.create(reportChatContract)
  try {
    const ready = await client.init({ baseUrl, headers: { Authorization: 'Bearer ' + accessToken } })
    if (!ready.success)
      throw new Error(ready.error.message)

    // 画面に表示を許可されたレポートだけを送り、停止操作をリクエストに伝える。
    const result = await client.ai.chats.streamCompletion({
      messages: [{ role: 'user', content: 'Summarize the following order report:\n' + reportText }],
    }, { signal })
    // 接続前の失敗は HaiResult。接続後は差分を受け取るか、反復処理でエラーになる。
    if (!(Symbol.asyncIterator in result))
      throw new Error(result.error.message)

    for await (const event of result) {
      // 最初の候補の本文を追記する。done は回答が最後まで届いたことを示す。
      if (event.type === 'done')
        return
      const text = event.choices.find(choice => choice.index === 0)?.delta.content
      if (text)
        appendText(text)
    }
    signal.throwIfAborted()
    throw new Error('回答が完了前に終了しました。再試行してください。')
  }
  finally {
    // 完了、失敗、中止のいずれの場合もクライアントを閉じる。
    await client.close()
  }
}
```

レポート画面にボタン 2 個と回答欄を表示します。表示済みの要素、現在の `accessToken`、レポート API が返した `report.summary` を次の接続コードに渡します。画面を破棄するときは返されたクリーンアップ関数を呼び出します。

```html
<button id="summarize-report" type="button">レポートを要約</button>
<button id="stop-summary" type="button" disabled>停止</button>
<pre id="report-reply" aria-live="polite"></pre>
<p id="report-summary-status" role="status"></p>
```

```ts
import { streamReportSummary } from './report-chat-client.mts'

export function bindReportSummary(page: HTMLElement, accessToken: string, reportText: string) {
  const summarize = page.querySelector<HTMLButtonElement>('#summarize-report')
  const stop = page.querySelector<HTMLButtonElement>('#stop-summary')
  const reply = page.querySelector<HTMLElement>('#report-reply')
  const status = page.querySelector<HTMLElement>('#report-summary-status')
  if (!summarize || !stop || !reply || !status)
    throw new Error('Missing report summary controls')
  let active: AbortController | undefined

  const summarizeReport = async () => {
    if (active)
      return
    const request = new AbortController()
    active = request
    summarize.disabled = true
    stop.disabled = false
    reply.textContent = ''
    status.textContent = ''
    try {
      await streamReportSummary('/api/v1', accessToken, reportText, (text) => {
        reply.textContent += text
      }, request.signal)
    }
    catch (error) {
      status.textContent = request.signal.aborted
        ? '中止しました'
        : error instanceof Error ? error.message : '回答を生成できませんでした'
    }
    finally {
      active = undefined
      summarize.disabled = false
      stop.disabled = true
    }
  }

  const cancel = () => active?.abort()
  summarize.addEventListener('click', summarizeReport)
  stop.addEventListener('click', cancel)
  return () => {
    cancel()
    summarize.removeEventListener('click', summarizeReport)
    stop.removeEventListener('click', cancel)
  }
}
```

レポート画面のデータと要素がそろったらボタンに接続します。画面の破棄時には `disposeSummary()` を呼び出します。

```ts
const disposeSummary = bindReportSummary(reportPanel, accessToken, report.summary)
```

「レポートを要約」を押すと、開発者ツールのネットワーク欄に `POST /api/v1/ai/chats/completions/stream` が表示され、モデルが差分を返すたびに回答欄に追記されます。「停止」を押すと、受信済みの本文を残して中止を表示します。セッションが無効な場合はストリーム開始前に失敗し、権限のない主体を要求すると 403 になります。モデルが途中で失敗した場合は反復処理がエラーになり、画面に失敗を表示します。アプリケーション層の暗号化を有効にしたサイトでは、この SSE ルートを通常の HTTPS で許可します。 [ファイルとストリームの登録](#http-contract-extensions)

<a id="ai-memory-write-procedures-api"></a>

### `serv.createAiMemoryWriteProcedures` · ユーザーの記憶を書き込む

アシスタント設定画面を記憶の書き込みルートに接続します。追加、編集、個別削除、全消去は個別に登録できます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createAiMemoryWriteProcedures(deps)` | 記憶を書き込む操作を登録 | `AiMemoryWriteProcedureDeps` には `ai` が必須。書き込みには `ai.memory.scoped` を使用します。`resolveMemoryScope(request)` で許可する主体と範囲を指定できます。既定では本人の記憶を追加、編集、個別削除できます。全消去にはアプリによる明示的な範囲の付与が必要です。 | `memories.add`、`update`、`remove`、`clear` を返します。各操作は `HaiResult` を返し、主体または範囲が許可されていなければ `FORBIDDEN` となります。 | `serv.createAiMemoryWriteProcedures({ ai, resolveMemoryScope })` |

<a id="ai-memory-write-example"></a>

#### 利用例：レポートアシスタントの書式の好みを保存する

IAM と記憶を保存できる AI を初期化します。レポートアシスタントの設定画面では、書式の好みを追加する操作のみ公開します。`apiContract.extensions.ai.memories.add` を選び、範囲の指定を省略して認証済みユーザーの記憶を使います。

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const add = apiContract.extensions.ai.memories.add
const memoryRoutes = serv.createAiMemoryWriteProcedures({ ai })

// 記憶を追加する契約ノードとハンドラーを対応付け、IAM でセッションを検証します。
export const app = serv.createApp({
  auth: { iam },
  contract: apiContract.create({ ai: { memories: { add } } }),
  procedures: { ai: { memories: { add: memoryRoutes.memories.add } } },
})
```

サービスの起動後、ログイン中の利用者として設定画面から好みを保存します。成功時は新規レコードの ID が表示されます。他の利用者の `objectId` を指定すると、業務エラーの `httpStatus` は 403 です。

```sh
curl -sS "$ORDERS_API_ROOT/ai/memories" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"content":"Use bullet points for monthly report summaries.","type":"preference"}' |
  jq -e 'if .success then .data.id else error(.error.message) end'
```

<a id="iam-audio-api"></a>

### `serv.createIamAudio` · IAM で監査レポート用のリアルタイム音声チケットを発行する

初期化した `ai` と `iam`、解析済みの `config.audio`、業務権限を `serv.createIamAudio({ ai, iam, config, permission })` に渡します。戻り値の `config` を `serv.createApp({ audio })` に渡し、アプリの契約で `apiContract.extensions.ai.audio.issueTicket` と戻り値の `issueTicket` を対応付けます。呼び出し元はアクセストークンで短期の使い捨てチケットを取得します。接続時にはアカウントの状態と権限を再確認し、設定済みの既定音声モデルを使います。

注文管理画面で `reports:read` を持つ監査担当者に、レポート要約のストリーミング音声を公開します。画面でチケットを取得して接続し、音声を再生します。 [発行からブラウザーでの再生まで](#audio-ticket-example)

<a id="ai-media-procedures-api"></a>

### `serv.createAiMediaProcedures` · 画像と音声を生成する

許可されたユーザーにメディア操作を公開します。音声機能の照会、チケット発行、文字起こし、音声合成、画像生成から選びます。文字起こし、音声合成、画像生成の本文上限は `transportRoutes` で個別に設定します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createAiMediaProcedures(deps)` | 音声と画像の操作を登録 | `AiMediaProcedureDeps` には `ai` が必須。操作に応じて `audio` または `image` を渡します。各呼び出しに `authorizeMedia(request)` の許可が必要です。チケットの発行には `audioTickets.issue` も必要です。 | `audio.getCapabilities`、`audio.issueTicket`、`audio.transcribe`、`audio.synthesize`、`images.generate` を返します。機能や権限がなければ失敗します。画像生成と音声合成の成功時には `File` を返します。 | `serv.createAiMediaProcedures({ ai, authorizeMedia })` |

#### 利用例：監査担当がレポートを聞き、録音メモを書き起こす

合成エンドポイントは最大 5,000 文字の `text` を受け取り、WAV または MP3 ファイルを返します。書き起こしでは最大 8 MiB の WAV または MP3 を multipart の `audio` フィールドに送り、`data.text` で結果を取得します。どちらも通常の HTTP リクエストで呼び出せます。 [音声合成と書き起こしの設定・検証](../getting-started/serv.ja.md#orders-console-audio)

<a id="ai-media-example"></a>

#### 利用例：権限のあるレポート編集者が表紙画像を生成する

IAM と既定の画像モデルを設定した AI を初期化します。注文運用コンソールのレポート編集画面ではテキストからの画像生成を公開し、検証済みセッションの `reports:cover:generate` 権限を確認します。許可時にモデルを指定しなければ、設定済みの既定モデルを使います。

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const generate = apiContract.extensions.ai.images.generate
const mediaRoutes = serv.createAiMediaProcedures({
  ai,
  // レポート表紙の生成権限を確認してから、画像モデルを呼び出します。
  authorizeMedia: ({ context, operation }) => operation === 'generateImage'
    && context.session.permissions.includes('reports:cover:generate')
    ? core.ok({})
    : core.err(HaiCommonError.FORBIDDEN),
})

// 画像生成ルートのみ登録し、プロンプトと JSON を合わせた本文上限を 32 KiB にします。
export const app = serv.createApp({
  auth: { iam },
  contract: apiContract.create({ ai: { images: { generate } } }),
  procedures: { ai: { images: { generate: mediaRoutes.images.generate } } },
  transportRoutes: [{ procedure: generate, maxRequestBytes: 32 * 1024 }],
})
```

サービス起動後、`reports:cover:generate` を持つ利用者のトークンで表紙の指示を送ります。成功したら `Content-Type` を確認して取得した画像をプレビューします。実際の形式に合う拡張子を付けます。権限がない場合は HTTP 403 になります。アプリケーション層の暗号化を使う場合、このメソッドと完全なパスに `encryption: "disabled"` を設定します。 [ファイルとストリーム](#http-contract-extensions)

```sh
curl -fsS "$ORDERS_API_ROOT/ai/images/generations" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"prompt":"A quarterly order report cover on a light background"}' \
  --dump-header - --output quarterly-report-cover
```

<a id="storage-transfer-procedures-api"></a>

### `serv.createStorageTransferProcedures` · 非公開ファイルを中継する

利用する契約ノードを選び、ファクトリーが返すルーターから対応する実装を取り出します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createStorageTransferProcedures(deps)` | 認可付きファイル中継ルートを構成 | `storage.file.put`・`getStreamWithMetadata` とキー全体を検査する `authorize` が必須。 | `apiContract.extensions.storage` 用のルーター。multipart アップロードと添付ダウンロードの両方にトランスポート登録が必要。 | `serv.createStorageTransferProcedures({ storage, authorize: canUseKey })` |

<a id="storage-file-example"></a>

#### 利用例：個人ファイルをアップロード・ダウンロードする

初期化済み Storage と IAM を使います。リクエストごとに検証済みユーザーに対してキー全体を確認します。ダウンロードは認証付き添付で返し、オブジェクトパスと読み取り権限はアプリが管理します。

```ts
import { apiContract, STORAGE_PROXY_MAX_FILE_BYTES } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { storage } from '@h-ai/storage'

const contract = apiContract.extensions.storage
const { upload, download } = contract.files
// 初期化済み Storage を使い、完全なキーをユーザーのディレクトリと照合します。拒否されたキーではオブジェクトを開けません。
const procedures = serv.createStorageTransferProcedures({
  storage,
  authorize: ({ keys, context }) => keys[0].startsWith(
    'users/' + encodeURIComponent(context.session.userId) + '/',
  ),
})
export const app = serv.createApp({
  auth: { iam },
  contract,
  procedures,
  transportRoutes: [
    // アップロードの上限は multipart メタデータの分も確保します。ダウンロードの本文は空にします。
    { procedure: upload, maxRequestBytes: STORAGE_PROXY_MAX_FILE_BYTES + 16 * 1024 },
    { procedure: download, maxRequestBytes: 0 },
  ],
})
```

手元にある `quarterly-orders.csv` を使います。初回アップロード成功時にオブジェクトキーを表示し、別名でダウンロードします。同じキーに再アップロードすると失敗し、他の利用者のキーの取得には HTTP 403 が返ります。

```sh
file_key="users/$ORDERS_USER_ID/reports/quarterly-orders.csv"
curl -sS "$ORDERS_API_ROOT/storage/files/upload" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" \
  --form-string "key=$file_key" --form 'file=@quarterly-orders.csv;type=text/csv' |
  jq -e 'if .success then .data.key else error(.error.message) end' &&
  curl -fsS --get "$ORDERS_API_ROOT/storage/files/download" \
    -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" --data-urlencode "key=$file_key" \
    --output quarterly-orders.download.csv
```

ファイルの上限は 5 MiB です。リクエストには 16 KiB を追加で確保します。ダウンロード成功時に `Content-Disposition: attachment` と `Cache-Control: no-store` が付きます。大容量オブジェクトには [Storage の事前署名](storage.ja.md)を使います。

<a id="payment-close-order-procedures-api"></a>

### `serv.createPaymentCloseOrderProcedures` · 認可された注文をクローズする

利用する契約ノードを選び、ファクトリーが返すルーターから対応する実装を取り出します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値または失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createPaymentCloseOrderProcedures(deps)` | 支払い注文のクローズを構成 | 初期化済み `payment.closeOrder` と `authorizeClose(input, context)` が必須。信頼できる注文の決済手段と加盟店注文番号、または失敗を返す。 | `apiContract.extensions.payment` 用のルーター。信頼できる記録と入力が一致しなければ拒否。 | `serv.createPaymentCloseOrderProcedures({ payment, authorizeClose })` |

#### 利用例：注文担当者が指定した注文をクローズする

Payment を初期化し、信頼できる注文データから加盟店注文番号と決済事業者を取得します。`authorizeClose` は操作者と注文を確認します。`POST /api/v1/payment/orders/{orderNo}/close` を呼ぶと、認可に成功し対象が一致した場合に決済事業者へクローズを依頼します。 アプリの初期化で準備した依存関係を次の関数に渡し、HTTP アプリを作成します。 [決済注文](payment.ja.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type PaymentCloseOrderProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createOrderAdminApp(deps: PaymentCloseOrderProcedureDeps, iam: ServIam) {
  // このアプリで公開する操作と、それに対応する実装を選ぶ。
  const routes = serv.createPaymentCloseOrderProcedures(deps)
  const contract = { orders: { close: apiContract.extensions.payment.orders.close } }
  const procedures = { orders: { close: routes.orders.close } }
  // 契約とハンドラーを登録する。初期化済みの IAM がリクエストトークンを検証する。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

決済サンドボックスで未払い注文を作り、信頼できる注文レコードの店舗注文番号を `ORDERS_PAYMENT_ORDER_NO` に設定します。この例はその注文が Stripe を使う場合です。`success: true` を受け取ってから画面の状態を変え、認可や決済経路が失敗した場合は以前の状態を保持します。

```sh
order_no="$(jq -nr --arg number "$ORDERS_PAYMENT_ORDER_NO" '$number | @uri')"
curl -sS "$ORDERS_API_ROOT/payment/orders/$order_no/close" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"provider":"stripe"}' |
  jq -e 'if .success then {success: .success} else error(.error.message) end'
```

認証と認可の動作は [serv.implement](#authentication) を参照してください。

<a id="error-handling"></a>

### HTTP ステータス、業務エラー、ログ

| リクエスト段階 | 観察できる結果 | 呼び出し側の処理 |
| --- | --- | --- |
| 契約入力の検証 | HTTP 400。翻訳されたフィールドは `error.cause`。 | フィールドを修正して再送信。 |
| 通常 procedure のガード・二次検証・業務失敗 | 既定は HTTP 200 と `success: false`。認証と認可の業務ステータスは 401 と 403。 | 最初に `success`、次に `error.code` と `httpStatus` を確認。 |
| 検証サービス障害、更新ルート、ファイル、HTTP 方針 | 実際の HTTP エラーステータスを使用。想定外の障害は安全な 5xx。 | 期限切れ認証情報は API Client の更新動作に従う。403 と 5xx は更新を開始しない。 |

HTTP レスポンスは `X-Request-Id` と `X-Trace-Id` を持ち、公開エラーにはサーバー診断を探すための関連 ID が入ります。Audit を初期化すると、書き込みと procedure の拒否は `request.execute`、契約・ミドルウェア・ルーティングの拒否は `http.reject` も生成します。業務の明示的な監査イベントはアプリが操作完了時に記録します。同時呼び出し間でリクエスト言語は分離されます。
