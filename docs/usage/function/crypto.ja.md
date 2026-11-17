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
| `crypto.password.hash` | サーバーで保存するパスワードハッシュを作る。 | `password, config?; saltLength = 16 characters, iterations = 10000` | `HaiResult<string>` | `crypto.password.hash(password)` |
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

### HTTP ツールとストアインスタンス

以下のルート export は HTTP アダプター、設定解析、独立した registry の組み立て用です。アルゴリズムと通信の主ファクトリーは `crypto` から使い、返されたインスタンスは作成側が管理します。

| API | 入力・既定値 | 出力・失敗 | 例 |
| --- | --- | --- | --- |
| `isValidSM2PublicKey` | 未知の値 | `boolean`、初期化不要 | `isValidSM2PublicKey(value)` |
| `parseTransportServerKeyRing` | 秘密 JSON またはオブジェクト | `HaiResult<TransportServerKeyRing>`、秘密をエラーに含めない | `parseTransportServerKeyRing(secret)` |
| `createCacheTransportKeyStore` | `{ cache, ttlSeconds?, maxRegistrationsPerMinute?, maxRequestsPerMinute? }` | `TransportKeyStore`、無効引数は TypeError、満杯は `hai:crypto:072` で reject | `createCacheTransportKeyStore({ cache })` |
| `registry.register` | 有効な SM2 公開鍵 | `Promise<string>`、鍵・保存失敗は reject | `await registry.register(publicKey)` |
| `registry.get` | クライアント ID | `Promise<string / undefined>`、保存失敗は reject | `await registry.get(clientId)` |
| `registry.claimRequest` | クライアント ID、要求 ID、保持期限 Unix ミリ秒 | 原子的な `Promise<boolean>`、保存失敗は reject | `await registry.claimRequest(clientId, requestId, expiresAt)` |
| `registry.delete?` | クライアント ID | `Promise<void>`、公開鍵のみ削除、保存失敗は reject | `await registry.delete?.(clientId)` |
| `registry.close?` | なし | `Promise<void>`、独自ストア用の任意の終了処理。組み込み Cache ストアは借用接続を閉じない | `await registry.close?.()` |
| `resolveTransportBodyLimits` | 任意の平文バイト数、`{ requiredPlaintextBytes? }` | 不変 `TransportBodyLimits`、無効値・競合は RangeError | `resolveTransportBodyLimits(8388608)` |
| `createTransportBodyPolicy` | 任意の全体バイト数、ルート対応表（既定は空） | ポリシー、無効設定は RangeError | `createTransportBodyPolicy(undefined, { '/files/*': 8388608 })` |
| `policy.acquire` | 実際の pathname | `{ limits, release } / null`、満杯なら null | `policy.acquire('/files/report')` |
| `lease.release` | なし | `void`、一度だけ解放、重複呼び出し可 | `lease.release()` |
| `readTransportBody` | 元ストリームまたは null、`{ maxBytes, signal?, direction?, stage? }` | `Promise<string>`、容量・UTF-8・中断・読み取りエラーは throw | `await readTransportBody(request.body, { maxBytes: 16384 })` |
| `authenticateTransportRequest` | manager、実際の Request、任意のルート上限 | `Promise<HaiResult<{ plaintext, context }>>`、読み取り・容量エラーは throw | `await authenticateTransportRequest(manager, request)` |
| `createTransportErrorResponse` | 時刻・容量エラー、任意の認証済み `{ manager, context }` | `Promise<Response>`、信頼できる context があれば暗号化 | `await createTransportErrorResponse(error)` |
| `TransportBodyTooLargeError` | 上限、任意の観測バイト数・方向・段階 | RangeError 派生、`hai:crypto:070` | `new TransportBodyTooLargeError(1024, 1025)` |
| `TransportTimeError` | 任意の信頼できる context、サーバー Unix ミリ秒 | Error 派生、無効時刻は RangeError | `new TransportTimeError(undefined, Date.now())` |

`TRANSPORT_PROTOCOL`、`TRANSPORT_TIME_LIMITS`、`TRANSPORT_BODY_LIMITS`、`TRANSPORT_PLAINTEXT_RANGE` は定数です。設定読み込みや接続作成は行いません。

<a id="primitive-validation"></a>

### 入力検証と互換性

SM2 の平文は空でない文字列に限ります。不完全・改変された暗号文、誤った秘密鍵、空平文は失敗します。秘密鍵は十六進 64 桁かつ 1～n-2 のスカラーで、署名できない n-1 を除外します。署名は 128 hex に限定し、非正規形式は `ok(false)` です。SM4 を使う transport の空メッセージは引き続き利用できます。

SM3 の hex 入力は完全なバイト単位で、奇数長や無効文字は `INVALID_INPUT` です。HMAC は UTF-8 バイト数で判定し、64 バイトを超える鍵を先に SM3 で処理します。[RFC 2104](https://www.rfc-editor.org/rfc/rfc2104) に従う修正により、以前の非 ASCII 長鍵の誤った結果は変わるため、外部に保存した検証値を再生成してください。transport の 64 バイト ASCII 鍵は影響を受けません。

SM4 は空平文を許可しますが、暗号文は空でない完全な 16 バイト分組で、有効な符号化・PKCS#7・UTF-8 が必要です。不明な mode/encoding は拒否し、Base64 は分割処理で大きい入力を扱います。CBC 自体は認証しないため、HTTP は transport を使います。

パスワード記録は `$hai$iterations$salt$hash` を厳密に解析します。iterations は正規の十進整数 1～1000000、salt は英数字 8～128 文字、hash は小文字 hex 64 桁です。不正記録は `INVALID_INPUT`、正常に生成済みの記録は引き続き有効です。

<a id="transport-protocol"></a>

### Transport v2 の形式と検証順序

Serv、Kit、api-client、ブラウザー・モバイルは同じアプリ層プロトコルを使います。鍵交換の公開鍵は TLS で認証し、IAM 権限と業務の冪等性は別途検証します。POST JSON `{ clientPublicKey }` を登録し、`clientId`、`serverKeyId`、`serverPublicKey`、`maxPlaintextBytes`、任意の `clientKeyTtlSeconds` を返します。公開鍵は有効な SM2 非圧縮点のみで、128 hex または `04` + 128 hex です。

固定 TTL は登録から計測します。クライアントは交換送信時点から計測し、TTL の十分の一、最大 30 秒前に更新します。並行要求は交換を共有し、送信済み要求は送信時のセッションで応答を検証します。TTL 省略時は自動更新期限がなく、独自ストアは `clientKeyTtlSeconds` を宣言できます。

全ノードは同じ秘密の管理鍵リングを使います。新旧鍵を配布し、`activeKeyId` を切り替えてマネージャーを再作成し、移行後に旧 ID を削除して失効させます。旧クライアントは destroy 後に再交換し、完了した可能性のある書き込みを自動再送しません。鍵は保護されたサーバー設定だけに置き、公開 YAML、`PUBLIC_*`、`VITE_*`、ログ、応答に含めません。

封装は厳密に `{ context, direction, status, encryptedKey, ciphertext, iv, tag, signature }` で、context も以下の項目だけを許可します。

```ts
interface Context {
  version: 2
  serverKeyId: string
  clientId: string
  requestId: string
  issuedAt: number
  method: string
  pathHash: string
}
```

鍵 ID は英数字・下線・ハイフン 1–64 文字、クライアント ID は同じ文字種で 1–128 文字です。`requestId` は毎回新しい 128 ビット乱数の小文字 hex 32 桁、`issuedAt` は正の安全な整数の Unix ミリ秒です。`method` は実際の大文字 HTTP メソッドです。`pathHash` は実際の `URL.pathname + URL.search` の SM3 小文字 hex で、入力は UTF-8 8192 バイトまで、クエリーの復号や並べ替えをしません。プロキシは元のパスとクエリーを保ちます。

メッセージごとに独立した SM4 鍵 16 バイト、MAC 鍵 32 バイト、IV 16 バイトを生成します。UTF-8 JSON `[sm4KeyHex, macKeyHex]` を SM2 C1C3C2/hex で暗号化したものが `encryptedKey` です。SM4-CBC は PKCS#7 と hex 暗号文・IV を使います。HMAC の鍵は `macKeyHex` 自体の UTF-8/ASCII 64 バイトで、hex 復号した値ではありません。

認証文字列は次の固定順序配列を空白なしで `JSON.stringify()` した値です。改行は説明用です。

```text
["hai-transport", context.version, direction, context.serverKeyId,
 context.clientId, context.requestId, context.issuedAt, context.method,
 context.pathHash, status, encryptedKey, ciphertext, iv]
```

`tag = HMAC_SM3(authenticatedText, macKeyHex)` は小文字 hex 64 桁です。`JSON.stringify([authenticatedText, tag])` に SM2 の既定値 `hash=true`、`userId=1234567812345678` で署名し、128 hex を得ます。要求はクライアント秘密鍵、direction `request`、status 0 を使います。応答は要求の `serverKeyId` に対応する秘密鍵、direction `response`、実際の HTTP status と要求 context の完全なコピーを使います。

1. 上限内で読み取り、追加の項目を拒否します。ID、メソッド、パスは実際の HTTP Request から取得し、再計算したパスハッシュを比較します。
2. 登録済み公開鍵で SM2 署名を検証し、鍵を復号し、定時間比較で HMAC を検証してから CBC を復号します。未認証値は CBC に渡しません。[RFC 7366](https://www.rfc-editor.org/rfc/rfc7366) の認証後復号の原則に従いますが、これは TLS レコードではありません。HMAC は [RFC 2104](https://www.rfc-editor.org/rfc/rfc2104) に従います。
3. `issuedAt > now + futureSkew` または `now >= issuedAt + maxAge` は拒否します。未来差の境界は含み、失効境界は含みません。認証後だけ `(clientId, requestId)` を原子的に消費し、期限を再確認します。重複、保存失敗、処理中の失効は拒否し、業務失敗でも nonce を戻しません。
4. 結合・署名・MAC が有効な時刻エラーだけに、検証時刻 `serverTime` を含む暗号化 400 / `hai:crypto:071` を返します。HEAD はヘッダーに載せます。クライアントは要求 context の全項目と実際の status を照合してから署名・MAC・復号を行い、時刻・容量診断を信頼します。マーカー欠落、形式違反、関連不一致は拒否し、平文へフォールバックしません。

全メッセージは `X-Encrypted: true`、要求はさらに `X-Client-Id` を付けます。本文を持つメソッドは空平文でも JSON 封装を使います。GET/HEAD は空平文の封装を `X-Hai-Transport` に載せ、本文を付けません。通常応答は JSON、HEAD・204/205/304・実際に本文のない応答は同じヘッダーを使います。ヘッダーと本文に重複して載せません。CORS は同ヘッダーを許可・公開します。平文ルートはサーバーとクライアントで明示的に除外し、Kit に `requireEncryption` / `encryptResponse` の降格設定はありません。

独自アダプターは `await authenticateTransportRequest(manager, request)` 成功後だけ `data.plaintext` を業務へ渡し、`await manager.encryptResponse(data.context, json, status)` で応答を関連付けます。認証済み時刻エラーは信頼できる context を `createTransportErrorResponse()` に渡します。[保持と復旧](../data/crypto.ja.md#transport-state)、[容量とデプロイ](crypto.ja.md#transport-capacity)も参照してください。

未翻訳：詳細な使用例。[中国語の該当節](crypto.md#detailed-workflow)を参照してください。

<a id="call-options"></a>

## 呼び出し引数

以下はコードの引数であり、`_crypto.yml` の項目ではありません。Crypto と借用する cache を先に初期化し、接続の終了はアプリが担当します。

### アルゴリズムの引数

| 項目 | 既定値 | 許容値と動作 |
| --- | --- | --- |
| SM2 `cipherMode` | `1`（C1C3C2） | `0` は C1C2C3。復号でも同じ値を指定。 |
| SM2 `outputFormat` | `hex` | 暗号文の符号化。`hex` または `base64`。 |
| SM2 `hash` | `true` | 署名前にハッシュを計算するか。検証時も一致させる。 |
| SM2 `userId` | `1234567812345678` | 署名者識別子。検証時も同じ値。 |
| SM3 `inputEncoding` | `utf8` | 文字列は `utf8` または `hex`。Uint8Array はバイト列。hex は完全なバイト単位の有効な十六進数。 |
| SM4 `mode` | `cbc` | `cbc`、または既存形式向けの明示的な `ecb`。 |
| SM4 `iv` | CBC でランダム生成 | 十六進 32 桁。暗号化ごとに新しい IV を使用。 |
| SM4 `outputFormat` | `hex` | `hex` または `base64`。 |
| パスワード `saltLength` | `16` | 英数字ソルトの文字数。整数 8–128。 |
| パスワード `iterations` | `10000` | 整数 1–1000000。 |

### 通信サーバー・クライアントの引数

| 引数 | 既定値 | 意味 |
| --- | --- | --- |
| サーバー `serverKeyRing` | 必須 | 信頼できる起動処理から渡す管理鍵 `{ activeKeyId, keys }`。 |
| サーバー `keyStore` | 必須 | `createCacheTransportKeyStore({ cache })` の registry。本番は Redis。 |
| サーバー `maxPlaintextBytes` | 1048576 | 要求・応答の UTF-8 平文バイト数、整数 1024–67108864。宿主は Serv/Kit のファイル値を転送可能。 |
| サーバー `maxFutureSkewSeconds` | 30 | 未来時刻の許容差、整数 0–300 秒。 |
| サーバー `maxRequestAgeSeconds` | 300 | 発行からの有効期間、整数 1–600 秒。 |
| クライアント `keyExchangeUrl` | 必須 | 信頼するサーバーの鍵交換 URL。 |
| クライアント `maxPlaintextBytes` | サーバーに追従 | 明示値があればローカル値と交換値の小さい方。 |
| クライアント `fetch` | グローバル fetch | 本文・キャンセルの契約を守る標準 Fetch 実装。 |

### キャッシュ registry の引数

| 引数 | 既定値 | 意味 |
| --- | --- | --- |
| `cache` | 必須 | 初期化済み `@h-ai/cache`。memory は開発・テスト、本番共有状態は Redis。 |
| `ttlSeconds` | 3600 | 公開鍵の固定寿命、整数 1–86400 秒。読み取りで延長せず、無期限は不可。 |
| `maxRegistrationsPerMinute` | 10000 | 共有 60 秒窓の登録上限、正の安全な整数。 |
| `maxRequestsPerMinute` | 100000 | 共有 60 秒窓の新規要求上限、正の安全な整数。 |

アプリ全体のキャッシュ増加を守る枠で、IP・利用者・経路別の制限とは別です。最初の確保から60秒ごとに登録10000本、新規番号100000件が既定で、上限時503、期限後復旧します。公開鍵や印は消しません。[具体例](../data/crypto.ja.md#transport-state)を参照し、上限を増やす際は Redis メモリも確認します。


窓は最初の書き込みから cache TTL で計測します。CAS で原子的に消費し、元の TTL を保持するため、アプリの時刻差で窓をリセットしません。全ノードで上限を一致させます。満杯・継続的な競合は `hai:crypto:072`、Serv/Kit では 503 とし、自動再送しません。失敗書き込み・並行重複は保守的に枠を消費する場合がありますが、既存 nonce の通常の再送は消費しません。公開鍵・nonce・固定二つのカウンターは全て期限付きです。全キー走査や有効 nonce の追い出しはしません。件数は分単位上限と保持分数で有界となり、既定の公開鍵は最大 61 窓、nonce は最大 17 窓をまたぎます。Redis のメモリ、noeviction、信頼できる永続化も設定してください。

<a id="transport-capacity"></a>

## HTTP 容量とファイル換算

`maxPlaintextBytes` は要求・応答それぞれの JSON 平文全体の UTF-8 バイト数を制限します。既定 1 MiB、整数範囲 1 KiB–64 MiB です。文字列、null、0、負数、小数、無制限は無効です。`auto` は Serv/Kit の宿主設定だけが受け付け、Crypto に渡す前に省略へ正規化します。

`config/_serv.yml` の `transport.maxPlaintextBytes` と `HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES`、または `config/_kit.yml` と `HAI_KIT_TRANSPORT_MAXPLAINTEXTBYTES` で設定します。生成済み API/fullstack テンプレートはマネージャーへ転送します。直接接続では `crypto.transport.createServer()` に渡し、変更後にマネージャーを再作成します。

鍵交換は `manager.bodyLimits.plaintextBytes` を返します。クライアントは指定がなければ追従し、ローカル上限があれば小さい方を使います。独自エンドポイントも `maxPlaintextBytes` を返し、鍵交換本体の 16 KiB 制限は保持します。サーバー上限を下げた場合は直ちに検査され、既存クライアントは再交換で取得します。

`new TextEncoder().encode(JSON.stringify(payload)).byteLength` で測定し、文字数は使いません。Base64 は `4 * ceil(ファイルバイト数 / 3)` 文字に、JSON、名前、エスケープ、他の項目を加えます。4 MiB の XLSX は Base64 本体が `5592408` バイトで、一般的な JSON 包装には平文 8 MiB が使えます。バイナリを UTF-8 と解釈せず、アプリの JSON/Base64 形式を守ります。

`resolveTransportBodyLimits(limit).encryptedPayloadBytes` は十六進 SM4-CBC と認証封装のため `2 * limit + 32768` を返します。平文 8 MiB に対するプロキシ要求上限は `16809984` バイトです。メモリには JSON、Base64、暗号文、認証の中間値も保持されます。元ファイル、展開量、シート・行数、権限、業務の並行数はアプリ側で制限します。

通常ルートは全体上限を使います。Feedback の報告・証拠・添付・ZIP ルートは宿主の `routePlaintextBytes` で `feedback.budget.maxTransportBytes` を宣言し、明示的な宿主値が優先します。`*` は完全な一つのパス区間だけに一致し、重複パターンは小さい上限を使います。鍵交換とデプロイは最大のルート上限を予約します。明示的で 1 MiB を超えるルートは同時 2 件、通常ルートは別に 16 件で、応答完了・失敗時に解放します。満杯なら 503 / `hai:crypto:072` とし、書き込みを自動再送しません。

鍵交換 JSON 16 KiB、公開鍵 4 KiB、認証ヘッダー 16 KiB、パス 8 KiB、交換タイムアウト 30 秒、認証と共有リプレイ防止は独立です。超過時は Content-Length や clone/tee に頼らず元ストリームを停止・キャンセルし reader を解放します。`TransportBodyTooLargeError` は RangeError を継承し、コード `hai:crypto:070` と `direction`、`stage`、`limitBytes`、取得できた `actualBytes` だけを持ちます。段階は `plaintext`・`encrypted`・`header` で、早期停止時の観測値は本文全体より小さい場合があります。

要求超過は 413、認証済み要求に対する応答超過は暗号化した 500 へ置換します。クライアントは認証後に応答診断を復元します。未認証 413 は要求容量エラーとして本文をキャンセルします。api-client は方向・段階・バイト数を保ち `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`）へ変換します。

### デプロイと差分更新

docker-ssh は解決済み `_serv.yml` から Nginx `client_max_body_size` を生成し、要求・応答 buffering を無効にします。応答容量は両端で検査し、ヘッダーバッファーは独立です。SvelteKit は `_kit.yml` から adapter-node の `BODY_SIZE_LIMIT` を導出します。自前プロキシ・起動処理も `resolveTransportBodyLimits()` を使い、外部 CDN・ゲートウェイの上限は運用側で設定します。

全体デプロイは新上限を使います。app を含む差分更新はプロキシ設定も持ち、容量が変われば既存イメージで Web を再作成し、ヘルスチェックと復旧に含めます。新しい Web イメージは不要です。差分では容量指令だけ変更でき、ポート・API ルート・その他のプロキシ変更は全体デプロイが必要です。app 未選択で容量が変わる場合は拒否し、容量が同じなら Web を維持します。[デプロイ](../function/deploy.ja.md)を参照してください。

独自マネージャーとテスト代替は `resolveTransportBodyLimits()` で `bodyLimits` を作り、鍵交換で対応する平文上限を返します。

<a id="browser-support"></a>

## ブラウザー対応

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](crypto.md#browser-support)にあり、この節は部分翻訳です。
