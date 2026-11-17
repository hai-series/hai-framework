# @h-ai/ui 設定

[原文（中国語）](ui.md) · [データ構造](../data/ui.ja.md) · [API リファレンス](../function/ui.ja.md)

エクスポートされたコンポーネントとヘルパーで UI を設定します。アプリのテーマ、言語、ガイドは描画時と起動時で一致させます。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `applyTheme(theme, persist)` | Required theme, `true` | テーマを適用し、任意で永続化。 |
| `createThemeBootstrapScript.storageKey`, `defaultThemeId` | Required key, `light` | 共通の保存キーと既定テーマ。`defaultThemeColor`、`colorCssVar`、`toneDatasetKey`、`locale` は任意。 |
| `createLocaleStore.defaultLocale`, `supportedLocales`, `detectBrowser`, `persistKey` | `zh-CN`, built-in locales, `true`, `hai-locale` | 既定の言語、選択方法、保存先を指定。 |
| `createGuide.tours`, `articles`, `persistence`, `persistKey`, `nav`, `waitTimeout` | Required tours (can be empty), optional articles/nav, `cookie`, `hai-guide`, `3000` ms | 案内内容、画面遷移、進捗の保存と待機時間を指定。 |
| `AuthPanel.config`, `actions` | 必須 | アプリが公開認証ポリシーと業務コールバックを渡す。 |
