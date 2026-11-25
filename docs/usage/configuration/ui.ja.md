# @h-ai/ui 設定

<a id="h-aiui-ファイル設定"></a>

[简体中文](ui.md) · [English](ui.en.md)

[設定一覧](README.ja.md) · [コンポーネントと利用例](../function/ui.ja.md#component-catalog) · [ブラウザーの保存領域](../data/ui.ja.md#browser-storage)

<a id="configuration-fields"></a>

## 設定の読み込み

`@h-ai/ui` は Svelte がマウントします。モジュール専用の `config/_ui.yml`、環境変数、初期化処理はありません。スタイルと自動インポートはフロントエンドのビルドで読み込み、テーマ、言語、ガイド、コンポーネントの設定はレイアウトやページから渡します。

| 設定場所 | 読み取り元 | 効果と反映時期 |
| --- | --- | --- |
| `src/app.css` など、フロントエンドの CSS 入口 | Tailwind CSS 4、DaisyUI 5 | UI のクラスとテーマをコンパイルします。配布時は再ビルドし、開発中は開発サーバーがスタイルを更新します。 |
| Vite または Svelte の前処理設定 | Svelte コンパイラー | 必要に応じて `ui.autoImport()` を登録すると、テンプレートのコンパイル時にコンポーネントをインポートします。 |
| ルートレイアウト、HTML シェル、ページ | アプリとブラウザー | テーマ、言語、保存済みの設定を反映し、props とコールバックをコンポーネントに渡します。 |
| `config/_core.yml` の `defaultLocale` | Core と言語 API を使うホストアプリ | アプリが Core に指定したときにサーバーの既定言語に反映されます。SSR の言語はリクエストごとに設定できます。 |

<a id="style-configuration"></a>

## スタイルのビルドとテーマ選択

フロントエンドの CSS 入口で UI のスタイルを読み込みます。単一アプリの `src/app.css` では `@source` をこのファイルからの相対パスで指定します。モノレポのルートに UI をインストールしている場合は、実際の `@h-ai/ui/dist` を指す相対パスに変えてください。Vite プロジェクトでは先に `@tailwindcss/vite` を登録します。

```css
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';
@import '@h-ai/ui/styles/theme.css';
@source '../node_modules/@h-ai/ui/dist';
@plugin 'daisyui' {
  themes: light --default, dark;
}
```

ルートレイアウトでスタイルをインポートすると、初期テーマは `light` になります。`dark` を選ぶとページと標準フォームの配色が変わります。`ThemeSelector.themeIds` で候補を絞る場合は、候補の CSS もビルドに含めてください。モバイルでは必要に応じて `@h-ai/ui/styles/design-tokens.css` と `@h-ai/ui/styles/mobile.css` を読み込みます。[スタイルと自動インポート](../function/ui.ja.md#styles) · [テーマ切替の利用例](../function/ui.ja.md#theme)

Fullstack テンプレートは生成時に `fullstack.theme.defaultTheme` と `fullstack.theme.themes` を読み込みます。既定のテーマは `light` です。リストを省略すると `light`、`dark`、`high-contrast`、`formal`、`eye-care`、`liquid-glass` が採用されます。既定テーマは選択肢にも含まれます。生成後は各フロントエンドの `src/app.css` がテーマをビルドし、共有のテーマストアが選択肢とフォールバックを管理します。[CLI での生成](../function/cli.ja.md)

<a id="runtime-preferences"></a>

## 実行時の設定

- **テーマ**。`ui.getSavedTheme(fallback)` で保存済みのテーマ ID を読み取り、`ui.applyTheme(id)` で適用して保存します。Svelte の読み込み前に HTML シェルで復元する場合は、`ui.createThemeBootstrapScript(options)` に JSON 設定専用の保存キーを指定します。
- **言語**。ブラウザーの `ui.createLocaleStore(options)` は利用可能な保存値、ブラウザーの優先言語、既定値の順に確認します。Paraglide のアプリ文言にはアプリの `setLocale` も呼び出します。サーバーでは `core.i18n.runWithLocale` または `kit.i18n.runWithLocale` で描画を包みます。
- **ガイドとコンポーネント**。レイアウトで `ui.createGuide(options)` を呼び、ページのコンポーネントに props とコールバックを渡します。保存方式、コピー、アップロード、検索はこれらの指定に従います。サービスの URL、認可、永続化はアプリが管理します。

[Core の既定言語](core.ja.md) · [Kit のリクエスト言語](../function/kit.ja.md#hooks) · [呼び出し引数](../function/ui.ja.md#call-options)
