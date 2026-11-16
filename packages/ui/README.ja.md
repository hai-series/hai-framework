# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

内蔵メッセージは `zh-CN`、`en-US`、`ja-JP` に対応し、言語セレクターは既定で3言語を表示します。

Svelte 5 Runes のクロスプラットフォーム UI ライブラリーです。DaisyUI v5 + Tailwind CSS v4 のスタイル、Bits UI v2 のヘッドレス UI、内蔵 i18n（zh-CN / en-US / ja-JP）、15 種類の厳選テーマ、ハイコントラスト、直角ビジネス、目にやさしいテーマを提供します。

HTTP/UI 境界で業務メッセージを公開するのは、明示された有効な4xx状態のみです。`httpStatus` が未指定または不正な場合は500として安全なメッセージを返します。独自の業務エラーには完全なエラー定義または明示的な状態を指定してください。

## クイックスタート

### インストール

```bash
npm install @h-ai/ui @h-ai/core
```

Node サーバーでは UI と core の両方を本番依存に含め、ログなどのネイティブ依存を通常どおり読み込めるようにします。

### 1. package.json のアプリ内インポートを設定

```json
{ "imports": { "#lib/*": "./src/lib/*" } }
```

### 2. vite.config.ts を設定

SvelteKit 3 の前処理、コンパイラー、アダプターは Vite プラグインで設定します。通常の Svelte/Vite プロジェクトのみ svelte.config.js を保持します。

`vitePreprocess()` などのスタイル・テンプレート言語変換を先に、`autoImportHaiUi()` を後に実行してください。自動 import は Svelte 全体の AST を読み取るため、変換前の SCSS・Pug などの非標準構文は受け付けません。直接の markup API は同期のままです。

```ts
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: [
        vitePreprocess(),
        autoImportHaiUi()
      ],
      compilerOptions: { runes: true },
      adapter: adapter(),
      paths: { relative: false },
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: [...haiOptimizeExclude],
    include: [...haiPrebundledDeps]
  },
  ssr: {
    noExternal: ['@h-ai/ui', '@h-ai/kit'],
    external: ['@h-ai/core', 'sm-crypto']
  },
})
```

### 3. src/app.css の設定

Crypto または Kit/IAM を使うアプリでは `sm-crypto@0.5.8` を本番依存に追加します。CLI は設定済みです。手動導入では `pnpm add sm-crypto@0.5.8` を実行してください。external だけでは不十分で、adapter-node がネイティブ解決を維持するには直接の本番依存が必要です。

```css
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';
@import '@h-ai/ui/styles/theme.css';
@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
@source "../../../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";

@plugin "daisyui" {
  themes:
    light --default,
    dark --prefersdark,
    cupcake,
    emerald,
    corporate,
    nord,
    dracula,
    night;
}

/* 图标（可选） */
@plugin "@iconify/tailwind4" {
  prefixes: tabler;
}
```

> `@source` で TailwindCSS に `@h-ai/ui` の class を走査させます。ない場合はスタイルが欠落します。monorepo 内のアプリでは依存がルート `node_modules` に置かれる場合があるため、両方のパスを残すことを推奨します。

### 4. コンポーネントの使用

```svelte
<script>
  import { Button, Card, Input } from '@h-ai/ui'
</script>

<Card title='示例表单'>
  <Input placeholder='请输入用户名' />
  <Button variant='primary' onclick={handleSubmit}>提交</Button>
</Card>
```

自動 import を有効にすると、個別の import なしでテンプレートから使えます：

```svelte
<!-- 无需 import { Button } from '@h-ai/ui' -->
<Button variant='primary'>提交</Button>
```

> `toast`・型 import・DOM の `Range` と衝突する `Range` を除き、公開 Svelte コンポーネントは `@h-ai/ui/auto-import` で自動注入できます。

管理画面など一部のコンポーネントを使うページは、公開コンポーネントディレクトリーの入口から直接 import できます。テーマツールは軽量な `@h-ai/ui/theme` から読み込み、テーマの利用だけでルート入口の AI・グラフコンポーネントを読み込まないようにします。ストアの言語ツールは `@h-ai/ui/i18n` から読み込み、コンポーネントやガイド CSS を読み込みません。インストール済みパッケージの exports を確認し、内部 `src/`・`dist/` は import しないでください。

自動 import はテンプレート AST で実際に使用するコンポーネントだけを対象とし、コメント、textarea、スクリプト文字列内の例では import しません。スクリプトの宣言と each・await・snippet の局所バインドを優先します。セミコロンなし、複数行、別名の実際の import を構文木で認識し、既存の実行時バインドを重複させません。ルート入口 `@h-ai/ui` の型のみのコンポーネントは必要時に値へ昇格します。他モジュールの同名の型を安全に統合できない場合、ファイル名とコンポーネント名を含むビルドエラーになります。型に別名を付けるか、コンポーネントを別のローカル名で明示的に import してください。

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

## 設定一覧

コンポーネントの動作は props で指定し、アプリ全体のテーマ、言語、オンボーディングは公開 API で設定します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/ui.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/ui.md)（中国語）を参照してください。

- **基本・複合・レイアウトコンポーネント** — 入力、フォーム、テーブル、ダイアログ、レイアウト
- **業務コンポーネント** — CRUD、IAM、フィードバック、ファイル、グラフ、AI コンテンツ、コードワークスペース
- `@h-ai/ui/theme` / `@h-ai/ui/i18n` / `@h-ai/ui/toast` / `@h-ai/ui/guide` — 外観、言語、通知、オンボーディングの管理
- `@h-ai/ui/vite` / `@h-ai/ui/auto-import` — Vite の依存関係と自動インポートの設定

## データ構造

モジュール独自のデータベーステーブルは作成しません。

テーマ、言語、ガイド進捗、コンポーネント状態の管理範囲については[データ構造](../../docs/usage/data/ui.md)（中国語）を参照してください。

## 開発とテスト

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## ライセンス

Apache-2.0
