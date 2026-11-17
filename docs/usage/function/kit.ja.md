# @h-ai/kit API リファレンス

<!-- translation: partial -->

[原文（中国語）](kit.md) · [設定](../configuration/kit.ja.md) · [データ構造](../data/kit.ja.md)

<a id="quick-start"></a>

## クイックスタート

Kit は SvelteKit のフック、ルートハンドラー、ブラウザークライアントで使います。サーバーコードはルートを保護し、入力を検証し、業務結果を HTTP レスポンスに変換します。

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

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

<a id="api-reference"></a>

## API 一覧

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `kit.createHandle`, `kit.sequence`, `kit.handler` | フックの作成、順番のある合成、またはルートハンドラーのラップ。 | `kit.sequence(first, second)` |
| `kit.guard.check`, `require`, `requireSensitive` | 認可を確認し、通常または機密操作のアクセスを制御。 | `kit.guard.require(session, permission)` |
| `kit.response.ok`, `created`, `noContent`, `error`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `validationError`, `internalError`, `redirect`, `fromResult`, `fromError` | HTTP レスポンスを作成、または業務結果・エラーをステータスと本体へ変換。 | `kit.response.fromResult(result)` |
| `kit.validate.body`, `query`, `params`, `IdParamSchema`, `PaginationQuerySchema` | スキーマでリクエストを検証し、型付きの入力を返す。 | `await kit.validate.body(request, schema)` |
| `kit.client.create`, `createAuthActions`, `installBrowserTransport`, `installBrowserTransportFetch` | 同一オリジンのクライアントを作成し、認証または暗号化 Fetch を組み込む。 | `kit.client.create()` |
| `kit.auth.publicPaths` | 認証ガードで使う公開認証パスを取得。 | `kit.auth.publicPaths` |

未翻訳：SvelteKit フック、セッションガード、暗号化 Fetch の接続手順。[中国語の該当節](kit.md#detailed-workflow)を参照してください。

<a id="host-options"></a>

## フック引数と実行時の依存

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](kit.md#host-options)にあり、この節は部分翻訳です。
