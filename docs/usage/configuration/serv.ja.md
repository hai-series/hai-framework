# @h-ai/serv 設定

[简体中文](serv.md) · [English](serv.en.md)

[設定ハンドブック](README.ja.md) · [API リファレンス](../function/serv.ja.md) · [データ構造](../data/serv.ja.md) · [注文運用コンソールのチュートリアル](../getting-started/serv.ja.md#quick-start)

## 設定の読み込み

CLI で生成した独立 API サービスは、Core で `config/_serv.yml` を読み込み、`ServConfigSchema` で検証します。サーバーは `http`、`cors`、有効な `transport` を `serv.createApp()` に渡します。通信暗号化にはサーバーの鍵リングと共有鍵レジストリも必要です。A2A やリアルタイム音声を有効にするときは、対応する AI、IAM、業務認可の処理をアプリから渡します。 解決済みの `server.host` と `server.port` を `serv.listen()` に渡して待ち受けを開始します。 [アプリファクトリーの引数](../function/serv.ja.md#host-options)

Core で読み込むときは、`HAI_SERV_<フィールドパス>` が YAML を上書きできます。たとえば、`HAI_SERV_HTTP_APIPREFIX` は `http.apiPrefix`、`HAI_SERV_TRANSPORT_MAXREQUESTAGESECONDS` は `transport.maxRequestAgeSeconds` に対応します。同じ設定元ではオブジェクト全体を適用した後、個別の項目で上書きします。優先順位はプロセス環境、モード別の非公開ファイル、共通の非公開ファイル、モード別の公開ファイル、基礎の環境ファイルの順です。設定を実際に読み込み、利用先に渡す処理はアプリにあります。 [設定元と優先順位（中国語）](runtime.md#配置从哪里来)

生成した独立 API と Fullstack のサーバーは、それぞれの `_serv.yml` で待ち受け先、API プレフィックス、プロキシ、CORS、有効な通信暗号化の設定を環境変数に対応付けています。登録したスキーマで任意項目も上書きできます。たとえば `HAI_SERV_TRANSPORT_ROUTEPLAINTEXTBYTES` には JSON のパスマップを指定します。`http.docs.requireAuth` は docs オブジェクトを有効にしたときに適用されます。変更後はサーバーを再起動し、ゲートウェイのルートやプローブを変更した場合はデプロイ設定も更新します。

<a id="configuration-fields"></a>

## 設定一覧

<a id="listening"></a>

### 待ち受け

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `server` | オブジェクト、省略可 | `{ host: "127.0.0.1", port: 3000 }` | 解析後の HTTP 待ち受けアドレスとポート。 |
| `server.host` | 空でない文字列 | `"127.0.0.1"` | ホスト名または IP アドレス。解析時は空でない `HOST` が優先。 |
| `server.port` | 1～65535 の整数 | `3000` | TCP ポート。解析時は有効な `PORT` が優先。 |

<a id="local-listening-example"></a>

#### ローカルでサービスを起動する

次の設定を `config/_serv.yml` に記述し、アプリに必要なほかの設定を残します。ループバックの 4100 ポートにバインドするため、開発機で複数のサービスを起動できます。空でない `HOST` と有効な `PORT` は引き続き優先されます。

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  host: 127.0.0.1
  port: 4100
```

起動後に `http://127.0.0.1:4100/health` を開きます。フレームワーク既定のヘルスチェックは HTTP 200 を返します。

<a id="http-endpoints"></a>

### API、ドキュメント、プローブ

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `http` | オブジェクト、省略可 | この節とアクセス制御の既定値 | API、ドキュメント、ヘルスチェック、アクセス制御の設定。 |
| `http.apiPrefix` | `/` で始まるパス。英数字、アンダースコア、ピリオド、ハイフンを使用可。ドットセグメントと末尾スラッシュは禁止 | `"/api/v1"` | 業務 API のルートプレフィックス。鍵交換パスは `transport.keyExchangePath` で個別に指定する。 |
| `http.openapi` | `false` またはオブジェクト | `false` | オブジェクトを指定すると OpenAPI JSON エンドポイントを有効にする。 |
| `http.openapi.path` | `/` で始まる完全なパス | `"/openapi.json"` | クライアントやツール向けの OpenAPI JSON のパス。 |
| `http.docs` | `false` またはオブジェクト | `false` | オブジェクトを指定すると Scalar API ドキュメントを有効にする。 |
| `http.docs.path` | `/` で始まる完全なパス | `"/docs"` | ドキュメントのパス。同じディレクトリの `_hai/scalar.js` でスクリプトを配信。 |
| `http.docs.requireAuth` | 真偽値 | 省略時は認証不要 | `true` の場合、アプリが検証済みセッションを確立する。ドキュメントの応答には `Cache-Control: private, no-store` が付く。別途有効にした OpenAPI JSON は個別のアクセス制御に従う。 |
| `http.health` | `false` またはオブジェクト | `{ path: "/health", readyPath: "/ready" }` | 稼働確認用と準備状況確認用のプローブを有効にする。どちらも HTTP アプリが応答できることを示す。 |
| `http.health.path` | `/` で始まる完全なパス | `"/health"` | 稼働確認のパス。 |
| `http.health.readyPath` | `/` で始まる完全なパス | `"/ready"` | 準備状況確認のパス。 |

ドキュメントページ、OpenAPI JSON、Scalar スクリプトには個別のパスを使用し、登録済みの GET または HEAD 契約パスと重複しないようにします。同一パスの競合はハンドラーの組み立て時に拒否されます。

`serv.createRuntimeSecurityPolicy()` を使う生成プロジェクトでは、本番環境の OpenAPI JSON とドキュメントを無効にします。公開範囲には Core の環境設定、プロキシのルート、プローブの設定も影響します。 [デプロイとドキュメントのパス（中国語）](http.md#serv监听和路由)

<a id="docs-health-example"></a>

#### API ドキュメントとヘルスチェックの URL を設定する

開発環境の `config/_serv.yml` に次の設定を記述します。ドキュメントを表示するには、アプリの認証処理で検証済みのセッションが必要です。OpenAPI JSON を個別に公開しない場合、ドキュメントページが仕様を埋め込みます。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  openapi: false
  docs:
    path: /docs
    requireAuth: true
  health:
    path: /healthz
    readyPath: /readyz
```

認証ありと認証なしで `/docs` にアクセスし、それぞれ HTTP 200 と HTTP 401 になることを確認します。どちらの応答にも `Cache-Control: private, no-store` が付きます。既定の OpenAPI パスは HTTP 404 になります。`/healthz` と `/readyz` のプローブは HTTP 200 を返します。OpenAPI JSON を個別に公開するには `http.openapi: { path: /openapi.json }` とし、そのパスのアクセス制御を設定します。

<a id="request-access"></a>

### 信頼するプロキシとアクセス制御

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `http.trustedProxies` | `"auto"` または IPv4／IPv6 アドレスや CIDR の配列。最大 1000 件 | `"auto"` | 信頼するプロキシからだけ転送アドレスを受け取る。`auto` はフレームワークが管理する非公開 Compose ネットワークでコンテナーのサブネットを信頼する。それ以外の環境では既定で転送ヘッダーを無視する。`[]` は明示的に無視する。 |
| `http.access` | `false`、インラインポリシー、別ファイルの参照オブジェクト | `false` | 完全なパス、メソッド、信頼できるクライアント IP、時刻に基づきリクエストを確認する。インラインとファイル参照は同時に指定できない。 |
| `http.access.file` | 通常の `.yml` または `.yaml` ファイルのパス。最大 4096 文字 | ファイル参照の場合は必須 | 相対パスはサーバープロセスの作業ディレクトリを基準とする。リクエストハンドラーを組み立てるときに一度読み込む。ファイルサイズは最大 1 MiB。 |
| `http.access.global` | インライン条件オブジェクト | 省略可 | ヘルスチェックを含め、現在のホストが処理する全リクエストに適用する。 |
| `http.access.rules` | パスルールの配列。最大 1000 件 | `[]` | 共通条件と一致したすべてのルールを満たす必要がある。`encryption` で一致したメソッドとパスの通信暗号化を指定できる。 |

時間帯、IP リスト、パスの照合、HTTP メソッド、暗号化モードの全フィールドと制約は Core のアクセス制御を参照してください。Kit も `_kit.yml` の `http.access` に同じポリシーを指定します。 [Core のアクセス制御](core.ja.md#request-access) · [Kit のアクセス制御](kit.ja.md#request-access)

<a id="trusted-proxy-example"></a>

#### 取引先のネットワークにレポートを公開する

取引先はリバースプロキシ経由で注文運用コンソールの外部向けレポートを読みます。次の設定をサーバー設定ファイルの `http` に追加します。プロキシの接続元は `192.0.2.10`、取引先ネットワークは `203.0.113.0/24` の例です。デプロイ時はそれぞれ実際の値に置き換えます。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  trustedProxies: [192.0.2.10]
  access:
    rules:
      - id: partner-reports
        paths: [/api/v1/external/reports]
        methods: [GET]
        allowIps: [203.0.113.0/24]
```

許可したネットワークからプロキシを経由して `GET /api/v1/external/reports` を実行し、HTTP 200 を確認します。別のネットワークでは 403 になります。サブディレクトリーに配置する場合は規則にプレフィックスを含む完全なパスを指定します。プローブにも制限が必要なときは、プローブ用の規則か共通条件を追加します。 [取引先向けレポートの設定](../getting-started/serv.ja.md#orders-console-access)

<a id="time-window-example"></a>

#### 監査担当者が業務時間内にレポートを確認できるようにする

次の規則を `http.access.rules` に追加し、実際の注文運用コンソールのレポートパスを使います。上海時間の平日 09:00 から 18:00 未満が許可されます。レポートルートでは既存のロールと権限も引き続き確認します。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  access:
    rules:
      - id: report-hours
        paths: [/api/v1/reports/current]
        methods: [GET]
        timezone: Asia/Shanghai
        windows:
          - days: [1, 2, 3, 4, 5]
            start: '09:00'
            end: '18:00'
```

`reports:read` 権限を持つ監査担当者でサインインし、時間帯の内外で `GET /api/v1/reports/current` を実行します。時間帯内は 200、時間帯外の新規リクエストは 403 になります。運用担当者が独立して管理する場合は、ポリシーオブジェクトを別の YAML ファイルに保存して `http.access.file` で参照します。 [ポリシーの別ファイル管理（中国語）](request-access.md#4-运维人员携带独立-yaml-交付)

<a id="http-rate-limit"></a>

### 固定ウィンドウのレート制限

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `http.rateLimit` | `false` またはオブジェクト | `false` | 信頼済みの接続元 IP ごとにリクエスト頻度を制限する。有効にする場合はサーバーがアトミックな計数ストアを渡す。 |
| `http.rateLimit.windowMs` | 1～2147483647 の整数、単位はミリ秒 | `60000` | 最初に計数を書き込んだ時点から始まる固定時間枠。後続のリクエストも同じ期限を使う。 |
| `http.rateLimit.maxRequests` | 正の安全な整数 | `100` | 1 つの接続元が時間枠内で通過できる回数。超過時は HTTP 429。 |

解析済みの制限設定とアトミックな計数ストアを、アプリのリクエスト入口に渡します。1 プロセスでの開発にはメモリーストアを使えます。複数インスタンスでは同じ Redis、名前空間、ウィンドウ、上限を使います。既定では信頼できるクライアント IP ごとに計数し、アドレスが特定できないリクエストは `unknown` のカウンターを共有します。ストアの障害時は HTTP 503 を返します。 アクセスポリシーを通過した HTTP リクエストは IP ごとに上限を共有します。組み込みのヘルスチェックとレディネスプローブ、CORS プリフライトは対象外です。暗号化を有効にすると鍵交換も計数します。

サインイン中のアカウントごとに上限を設定する場合は、ホストのコードで制限キーを指定します。YAML には期間と回数を指定します。

<a id="rate-limit-config-example"></a>

#### 接続元ごとのリクエスト頻度を制限する

次の設定を `config/_serv.yml` に記述します。同じ信頼済みの接続元から 10 秒以内に 2 回までリクエストを許可します。独自のリバースプロキシを運用する場合は、実際のプロキシ IP または CIDR を同じ `http` に指定します。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  rateLimit:
    windowMs: 10000
    maxRequests: 2
```

`HAI_SERV_HTTP_RATELIMIT` で設定全体を上書きできます。個別の項目には `HAI_SERV_HTTP_RATELIMIT_WINDOWMS` と `HAI_SERV_HTTP_RATELIMIT_MAXREQUESTS` を使います。

注文運用コンソールを起動し、同じ接続元から 10 秒以内に `GET /api/v1/status` を 3 回呼び出します。最初の 2 回は 200 で残り回数は 1、0、3 回目は 429 になります。`Retry-After` に示された秒数を待って再試行し、200 に戻ることを確認します。実際の待ち受け先とデプロイ先のプレフィックスを使います。 [設定と起動の例](../getting-started/serv.ja.md#orders-console-access)

<a id="cors"></a>

### クロスオリジンアクセス

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `cors` | `false` またはオブジェクト | `false` | オブジェクトで CORS を有効にし、レスポンスヘッダーとプリフライトを処理する。 |
| `cors.origin` | 完全なオリジンの文字列、カンマ区切り文字列、または文字列配列 | `"*"` | ブラウザーによるレスポンスの読み取りを許可する。Cookie などの認証情報を使う場合はオリジンを明示し、ワイルドカードは使えない。 |
| `cors.nativeOrigins` | `http:`、`https:`、`capacitor:`、`tauri:` のオリジンをカンマ区切りで指定 | なし | ネイティブアプリからの追加オリジンを許可する。 |
| `cors.paths` | 完全なリクエストパスの配列 | ホストが処理するすべてのリクエスト | 指定パスとその配下に適用。デプロイのプレフィックスを含める。空配列はどのパスにも一致しない。 |
| `cors.methods` | HTTP メソッドの配列 | `[GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS]` | プリフライト後に利用できるメソッドをブラウザーに伝える。 |
| `cors.allowedHeaders` | リクエストヘッダー名の配列 | `[Authorization, Content-Type, X-Requested-With, X-Hai-Reauthentication, X-Hai-Terminal]` | プリフライト後にブラウザーが送信できるヘッダー。 |
| `cors.exposedHeaders` | レスポンスヘッダー名の配列 | `[]` | ブラウザースクリプトから読み取れるヘッダーを追加する。`X-Request-Id` と `X-Trace-Id` も公開する。 |
| `cors.credentials` | 真偽値 | `false` | クロスオリジンのリクエストに Cookie などの認証情報を含めることを許可する。 |
| `cors.maxAge` | 0 以上の整数、単位は秒 | `86400` | プリフライト結果のキャッシュ時間。ブラウザー側の上限も適用される。 |

CORS を有効にしたパスでは、ホストが `Origin` と `Access-Control-Request-Method` を含む OPTIONS のプリフライトを処理します。アクセス規則で許可されれば 204 を返し、レート制限の枠は消費しません。それ以外の OPTIONS にはアプリのアクセス、レート制限、通信暗号化の規則を適用します。 生成した API Service と Fullstack で本番環境の CORS を有効にする場合は、Web オリジンを明示します。

<a id="cors-example"></a>

#### 注文運用コンソールから別オリジンの API を利用する

コンソールを `https://console.orders.example.com`、API を `https://api.orders.example.com` に配置します。次をアプリの YAML に追加し、実際のコンソールのオリジンに置き換えます。同じサイトの異なるオリジンなので、セッション Cookie の属性が許可するときはブラウザーが Cookie を送信できます。

```yaml schema=@h-ai/serv:ServConfigSchema
cors:
  origin: https://console.orders.example.com
  paths: [/api/v1]
  methods: [GET, POST, OPTIONS]
  credentials: true
  allowedHeaders:
    - Authorization
    - Content-Type
    - X-Request-Client
    - X-Request-Id
    - X-Hai-Terminal
    - X-Hai-Reauthentication
    - X-Hai-Locale
  exposedHeaders:
    - Retry-After
    - X-RateLimit-Remaining
  maxAge: 600
```

サインイン後、API のプリフライトにコンソールと一致する `Access-Control-Allow-Origin` と `Access-Control-Allow-Credentials: true` が含まれることを、ブラウザーのネットワークパネルで確認します。レート制限時は HTTP 429 の `response.headers.get("Retry-After")` を読み、再試行できる時刻を表示します。アプリ層の通信暗号化を有効にする場合は、クライアントが使う `X-Client-Id`、`X-Encrypted`、`X-Hai-Transport` をリクエストの許可ヘッダーに追加し、`X-Encrypted` と `X-Hai-Transport` を公開します。

<a id="refresh-cookie"></a>

### 更新 Cookie に HTTPS を要求する

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `HAI_SERV_REFRESH_COOKIE_SECURE` | サーバープロセスの環境変数。`true` または `false` | 未設定時は本番環境で有効 | 有効な更新 Cookie の `Secure` 属性を制御する。明示した `refreshCookie.secure` が優先。`HAI_SERV` 全体の上書きはこの変数に影響しない。 |

生成したアプリは、指定のネイティブオリジンとアプリ固有のネイティブリクエスト条件を満たすときにトークンのネイティブ受け渡しを許可します。 [認証とガード](../function/serv.ja.md#authentication)

<a id="refresh-cookie-secure-example"></a>

#### HTTPS でサインインして更新 Cookie を確認する

`refreshCookie` を有効にしている場合は、本番サーバーの環境で `HAI_SERV_REFRESH_COOKIE_SECURE=true` を維持します。同一サイトの HTTPS 画面からサインインし直し、ログインまたは更新レスポンスの `Set-Cookie` に `Secure`、`HttpOnly`、`SameSite=Strict` があることをブラウザーで確認します。Cookie 対応の API Client はアクセストークンの期限が切れたときに更新します。この Strict Cookie の認証方式では、画面と API を同じサイトに置きます。 [サインイン、更新、サインアウト](../getting-started/serv.ja.md#orders-console-iam)

<a id="transport"></a>

### 通信暗号化

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `transport` | `false` またはオブジェクト | `false` | オブジェクトでアプリ層の通信暗号化を設定する。サーバーの鍵リングと共有鍵レジストリを渡し、クライアントに鍵交換のアドレスを設定する。 |
| `transport.maxPlaintextBytes` | `"auto"` または 1024～67108864 バイトの整数 | `"auto"`、通常ルートは 1 MiB | 通常のリクエストとレスポンスの UTF-8 平文の上限。 |
| `transport.maxFutureSkewSeconds` | 0～1800 秒の整数 | `30` | リクエストのタイムスタンプがサーバー時刻より先行できる秒数。 |
| `transport.maxRequestAgeSeconds` | 1～3600 秒の整数 | `300` | 発行時刻からのリクエストの有効期間。通信時間も含む。 |
| `transport.routePlaintextBytes` | 完全なパスを 1024～67108864 バイトの整数に対応付ける。最大 100 件 | 省略可 | 指定ルートの双方向の平文上限。実際のリクエストパスを使う。`*` はパスの 1 セグメント全体に一致する。複数該当する場合は最小の上限を使う。 |
| `transport.excludePaths` | `/` で始まる完全なパスの配列 | `[]` | パスとその配下を通信暗号化から除外する。明示的な `encryption: required` のパスルールが優先。 |
| `transport.keyExchangePath` | オリジン直下を基準とする絶対パス | `"/api/v1/_hai/key-exchange"` | 鍵交換用の公開 POST パス。各セグメントには半角英数字、`_`、`-`、`.` を使用できます。`.` または `..` のみのセグメント、空のセグメント、末尾のスラッシュ、パーセントエンコード、クエリ、フラグメントは無効です。 |

クライアントには HTTPS で提供します。 管理されたデプロイでは、サーバーだけに非公開の環境変数 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` を渡します。起動時に鍵リングを解析、確認してから、キャッシュに接続して鍵レジストリを準備します。ブラウザーには交換パスなど公開可能なクライアント設定を渡します。複数インスタンスではレジストリを共有し、時刻条件をそろえます。 [鍵リングの設定](crypto.ja.md) · [サーバーとブラウザーの設定](../getting-started/serv.ja.md#orders-console-transport)

<a id="transport-example"></a>

#### 大きなレスポンスに個別の通信上限を設ける

Crypto と共有鍵レジストリを初期化した API サービスの `config/_serv.yml` に次の設定を記述します。アプリが `/backend/api` の下で JSON レポートをエクスポートする例です。公開済みエクスポートルートの完全なパスを指定します。プローブは通常の HTTPS リクエストを使います。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  apiPrefix: /backend/api
transport:
  maxPlaintextBytes: auto
  maxFutureSkewSeconds: 60
  maxRequestAgeSeconds: 300
  routePlaintextBytes:
    /backend/api/reports/*/export: 8388608
  keyExchangePath: /backend/api/_hai/key-exchange
  excludePaths: [/health, /ready]
```

クライアントの `baseUrl` には HTTPS オリジンに `/backend/api` を付けた URL、`transport.keyExchangePath` には `/backend/api/_hai/key-exchange` を指定します。API のプレフィックスを変更しても、既定の鍵交換パスは `/api/v1/_hai/key-exchange` です。`/backend/api/_hai/key-exchange` で鍵交換を確認します。通常ルートの上限は 1 MiB のままです。エクスポートルートは 1 MiB を超えて 8 MiB までの UTF-8 平文を返せます。上限の前後のデータで動作を確認し、プロキシが暗号化後のリクエストを受け付けることも確かめます。 [クライアント接続](../function/api-client.ja.md#client-integration)

<a id="fullstack-key-exchange-example"></a>

#### Fullstack ゲートウェイ経由で鍵を交換する

Fullstack バックエンドの `config/_serv.yml` に次の設定を記述します。業務 API は `/backend/api`、鍵交換は `/exchange/keys` を使用します。公開ヘルスチェックは `http.health` で設定したパスを使用します。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  apiPrefix: /backend/api
transport:
  keyExchangePath: /exchange/keys
```

Docker SSH Provider でデプロイすると、ゲートウェイは `/exchange/keys` をそのまま Serv に転送します。公開の `runtime-config.js` は `apiBase` と `apiKeyExchangePath` を Web クライアントに渡します。独自のゲートウェイを運用する場合は、鍵交換パスと業務のプレフィックスを同じバックエンドに転送します。ブラウザーでゲートウェイを開き、`POST /exchange/keys` が 200 を返し、暗号化された業務リクエストが `/backend/api` 配下のエンドポイントに届くことを確認します。 [Fullstack のデプロイ](../function/deploy.ja.md)

<a id="a2a"></a>

### A2A の HTTP エンドポイント

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `a2a` | `false` またはオブジェクト | `false` | A2A の公開ディスカバリーとメッセージのパスを設定する。アプリから初期化済みハンドラーも渡す。 |
| `a2a.cardPath` | サイトの絶対パス | `/.well-known/agent-card.json` | 公開 Agent Card を返す GET ルート。 |
| `a2a.rpcPath` | `cardPath` と異なるサイトの絶対パス | `/a2a` | 認証済み JSON-RPC リクエストを受ける POST ルート。SSE を返す操作も利用できる。 |

#### 取引先のプログラムから未処理注文の要約を取得する

注文アシスタントを専用パスで公開します。実際のリクエストパスを指定し、リバースプロキシからハンドラーを登録したホストへ転送します。

```yaml schema=@h-ai/serv:ServConfigSchema
a2a:
  cardPath: /.well-known/agent-card.json
  rpcPath: /partners/orders/a2a
```

`_ai.yml` の Agent Card URL を `https://api.orders.example.com/partners/orders/a2a` とし、`a2a.security.apiKey` で `X-Agent-Key` をヘッダーとして宣言します。起動時に AI と IAM を初期化し、注文用エグゼキューターを登録してから HTTP ハンドラーを接続します。発行した取引先のキーは `ORDERS_AGENT_KEY` でコマンドに渡します。両方のエンドポイントを HTTPS で配信し、アプリ層の通信暗号化は適用しません。 [A2A](../function/ai.ja.md#a2a)

```sh
orders_origin=https://api.orders.example.com
curl --fail-with-body -sS "$orders_origin/.well-known/agent-card.json"
curl --fail-with-body -sS "$orders_origin/partners/orders/a2a" \
  -H "X-Agent-Key: ${ORDERS_AGENT_KEY:?}" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":"orders-backlog-1","method":"SendMessage","params":{"message":{"messageId":"orders-backlog-1","role":"ROLE_USER","parts":[{"text":"Summarize the order backlog."}]}}}'
```

ディスカバリーには公開した JSON-RPC の URL が含まれます。呼び出しに成功すると JSON-RPC の `result` が返り、キーがない場合や無効な場合は HTTP 401 になります。サブディレクトリーに配置する場合は、そのディレクトリーを含む完全なパスを設定します。

<a id="audio"></a>

### リアルタイム音声の WebSocket

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `audio` | `false` またはオブジェクト | `false` | `serv.listen()` の Node ホストに音声パスを設定する。音声処理、チケット検証、業務認可はアプリから渡す。 |
| `audio.path` | サイトの絶対パス | `${http.apiPrefix}/ai/audio` | WebSocket をアップグレードするサイト内のパスです。明示した絶対パスは業務プレフィックスの外でもそのまま使われます。 |

#### 監査担当者の音声メモを話しながら文字にする

音声モデルと使い捨てチケットを用意した注文 API で、リアルタイム音声を `/voice/orders` に登録します。ゲートウェイではこのパスの WebSocket 転送を有効にします。

```yaml schema=@h-ai/serv:ServConfigSchema
audio:
  path: /voice/orders
```

監査メモを編集できるアカウントでサインインし、使い捨てチケットを取得して `wss://api.orders.example.com/voice/orders` に接続します。マイク入力を送信すると、認識結果が順次表示されます。同じチケットを再利用すると接続が拒否されます。1 回の音声合成や録音ファイルの文字起こしには HTTP エンドポイントを使えます。 [チケットと接続の例](../function/serv.ja.md#audio-ticket-example)

管理対象の Fullstack ゲートウェイは Serv の設定パスで WebSocket を転送し、使い捨てチケットを含むアップグレードのログを残しません。自前の HTTPS ゲートウェイは `Upgrade` を転送してください。外側のゲートウェイがサブディレクトリだけを許可する場合は、設定したパスも許可します。

<a id="apply-and-verify"></a>

## 設定の反映と確認

再起動後に、利用者がアクセスするドメインからヘルスチェック、認証、API ルートを確認します。プロキシが伝えた信頼できるアドレス、ブラウザーのプリフライト、鍵交換の順に確認します。公開プロキシのパスやコンテナーのプローブを変更した場合は、デプロイ設定も更新します。 [アクセス制御と接続元（中国語）](request-access.md)
