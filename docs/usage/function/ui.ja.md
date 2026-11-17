# @h-ai/ui API リファレンス

<!-- translation: partial -->

[原文（中国語）](ui.md) · [設定](../configuration/ui.ja.md) · [データ構造](../data/ui.ja.md)

<a id="quick-start"></a>

## クイックスタート

公開された UI エントリーポイントからコンポーネントをインポートします。認可と永続化はアプリ側に置きます。画面部品には制御する値とコールバックを渡します。

次のコードを Svelte 5 のページ（例: `+page.svelte`）に書きます。

```svelte
<script lang='ts'>
  import { Button, Card, Input } from '@h-ai/ui'

  let name = $state('')
  let submittedName = $state('')
</script>

<Card title='挨拶をプレビュー'>
  <label for='greeting-name'>名前</label>
  <Input id='greeting-name' bind:value={name} />
  <Button variant='primary' disabled={!name.trim()} onclick={() => { submittedName = name.trim() }}>
    プレビュー
  </Button>
  <p role='status'>
    {#if submittedName}こんにちは、{submittedName}さん。{/if}
  </p>
</Card>
```

`bind:value` は入力欄の文字列を `name` に入れます。`Ada` と入力して「プレビュー」を押すと「こんにちは、Adaさん。」と表示されます。この例ではページの状態だけを更新します。

自動インポートを設定すると、テンプレートで使うコンポーネントの import を省略できます。

```svelte
<Button variant='primary'>プレビュー</Button>
```

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

<a id="api-reference"></a>

## API 一覧

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `autoImportHaiUi` | 対応する UI のインポートをアプリのツール設定に統合。 | `autoImportHaiUi()` |
| `parseMarkdown`, `renderMarkdownDocument`, `highlightCode`, `isLanguageSupported` | Markdown を解析・描画し、言語の確認や構文強調を行う。利用者の入力には信頼できる描画設定を使う。 | `parseMarkdown('# Notes')` |
| `resolveDocumentMarkdownContent`, `resolveDocumentDownloadActions`, `downloadAiDocument` | 文書の表示内容と利用可能なダウンロード操作を解決。 | `downloadAiDocument` |
| `createLocaleStore`, `getGlobalLocale`, `setGlobalLocale`, `detectBrowserLocale`, `isLocaleSupported`, `resolveLocale`, `interpolate` | 言語と翻訳文の置換を管理。SSR ではリクエストごとに分離。 | `createLocaleStore({ defaultLocale: 'ja-JP' })` |
| `applyTheme`, `createThemeBootstrapScript`, `getThemeInfo`, `isDarkTheme`, `normalizeThemeId` | 外観を確認・設定し、描画前にテーマを初期化。 | `applyTheme('dark')` |
| `CrudPage`, `AuthPanel`, `PasswordInput` | 一覧と編集画面、認証操作、制御されたパスワード入力を組み立てる。 | `<AuthPanel {config} {actions} />` |
| `ToolWorkspace`, `ArtifactWorkspace` | 認可済みツールや成果物の版を表示。実行・保存・競合の処理はホストの操作へ渡す。 | `ToolWorkspace` |
| `createGuide` | アプリが定義する操作で案内とヘルプを設定。 | `createGuide({ tours: [] })` |

<a id="tool-workspaces"></a>

## ツールと成果物のワークスペース

ToolWorkspace に、サーバーで絞り込んだカタログ、スキーマ付きフォーム、認可済みの実行関数を渡します。実行の控えを保持し、進捗はホストから読み、指定された取消操作を使います。ArtifactWorkspace には、閲覧可能な本文、版、保存とプレビューの操作を渡します。保存が競合した場合は結果を返し、ユーザーが確認できるよう下書きを残します。

未翻訳：全コンポーネントとプロパティ、導入例、実行時の制約。[中国語の該当節](ui.md#detailed-workflow)を参照してください。

<a id="call-options"></a>

## 呼び出し引数と接続オプション

エクスポートされたコンポーネントとヘルパーで UI を設定します。アプリのテーマ、言語、ガイドは描画時と起動時で一致させます。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `applyTheme(theme, persist)` | Required theme, `true` | テーマを適用し、任意で永続化。 |
| `createThemeBootstrapScript.storageKey`, `defaultThemeId` | Required key, `light` | 共通の保存キーと既定テーマ。`defaultThemeColor`、`colorCssVar`、`toneDatasetKey`、`locale` は任意。 |
| `createLocaleStore.defaultLocale`, `supportedLocales`, `detectBrowser`, `persistKey` | `zh-CN`, built-in locales, `true`, `hai-locale` | 既定の言語、選択方法、保存先を指定。 |
| `createGuide.tours`, `articles`, `persistence`, `persistKey`, `nav`, `waitTimeout` | Required tours (can be empty), optional articles/nav, `cookie`, `hai-guide`, `3000` ms | 案内内容、画面遷移、進捗の保存と待機時間を指定。 |
| `AuthPanel.config`, `actions` | 必須 | アプリが公開認証ポリシーと業務コールバックを渡す。 |

<a id="form-layout-guide"></a>

## フォーム配置と検証

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](ui.md#form-layout-guide)にあり、この節は部分翻訳です。


<a id="toast-options"></a>

## Toast の位置・時間・診断

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](ui.md#toast-options)にあり、この節は部分翻訳です。


<a id="theme-locale-guide"></a>

## テーマ・言語・AI 表示

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](ui.md#theme-locale-guide)にあり、この節は部分翻訳です。
