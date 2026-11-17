# @h-ai/ui API reference

<!-- translation: partial -->

[Chinese source](ui.md) · [Configuration](../configuration/ui.en.md) · [Data structures](../data/ui.en.md)

<a id="quick-start"></a>

## Quick start

Import components through the public UI entry points. Keep authorization and persistence in the application. Supply controlled values and callbacks for interactive scenes.

Put this in a Svelte 5 page, such as `+page.svelte`.

```svelte
<script lang='ts'>
  import { Button, Card, Input } from '@h-ai/ui'

  let name = $state('')
  let submittedName = $state('')
</script>

<Card title='Preview a greeting'>
  <label for='greeting-name'>Name</label>
  <Input id='greeting-name' bind:value={name} />
  <Button variant='primary' disabled={!name.trim()} onclick={() => { submittedName = name.trim() }}>
    Preview
  </Button>
  <p role='status'>
    {#if submittedName}Hello, {submittedName}.{/if}
  </p>
</Card>
```

`bind:value` writes the text input to `name`. Type `Ada` and select **Preview** to see “Hello, Ada.”. This example updates only the page state.

With the auto-import plugin configured, a component used in a template can be imported automatically:

```svelte
<Button variant='primary'>Preview</Button>
```

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `autoImportHaiUi` | Integrate supported UI imports in the application tooling. | `autoImportHaiUi()` |
| `parseMarkdown`, `renderMarkdownDocument`, `highlightCode`, `isLanguageSupported` | Parse/render content and check or apply syntax highlighting. Use trusted rendering settings for user-provided text. | `parseMarkdown('# Notes')` |
| `resolveDocumentMarkdownContent`, `resolveDocumentDownloadActions`, `downloadAiDocument` | Resolve document presentation and permitted download actions. | `downloadAiDocument` |
| `createLocaleStore`, `getGlobalLocale`, `setGlobalLocale`, `detectBrowserLocale`, `isLocaleSupported`, `resolveLocale`, `interpolate` | Manage locales and interpolate messages. Scope SSR locale by request. | `createLocaleStore({ defaultLocale: 'ja-JP' })` |
| `applyTheme`, `createThemeBootstrapScript`, `getThemeInfo`, `isDarkTheme`, `normalizeThemeId` | Inspect or apply appearance and initialize the theme before rendering. | `applyTheme('dark')` |
| `CrudPage`, `AuthPanel`, `PasswordInput` | Compose list and edit screens, connect authentication actions or bind a controlled password input. | `<AuthPanel {config} {actions} />` |
| `ToolWorkspace`, `ArtifactWorkspace` | Display authorized tools or artifact versions and call host operations for execution, saving and conflicts. | `ToolWorkspace` |
| `createGuide` | Set up tours and help content with application-defined actions. | `createGuide({ tours: [] })` |

<a id="tool-workspaces"></a>

## Tool and artifact workspaces

Provide ToolWorkspace with a server-filtered catalog, schema-backed forms and authorized execution callbacks. Keep the job receipt, read progress from the host and use the supplied cancellation action. Provide ArtifactWorkspace with the authorized content, versions, save and preview operations. When a save conflicts, return the conflict and keep the current draft for review.

Still untranslated: the full component and property catalog, integration examples and runtime constraints. Read the [Chinese source section](ui.md#detailed-workflow).

<a id="call-options"></a>

## Call arguments and integration options

Configure UI through the exported components and helper options. Keep app-specific theme, locale and guide options consistent between rendering and bootstrap.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `applyTheme(theme, persist)` | Required theme, `true` | Apply a theme and optionally persist it. |
| `createThemeBootstrapScript.storageKey`, `defaultThemeId` | Required key, `light` | Choose the shared storage key and default theme. `defaultThemeColor`, `colorCssVar`, `toneDatasetKey` and `locale` are optional. |
| `createLocaleStore.defaultLocale`, `supportedLocales`, `detectBrowser`, `persistKey` | `zh-CN`, built-in locales, `true`, `hai-locale` | Control default language, selection and storage. |
| `createGuide.tours`, `articles`, `persistence`, `persistKey`, `nav`, `waitTimeout` | Required tours (can be empty), optional articles/nav, `cookie`, `hai-guide`, `3000` ms | Configure onboarding content, navigation, persistence and wait time. |
| `AuthPanel.config`, `actions` | Required | The app supplies public authentication policies and the business callbacks. |

<a id="form-layout-guide"></a>

## Form layout and validation

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](ui.md#form-layout-guide); this subsection is partially translated.


<a id="toast-options"></a>

## Toast placement, duration and diagnostics

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](ui.md#toast-options); this subsection is partially translated.


<a id="theme-locale-guide"></a>

## Themes, locales and AI content

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](ui.md#theme-locale-guide); this subsection is partially translated.
