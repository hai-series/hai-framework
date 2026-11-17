# @h-ai/ui API reference

<!-- translation: partial -->

[Chinese source](ui.md) · [Configuration](../configuration/ui.en.md) · [Data structures](../data/ui.en.md)

<a id="quick-start"></a>

## Quick start

Import components through the public UI entry points. Keep authorization and persistence in the application. Supply controlled values and callbacks for interactive scenes.

```svelte
<script>
  import { Button, Card, Input } from '@h-ai/ui'
</script>

<Card title='示例表单'>
  <Input placeholder='请输入用户名' />
  <Button variant='primary' onclick={handleSubmit}>提交</Button>
</Card>
```

```svelte
<!-- 无需 import { Button } from '@h-ai/ui' -->
<Button variant='primary'>提交</Button>
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

Additional options and workflow examples are available in the [Chinese reference](ui.md).
