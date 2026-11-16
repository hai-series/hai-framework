# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md)

`@h-ai/kit` は、SvelteKit でのリクエスト処理、認証、API の実装を支援します。ページと API を同じサイトから提供する場合、ブラウザーはそのサイトのアドレスで API を呼び出せます。

SvelteKit のサーバーでは `@h-ai/kit` から `kit` をインポートし、`kit.createHandle()` でリクエスト処理関数を作成します。ブラウザーで同じパッケージをインポートすると、HTTP クライアント、一覧やフォームの補助機能、ページのトークン、既定言語の設定が使えます。型はサーバーで `KitFunctions`、ブラウザーで `BrowserKitFunctions` です。`AuthCookieWriter` はログイン後などにサーバーが現在のレスポンスに Cookie を設定するためのメソッドを定義します。

- `kit.createHandle()`：セッション解析、ルートガード、middleware チェーン、任意の通信・Cookie 暗号化。
- `kit.handler()`：API endpoint の例外処理境界。
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> クロスプラットフォームの公開 HTTP contract は `@h-ai/api-contract` で定義し、`@h-ai/serv` にマウント、`@h-ai/api-client` の型付きクライアントで呼び出します。`@h-ai/kit` は業務 API contract を定義・提供しません。

## クイックスタート

`kit.sequence()` で複数の SvelteKit ハンドラーを組み合わせると、生成したページは内側のハンドラーから外側への順に変換されます。複数のハンドラーが `preload` やシリアル化するレスポンスヘッダーのフィルターを指定した場合は、最初の設定が使われます。言語ミドルウェアはこの処理の中で HTML の `lang` 属性を更新できます。

### インストール

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite @tailwindcss/vite tailwindcss
```

### プロジェクト設定

**vite.config.ts**：

```ts
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      preprocess: [
        vitePreprocess()
      ],
      compilerOptions: { runes: true },
      // 绝对路径保持 SSR 与浏览器端认证、加密路径一致。
      paths: { base: '', relative: false },
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['bits-ui']
  },
  ssr: {
    noExternal: ['@h-ai/ui', '@h-ai/kit'],
    external: ['@h-ai/core', 'sm-crypto']
  },
})
```

Crypto または Kit/IAM を使う場合、アプリの本番依存に `sm-crypto@0.5.8` を含めます。CLI 生成済みのプロジェクトでは設定済みです。手動導入は `pnpm add sm-crypto@0.5.8` を実行してください。adapter-node は直接の本番依存も参照するため、external 指定だけでは不十分です。

## 設定一覧

生成したプロジェクトでは、待ち受けアドレスとポートを `config/_kit.yml` に記述します。アクセス制限と暗号化の設定を `kit.createHandle(options)` に渡し、返された関数を SvelteKit のサーバーフックとして使います。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/kit.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/kit.md)（中国語）を参照してください。

- `kit.createHandle` / `kit.sequence` / `kit.middleware` / `kit.guard` / `kit.handler` — SvelteKit のリクエスト処理、ルート、権限チェックをまとめる
- `kit.response` / `kit.validate` / `kit.crud` / `kit.i18n` — 入力検証、レスポンス、CRUD 定義、ローカライズ処理
- `kit.auth` / `kit.client` / `kit.createFeedbackHandler` — ブラウザーのログイン状態とリクエストを扱い、フィードバックを受け付ける HTTP エンドポイントを作る
- `@h-ai/kit/adapter` / `@h-ai/kit/crypto` / `@h-ai/kit/a2a` — ビルドアダプター、暗号化通信、A2A ルートの設定

## データ構造

モジュール独自のデータベーステーブルは作成しません。

リクエストコンテキスト、Cookie、アプリ側の永続化については[データ構造](../../docs/usage/data/kit.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/kit test
```

Kit に共通の init/close はありません。共有 cache・IAM・crypto はアプリが初期化と終了を管理します。型検査できる例は [JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。認証は iam.auth.verifyToken で検証し、空でない token だけでは許可しません。

## ライセンス

Apache-2.0
