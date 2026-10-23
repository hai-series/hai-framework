# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

## 概要

非対称暗号、ハッシュ、対称暗号、パスワードハッシュを提供する暗号モジュールです。

## 主な機能

- 非対称暗号（鍵生成、暗号化・復号、署名・検証）
- ハッシュ（Hash、HMAC、検証）
- 対称暗号（ECB/CBC モード）
- パスワードハッシュ（ソルト付き反復ハッシュ）
- 通信暗号化（`crypto.transport`：サーバー管理機能 + クライアントの `encryptedFetch`）
- サーバー・ブラウザー共通（Node.js / ブラウザー）

## 使い始める

### セキュリティに関する注意

- **SM4 の既定の暗号化結果は構造化された暗号文**：`crypto.symmetric.encrypt(data, key)` は既定で CBC + ランダム IV を使用し、`{ mode, ciphertext, iv, encoding }` を返します。復号時はこのオブジェクトを `crypto.symmetric.decrypt(payload, key)` に渡します。
- **SM4 にはランダムな鍵を使用してください**：`crypto.symmetric.generateKey()` で鍵を生成します。このモジュールはパスワードから暗号鍵を導出する KDF を提供しません。パスワードの保存にはサーバー専用の `crypto.password.hash(password)` を使用し、パスワードやそのハッシュを直接 SM4 の鍵にしないでください。
- **IV は毎回一意にしてください**：同じ鍵で IV を再利用してはいけません。既定の CBC または `encryptWithIV()` による毎回の自動生成を推奨します。IV は暗号文と一緒に送信・保存します（公開可能で、秘密にする必要はありません）。

### クイックスタート

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
const initialized = await crypto.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
```

#### 非対称暗号（暗号化・復号 / 署名・検証）

```ts
// 生成密钥对
const keyPair = crypto.asymmetric.generateKeyPair()
if (!keyPair.success)
  throw new Error(keyPair.error.message)
const { publicKey, privateKey } = keyPair.data

// 加密 / 解密
const encrypted = crypto.asymmetric.encrypt('Hello', publicKey)
if (encrypted.success) {
  const decrypted = crypto.asymmetric.decrypt(encrypted.data, privateKey)
  // decrypted.data === 'Hello'
}

// 输出 base64 格式密文
const b64 = crypto.asymmetric.encrypt('Hello', publicKey, { outputFormat: 'base64' })

// 签名 / 验签
const sig = crypto.asymmetric.sign('important data', privateKey)
if (sig.success) {
  const valid = crypto.asymmetric.verify('important data', sig.data, publicKey)
  // valid.data === true
}

// 校验密钥格式
crypto.asymmetric.isValidPublicKey(publicKey) // true
crypto.asymmetric.isValidPrivateKey(privateKey) // true
```

#### ハッシュ（Hash / HMAC / 検証）

```ts
// 字符串哈希
const hash = crypto.hash.hash('Hello!')
// hash.data → 64 字符十六进制哈希值

// Uint8Array 输入
const buf = new TextEncoder().encode('Hello!')
const hashBuf = crypto.hash.hash(buf)

// 十六进制编码输入
const hashHex = crypto.hash.hash('48656c6c6f21', { inputEncoding: 'hex' })

// HMAC
const hmac = crypto.hash.hmac('message', 'secret-key')

// 验证哈希是否匹配
if (hash.success) {
  const matched = crypto.hash.verify('Hello!', hash.data)
  // matched.data === true
}
```

#### 対称暗号（既定の CBC / 構造化暗号文）

```ts
// 生成随机密钥和 IV
const key = crypto.symmetric.generateKey()
const iv = crypto.symmetric.generateIV()

// 默认：CBC + 自动随机 IV，返回结构化密文
const safeEnc = crypto.symmetric.encrypt('data', key)
if (safeEnc.success) {
  // safeEnc.data: { mode: 'cbc', ciphertext, iv, encoding: 'hex' }
  const safeDec = crypto.symmetric.decrypt(safeEnc.data, key)
  // safeDec.data === 'data'
}

// CBC 指定 IV（仍然返回结构化密文）
const cbcEnc = crypto.symmetric.encrypt('data', key, { mode: 'cbc', iv })
if (cbcEnc.success) {
  const cbcDec = crypto.symmetric.decrypt(cbcEnc.data, key)
}

// 结构化结果：自动生成 IV 的 CBC 加解密
const withIV = crypto.symmetric.encryptWithIV('data', key)
if (withIV.success) {
  const dec = crypto.symmetric.decryptWithIV(withIV.data.ciphertext, key, withIV.data.iv)
}

// ECB 模式（❌ 不安全；只有底层协议明确要求时才显式指定）
const ecbEnc = crypto.symmetric.encrypt('data', key, { mode: 'ecb' })
if (ecbEnc.success) {
  const ecbDec = crypto.symmetric.decrypt(ecbEnc.data, key)
}

// 输出 base64 格式（ciphertext 字段为 base64，encoding 字段会标明）
const b64Enc = crypto.symmetric.encrypt('data', key, { outputFormat: 'base64' })

// 校验密钥/IV 格式
crypto.symmetric.isValidKey(key) // true
crypto.symmetric.isValidIV(iv) // true
```

#### パスワードハッシュ（ソルト付き反復）

```ts
// 哈希密码（输出格式: $hai$<iterations>$<salt>$<hash>）
const hashed = crypto.password.hash('myPassword123')

// 自定义盐值长度和迭代次数
const custom = crypto.password.hash('myPassword123', {
  saltLength: 32,
  iterations: 20000,
})

// 验证密码
if (hashed.success) {
  const ok = crypto.password.verify('myPassword123', hashed.data)
  // ok.data === true

  const wrong = crypto.password.verify('wrongPassword', hashed.data)
  // wrong.data === false
}
```

#### 通信暗号化（crypto.transport）

正規化、検証順序、nonce 保存は [Transport v2 プロトコル](TRANSPORT-PROTOCOL.md) を参照してください。

通信暗号化は `crypto.transport` 名前空間で提供し、`@h-ai/serv`、`@h-ai/kit`、`@h-ai/api-client` で同じプロトコル定数とペイロード形式を再利用します。

通常のアプリケーションでは、上位モジュールの統合機能を優先してください：

- サーバー：`serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })` または `kit.createHandle({ crypto: { crypto, transport: { serverKeyRing, keyStore } } })`。
- クライアント：`apiClient.init({ transport: { crypto } })` または `kit.client.create({ transport: { crypto } })`。

`crypto.transport.createServer({ serverKeyRing, keyStore })` / `createClient()` の直接呼び出しは、独自ランタイム、テスト、HTTP 鍵交換 endpoint を自分で接続する場合に限って推奨します。

##### 使用手順

1. `await crypto.init()` を呼び、`crypto.asymmetric` と `crypto.symmetric` を初期化します。
2. サーバーで `crypto.transport.createServer({ serverKeyRing, keyStore })` を呼び、`manager` を作成します。サーバー鍵ペアとクライアント公開鍵を管理します。複数ノードでは共有 `keyStore` を注入できます。
3. POST の鍵交換 endpoint を用意します。`{ clientPublicKey }` を受け取り、`manager.registerClientKey()` で登録し、`{ serverKeyId: manager.getServerKeyId(), serverPublicKey: manager.getServerPublicKey(), clientId }` を返します。
4. クライアントで `crypto.transport.createClient({ keyExchangeUrl })` によりセッションを作成します。最初の `client.init()` または `client.encryptedFetch()` で鍵交換が自動実行されます。
5. 空の POST と GET/HEAD を含め、すべての要求が認証封装 `{ context, direction, status, encryptedKey, ciphertext, iv, tag, signature }` を送ります。
6. 独自アダプターは先に `await authenticateTransportRequest(manager, request)` を実行し、成功時のみ `data.plaintext` を業務へ渡し、`data.context` を保持します。
7. 応答は `await manager.encryptResponse(context, data, response.status)` で元要求に関連付け、クライアントがコンテキスト・status・完全性を検証してから平文を返します。
8. `client.destroy()` でクライアントセッションを消去します。サーバー側のリソースは `manager.close()` またはモジュール単位の `await crypto.close()` で解放します。

> サーバーには同じ管理済み `serverKeyRing` と共有 `keyStore`（Redis または共有 DB）を明示的に渡します。クライアント公開鍵の共有だけではノード間で復号できません。暗黙のプロセス鍵・メモリー registry はなく、開発・テストでは `createInMemoryKeyStore(capacity)` を明示します。再起動後は同じ鍵環を読み込み、sticky session は不要です。

共有ストレージには、`@h-ai/crypto` のルート入口からエクスポートされる Provider ファクトリーを再利用できます：

- `createInMemoryKeyStore(maxClients)`：テストや容量指定用に、既定のメモリーストアを明示的に作成。
- `createRedisTransportKeyStore({ cache, ttlSeconds? })`：`@h-ai/cache` を再利用。通常は Redis Provider と組み合わせ、複数ノードで共有。
- `createReldbTransportKeyStore({ reldb, ttlSeconds?, maxClients? })`：初期化済みの `@h-ai/reldb` を再利用し、公開鍵・nonce・容量テーブルを自動作成。`pruneExpired()` を備える `ReldbTransportKeyStore` を返します。

登録前に公開鍵の形式と SM2 曲線上の点を検証します。128 文字の hex、または `04` + 128 文字の hex のみ受け付け、圧縮点・無限遠点・曲線外の点は拒否します。純関数 `isValidSM2PublicKey(value)` は初期化不要で、serv/kit は registry に書く前に不正な鍵を HTTP 400 で拒否します。

Redis/DB の `ttlSeconds` を省略すると無期限です。指定時は 1–2147483647 の整数秒とし、有限 TTL を推奨します。Redis はネイティブのキー TTL を使い、DB の `maxClients` 上限は提供しません。メモリー予算を設定し、有効な nonce を追い出さないでください。DB の `maxClients` は正の安全な整数、既定 10000 で、全ノードと永続容量レコードが一致する必要があります。登録はトランザクション内で共有容量行をロックし、件数確認後に挿入します。満杯では登録を拒否し、有効な公開鍵や nonce を削除しません。クライアント削除時も有効な nonce は保持します。

DB の期限は DB 時計の epoch ミリ秒で生成・判定します。DB と各ノードの時計をプロトコルの許容範囲内に同期してください。初回テーブル作成失敗後は再試行できます。登録時に 1 バッチ清掃し、`await registry.pruneExpired()` は期限切れ公開鍵と nonce を各 100 件まで削除します。低トラフィック時もアプリで定期実行してください。暗黙のタイマーは作らず、注入された reldb も閉じません。旧 timestamp 列は停止中に BIGINT の `created_at_ms` / `expires_at_ms` に移行します。容量は `hai_crypto_transport_capacity` に永続化されるため、変更時は全ノードと保存行を調整し、registry 再作成のために有効な nonce を消さないでください。

```ts
const registry = createReldbTransportKeyStore({ reldb, ttlSeconds: 3600, maxClients: 10000 })
// アプリの定期メンテナンスから呼び出し、失敗時はスケジューラーで再試行する。
const removed = await registry.pruneExpired()
```

```ts
// 服务端：通常由 serv.createApp({ transport: { crypto, serverKeyRing, keyStore } }) 或 kit.createHandle({ crypto }) 内部调用
const server = crypto.transport.createServer({ serverKeyRing, keyStore })
if (!server.success)
  throw new Error(server.error.message)

// 客户端：通常由 apiClient.init({ transport: { crypto } }) 或 kit.client.create({ transport }) 内部调用
const client = crypto.transport.createClient({
  keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange',
})

const response = await client.encryptedFetch('https://api.example.com/api/v1/echo', {
  method: 'POST',
  body: JSON.stringify({ hello: 'world' }),
})
```

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto } from '@h-ai/crypto'

await crypto.init()
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

const server = crypto.transport.createServer({
  serverKeyRing,
  keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
})
if (!server.success)
  throw new Error(server.error.message)
```

`encryptedFetch()` は標準の `fetch` と同じエラー規則に従います。ネットワーク、鍵交換、リクエスト暗号化、レスポンス復号に失敗すると reject します。呼び出し元でアプリケーションの fetch エラー処理に沿って捕捉してください。

プロトコル定数は `crypto.transport.protocol`（または `TRANSPORT_PROTOCOL`）で取得できます：`X-Client-Id`、`X-Encrypted`、既定の `/_hai/key-exchange`。

`createServer({ serverKeyRing, keyStore })` は両方とも必須です。鍵環は `{ activeKeyId, keys: { [id]: { publicKey, privateKey } } }` で、ID は英数字・下線・ハイフンの 1–64 文字です。作成時に鍵の組を検証しスナップショットを保持します。不正・未設定の値は機密情報を含まない HaiResult エラーになります。例の `keyStore` は接続済み Redis/共有 DB の registry です。メモリーは開発・テストで明示的に使用します。

```ts
import { parseTransportServerKeyRing } from '@h-ai/crypto'

const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data
const server = crypto.transport.createServer({ serverKeyRing, keyStore })
```

鍵交換は `{ serverKeyId, serverPublicKey, clientId }` を返し、暗号化リクエストは `serverKeyId` を送ります。サーバーは指定した秘密鍵だけを選び、不明・失効 ID は他の鍵を試さず拒否します。応答はクライアント公開鍵で暗号化します。更新時は全ノードに新旧の鍵を先に配布し、続いて `activeKeyId` を切り替えて manager を順次再構築します。移行期間後に古い ID を全ノードから削除します。旧クライアントは `destroy()` 後に再交渉し、非冪等処理を自動再送しません。同じ鍵環を Secret Manager またはサーバー専用の非公開環境から配布し、通常の YAML、PUBLIC_/VITE_、ログ、公開応答には含めないでください。CLI はプロジェクト作成時だけ独立した開発用鍵環を Git 対象外の `.env.local` に作成します。実行時には生成せず、本番には対象環境で管理する鍵を配布します。

認証済み v2 のみを受け付けます。独立したランダム SM4-CBC 鍵と HMAC-SM3 鍵を SM2 で包み、送信者署名、MAC の順に検証してから CBC を復号します。要求はクライアント秘密鍵、応答は選択されたサーバー鍵バージョンで署名します。version、direction、serverKeyId、clientId、nonce を兼ねるランダム 128 ビット requestId、issuedAt、HTTP method、pathname と元の search の SM3 pathHash、応答 status を認証します。要求の有効期限は 5 分、未来方向の時計差は最大 30 秒です。共有 registry が (clientId, requestId) を原子的に消費し、ノード間の時計差を含め issuedAt + 6 分まで保持します。保存障害では拒否します。時計同期と Redis の noeviction/永続化により有効な nonce を保持してください。業務の再試行には別の冪等キーが必要です。

空の POST も空平文の認証封装を送ります。GET/HEAD は X-Hai-Transport ヘッダー、204/304/HEAD など本文なし応答も同じヘッダーを使います。他の要求・応答は JSON 本文と X-Encrypted: true を使います。クライアントは元の要求コンテキストと HTTP status を照合し、マーカー欠落、旧形式、認証失敗では reject します。平文 endpoint は excludePaths で明示的に除外し、CORS では X-Hai-Transport を許可・公開してください。鍵交換の公開鍵認証は TLS に依存し、IAM の業務認可は別に必要です。

serv、kit、クライアントは `TRANSPORT_BODY_LIMITS` を共有します。鍵交換 JSON は 16 KiB、公開鍵は 1 個あたり 4 KiB、平文は 1 MiB、暗号文 JSON は 2 MiB + 32 KiB です。すべて実際の UTF-8 バイト数で計算します。クライアントの鍵交換は最大 30 秒です。超過、不正 UTF-8、キャンセル時は元のストリームを停止して reader を解放し、clone/tee は作りません。呼び出し元の signal を維持し、1 件のキャンセルは他のリクエストと共有する鍵交換に影響しません。不正な暗号化応答は生の暗号文を返さず reject します。

独自 HTTP アダプターではルート入口の純粋関数 `readTransportBody(stream, { maxBytes, signal? })` を `crypto.init()` なしで利用できます。元のストリームを渡し、読み取り後は Request/Response を再構築して古い Content-Length/Content-Encoding を削除してください。上限超過は RangeError、不正 UTF-8 は TypeError、読み取り例外・signal.reason は元の理由で拒否します。ストリームのキャンセル処理が失敗しても元の例外を維持します。

```ts
import { readTransportBody, TRANSPORT_BODY_LIMITS } from '@h-ai/crypto'

const text = await readTransportBody(request.body, {
  maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes,
  signal: request.signal,
})
const payload: unknown = JSON.parse(text)
```

#### モジュールの終了

```ts
// 使用完毕后关闭，释放内部状态
await crypto.close()
```

### エラー処理

すべての操作は `HaiResult<T>` を返します：

```ts
const result = crypto.asymmetric.encrypt('data', publicKey)
if (!result.success) {
  // result.error.code / result.error.message
}
```

### 任意の連携

管理画面のオンライン暗号化デモは Crypto の SM3/SM4 API を直接呼びます。SM4 はランダムな一時鍵と IV を使い、成功表示前に復号を検証します。鍵は保存しません。入力が変わると古い結果を消去し、ランダムなダイジェストや Base64 を暗号処理の結果として表示してはいけません。

## 本番の共有状態

本番の伝送 registry は stateScope=shared と実際の Redis または PostgreSQL/MySQL が必須です。memory、および memory/SQLite を包む工場も拒否します。各ノードは同じ管理されたバージョン付き鍵セットを読み込みます。 NODE_ENV または HAI_CORE_ENV が production の場合、初期化成功前に検証します。明示的な HAI_E2E=1/HAI_E2E_MOCK=1 テストのみ除外します。 [状態・並行制御・復旧範囲（中国語）](../../docs/distributed-state.md)。

## 開発とテスト

```bash
pnpm --filter @h-ai/crypto test
```

## ライセンス

Apache-2.0
