# @h-ai/crypto 設定

<!-- translation: partial -->

[原文（中国語）](crypto.md) · [データ構造](../data/crypto.ja.md) · [API リファレンス](../function/crypto.ja.md)

暗号プリミティブはコードで設定します。アルゴリズム固有の設定と秘密鍵はアプリが管理します。HTTP 通信ではレジストリ付きのサーバー・クライアント管理機能を使用します。

```yaml schema=@h-ai/serv:ServConfigSchema
transport:
  maxPlaintextBytes: 25165824
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `createInMemoryKeyStore(maxClients?)` | `10000` | 開発または単一プロセスのテスト向け。上限では最も古い公開鍵を除去。 |
| `createRedisTransportKeyStore({ cache })` | 必須 | 初期化済み Redis を通信状態の共有に使用。 |
| `createReldbTransportKeyStore({ reldb })` | 必須 | 初期化済み RelDB を使用。 |
| `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` | 省略可 | サーバーで JSON の鍵リングを読み込み、`parseTransportServerKeyRing()` で検証。 |

未翻訳：プロバイダー制限、通信本文の予算、鍵ストアの設定。[中国語の該当節](crypto.md#configuration-fields)を参照してください。
