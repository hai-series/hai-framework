# @h-ai/crypto API リファレンス

<!-- translation: partial -->

[原文（中国語）](crypto.md) · [設定](../configuration/crypto.ja.md) · [データ構造](../data/crypto.ja.md)

<a id="quick-start"></a>

## クイックスタート

プロバイダーを使う前に Crypto を初期化します。設定と鍵は信頼できる起動処理から取得します。サーバーや Fetch クライアントに暗号化を組み込むには通信マネージャーを使います。

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
const initialized = await crypto.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
```

<a id="api-reference"></a>

## API 一覧

| API | 用途 | 入力 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `crypto.init` | 各アルゴリズムを使える状態にする。 | なし | `Promise<HaiResult<void>>` | `await crypto.init()` |
| `crypto.close` | モジュールの状態を解除。通信マネージャーとセッションは作成した側が使い終わったら閉じる。 | なし | `Promise<void>` | `await crypto.close()` |
| `crypto.isInitialized` | 初期化済みかを確認する（プロパティ）。 | なし | `boolean` | `crypto.isInitialized` |
| `crypto.asymmetric.generateKeyPair` | SM2 の鍵ペアを作る。 | なし | `HaiResult<KeyPair>` | `crypto.asymmetric.generateKeyPair()` |
| `crypto.asymmetric.encrypt` | 受信者の公開鍵で文字列を暗号化する。 | `data, publicKey, options?; cipherMode = 1, outputFormat = 'hex'` | `HaiResult<string>` | `crypto.asymmetric.encrypt('orders', publicKey)` |
| `crypto.asymmetric.decrypt` | 対応する秘密鍵と同じ暗号モードで平文に戻す。 | `ciphertext, privateKey, options?; cipherMode = 1` | `HaiResult<string>` | `crypto.asymmetric.decrypt(ciphertext, privateKey)` |
| `crypto.asymmetric.sign` | 秘密鍵でメッセージに署名する。 | `data, privateKey, options?; hash = true, userId = '1234567812345678'` | `HaiResult<string>` | `crypto.asymmetric.sign('orders', privateKey)` |
| `crypto.asymmetric.verify` | 署名時と同じオプションを使い、公開鍵で署名を確認する。 | `data, signature, publicKey, options?; hash = true, userId = '1234567812345678'` | `HaiResult<boolean>` | `crypto.asymmetric.verify('orders', signature, publicKey)` |
| `crypto.asymmetric.isValidPublicKey` | SM2 公開鍵の形式を確認する。 | `publicKey` | `boolean` | `crypto.asymmetric.isValidPublicKey(publicKey)` |
| `crypto.asymmetric.isValidPrivateKey` | SM2 秘密鍵の形式を確認する。 | `privateKey` | `boolean` | `crypto.asymmetric.isValidPrivateKey(privateKey)` |
| `crypto.hash.hash` | SM3 で 64 桁の十六進ダイジェストを計算する。 | `data: string / Uint8Array, options?; inputEncoding = 'utf8'` | `HaiResult<string>` | `crypto.hash.hash('orders')` |
| `crypto.hash.hmac` | 鍵付きの SM3 ダイジェストを計算する。 | `data, key` | `HaiResult<string>` | `crypto.hash.hmac('orders', secretKey)` |
| `crypto.hash.verify` | ダイジェストを再計算し、指定値と照合する。 | `data, expectedHash` | `HaiResult<boolean>` | `crypto.hash.verify('orders', digest)` |
| `crypto.symmetric.generateKey` | ランダムな SM4 鍵を生成する（十六進 32 桁）。 | なし | `string` | `crypto.symmetric.generateKey()` |
| `crypto.symmetric.generateIV` | ランダムな初期化ベクトルを生成する（十六進 32 桁）。 | なし | `string` | `crypto.symmetric.generateIV()` |
| `crypto.symmetric.encrypt` | 文字列を暗号化して構造化データを返す。CBC では IV を省略すると新しく生成する。 | `data, key, options?; mode = 'cbc', outputFormat = 'hex'` | `HaiResult<SymmetricEncryptedPayload>` | `crypto.symmetric.encrypt('orders', key)` |
| `crypto.symmetric.decrypt` | 暗号化時と同じ鍵で平文に戻す。 | `payload, key` | `HaiResult<string>` | `crypto.symmetric.decrypt(payload, key)` |
| `crypto.symmetric.encryptWithIV` | CBC で暗号化し、新しい IV を含めて返す。 | `data, key` | `HaiResult<EncryptWithIVResult>` | `crypto.symmetric.encryptWithIV('orders', key)` |
| `crypto.symmetric.decryptWithIV` | 十六進の CBC 暗号文を、暗号化時の鍵と IV で復号する。 | `ciphertext, key, iv` | `HaiResult<string>` | `crypto.symmetric.decryptWithIV(ciphertext, key, iv)` |
| `crypto.symmetric.isValidKey` | SM4 鍵の形式を確認する。 | `key` | `boolean` | `crypto.symmetric.isValidKey(key)` |
| `crypto.symmetric.isValidIV` | 初期化ベクトルの形式を確認する。 | `iv` | `boolean` | `crypto.symmetric.isValidIV(iv)` |
| `crypto.password.hash` | サーバーで保存するパスワードハッシュを作る。 | `password, config?; saltLength = 16 bytes, iterations = 10000` | `HaiResult<string>` | `crypto.password.hash(password)` |
| `crypto.password.verify` | 保存されたハッシュとパスワードを照合する。 | `password, storedHash` | `HaiResult<boolean>` | `crypto.password.verify(password, storedHash)` |
| `crypto.transport.createServer` | 通信マネージャーを作る。サーバーで鍵リングと共有ストアを渡す。 | `{ serverKeyRing, keyStore, … }` | `HaiResult<TransportEncryptionManager>` | `crypto.transport.createServer({ serverKeyRing, keyStore })` |
| `crypto.transport.createClient` | クライアントセッションを作る。鍵交換 URL はサーバーの設定と一致させる。 | `{ keyExchangeUrl, fetch?, maxPlaintextBytes? }` | `TransportClient` | `crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/_hai/key-exchange' })` |
| `crypto.transport.protocol` | 共通のヘッダー名とプロトコル定数を取得する（プロパティ）。 | なし | `TRANSPORT_PROTOCOL_T` | `crypto.transport.protocol` |

### 通信マネージャーとクライアントセッション

`HaiResult` の `data` を読む前に `success` を確認します。例の暗号文、署名、ハッシュはいずれも先行する呼び出しの成功結果です。`createServer()` が成功したときの `data` が `manager`、`createClient()` の直接の戻り値が `session` です。実際の HTTP リクエストからサーバーがコンテキストを用意します。

| API | 用途 | 入力 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `manager.getServerKeyId` | 現在使っているサーバー鍵の ID を取得する。 | なし | `string` | `manager.getServerKeyId()` |
| `manager.getServerPublicKey` | 鍵交換用の現在の公開鍵を取得する。 | なし | `string` | `manager.getServerPublicKey()` |
| `manager.registerClientKey` | クライアントの公開鍵を登録し、クライアント ID を返す。 | `clientPublicKey` | `Promise<string>` | `await manager.registerClientKey(clientPublicKey)` |
| `manager.getClientPublicKey` | 登録済みの公開鍵を取得し、なければ undefined を返す。 | `clientId` | `Promise<string \| undefined>` | `await manager.getClientPublicKey(clientId)` |
| `manager.decryptRequest` | 暗号化されたリクエストをサーバー側の実際のコンテキストで検証して復号する。 | `payload, expectedContext` | `Promise<HaiResult<string>>` | `await manager.decryptRequest(payload, expectedContext)` |
| `manager.encryptResponse` | 応答を暗号化し、元のリクエストに関連付ける。 | `requestContext, data, httpStatus` | `Promise<HaiResult<EncryptedPayload>>` | `await manager.encryptResponse(requestContext, '{}', 200)` |
| `manager.close` | 通信マネージャーを閉じる。 | なし | `Promise<void>` | `await manager.close()` |
| `session.init` | 暗号化したリクエストを送る前に鍵交換を行う。 | なし | `Promise<HaiResult<void>>` | `await session.init()` |
| `session.encryptedFetch` | Fetch と同じ引数を使い、暗号化セッションでリクエストを送る。 | `input, init?` | `Promise<Response>` | `await session.encryptedFetch(ordersUrl)` |
| `session.ready` | セッションが新しいリクエストを送れるか確認する。 | なし | `boolean` | `session.ready()` |
| `session.destroy` | ローカルのセッション鍵を破棄する。 | なし | `void` | `session.destroy()` |

未翻訳：暗号化通信の設定、鍵のローテーション、HTTP との接続例。[中国語の該当節](crypto.md#detailed-workflow)を参照してください。
