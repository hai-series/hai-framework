# @h-ai/kit 設定

[简体中文](kit.md) · [English](kit.en.md)

[設定ハンドブック](README.ja.md) · [API リファレンス](../function/kit.ja.md) · [データ構造](../data/kit.ja.md) · [注文運用コンソールのチュートリアル](../getting-started/kit.ja.md#quick-start)

## 設定の読み込み

CLI で生成した SvelteKit サービスは、Core で `config/_kit.yml` を読み込み、`KitConfigSchema` で検証します。`hooks.server.ts` で `http`、`cors`、有効な通信設定を `kit.createHandle()` に渡します。A2A を有効にするときは AI のプロトコルハンドラーと認証も渡します。鍵リングと共有鍵レジストリはサーバー側で指定します。ブラウザーが受け取るのは必要な公開通信設定です。 [フックの引数](../function/kit.ja.md#host-options)

Core で読み込むときは、`HAI_KIT_<フィールドパス>` が YAML を上書きできます。たとえば、`HAI_KIT_HTTP_TRUSTEDPROXIES` は `http.trustedProxies`、`HAI_KIT_TRANSPORT_MAXREQUESTAGESECONDS` は `transport.maxRequestAgeSeconds` に対応します。同じ設定元ではオブジェクト全体を適用した後、個別の項目で上書きします。優先順位はプロセス環境、モード別の非公開ファイル、共通の非公開ファイル、モード別の公開ファイル、基礎の環境ファイルの順です。設定を実際に読み込み、利用先に渡す処理はアプリにあります。 [設定元と優先順位（中国語）](runtime.md#配置从哪里来)

サンプル管理画面の `_kit.yml` ではプロキシ、アクセス制御、待ち受け、通信暗号化の設定を環境変数に対応付けています。SvelteKit テンプレートは選択した機能に応じて通信暗号化を設定し、Core とスキーマで `HAI_KIT_` の上書きを読み込みます。生成プロジェクトの `pnpm start` では adapter-node が `HOST` と `PORT` を直接読み込み、既定で `0.0.0.0:3000` で待ち受けます。独自の Node 起動コードでは解析後の `server` 設定を使えます。変更後はサービスを再起動します。

<a id="configuration-fields"></a>

## 設定一覧

<a id="listening"></a>

### 待ち受け

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `server` | オブジェクト、省略可 | `{ host: "127.0.0.1", port: 3000 }` | 解析後の HTTP 待ち受けアドレスとポート。独自の起動コードで使う。 |
| `server.host` | 空でない文字列 | `"127.0.0.1"` | ホスト名または IP アドレス。解析時は空でない `HOST` が優先。 |
| `server.port` | 1～65535 の整数 | `3000` | TCP ポート。解析時は有効な `PORT` が優先。 |

<a id="local-listening-example"></a>

#### ローカルでサービスを起動する

生成プロジェクトでは adapter-node で起動します。ビルド後に `HOST=127.0.0.1 PORT=4100 pnpm start` を実行し、`http://127.0.0.1:4100` の下にあるアプリのルートを開きます。

独自の起動コードを使う場合は、次の設定を `config/_kit.yml` に記述し、解析した `server` を HTTP の待ち受け処理に渡します。空でない `HOST` と有効な `PORT` は引き続き優先されます。

```yaml schema=@h-ai/kit:KitConfigSchema
server:
  host: 127.0.0.1
  port: 4100
```

<a id="request-access"></a>

### 信頼するプロキシとアクセス制御

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `http` | 省略可能なオブジェクト | この節とレート制限の節に記載する既定値 | 信頼するプロキシ、アクセス制御、レート制限の設定。 |
| `http.trustedProxies` | `"auto"` または IPv4／IPv6 アドレスや CIDR の配列。最大 1000 件 | `"auto"` | 信頼するプロキシからだけ転送アドレスを受け取る。`auto` はフレームワークが管理する非公開 Compose ネットワークでコンテナーのサブネットを信頼する。それ以外の環境では既定で転送ヘッダーを無視する。`[]` は明示的に無視する。 |
| `http.access` | `false`、インラインポリシー、別ファイルの参照オブジェクト | `false` | 完全なパス、メソッド、信頼できるクライアント IP、時刻に基づきリクエストを確認する。インラインとファイル参照は同時に指定できない。 |
| `http.access.file` | 通常の `.yml` または `.yaml` ファイルのパス。最大 4096 文字 | ファイル参照の場合は必須 | 相対パスはサーバープロセスの作業ディレクトリを基準とする。リクエストハンドラーを組み立てるときに一度読み込む。ファイルサイズは最大 1 MiB。 |
| `http.access.global` | インライン条件オブジェクト | 省略可 | ヘルスチェックを含め、現在のホストが処理する全リクエストに適用する。 |
| `http.access.rules` | パスルールの配列。最大 1000 件 | `[]` | 共通条件と一致したすべてのルールを満たす必要がある。`encryption` で一致したメソッドとパスの通信暗号化を指定できる。 |

時間帯、IP リスト、パスの照合、HTTP メソッド、暗号化モードの全フィールドと制約は Core のアクセス制御を参照してください。Serv は同じポリシーを `_serv.yml` の `http` の下で読み込みます。 [Core のアクセス制御](core.ja.md#request-access) · [Serv のアクセス制御](serv.ja.md#request-access)

ページデータリクエストには対応する画面パスのアクセス条件も適用します。たとえば `/console/reports` の規則はこの画面のデータリクエストにも適用されます。

<a id="trusted-proxy-example"></a>

#### 取引先のネットワークにレポートを公開する

取引先はリバースプロキシ経由で注文運用コンソールの外部向けレポートを読みます。次の設定をサーバー設定ファイルの `http` に追加します。プロキシの接続元は `192.0.2.10`、取引先ネットワークは `203.0.113.0/24` の例です。デプロイ時はそれぞれ実際の値に置き換えます。

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  trustedProxies: [192.0.2.10]
  access:
    rules:
      - id: partner-reports
        paths: [/api/v1/external/reports]
        methods: [GET]
        allowIps: [203.0.113.0/24]
```

許可したネットワークからプロキシを経由して `GET /api/v1/external/reports` を実行し、HTTP 200 を確認します。別のネットワークでは 403 になります。サブディレクトリーに配置する場合は規則にプレフィックスを含む完全なパスを指定します。プローブにも制限が必要なときは、プローブ用の規則か共通条件を追加します。 [取引先向けレポートの設定](../getting-started/kit.ja.md#orders-console-access)

<a id="time-window-example"></a>

#### 監査担当者が業務時間内にレポートを確認できるようにする

次の規則を `http.access.rules` に追加し、実際の注文運用コンソールのレポートパスを使います。上海時間の平日 09:00 から 18:00 未満が許可されます。レポートルートでは既存のロールと権限も引き続き確認します。

```yaml schema=@h-ai/kit:KitConfigSchema
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

解析済みの制限設定とアトミックな計数ストアを、アプリのリクエスト入口に渡します。1 プロセスでの開発にはメモリーストアを使えます。複数インスタンスでは同じ Redis、名前空間、ウィンドウ、上限を使います。既定では信頼できるクライアント IP ごとに計数し、アドレスが特定できないリクエストは `unknown` のカウンターを共有します。ストアの障害時は HTTP 503 を返します。 同じクライアント IP のリクエストで上限を共有します。通常のルート、鍵交換、Hook が処理するアプリのヘルスチェックも計数します。CORS プリフライトは対象外です。

サインイン中のアカウントごとに上限を設定する場合は、ホストのコードで制限キーを指定します。YAML には期間と回数を指定します。

<a id="rate-limit-config-example"></a>

#### 接続元ごとのリクエスト頻度を制限する

次の設定を `config/_kit.yml` に記述します。同じ信頼済みの接続元から 10 秒以内に 2 回までリクエストを許可します。独自のリバースプロキシを運用する場合は、実際のプロキシ IP または CIDR を同じ `http` に指定します。

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  rateLimit:
    windowMs: 10000
    maxRequests: 2
```

`HAI_KIT_HTTP_RATELIMIT` で設定全体を上書きできます。個別の項目には `HAI_KIT_HTTP_RATELIMIT_WINDOWMS` と `HAI_KIT_HTTP_RATELIMIT_MAXREQUESTS` を使います。

注文運用コンソールを起動し、同じ接続元から 10 秒以内に `GET /api/v1/status` を 3 回呼び出します。最初の 2 回は 200 で残り回数は 1、0、3 回目は 429 になります。`Retry-After` に示された秒数を待って再試行し、200 に戻ることを確認します。実際の待ち受け先とデプロイ先のプレフィックスを使います。 [設定と起動の例](../getting-started/kit.ja.md#orders-console-access)

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

有効にすると、Kit は既定でマウント済みの契約 API、アプリのベースパス配下の `/api/*`、SvelteKit のページデータを暗号化します。鍵交換には専用の HTTPS POST とプロトコルの JSON を使います。注文管理画面でレポート契約を `/console/reports` にマウントする場合、ブラウザーの通信設定にも同じ完全なプレフィックスを渡します。 [カスタムプレフィックスのレポートを暗号化](../function/kit.ja.md#kit-custom-contract-transport)

SvelteKit を `/console` に配置する場合、`transport.keyExchangePath` に `/console/api/v1/_hai/key-exchange` を明示します。生成アプリは `excludePaths` と `routePlaintextBytes` に不足しているビルド時のベースパスを補います。アクセス規則には実際のリクエストパスを使用します。 [通信設定とベースパス](../function/kit.ja.md#host-options) · [Serv の鍵交換パス](serv.ja.md#transport)

クライアントには HTTPS で提供します。 管理されたデプロイでは、サーバーだけに非公開の環境変数 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` を渡します。起動時に鍵リングを解析、確認してから、キャッシュに接続して鍵レジストリを準備します。ブラウザーには交換パスなど公開可能なクライアント設定を渡します。複数インスタンスではレジストリを共有し、時刻条件をそろえます。 [鍵リングの設定](crypto.ja.md) · [サーバーとブラウザーの設定](../getting-started/kit.ja.md#orders-console-transport)

<a id="transport-example"></a>

#### 大きなレスポンスに個別の通信上限を設ける

Crypto、共有鍵レジストリ、クライアントの通信暗号化を有効にした SvelteKit プロジェクトの `config/_kit.yml` に次の設定を記述します。アプリが `/console` の下で JSON レポートのエクスポートと公開プローブを提供する例です。実際のパスに置き換えます。

```yaml schema=@h-ai/kit:KitConfigSchema
transport:
  maxPlaintextBytes: auto
  maxFutureSkewSeconds: 60
  maxRequestAgeSeconds: 300
  routePlaintextBytes:
    /console/api/reports/*/export: 8388608
  keyExchangePath: /console/api/v1/_hai/key-exchange
  excludePaths: [/console/api/health]
```

ブラウザーが同じ HTTPS オリジンの `/console/api/v1/_hai/key-exchange` で鍵交換を要求することを確認します。通常ルートの上限は 1 MiB のままです。エクスポートルートは 1 MiB を超えて 8 MiB までの UTF-8 平文を返せます。上限の前後のデータで動作を確認し、プロキシが暗号化後のリクエストを受け付けることも確かめます。

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

CORS を有効にしたパスでは、ホストが `Origin` と `Access-Control-Request-Method` を含む OPTIONS のプリフライトを処理します。アクセス規則で許可されれば 204 を返し、レート制限の枠は消費しません。それ以外の OPTIONS にはアプリのアクセス、レート制限、通信暗号化の規則を適用します。

<a id="cors-example"></a>

#### 注文運用コンソールから別オリジンの API を利用する

コンソールを `https://console.orders.example.com`、API を `https://api.orders.example.com` に配置します。次をアプリの YAML に追加し、実際のコンソールのオリジンに置き換えます。同じサイトの異なるオリジンなので、セッション Cookie の属性が許可するときはブラウザーが Cookie を送信できます。

```yaml schema=@h-ai/kit:KitConfigSchema
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

<a id="cors-multipart"></a>

#### 信頼するコンソールから注文の添付ファイルを送信する

本番ビルドの SvelteKit は `kit.createHandle()` を呼ぶ前に、別オリジンからのフォーム送信の Origin を確認します。OPTIONS プリフライトが成功しても、呼び出し元が `csrf.trustedOrigins` に含まれていなければアップロードは HTTP 403 になります。信頼オリジンの一覧はアプリのフォーム送信に適用され、Kit の CORS 適用範囲は `cors.paths` で指定します。

注文 API の `vite.config.ts` で、既存の `sveltekit({...})` のオプションに次のフィールドを追加して再ビルドします。`svelte.config.js` を使用する場合は、同じ `csrf` オブジェクトを `kit` の下に設定します。信頼するページの完全な HTTPS オリジンを指定します。

```ts
sveltekit({
  csrf: { trustedOrigins: ['https://console.orders.example.com'] },
})
```

添付ファイルのエンドポイントの CORS を `config/_kit.yml` に設定します。アプリ層の通信暗号化も有効にする場合、このリクエスト規則で multipart の POST を HTTPS で送信できます。`http` と `cors` を `kit.createHandle()` に渡します。契約ハンドラーにはアップロード操作、本文の上限、ファイルの所有権を確認する認可を設定します。 [ファイル転送の設定](../function/serv.ja.md#storage-transfer-procedures-api)

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  access:
    rules:
      - id: order-attachment-upload
        paths: [/api/v1/storage/files/upload]
        methods: [POST]
        encryption: disabled
cors:
  origin: https://console.orders.example.com
  paths: [/api/v1/storage/files/upload]
  methods: [POST]
  allowedHeaders: [Authorization, Content-Type]
```

コンソールから次の関数を呼び出します。サインインで取得した Bearer トークン、サーバーが認可したオブジェクトの `key`、ユーザーが選択した `file` を渡します。multipart の境界を含む `Content-Type` はブラウザーが設定します。

```ts
async function uploadAttachment(file: File, key: string, accessToken: string) {
  const body = new FormData()
  body.set('key', key)
  body.set('file', file)
  return fetch('https://api.orders.example.com/api/v1/storage/files/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  })
}
```

本番ビルドを HTTPS で動作させ、OPTIONS が 204、認可されたアップロードが `success: true`、別のオリジンからのフォーム POST が 403 になることを確認します。CORS で許可していないオリジンからの API の HTTP 応答は、ネットワークパネルまたはサーバーログで確認できます。

<a id="cookie-environment"></a>

### Cookie の暗号化

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `HAI_KIT_COOKIE_KEY` | サーバープロセスの環境変数。16 進数 32 文字 | 省略可。暗号化する Cookie を指定し、コードで鍵を渡さない場合は必須 | `kit.createHandle()` で選択した Cookie の暗号化鍵。明示した `crypto.cookieEncryptionKey` が優先。 |

認証 Cookie の属性は認証処理で設定します。 [フックの引数](../function/kit.ja.md#host-options)

<a id="cookie-encryption-example"></a>

#### アプリの設定を保存する Cookie を暗号化する

`hooks.server.ts` で Crypto を初期化し、注文設定を保存する `order_preferences` を `crypto.encryptedCookies` に追加します。Cookie 名にはアプリですでに使用している名前を指定します。以下のコマンドでは OpenSSL でローカルテスト用の鍵を作成し、同じシェルでビルド済みのアプリを起動します。 [注文設定を保存する Cookie の Hook 例](../function/kit.ja.md#orders-console-cookie)

```bash
export HAI_KIT_COOKIE_KEY="$(openssl rand -hex 16)"
pnpm start
```

注文設定を保存します。ブラウザーのネットワークパネルで、レスポンスヘッダー `Set-Cookie` の `order_preferences` を URL デコードした値が `enc:v2:` で始まることを確認します。ページを再読み込みし、保存した設定が表示されることを確かめます。本番環境ではサーバー側のシークレット管理から固定の鍵を渡し、同じ環境のすべてのインスタンスで同じ値を使います。

<a id="a2a"></a>

### A2A の HTTP エンドポイント

| フィールド | 型と制約 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `a2a` | `false` またはオブジェクト | `false` | A2A の公開ディスカバリーとメッセージのパスを設定する。アプリから初期化済みハンドラーも渡す。 |
| `a2a.cardPath` | サイトの絶対パス | `/.well-known/agent-card.json` | 公開 Agent Card を返す GET ルート。 |
| `a2a.rpcPath` | `cardPath` と異なるサイトの絶対パス | `/a2a` | 認証済み JSON-RPC リクエストを受ける POST ルート。SSE を返す操作も利用できる。 |

#### 取引先のプログラムから未処理注文の要約を取得する

注文アシスタントを専用パスで公開します。実際のリクエストパスを指定し、リバースプロキシからハンドラーを登録したホストへ転送します。

```yaml schema=@h-ai/kit:KitConfigSchema
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

<a id="apply-and-verify"></a>

## 設定を反映して確認する

再起動後に、利用者がアクセスするドメインから認証 Cookie とアプリのルートを確認します。プロキシが伝えた信頼できるアドレス、条件を満たさないリクエストの拒否、暗号化を有効にした場合の鍵交換を確認します。 [アクセス制御と接続元（中国語）](request-access.md)
