# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/ai](../ai/README.ja.md) · [@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md) · [@h-ai/storage](../storage/README.ja.md)

hai-framework の API サービスランタイム。公開 HTTP App 抽象を通じて `@h-ai/api-contract` を複数プラットフォームから使える HTTP API として提供します。Hono は内部実装です。

`@h-ai/serv` から `serv` をインポートし、`serv.createApp()` で HTTP アプリを作成して `serv.listen()` で待ち受けを開始します。独自のラッパーの型を指定する場合は、同じ入口から `ServFunctions` をインポートできます。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/serv.ja.md#quick-start)を参照してください。

## 設定一覧

生成したプロジェクトでは、HTTP の設定、待ち受けアドレス、ポートを `config/_serv.yml` に記述します。起動時に HTTP の設定、契約、処理関数を `serv.createApp(options)` に渡し、返されたアプリケーションをアドレスとポートとともに `serv.listen()` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/serv.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/serv.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

セッション Cookie、静的ファイル、リクエストのデータの保存先については[データ構造](../../docs/usage/data/serv.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

宣言の JSDoc 例は実在する `@h-ai/serv` または公開 features サブパスから import します。内部 Hono・guard・router・transport は「模块内部上下文」と明記し、ルート API として扱いません。起動設定の例外、業務 HaiResult、HTTP middleware の status、listener の Promise<void> 終了を区別し、既定の AI completion は非ストリーミング JSON のままです。保守時は `node scripts/check-module-jsdoc.mjs --package serv` で実際の宣言と内部スコープに対して例をコンパイルします。実 HTTP、認可、共有リプレイ防止の検証を代替しません。

## ライセンス

Apache-2.0
