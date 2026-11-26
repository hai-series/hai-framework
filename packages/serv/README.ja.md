# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/ai](../ai/README.ja.md) · [@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md) · [@h-ai/storage](../storage/README.ja.md)

hai-framework の API サービスランタイム。公開 HTTP App 抽象を通じて `@h-ai/api-contract` を複数プラットフォームから使える HTTP API として提供します。Hono は内部実装です。

`@h-ai/serv` から `serv` をインポートし、`serv.createApp()` で HTTP アプリを作成して `serv.listen()` で待ち受けを開始します。独自のラッパーの型を指定する場合は、同じ入口から `ServFunctions` をインポートできます。

## クイックスタート

`pnpm add @h-ai/serv` でインストールします。

[最小構成の導入手順](../../docs/usage/getting-started/serv.ja.md#quick-start)を参照してください。 [依存関係と初期化順序](../../docs/usage/function/serv.ja.md#module-dependencies)を参照してください。

## 設定一覧

生成したプロジェクトでは、HTTP の設定、待ち受けアドレス、ポートを `config/_serv.yml` に記述します。起動時に HTTP の設定、契約、処理関数を `serv.createApp(options)` に渡し、返されたアプリケーションをアドレスとポートとともに `serv.listen()` に渡します。

アクセス規則と信頼済みプロキシは `http.access` と `http.trustedProxies` に設定します。通信暗号化が有効な場合、`transport.keyExchangePath` はオリジン直下からの絶対パスで、既定値は `/api/v1/_hai/key-exchange` です。

待ち受け、HTTP、CORS、通信暗号化の項目と配置例は[設定一覧](../../docs/usage/configuration/serv.ja.md)を参照してください。SvelteKit サイトの設定は [Kit の設定一覧](../../docs/usage/configuration/kit.ja.md)を参照してください。

アクセス制御、信頼済みプロキシ、レート制限は `http` 配下で設定します。`http.rateLimit` を有効にするときは計数ストアを渡します。 [レート制限の利用例](../../docs/usage/function/serv.ja.md#rate-limit-example)

## 機能

`serv.storageAssets()` は公開ファイルを読み取り専用で配信し、GET 応答のヘッダーと本文を一度の Storage 読み取りから取得します。

[API 一覧](../../docs/usage/function/serv.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

- チャットの返信を逐次表示し、書式の好みを保存し、商品イラストを生成できます。 [ストリーミングチャット](../../docs/usage/function/serv.ja.md#ai-streaming-procedures-api) · [記憶の書き込み](../../docs/usage/function/serv.ja.md#ai-memory-write-procedures-api) · [音声と画像の生成](../../docs/usage/function/serv.ja.md#ai-media-procedures-api)
- 権限付きの監査担当者に音声チケットを発行し、レポート要約を再生します。 [IAM 音声の組み立て](../../docs/usage/function/serv.ja.md#iam-audio-api)
- 管理画面にロール権限や API キーの管理、非公開ファイルの中継、支払い注文のクローズを登録できます。 [IAM の管理](../../docs/usage/function/serv.ja.md#iam-management-procedures-api) · [ファイルの中継](../../docs/usage/function/serv.ja.md#storage-transfer-procedures-api) · [支払い注文のクローズ](../../docs/usage/function/serv.ja.md#payment-close-order-procedures-api)
- 登録した操作ごとに multipart、ファイル、SSE の本文上限を設定します。 [ファイルとストリーミングのルート](../../docs/usage/function/serv.ja.md#http-contract-extensions)
- `serv.createContractHandler()` で同じ注文 API を Kit にマウントできます。A2A の処理器、アクセスルール、頻度制限を両ホストで共用します。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

セッション Cookie、静的ファイル、リクエストのデータの保存先については[データ構造](../../docs/usage/data/serv.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

公開 API の JSDoc 例は `@h-ai/serv` からインポートします。内部 Hono・guard・router・transport は「模块内部上下文」と明記し、ルート API として扱いません。起動設定の例外、業務 HaiResult、HTTP middleware の status、listener の Promise<void> 終了を区別し、既定の AI completion は非ストリーミング JSON のままです。保守時は `node scripts/check-module-jsdoc.mjs --package serv` で実際の宣言と内部スコープに対して例をコンパイルします。実 HTTP、認可、共有リプレイ防止の検証を代替しません。

## ライセンス

Apache-2.0
