# @h-ai/ui Data Structures

[简体中文](ui.md) · [日本語](ui.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/ui.en.md) · [Components and examples](../function/ui.en.md#component-catalog)

When a user returns to a page, the browser can restore the theme, language, guide progress and drawer width. UI creates no database tables, Redis keys or business files. The host application owns search, upload, authorization and business records.

## Browser storage

| Key | Location and value | Reader, writer and lifetime |
| --- | --- | --- |
| `theme` | Theme ID string in localStorage, for example `dark` | `ui.applyTheme(id)` writes by default. `ui.getSavedTheme(fallback)` reads it and defaults to `light`. The value has no automatic expiry. |
| Host-defined `storageKey` | JSON object in localStorage containing `themeId`, with optional color and a host-named locale field | The HTML shell script from `ui.createThemeBootstrapScript(options)` loads and normalizes the values. The host synchronizes changes made within the page. The value has no automatic expiry. |
| `hai-locale` | Locale code in localStorage. Override the key with `createLocaleStore({ persistKey })`. | The browser reads it on initialization and writes it when the store's `set(locale)` runs. The SSR store does not access it. The value has no automatic expiry. |
| `<persistKey>:<scope>:<id>` | JSON guide progress. Defaults to a cookie. localStorage and controller memory are also available. | The default prefix is `hai-guide`, the default scope is `anonymous`, and `id` identifies the tour. The default cookie expires after one year. Use `guide.reset(id)` to clear progress in the current scope. |
| `<persistKey>-pending` | Pending guide as JSON in sessionStorage | Written before cross-route navigation and consumed on resume. It starts the tour only within five minutes and if scope and destination match. |
| `Drawer.widthStorageKey` or `hai-ui:crud:<resource.name>:drawer-width` | Pixel width as a decimal string in localStorage | Read when side or detail drawer resizing is enabled and written after drag and keyboard resizing. CrudPage shares a key between the edit and detail drawers for the same resource. The value has no automatic expiry. |

When the browser blocks storage, theme and drawer changes can still apply to the current page. The guide controller keeps progress in memory. For SSR, create request-local or layout-local locale and guide state. Restore browser preferences on the client.

<a id="example-data"></a>

### Remember the selected theme

`ui.applyTheme('dark')` writes the plain string `dark` to `theme`. The layout can read it on the next visit. Include the dark theme CSS in the build.

For JSON preferences in the HTML shell, choose a separate key such as `orders-display`. This example includes a custom color and a locale field named `language`.

```json
{ "themeId": "dark", "themeColor": "#5765f0", "language": "en-US" }
```

Use different keys for the JSON bootstrap and the theme ID string helpers. `ui.getThemeInitScript()` stores JSON at `theme`. When using that script, use the same JSON format in the layout. A layout using `ui.getSavedTheme` and `ui.applyTheme` can generate a bootstrap with a separate key or follow the same string format in its HTML shell.

### Remember the selected language

`localeStore.set('ja-JP')` saves the string `ja-JP` to `hai-locale` or to the configured key. The next load uses it before inspecting browser preferences when the locale is still supported. The app manages its own translations, including Paraglide messages.

### Remember a completed tour

The key `hai-guide:orders:intro` identifies the `intro` tour for the `orders` scope. The record shows that version 1 is complete.

```json
{ "version": 1, "status": "completed", "updatedAt": 1794873600000 }
```

`status` is `completed`, `dismissed` or `deferred`. Completion and dismissal suppress invitations for that version. Deferral suppresses them for 24 hours. Increment `version` to offer a new version. `updatedAt` is in Unix milliseconds.

### Resume a tour after navigation

`hai-guide-pending` holds this start request. When the app reaches `/orders` in the matching scope, the controller uses `createdAt` in Unix milliseconds to check the five-minute window.

```json
{ "id": "intro", "scope": "orders", "route": "/orders", "createdAt": 1794873600000 }
```

### Remember the drawer width

After the order edit drawer is set to 480 pixels, `hai-ui:crud:orders:drawer-width` contains the string `480`. The component constrains the width to the drawer's range and the viewport. Remove the browser key to restore the host's initial width.

<a id="runtime-data"></a>

## Data exchanged with components

| Public type | Producer and consumer | Lifetime |
| --- | --- | --- |
| `CrudData<T>` | The host query or `ui.createCrudController()` provides `CrudPage` with items, total, page, page size and submitted filters. | Component or controller lifetime. The host owns the server records and authorization. |
| `ArtifactDocument` and `ArtifactSaveRequest` | The host supplies a version and content, and the UI sends `id`, `baseVersion` and the draft back to save. | Drafts and conflict indicators live in the workspace. The host persists content and history and detects version conflicts. |
| `ToolRun` | The host returns the run receipt and answers status requests. The UI displays progress, results and artifacts. | The current receipt, timer and cancellation signal belong to the workspace. The execution service owns persistent jobs, authorization and retry. |
| `FeedbackReceipt` | After accepting feedback, the host returns `number` and `collectionStatus` for the UI to display. | Evidence collection, authorization and retention belong to the feedback service. [Feedback data structures](feedback.en.md) |

For example, `{ "id": "report-42", "baseVersion": 3, "content": "# Updated report" }` asks to save a draft on version 3. If the server already has version 4, the host returns a conflict and the workspace keeps the draft. A receipt of `{ "id": "run-42", "status": "running", "progress": 0.5 }` describes a run halfway complete. The progress fraction ranges from 0 to 1. Omit it for an indeterminate indicator. [Tool and artifact workspaces](../function/ui.en.md#tool-workspaces)

### Query results and acceptance receipts

The host supplies the order list data. This sample shows one record on page 2, the total number of matching records and the applied filter. The controller starts at page 1 and uses 10 rows per page when the resource has no page size configured.

```json
{
  "items": [{
    "id": "order-42",
    "status": "packed"
  }],
  "total": 11,
  "page": 2,
  "pageSize": 10,
  "filters": { "status": "packed" }
}
```

After feedback submission succeeds, this receipt means the report was accepted and its attachments or diagnostic evidence are still being collected. Open the details by number to check the latest status.

```json
{ "number": "FB-104", "collectionStatus": "collecting" }
```
