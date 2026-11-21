# Crypto の設定ファイル

[中国語](crypto.md) · [English](crypto.en.md)

[設定手冊](README.ja.md)

Crypto に独立した `config/_crypto.yml` はなく、`crypto.init()` はファイル設定を受け取りません。アルゴリズム、通信マネージャー、registry の TTL・上限はコードの引数です。[呼び出し引数](../function/crypto.ja.md#call-options)を参照してください。

HTTP のファイル設定は `config/_serv.yml` と `config/_kit.yml` です。[Serv](serv.ja.md) と [Kit](kit.ja.md)、キャッシュ接続は [Cache](cache.ja.md) を参照してください。本番の秘密鍵は信頼できるサーバー起動処理から渡し、公開設定には置きません。

サンプルアプリは `.env.dev` と `.env.test` の `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` を読みます。サンプル専用鍵はコミットでき、クローン後にテストスクリプトが代替鍵を補う必要はありません。本番は別の非公開鍵を `.env.prod.local` または Secret Manager で配布します。どの環境でも実際の鍵を検証し、欠落、不正、鍵ペア不一致は起動失敗になります。
