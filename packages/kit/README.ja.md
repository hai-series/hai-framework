# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md)

`@h-ai/kit` は hai-framework の SvelteKit 統合モジュールで、共通のリクエストパイプラインと同一オリジンの endpoint ツールを提供します：

実行時の操作は `kit.xx` を使います。公開名前空間の型はサーバー側の `KitFunctions` とブラウザー側の `BrowserKitFunctions` です。ブラウザー条件入口では client、CRUD、ページ内 Token、既定の言語操作だけを利用できます。`AuthCookieWriter` はサーバー認証が現在のリクエストの Cookie に書き込む最小契約です。内部 helper を import せずに、再エクスポートしたメソッドや名前空間の宣言を生成できます。

- `kit.createHandle()`：セッション解析、ルートガード、middleware チェーン、任意の通信・Cookie 暗号化。
- `kit.handler()`：API endpoint の例外処理境界。
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> クロスプラットフォームの公開 HTTP contract は `@h-ai/api-contract` で定義し、`@h-ai/serv` にマウント、`@h-ai/api-client` の型付きクライアントで呼び出します。`@h-ai/kit` は業務 API contract を定義・提供しません。

## クイックスタート

`sequence` は SvelteKit の resolve オプションを保持します。ページ変換は内側から外側へ実行し、preload とシリアライズ対象ヘッダーのフィルターは最初の設定を優先します。

### インストール

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
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

生成プロジェクトは `config/_kit.yml` を使用します。解析済み設定を SvelteKit のフック、クライアント、ビルドアダプターに渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/kit.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/kit.md)（中国語）を参照してください。

- `createHandle` / `sequence` / `middleware` / `guard` / `handler` — SvelteKit のフック、エンドポイント、権限チェックを組み立て
- `response` / `validate` / `crud` / `i18n` — 入力検証、レスポンス、CRUD 定義、ローカライズ処理
- `auth` / `client` / `createFeedbackHandler` — 認証、ブラウザークライアント、フィードバック API の接続
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
