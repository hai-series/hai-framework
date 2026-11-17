# @h-ai/crypto API リファレンス

<!-- translation: partial -->

[原文（中国語）](crypto.md) · [設定](../configuration/crypto.ja.md) · [データ構造](../data/crypto.ja.md)

<a id="quick-start"></a>

プロバイダーを使う前に Crypto を初期化します。設定と鍵は信頼できる起動処理から取得します。サーバーや Fetch クライアントに暗号化を組み込むには通信マネージャーを使います。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `crypto.init`, `close`, `isInitialized` | 初期化、終了、準備状況の確認。 | `crypto.isInitialized` |
| `crypto.asymmetric.generateKeyPair`, `encrypt`, `decrypt`, `sign`, `verify`, `isValidPublicKey`, `isValidPrivateKey` | 鍵生成、暗号化・復号、署名・検証、鍵形式の確認。 | `crypto.asymmetric.generateKeyPair()` |
| `crypto.symmetric.generateKey`, `generateIV`, `encrypt`, `decrypt`, `encryptWithIV`, `decryptWithIV`, `isValidKey`, `isValidIV` | 鍵や IV の生成・検証と共通鍵暗号の処理。 | `crypto.symmetric.generateKey()` |
| `crypto.hash.hash`, `hmac`, `verify`, `crypto.password.hash`, `verify` | ハッシュ、鍵付きハッシュ、パスワードハッシュを計算・検証。 | `await crypto.password.hash(password)` |
| `crypto.transport.createServer`, `createClient`, `protocol` | サーバー管理オブジェクトとクライアントセッションを作成。共通通信仕様は `protocol`。 | `crypto.transport.createClient(options)` |
| `manager.getServerKeyId`, `getServerPublicKey`, `registerClientKey`, `getClientPublicKey`, `decryptRequest`, `encryptResponse`, `close` | 通信鍵の取得・登録、リクエストとレスポンスの処理、終了。 | `manager.getServerPublicKey()` |
| `session.init`, `encryptedFetch`, `ready`, `destroy` | 暗号化セッションを確立・終了し、セッションを通して送信。 | `await session.encryptedFetch(url)` |

追加の設定項目や利用例は[中国語リファレンス](crypto.md)に掲載しています。
