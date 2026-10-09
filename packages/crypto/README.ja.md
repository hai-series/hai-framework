# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

非対称暗号、ハッシュ、対称暗号、パスワードハッシュを提供する暗号モジュールです。

## 主な機能

- 非対称暗号（鍵生成、暗号化・復号、署名・検証）
- ハッシュ（Hash、HMAC、検証）
- 対称暗号（ECB/CBC モード）
- パスワードハッシュ（ソルト付き反復ハッシュ）
- 通信暗号化（`crypto.transport`：サーバー管理機能 + クライアントの `encryptedFetch`）
- サーバー・ブラウザー共通（Node.js / ブラウザー）

## セキュリティに関する注意

- **SM4 の既定の暗号化結果は構造化された暗号文**：`crypto.symmetric.encrypt(data, key)` は既定で CBC + ランダム IV を使用し、`{ mode, ciphertext, iv, encoding }` を返します。復号時はこのオブジェクトを `crypto.symmetric.decrypt(payload, key)` に渡します。
- **SM4 の `deriveKey(password, salt)` は KDF ではありません**：SM3 を 1 回実行するだけで、パスワードの総当たり攻撃への耐性はありません。**パスワード保存には使用禁止**です。パスワードハッシュには `crypto.password.hash(password)`、パスワードからの鍵導出には PBKDF2 / scrypt / Argon2 を使用してください。
- **IV は毎回一意にしてください**：同じ鍵で IV を再利用してはいけません。既定の CBC または `encryptWithIV()` による毎回の自動生成を推奨します。IV は暗号文と一緒に送信・保存します（公開可能で、秘密にする必要はありません）。

## クイックスタート

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
await crypto.init()
```

### 非対称暗号（暗号化・復号 / 署名・検証）

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

### ハッシュ（Hash / HMAC / 検証）

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

### 対称暗号（既定の CBC / 構造化暗号文）

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

// ⚠️ 已弃用：从密码派生密钥（仅为单次 SM3 哈希，不是 KDF，禁止用于密码存储场景）
// 密码散列请用 crypto.password.hash()；如需从密码派生密钥，请在应用层自行实现 PBKDF2 / scrypt / Argon2
const derivedKey = crypto.symmetric.deriveKey('my-password', 'random-salt')

// 校验密钥/IV 格式
crypto.symmetric.isValidKey(key) // true
crypto.symmetric.isValidIV(iv) // true
```

### パスワードハッシュ（ソルト付き反復）

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

### 通信暗号化（crypto.transport）

通信暗号化は `crypto.transport` 名前空間で提供し、`@h-ai/serv`、`@h-ai/kit`、`@h-ai/api-client` で同じプロトコル定数とペイロード形式を再利用します。

通常のアプリケーションでは、上位モジュールの統合機能を優先してください：

- サーバー：`serv.createApp({ transport: { crypto } })` または `kit.createHandle({ crypto: { crypto, transport: true } })`。
- クライアント：`apiClient.init({ transport: { crypto } })` または `kit.client.create({ transport: { crypto } })`。

`crypto.transport.createServer()` / `createClient()` の直接呼び出しは、独自ランタイム、テスト、HTTP 鍵交換 endpoint を自分で接続する場合に限って推奨します。

#### 使用手順

1. `await crypto.init()` を呼び、`crypto.asymmetric` と `crypto.symmetric` を初期化します。
2. サーバーで `crypto.transport.createServer()` を呼び、`manager` を作成します。サーバー鍵ペアとクライアント公開鍵を管理します。複数ノードでは共有 `keyStore` を注入できます。
3. POST の鍵交換 endpoint を用意します。`{ clientPublicKey }` を受け取り、`manager.registerClientKey()` で登録し、`{ serverPublicKey: manager.getServerPublicKey(), clientId }` を返します。
4. クライアントで `crypto.transport.createClient({ keyExchangeUrl })` によりセッションを作成します。最初の `client.init()` または `client.encryptedFetch()` で鍵交換が自動実行されます。
5. 鍵交換後、リクエストに `X-Client-Id` を付与します。body がある場合は `{ encryptedKey, ciphertext, iv }` に変換し、`X-Encrypted: true` を付けます。body のないリクエストでは `X-Client-Id` のみを付与し、暗号文 body は作成しません。
6. サーバーは `clientId` でクライアント公開鍵を取得し、`manager.decryptRequest()` でリクエスト本文を復号してから業務処理を実行します。
7. JSON 応答を返す前に `manager.encryptResponse(clientId, data)` で暗号化し、`X-Encrypted: true` を付けます。クライアントは応答を自動的に復号します。
8. `client.destroy()` でクライアントセッションを消去します。サーバー側のリソースは `manager.close()` またはモジュール単位の `await crypto.close()` で解放します。

> 既定の `keyStore` はプロセス内の FIFO メモリーストアです。`maxClients` を超えると最初に登録されたクライアントを削除します。複数ノードでは sticky session、またはクライアント公開鍵を共有する `TransportKeyStore` 実装が必要です。

共有ストレージには、`@h-ai/crypto` のルート入口からエクスポートされる Provider ファクトリーを再利用できます：

- `createInMemoryKeyStore(maxClients)`：テストや容量指定用に、既定のメモリーストアを明示的に作成。
- `createRedisTransportKeyStore({ cache, ttlSeconds? })`：`@h-ai/cache` を再利用。通常は Redis Provider と組み合わせ、複数ノードで共有。
- `createReldbTransportKeyStore({ reldb, ttlSeconds? })`：`@h-ai/reldb` を再利用し、`hai_crypto_transport_client_keys` テーブルを自動作成。

```ts
// 服务端：通常由 serv.createApp({ transport: { crypto } }) 或 kit.createHandle({ crypto }) 内部调用
const server = crypto.transport.createServer({ maxClients: 10000 })
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
  keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
})
if (!server.success)
  throw new Error(server.error.message)
```

`encryptedFetch()` は標準の `fetch` と同じエラー規則に従います。ネットワーク、鍵交換、リクエスト暗号化、レスポンス復号に失敗すると reject します。呼び出し元でアプリケーションの fetch エラー処理に沿って捕捉してください。

プロトコル定数は `crypto.transport.protocol`（または `TRANSPORT_PROTOCOL`）で取得できます：`X-Client-Id`、`X-Encrypted`、既定の `/_hai/key-exchange`。

### モジュールの終了

```ts
// 使用完毕后关闭，释放内部状态
await crypto.close()
```

## エラー処理

すべての操作は `HaiResult<T>` を返します：

```ts
const result = crypto.asymmetric.encrypt('data', publicKey)
if (!result.success) {
  // result.error.code / result.error.message
}
```

## テスト

```bash
pnpm --filter @h-ai/crypto test
```

## License

Apache-2.0

管理画面のオンライン暗号化デモは Crypto の SM3/SM4 API を直接呼びます。SM4 はランダムな一時鍵と IV を使い、成功表示前に復号を検証します。鍵は保存しません。入力が変わると古い結果を消去し、ランダムなダイジェストや Base64 を暗号処理の結果として表示してはいけません。
