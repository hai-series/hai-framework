# Crypto の設定ファイル

[中国語](crypto.md) · [English](crypto.en.md)

[設定手冊](README.ja.md)

Crypto に独立した `config/_crypto.yml` はなく、`crypto.init()` はファイル設定を受け取りません。アルゴリズム、通信マネージャー、registry の TTL・上限はコードの引数です。[呼び出し引数](../function/crypto.ja.md#call-options)を参照してください。

HTTP のファイル設定は `config/_serv.yml` と `config/_kit.yml` です。[Serv](serv.ja.md) と [Kit](kit.ja.md)、キャッシュ接続は [Cache](cache.ja.md) を参照してください。秘密鍵は信頼できるサーバー起動処理から渡し、公開設定には置きません。
