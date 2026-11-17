# @h-ai/ui Configuration

[Chinese source](ui.md) · [Data structures](../data/ui.en.md) · [API reference](../function/ui.en.md)

Configure UI through the exported components and helper options. Keep app-specific theme, locale and guide options consistent between rendering and bootstrap.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `applyTheme(theme, persist)` | Required theme, `true` | Apply a theme and optionally persist it. |
| `createThemeBootstrapScript.storageKey`, `defaultThemeId` | Required key, `light` | Choose the shared storage key and default theme. `defaultThemeColor`, `colorCssVar`, `toneDatasetKey` and `locale` are optional. |
| `createLocaleStore.defaultLocale`, `supportedLocales`, `detectBrowser`, `persistKey` | `zh-CN`, built-in locales, `true`, `hai-locale` | Control default language, selection and storage. |
| `createGuide.tours`, `articles`, `persistence`, `persistKey`, `nav`, `waitTimeout` | Required tours (can be empty), optional articles/nav, `cookie`, `hai-guide`, `3000` ms | Configure onboarding content, navigation, persistence and wait time. |
| `AuthPanel.config`, `actions` | Required | The app supplies public authentication policies and the business callbacks. |
