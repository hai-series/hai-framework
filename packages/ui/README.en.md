# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

## Introduction

Built-in messages support `zh-CN`, `en-US` and `ja-JP`; the language selector offers all three by default.

A cross-platform Svelte 5 Runes component library with DaisyUI v5 + Tailwind CSS v4 styling and Bits UI v2 headless interactions. Includes built-in i18n (zh-CN / en-US / ja-JP) and 15 curated DaisyUI themes plus high contrast and square business themes.

## Core features

- Forms, tables, dialogs, navigation, charts and application components.
- Authentication, CRUD, AI content, onboarding and a help center.
- Svelte 5, themes, responsive layouts and Chinese/English/Japanese component messages.

Markdown underline and highlight markers support escaping; unclosed markers remain text. Toasts and document downloads handle unusually long text without repeated scanning, while trace identifiers remain hidden by default.

## Getting started

### Installation

```bash
npm install @h-ai/ui @h-ai/core
```

For a Node server, declare both UI and core as production dependencies so the adapter preserves native logging and runtime dependencies.

### Quick start

#### 1. Configure svelte.config.js

```js
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: { runes: true },
  kit: { adapter: adapter() },
}

export default config
```

#### 2. Configure vite.config.ts

```ts
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  optimizeDeps: {
    // bits-ui 含 .svelte 源码须 exclude；@internationalized/date 须与 bits-ui 同为原始副本，
    // 否则日期组件会因双实例 instanceof 失败抛 "Unknown date type"
    exclude: [...haiOptimizeExclude],
    // 预打包 @h-ai/ui 的重型纯 JS 依赖（语法高亮 / Mermaid / PDF 等），
    // 避免首次进入业务路由时触发依赖再优化与整页刷新
    include: [...haiPrebundledDeps],
  },
  ssr: { noExternal: ['@h-ai/ui', '@h-ai/kit'], external: ['@h-ai/core', 'sm-crypto'] },
})
```

When using Crypto or Kit/IAM, include `sm-crypto@0.5.7` in application production dependencies. CLI projects already do this; for manual setup, run `pnpm add sm-crypto@0.5.7`. The external option alone is insufficient: adapter-node also uses direct production dependencies to preserve native package loading.

#### 3. Configure src/app.css

```css
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';
@import '@h-ai/ui/styles/theme.css';
@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
@source "../../../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";

@plugin "daisyui" {
  themes: light --default, dark --prefersdark, cupcake, emerald, corporate, nord, dracula, night;
}

/* 图标（可选） */
@plugin "@iconify/tailwind4" {
  prefixes: tabler;
}
```

> `@source` makes TailwindCSS scan classes in `@h-ai/ui`; without it, component styles are missing. In nested monorepo apps, dependencies may be hoisted to root `node_modules`, so retain both paths.

#### 4. Use components

```svelte
<script>
  import { Button, Input, Card } from '@h-ai/ui'
</script>

<Card title="示例表单">
  <Input placeholder="请输入用户名" />
  <Button variant="primary" onclick={handleSubmit}>提交</Button>
</Card>
```

With auto-import enabled, use components directly in templates without individual imports:

```svelte
<!-- 无需 import { Button } from '@h-ai/ui' -->
<Button variant="primary">提交</Button>
```

> `@h-ai/ui/auto-import` injects all public Svelte components except `toast`, type imports, and `Range` (which conflicts with the DOM `Range` constructor).

Pages using a subset of components, such as administration screens, can import public component-directory entry points directly. Import theme utilities from the lightweight `@h-ai/ui/theme` entry so theme consumers do not load the root entry's AI and chart components. Use `@h-ai/ui/i18n` for locale utilities in stores without loading components or tour CSS. Check the installed package's exports; do not import its internal `src/` or `dist/` paths.

The preprocessor recognizes semicolon-free, multiline and aliased imports without injecting components already bound locally. Type-only imports do not replace runtime components.

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

#### data-\* attribute forwarding

Public Svelte components forward caller-supplied `data-*` attributes to their root or primary interactive element for tests, analytics, and automation. Other unknown attributes are not forwarded.

```svelte
<Button data-testid='save-button' data-analytics-id='settings.save'>保存</Button>
<Input data-testid='username-input' bind:value={username} />
<Modal data-testid='confirm-modal' bind:open={open}>...</Modal>
```

No extra button, input, or overlay wrappers are needed just for `data-testid`.

### Component architecture

Three layers (primitives → compounds → scenes):

```
components/
├── primitives/   # Indivisible base UI elements
├── compounds/    # Primitives + Bits UI headless composition
└── scenes/       # Complete UI workflows for business scenarios
    ├── ai/       # AI documents / spreadsheets / Markdown preview
    ├── app/      # Settings / feedback / themes / language
    ├── crud/     # CRUD pages / drawers / filters / delete confirmation
    ├── iam/      # Authentication
    ├── storage/  # Storage management
    └── crypto/   # Cryptographic display
```

### Component catalog

#### Primitives (20)

| Component        | Description         | Key props                                                                      |
| ---------------- | ------------------- | ------------------------------------------------------------------------------ |
| `Button`         | Button              | `variant`, `size`, `loading`, `disabled`, `outline`, `circle`                  |
| `IconButton`     | Icon button         | `icon: trusted SVG string \| Snippet`, `variant`, `size`, `tooltip`, `loading` |
| `BareButton`     | Unstyled button     | `class`, `ariaLabel`, `role`, `tabindex`                                       |
| `Input`          | Input               | `type`, `value`, `size`, `error`, `validationMessage`                          |
| `BareInput`      | Unstyled input      | `type`, `class`, `accept`, `multiple`                                          |
| `Textarea`       | Text area           | `value`, `rows`, `size`, `autoResize`, `error`                                 |
| `Select`         | Select              | `options`, `value`, `placeholder`, `size`, `clearable`, `filterable`           |
| `Checkbox`       | Checkbox            | `checked`, `label`, `size`, `indeterminate`                                    |
| `Switch`         | Switch              | `checked`, `label`, `size`                                                     |
| `Radio`          | Radio group         | `options`, `value`, `direction`, `size`                                        |
| `ToggleCheckbox` | Native switch input | `checked`, `name`, `onchange`                                                  |
| `ToggleInput`    | Native toggle input | `checked`, `name`                                                              |
| `ToggleRadio`    | Native radio input  | `checked`, `name`, `onchange`                                                  |
| `Range`          | Slider              | `value`, `min`, `max`, `step`                                                  |
| `Rating`         | Rating              | `value`, `max`                                                                 |
| `Badge`          | Badge               | `variant`, `size`, `outline`                                                   |
| `Avatar`         | Avatar              | `src`, `name`, `size`, `shape`, `ring`                                         |
| `Tag`            | Tag                 | `text`, `variant`, `size`, `closable`                                          |
| `Spinner`        | Loading animation   | `size`, `variant`                                                              |
| `Progress`       | Progress bar        | `value`, `max`, `variant`, `striped`, `animated`                               |

For `BareInput` with `type="file"`, read `event.currentTarget.files` in `onchange` and leave the file path `value` unbound. Other input types support `bind:value`.

#### Compounds (37)

##### Forms

| Component   | Description    | Key props                                    |
| ----------- | -------------- | -------------------------------------------- |
| `Form`      | Form container | `columns`, `labelPosition`, `labelWidth`, `loading`, `disabled`, `onsubmit`            |
| `FormField` | Form field     | `label`, `for`, `colSpan`, `labelPosition`, `error`, `hint`, `required`         |
| `FormLayout` | Form layout | `columns`, `labelPosition`, `labelWidth` |
| `TagInput`  | Tag input      | `tags`, `maxTags`, `allowDuplicates`, `size` |

##### Form layouts and validation

`Form` and `FormLayout` (for native `<form>` elements) share `columns={1 | 2}`, `labelPosition="top" | "left"` and `labelWidth` (default `8rem`). Defaults are one column and stacked labels. Two columns collapse below a container width of `36rem`; inline labels stack below `28rem`.

`FormField.colSpan` defaults to `'auto'`: textareas, file/image uploads, TagInput and multiple Combobox controls span both columns. Use `1` or `2` to override, or mark a custom wide control with `data-form-wide`. Non-field content, including headings, error summaries and actions, spans the full row. Fields may override `labelPosition` / `labelWidth`.

Labels connect to nested UI controls automatically; use `<FormField for="control-id">` for explicit IDs or native controls. Errors and hints use `aria-describedby`, invalid controls use `aria-invalid`, and field errors appear once. `label` / `error` / `hint` accept strings or deferred translation functions.

`Input`, `Textarea`, `Select` and `PasswordInput` provide Chinese/English/Japanese native validation messages. `validationMessage` overrides failures without keeping valid input invalid. Sync locale with the UI `setGlobalLocale` / `createLocaleStore` to update visible validation errors immediately. `Textarea` supports `minlength` / `maxlength`; `Select` supports `name`, required validation and FormData serialization.

Field errors appear through Toast. Submitting the same invalid input again shows the error even after the previous notification was dismissed or expired. Correcting input clears the stale notification. Controls retain error borders, `aria-invalid` and linked screen-reader descriptions.

Text controls validate on blur after input and update errors as input is corrected. Pristine empty fields validate on submit, so leaving default focus does not shift actions. CRUD create/edit forms also validate on blur after input or on submit, honor custom messages and reset validation when reopened. `Select` validates when focus leaves both its trigger and options. `PasswordInput.minLength` enforces length and informs strength; omitting it leaves login password length unrestricted while strength uses an eight-character baseline.

`UserProfile.fieldConstraints` accepts per-field `required`, `minlength`, `maxlength`, `pattern` and `validationMessage` (`pattern` applies to single-line inputs), so application rules such as username formats share blur validation. `validationMessage` also accepts a deferred translation function.

`CrudEditPanel.onsubmit` receives only writable fields declared by the form. Fields marked `readonly` are omitted when editing and remain available when creating. Primary keys, related display values and audit timestamps are not copied from the entire row. Null values, `false` and `0` are preserved. Keep strict schema validation on the server.

`LoginForm`, `RegisterForm`, `ChangePasswordForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `AuthPanel`, `UserProfile` and `FeedbackModal` accept the same layout options. Pass them through `CrudPage.form` or directly to `CrudEditPanel`. CRUD fields support `colSpan` and deferred `validation.message`. Buttons and Enter both validate before submission; corrections clear errors. Server validation remains required.

```svelte
<!-- m、save、name、notes 为应用自己的翻译、提交回调和状态 -->
<Form columns={2} labelPosition="left" labelWidth="6rem" onsubmit={save}>
  <FormField label={() => m.name()} required>
    <Input name="name" bind:value={name} required />
  </FormField>
  <FormField label={() => m.notes()}>
    <Textarea name="notes" bind:value={notes} />
  </FormField>
  <Button type="submit">{m.save()}</Button>
</Form>
```

##### Feedback

| Component        | Description     | Key props                                         |
| ---------------- | --------------- | ------------------------------------------------- |
| `Alert`          | Alert           | `variant`, `title`, `dismissible`                 |
| `ToastContainer` | Toast container | Place globally and use with the `toast` singleton |

##### Overlays

| Component | Description         | Key props                                                                    |
| --------- | ------------------- | ---------------------------------------------------------------------------- |
| `Modal`   | Modal with dialog semantics, focus trap and restoration | `open`, `title`, `size`, `radius`, `bodyOverflow`, `showClose`               |
| `Drawer`  | Drawer              | `open`, `position`, `title`, `size`, `width`, `resizable`, `widthStorageKey` |
| `Confirm` | Confirmation dialog | `open`, `title`, `message`, `variant`, `onconfirm`                           |
| `Popover` | Popover             | `open`, `position`, `trigger`, `offset`, `portal`                            |

##### Data display

| Component   | Description    | Key props                                                                                                                                   |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card`      | Card container | `title`, `bordered`, `shadow`, `padding`                                                                                                    |
| `JsonViewer` | JSON tree viewer | `value`, `defaultExpandedDepth`, `maxScalarLength`, `showCopy`, `onCopy`; circular references are replaced with a placeholder |
| `DataTable` | Data table     | `data`, `columns`, `keyField`, `loading`, `sortKey`, `sortDir`, `onsort`; `cell` slot and `onrowclick` (`sortable` columns support sorting) |
| `Accordion` | Accordion      | `items: AccordionItem[]`                                                                                                                    |
| `Timeline`  | Timeline       | `items: TimelineItem[]`                                                                                                                     |

##### Bits UI headless interactions

| Component    | Description                         | Key props                                                   |
| ------------ | ----------------------------------- | ----------------------------------------------------------- |
| `Combobox`   | Searchable select (single/multiple) | `options`, `value`, `multiple`, `placeholder`, `size`       |
| `Calendar`   | Standalone calendar                 | `value: DateValue`, `minValue`, `maxValue`                  |
| `DatePicker` | Date input with popover             | `value: DateValue`, `minValue`, `maxValue`, `error`, `size` |

> Dates use `DateValue` / `CalendarDate` from `@internationalized/date`.

##### Mobile / enhanced interactions

| Component        | Description         | Key props                                              |
| ---------------- | ------------------- | ------------------------------------------------------ |
| `ActionSheet`    | Bottom action sheet | `open`, `title`, `items`, `cancelText`, `onselect`     |
| `AppBar`         | Top navigation      | `title`, `backHref`, `onback`, `fixed`, `safeArea`     |
| `BottomNav`      | Bottom navigation   | `items`, `active`, `centered`, `maxWidth`              |
| `InfiniteScroll` | Infinite scrolling  | `loading`, `finished`, `threshold`, `onload`           |
| `PullRefresh`    | Pull to refresh     | `refreshing`, `threshold`, `onrefresh`                 |
| `SafeArea`       | Safe area container | `top`, `bottom`, `left`, `right`                       |
| `SwipeCell`      | Swipe actions       | `leftActions`, `rightActions`, `threshold`, `onaction` |

##### Navigation

| Component    | Description                     | Key props                                                                                                  |
| ------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Tabs`       | Tabs                            | `items`, `active`, `type`, `size`, `lazy`, `onactivate`                                                    |
| `Pagination` | Pagination (shared table style) | `page`, `total`, `pageSize`, `showTotal`, `showJumper`, `showSizeChanger`, `showPageInfo`, `showFirstLast` |
| `Breadcrumb` | Breadcrumbs                     | `items`, `separator`                                                                                       |
| `Steps`      | Steps                           | `items`, `current`, `direction`, `clickable`                                                               |
| `Dropdown`   | Dropdown menu                   | `items`, `trigger`, `triggerClass`, `position`                                                             |
| `Tooltip`    | Tooltip                         | `content`, `position`, `delay`                                                                             |

##### State placeholders

| Component  | Description | Key props                             |
| ---------- | ----------- | ------------------------------------- |
| `Skeleton` | Skeleton    | `variant`, `width`, `height`, `count` |
| `Empty`    | Empty state | `title`, `description`, `icon`        |
| `Result`   | Result page | `status`, `title`, `description`      |

##### Page-level

| Component    | Description | Key props                                       |
| ------------ | ----------- | ----------------------------------------------- |
| `PageHeader` | Page header | `title`, `description`; supports `actions` slot |

#### Scenes (43)

##### Guide (2)

| Component | Description | Key props |
| --- | --- | --- |
| `GuideHost` | First-use invitations, tours and help dialog host | `guide`, `locale`, `scope`, `autoStart` |
| `HelpCenter` | Standalone searchable help center | `articles`, `tours`, `locale`, `selectedId`, `onstart` |

##### App (11)

| Component          | Description                                    | Key props                                                |
| ------------------ | ---------------------------------------------- | -------------------------------------------------------- |
| `FeedbackModal`    | Feedback modal                                 | `open`, `onsubmit`                                       |
| `FeedbackForm` | Standalone feedback form | `attachments`, `evidenceSummary`, `onsubmit`, `onfileschange` |
| `FeedbackList` | Server pagination, filters and processing actions | `data`, `query`, `permissions`, `onquerychange`, `onstatus` |
| `FeedbackDetail` | Diagnostic evidence, history and exports | `report`, `evidence`, `attachments`, `history`, `webhook`, `onretry`, `onexport` |
| `FeedbackScreenshot` | Image preview, highlighting and masking | `attachment`, `onannotate` |
| `SettingsModal`    | Settings modal                                 | `open`, `onclose`                                        |
| `SettingsLayout`   | Settings layout (section navigation + content) | `title`, `description`, `sections`, `active`, `onselect` |
| `LanguageSwitch`   | Language switcher                              | No props required                                        |
| `ThemeColorPicker` | Theme color picker                             | `value`, `presets`, `onchange`                           |
| `ThemeSelector`    | Full theme selector                            | No props required                                        |
| `ThemeToggle`      | Light/dark toggle                              | No props required                                        |

Pass the type: webhook task from report jobs into FeedbackDetail.webhook to show status, attempts and safe error codes; onretry calls the authenticated retry API. The Business evidence tab paginates kind: business, and archives download from the scene tab.

Descriptions are optional. Call `prepare()` from `@h-ai/feedback/client` before opening the modal. Connect `onfileschange` to attachment preparation and `onannotate` to image editing that burns annotations into the pixels. Failed submissions retain input and support local export. The list shows the description or server summary and requests pages through `onquerychange`; UI permissions do not replace server authorization. See the [feedback module](../feedback/README.en.md) for integration and offline tools.

##### IAM authentication (11)

| Component            | Description                                      | Key props                                                                                              |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `AuthPanel`          | Configuration driven authentication | `config`, `actions`, `loginHeader/loginFields/loginFooter`, `registerHeader/registerFields/registerFooter` |
| `AuthShell`          | Auth page layout (centered card / split columns) | `variant`, `title`, `subtitle`, `brandTitle`, `brandText`, `illustration`, `description`, `highlights` |
| `LoginForm`          | Login form                                       | `loading`, `errors`, `showForgotPassword`, `onsubmit`                                                      |
| `RegisterForm`       | Registration form                                | `loading`, `errors`, `fields`, `onsubmit`                                                              |
| `ForgotPasswordForm` | Forgot password                                  | `mode`, `loading`, `errors`, `onsubmit`                                                                |
| `ResetPasswordForm`  | Reset password                                   | `loading`, `errors`, `showCode`, `onsubmit`                                                            |
| `ChangePasswordForm` | Change password                                  | `loading`, `errors`, `requireOldPassword`, `onsubmit`                                                  |
| `PasswordInput`      | Password input                                   | `value`, `showToggle`, `showStrength`, `minLength`                                                     |
| `ReauthenticationDialog` | Sensitive action confirmation | `open`, `loading`, `error`, `onsubmit`, `onclose` |
| `PermGuard`          | Permission guard                                 | `permissions`, `mode`, `fallback`                                                                      |
| `UserProfile`        | User profile                                     | `user`, `editable`, `fields`, `avatarAccept`, `avatarHint`, `onsubmit` |
| `SessionRecoveryDialog` | In-place session recovery | `recovery`, `actions` |
| `SensitiveOperationsForm` | Permission operation editor | `operations`, `onsubmit`, `ondone` |

##### Storage (4)

| Component      | Description   | Key props                                                    |
| -------------- | ------------- | ------------------------------------------------------------ |
| `FileUpload`   | File upload   | `accept`, `maxSize`, `maxFiles`, `multiple`, `uploadHandler` |
| `ImageUpload`  | Image upload  | `value`, `accept`, `maxSize`, `aspectRatio`, `uploadHandler` |
| `AvatarUpload` | Avatar upload | `value`, `size`, `maxSize`, `fallback`, `uploadHandler`      |
| `FileList`     | File list     | `files`, `layout`, `showDelete`, `showDownload`              |

Upload components do not embed presigning, headers, or PUT/POST protocols. Applications call their service through `uploadHandler(file, { signal, onProgress })` and return `{ url?, response? }`. Image/avatar uploads require a displayable `url`. Without a handler, `FileUpload` only selects files, and image/avatar components generate local previews only.

##### Crypto display (3)

Input changes immediately clear `encryptedValue`; only successful results for current input are restored. Clearing, callback replacement, and unmounting invalidate old requests. Failures show built-in errors and leave ciphertext empty. Submit encrypted inputs only when current ciphertext is nonempty.

Callers must connect `EncryptedInput` to a real encryption service through `onencrypt`; `algorithm` describes that service's algorithm only. Without a callback, the component shows unavailability and generates no ciphertext, with no Base64 fallback.

| Component          | Description       | Key props                                               |
| ------------------ | ----------------- | ------------------------------------------------------- |
| `EncryptedInput`   | Encrypted input   | `value`, `encryptedValue`, `algorithm`, `showEncrypted` |
| `HashDisplay`      | Hash display      | `value`, `algorithm`, `copyable`, `truncate`            |
| `SignatureDisplay` | Signature display | `signature`, `publicKey`, `algorithm`, `verified`       |

Defaults match `@h-ai/crypto`: `SM4` for encrypted inputs, `SM3` for hashes, and `SM2` for signatures.

##### AI documents and spreadsheets (4)

| Component                | Description            | Key props / capabilities                                                                                   |
| ------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MarkdownRenderer`       | Markdown renderer      | `content`, `fontSize`, `allowHtmlTags`, `showCopyButton`, `enableHighlight`                                |
| `AiDocumentDownloadMenu` | Document download menu | `actions`, `ondownload`                                                                                    |
| `AiDocumentEditor`       | AI document editor     | `content`, `fontSize`, `allowHtmlTags`, `showRunButton`, `showCodePreviewToggle`, `allowUnsafeCodePreview` |
| `AiTableEditor`          | AI spreadsheet editor  | `columns`, `rows`, `editable`, `ondownload`                                                                |

> `AiDocumentEditor` permits only built-in Markdown preview by default. High-risk HTML / JS / CSS previews require explicit `allowUnsafeCodePreview` or controlled results from `oncoderun`.
>
> Mermaid works out of the box: ` ```mermaid ` blocks in documents (`sourceKind='document'`) render automatically in reading mode. Code mode (`sourceKind='code'` + `showCodePreviewToggle`) supports code/preview switching. Mermaid uses `securityLevel: 'strict'` and sanitized SVG without `allowUnsafeCodePreview`.
>
> `MarkdownRenderer` and `AiDocumentEditor` also support presentation options:
>
> - `fontSize` accepts a `number` in px or any CSS length such as `1.125rem`.
> - `allowHtmlTags` is off by default; when enabled, tags such as `<b>` / `<i>` / `<u>` / `<mark>` use a safe allowlist, with dangerous tags/attributes still sanitized.
> - Text entities in safe HTML retain one level of meaning, so quotes, comparison operators and `&` in configuration snippets remain readable. Encoded tags remain text and are never reparsed as markup.
> - HTML code blocks such as `<pre><code class="language-yaml">` also receive safely rebuilt highlighting and copy buttons. Input styles and events are discarded. Supported languages include YAML, TypeScript, Shell, PowerShell, dotenv, Nginx, Dockerfile and Svelte.
> - Raw `<img>` tags retain `width` / `height` as positive integer pixel values from 1 to 99999. These reserve space before lazy images load and keep document layout and anchor positions stable. Percentages, negatives, decimals, events, and arbitrary `style` are removed.

```svelte
<MarkdownRenderer content={markdown} fontSize='1.125rem' allowHtmlTags />

<AiDocumentEditor
  title='方案文档'
  content={documentMarkdown}
  fontSize={18}
  allowHtmlTags
  showToolbar
  showOutline={false}
/>
```

##### Charts

`Chart type='line'` uses LayerChart's native line chart by default. For monitoring dashboards with segmented lines, points, nearest-point hover, and vertical reference lines, use `lineVariant='segmented-point'`:

```svelte
<Chart
  type='line'
  data={trendData}
  x='label'
  y={['rateLimit', 'circuitBreak']}
  series={trendSeries}
  lineVariant='segmented-point'
  tooltipMode='nearest'
  showCrosshair
  legend
  grid
/>
```

##### CRUD scenes (5)

| Component           | Description                                     | Key props / capabilities                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CrudPage`          | CRUD page                                       | `crud`, `data`, `permissions`, `form`, `pagination`, `density`, `detailColumns`, `showHeader`, `toolbarLeading`, `toolbarActions`, `card`, `tableCell`, `onrowclick`, `sortableColumns`, `nav`, `loading`, `loaded`, `error`, `onRetry`, `keepPreviousData` |
| `CrudFilterBar`     | Filter toolbar (search + typed filters + reset) | `filterFields`, `searchValue`, `onsearch`, `onfilterchange`, `onreset`                                                                                                                                                                                                      |
| `CrudDetailPanel`   | Details panel (drawer/modal)                    | `open`, `item`, `fields`, `variant`, `drawerWidth`, `modalSize`                                                                                                                                                                                                             |
| `CrudEditPanel`     | Edit panel (drawer/modal)                       | `open`, `fields`, `variant`, `drawerWidth`, `modalSize`, `onsubmit`                                                                                                                                                                                                         |
| `CrudDeleteConfirm` | Delete confirmation                             | `open`, `loading`, `onconfirm`                                                                                                                                                                                                                                              |

> `CrudPage` and `FeedbackList` share a query bar inside the list card, an independently scrolling table and bottom pagination. Search, Query and Reset stay visible; extra filters start collapsed and retain their drafts. Query or Enter submits all conditions once; editing fields does not query automatically. Paging and sorting use applied conditions. Reset clears search, filters and sorting and returns to page one. Sorting buttons appear in column headers; `sortableColumns` must contain only fields supported by the backend. `detailColumns` configures detail links, `toolbarLeading` / `toolbarActions` add content above the card, and `card` / `tableCell` customize records. Filters support `select`, `boolean`, `number`, `date`, `date-range` and `text`. Without `sortableColumns`, CrudPage shows no sort buttons; list pages must declare backend-supported fields.
>
> The page fills available parent height. Tables fill remaining space even without data; only the data area scrolls, with headers fixed at its top and pagination fixed at the list card bottom.
> Pass remaining height through every host container, for example with `flex flex-1 min-h-0 flex-col`, from the viewport shell to the content area. Intermediate wrappers must not size only to their content. Pagination stays at the bottom for empty, short and scrolling lists.
>
> Columns first shrink to 7rem and truncate long text; horizontal scrolling appears only if total width still exceeds the container. The action column stays fixed on the right.

##### Error pages (1)

| Component   | Description                                         | Key props / capabilities                                                |
| ----------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `ErrorPage` | Generic error page with 401/403/404/500/503 presets | `status`, `code`, `title`, `description`, `homeUrl`, `onhome`, `onback` |

> `CrudPage` uses `form` to configure create/edit presentation: Without `sortableColumns`, CrudPage shows no sort buttons; list pages must declare backend-supported fields.
>
> - `form.variant`: `'drawer'` (default) or `'modal'`.
> - Drawer: `form.drawerSize` selects a preset; `form.drawerWidth` accepts any CSS width and takes precedence. The left edge is resizable by default and remembered per resource; disable with `form.drawerResizable=false`.
> - Modal: `form.modalSize` selects a preset; `form.modalWidth` / `form.modalHeight` accept CSS sizes.
>
> `pagination` configures the always-visible pagination bar. `showSizeChanger`, `pageSizeOptions`, `showJumper`, and `showTotal` are on by default. For compact views, disable page text with `showPageInfo` and first/last buttons with `showFirstLast`.
>
> `density` is `'normal'` (default) or `'compact'`. It affects list rows/actions, pagination, and create/edit/detail forms, not headers or filters.
>
> Controlled loading: `loading` / `loaded` / `error` / `onRetry` / `keepPreviousData`. Empty state appears only when `loaded && total === 0`, avoiding false empty results before the first response. Initial queries show loading; failures without usable data show errors/retry (`onRetry`). `keepPreviousData` (default true) retains old data during refresh/failure.
>
> Pure clients without SvelteKit SSR can use framework `defineCrud` + `createCrudController` to manage `data` and `nav`, with latest-wins (seq + AbortSignal), old-data retention on failure, lazy loading, and concurrent deduplication:
>
> ```svelte
> <script>
>   import { CrudPage, createCrudController, defineCrud } from '@h-ai/ui'
>   const crud = defineCrud({ name: 'user', label: '用户', fields: [/* ... */], api: { list: params => listUsers(params) } })
>   const c = createCrudController(crud) // 惰性页签传 { autoLoad: false }，首次激活时 c.load()
> </script>
> <CrudPage {crud} data={c.data} nav={c.nav} loading={c.loading} loaded={c.loaded} error={c.error} onRetry={c.reload} />
> ```
>
> `Tabs` supports lazy content. With `lazy`, never-activated panes are not rendered (`children` receives `isActivated(key)`); `onactivate(key)` runs once on first activation. Combine with `createCrudController({ autoLoad: false })` to load only when first visible.

### Examples

#### Toast notifications

```svelte
<script>
  import { toast, ToastContainer } from '@h-ai/ui'

  function notify() {
    toast.success('操作成功')
    toast.error('操作失败')
    toast.warning('请注意')
    toast.info('提示信息', 5000) // 自定义持续时间
  }
</script>

<button onclick={notify}>通知</button>
<ToastContainer />
```

Toasts float at the bottom right by default without shifting layout, using UI-owned semantic colors for information, success, warning and error, with a soft tinted background, a narrow color border, a distinct icon and a subtle shadow. They can be dismissed manually. Notifications share one FIFO queue and appear one at a time; each timer starts when its notification is shown (3 seconds by default, `duration: 0` waits for dismissal). Mount `<ToastContainer />` once in the root layout. Set a position with `toast.add({ message: m.saved(), variant: 'success', position: 'bottom-center' })`, where `m.saved()` is an application translation. Positions: `bottom-right` (default), `top-right`, `bottom-center`, `top-center`, `bottom-left`, `top-left`. Use Toast for login, password changes, saves, deletes and uploads, including failures. All warnings and errors, including field validation, use ToastContainer. Fields retain invalid markers and accessible descriptions; persistent status and recovery actions remain in place. `Alert` only accepts info/success.

Press F8 to focus the current notification and F8 again to return. Escape dismisses a dismissible notification and restores focus; Enter activates its dismiss button. This also works inside Modal without closing the dialog. Non-dismissible notifications can be focused for reading and exited with F8; automatic dismissal restores focus too.

> Built-in `notifySuccess` / `notifyError` / `notifyInfo` / `notifyWarning` remove the need for application wrappers. `notifyError(err, fallback?)` hides an ordinary Error's internal message, displays a fallback and preserves traceId. String arguments must be safe localized messages; do not pass an unknown `err.message`. Success lasts 3s and errors 5s by default.

When a Promise-based component requires an exception, preserve the complete failure with `throw new Error(result.error.message, { cause: result.error })`. `errorMessage` / `notifyError` follow the bounded, cycle-safe Error.cause chain to recover a safe business message and traceId. Server errors and unknown exceptions still use a safe fallback; internal exception text is not displayed.

Reactive components can call `useToastFeedback(() => error)` during initialization with safe localized messages. Queued duplicates of the same type are merged; notifications survive component unmount. Updating or clearing a source replaces or removes its previous notification; duplicate matching also includes traceId. The `message` API shares this queue, style and dismissal behavior. `MessageContainer` renders `ToastContainer`; choose one container in the root layout.

State modules can import `toast`, `useToastFeedback`, `notifySuccess` / `notifyError` / `notifyInfo` / `notifyWarning` and `errorMessage` from the lightweight `@h-ai/ui/toast` entry without loading components or tour CSS. Import `ToastContainer` from a component entry and mount it in the root layout.

The traceId is hidden by default. Use `toast.add({ message: m.retry(), variant: 'warning', traceId })`; existing safe messages containing `(traceId: …)` are separated automatically. The diagnostic icon reveals an issue reference ID, a copy action, and guidance to provide it to customer support or the development team. If copying fails, the ID can be selected manually. Hovering, focusing or expanding pauses the timer; closing the details and leaving resumes the remaining time. `toast.pause(id)` / `toast.resume(id)` are also available. Migrate warning/error Alert components to Toast; field errors retain aria-invalid and accessible descriptions, with recovery actions in place.

#### Choosing a Toast position

The application provides the `m.saved()` translation below. Notifications at different positions still share one queue and appear in order.

```ts
import { toast } from '@h-ai/ui/toast'

toast.add({ message: m.saved(), variant: 'success', position: 'top-right' })
toast.add({ message: m.saved(), position: 'bottom-center' })
```

#### Typical CRUD page

```svelte
<script>
  import {
    PageHeader, Card, DataTable, Button,
    Modal, Input, Select, toast, ToastContainer,
  } from '@h-ai/ui'

  let items = $state([])
  let showModal = $state(false)
  let loading = $state(false)
  let formData = $state({ name: '', type: '' })

  const columns = [
    { key: 'name', label: '名称' },
    { key: 'type', label: '类型' },
    { key: 'createdAt', label: '创建时间' },
  ]

  async function handleCreate() {
    loading = true
    try {
      await fetch('/api/items', { method: 'POST', body: JSON.stringify(formData) })
      showModal = false
      toast.success('创建成功')
    } finally {
      loading = false
    }
  }
</script>

<PageHeader title="项目管理" description="管理所有项目">
  {#snippet actions()}
    <Button onclick={() => showModal = true}>新建</Button>
  {/snippet}
</PageHeader>

<Card>
  <DataTable data={items} {columns} keyField="id" {loading}>
    {#snippet actions(item)}
      <Button size="xs">编辑</Button>
      <Button size="xs" variant="error">删除</Button>
    {/snippet}
  </DataTable>
</Card>

<Modal bind:open={showModal} title="新建项目">
  <form onsubmit={(e) => { e.preventDefault(); handleCreate() }} class="space-y-4">
    <Input placeholder="名称" bind:value={formData.name} required />
    <Select
      placeholder="选择类型"
      bind:value={formData.type}
      options={[
        { value: 'a', label: '类型 A' },
        { value: 'b', label: '类型 B' },
      ]}
    />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => showModal = false}>取消</Button>
    <Button {loading} onclick={handleCreate}>创建</Button>
  {/snippet}
</Modal>

<ToastContainer />
```

`Modal` retains the top-right close button without a `title` / `header`, but does not render a full header row. Use `radius="1.4rem"` for rounded corners and `bodyOverflow="visible"` when internal dropdowns/overlays need to extend outside.

#### Declarative CRUD page (CrudPage)

```svelte
<script lang='ts'>
  import { createSvelteKitNavAdapter } from '@h-ai/kit/client'
  import { CrudPage } from '@h-ai/ui'

  let { data } = $props()
  const nav = createSvelteKitNavAdapter()
</script>

<CrudPage
  crud={roleCrud}
  {data}
  permissions={{ create: true, update: true, delete: true }}
  form={{ variant: 'modal', modalSize: '3xl', columns: 2, labelPosition: 'top' }}
  pagination={{ showSizeChanger: true, showJumper: true, pageSizeOptions: [10, 20, 50] }}
  density='compact'
  detailColumns={['name']}
  sortableColumns={[{ key: 'createdAt', label: '创建时间' }]}
  {nav}
/>
```

> Use `form={{ variant: 'drawer', drawerWidth: '40rem' }}` for drawers. User resizing overrides the initial width and is remembered per resource.

#### Login page

```svelte
<script>
  import { LoginForm } from '@h-ai/ui'

  let loading = $state(false)
  let errors = $state({})

  async function handleLogin(data) {
    loading = true
    errors = {}
    try {
      await fetch('/api/login', { method: 'POST', body: JSON.stringify(data) })
    } catch {
      errors = { general: '登录失败，请检查用户名和密码' }
    } finally {
      loading = false
    }
  }
</script>

<!-- 场景组件内置 i18n，无需传入翻译 props -->
<LoginForm {loading} {errors} onsubmit={handleLogin} showRegisterLink />
```

#### Controlled PasswordInput

```svelte
<script>
  import { PasswordInput } from '@h-ai/ui'

  let password = $state('')
</script>

<PasswordInput
  value={password}
  oninput={(e) => { password = e.currentTarget.value }}
  placeholder="请输入密码"
  showStrength
/>
```

### Feedback capture and delivery checks

Feedback `evidence` shows sanitized material contents. `oncapture(id?)` hides the modal for navigation and adds or replaces a screenshot. With `onfileschange`, native silent screen recording produces a previewable, removable WebM/MP4 attachment (up to 60 seconds / 5 MiB; video is not automatically masked). `FeedbackDetail.onreplay` loads complete page events on demand for playback and seeking; logs and environment remain paginated.

Feedback materials scroll independently while action buttons remain visible, so expanded content never crosses the action bar. `FeedbackList` retains an accessible name; its host provides the page heading to avoid duplicate titles.

### Style dependencies

Components use TailwindCSS v4 + DaisyUI. Configure application `app.css` as follows:

```css
/* 必须 */
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';   /* 基础重置、滚动条、焦点样式 */
@import '@h-ai/ui/styles/theme.css';    /* Tailwind v4 @theme Token（品牌色/阴影/动效） */
@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
@source "../../../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";

/* 移动端项目追加（可选） */
@import '@h-ai/ui/styles/design-tokens.css'; /* CSS 自定义属性 */
@import '@h-ai/ui/styles/mobile.css';        /* 安全区域/触摸优化 */

/* DaisyUI 主题 */
@plugin "daisyui" {
  themes: light --default, dark --prefersdark, cupcake, emerald, corporate, nord, dracula, night;
}
```

- `global.css`: base HTML reset, scrollbars, and form focus rings.
- `theme.css`: Tailwind v4 `@theme` with brand colors, shadows, animation curves, and font features.
- `design-tokens.css`: spacing/radius/z-index/transition custom properties; recommended for mobile.
- `mobile.css`: safe-area padding, momentum scrolling, keyboard adaptation, and mobile shells (`hai-mobile-viewport` / `hai-mobile-shell` / `hai-mobile-main`).

On mobile pages, match `BottomNav` width to the page shell to avoid spanning the entire desktop preview viewport:

```svelte
<div class="hai-mobile-viewport">
  <div class="hai-mobile-shell max-w-lg">
    <AppBar title="Home" fixed={false} safeArea />
    <main class="hai-mobile-main">...</main>
    <BottomNav items={items} active="home" centered maxWidth="lg" safeArea />
  </div>
</div>
```

#### Icons

Components use Iconify (Tabler Icons):

```bash
npm install -D @iconify/tailwind4 @iconify-json/tabler
```

```css
/* app.css 中追加 */
@plugin "@iconify/tailwind4" {
  prefixes: tabler;
}
```

#### Theme switching

Manage 15 curated DaisyUI themes plus high contrast and square business themes through built-in utilities:

`high-contrast` ships in shared theme.css with bright text on dark surfaces, clear borders/focus, and stronger muted text/placeholders. ThemeSelector has localized labels; examples and default generated projects offer it. Explicit fullstack themes lists remain host controlled. Palette checks target 7:1 for normal text; arbitrary application content still needs accessibility review.

`formal` provides square corners for business buttons, fields, cards and dialogs, with localized labels in examples and default templates. Button submitHint displays the native Enter action only for type=submit; it adds no global shortcut. LoginForm focuses its identifier on desktop when ready and no element has focus; autoFocus=false opts out. Search Enter submits immediately while respecting IME composition. Theme choices support arrows/Home/End, Enter/Space and Escape focus restoration. Confirmation dialogs initially focus Cancel and synchronize Escape cancellation.

```ts
import {
  applyTheme, // 应用主题（自动持久化到 localStorage）
  createThemeBootstrapScript, // 生成可注入 app.html 的首屏主题恢复脚本
  getCurrentTheme, // 获取当前主题
  getSavedTheme, // Read saved appearance, with an optional application default
  getThemeInitScript, // 返回可注入到 HTML shell 的防闪烁脚本文本
  isDarkTheme, // 检查是否暗色主题
  normalizeHexColor, // 归一化 #RGB / #RRGGBB 主题色
  normalizeThemeId, // 校验主题 ID 并自动回退
  THEME_GROUPS, // 按亮色/暗色分组
  THEMES, // ThemeInfo[] — 17 个主题元数据
} from '@h-ai/ui/theme'
```

Use `getThemeInitScript()` for simple cases. For custom storage keys, theme color CSS variables, or language preferences, generate `createThemeBootstrapScript()` on the server and inject it into `app.html`.

Place a placeholder in SvelteKit `app.html`:

```html
<head>
  <script>%theme_bootstrap%</script>
</head>
```

Then inject it from `hooks.server.ts`:

```ts
import { createThemeBootstrapScript, DEFAULT_THEME_COLOR_CSS_VAR } from '@h-ai/ui/theme'

const themeBootstrapScript = createThemeBootstrapScript({
  storageKey: 'hai-demo-preferences',
  legacyThemeStorageKey: 'hai-demo-theme',
  defaultThemeColor: '#5765f0',
  colorCssVar: DEFAULT_THEME_COLOR_CSS_VAR,
})

transformPageChunk: ({ html }) => html.replace('%theme_bootstrap%', themeBootstrapScript)
```

### Internationalization (i18n)

@h-ai/ui uses **built-in component translations**:

- Scene components (`scenes/`) include Chinese/English/Japanese translations (zh-CN / en-US / ja-JP) out of the box.
- Components respond automatically to global locale changes, synchronized through `@h-ai/core`.
- Applications handle **page text** only; @h-ai/ui manages internal component text.
- Override specific text with props such as `submitText` or `labels`.

#### createLocaleStore

Client locale state management, automatically synchronized with the `@h-ai/core` global locale manager:

```svelte
<script>
  import { createLocaleStore, setGlobalLocale } from '@h-ai/ui/i18n'
  import { setLocale } from '$lib/paraglide/runtime'

  const localeStore = createLocaleStore()

  function changeLocale(code) {
    localeStore.set(code)       // 更新 UI store + 同步到 @h-ai/core
    setLocale(code)             // 同步到 Paraglide（应用层）
  }
</script>

<select value={localeStore.current} onchange={(e) => changeLocale(e.currentTarget.value)}>
  {#each localeStore.supported as l}
    <option value={l.code}>{l.label}</option>
  {/each}
</select>
```

`createLocaleStore` from `@h-ai/ui/i18n` selects a resolvable saved locale, then the complete navigator.languages list (followed by navigator.language), then defaultLocale and the first supported entry. An unsupported candidate never triggers an early default. Matching handles case, language shorthand and progressively less specific region/script tags, returning the configured code. Same-language variants follow supportedLocales order. detectBrowserLocale returns null without an actual match; an empty supported list ultimately keeps the caller default. SSR neither reads browser candidates nor changes global locale. Paraglide applications must still synchronize their own setLocale; custom store entries do not add built-in UI dictionaries.

#### Exported i18n utilities

```ts
import {
  createLocaleStore, // Svelte 响应式 locale store
  DEFAULT_LOCALE, // 默认 locale: 'zh-CN'
  DEFAULT_LOCALES, // 支持的 locale 列表
  detectBrowserLocale, // 检测浏览器语言
  getGlobalLocale, // 获取当前全局 locale
  interpolate, // 字符串插值（如 "Hello {name}"）
  isLocaleSupported, // 检查 locale 是否支持
  resolveLocale, // 解析 locale（支持回退）
  setGlobalLocale, // 设置全局 locale（同步 @h-ai/core）
} from '@h-ai/ui/i18n'
```

### Configuration driven authentication

State modules can import `authErrorMessage` from the lightweight `@h-ai/ui/i18n` entry without loading scene components. Admin profile password changes, mobile/desktop examples and generated templates share these messages.

Password login submits only `identifier` and `password`; `AuthPanel` maps the `LoginForm` field `username` to `identifier`. Server settings `session.maxAge` / `session.refreshTokenMaxAge` control session lifetimes. The login form has no per-login persistent-session option.

Agreement content can be configured as `agreements.userAgreementMarkdown` and `privacyPolicyMarkdown` using YAML `|`. The modal safely renders configured Markdown and prefers it over the URL of the same agreement. URL-only content stays in a sandboxed iframe.

```yaml
agreements:
  showOnRegister: true
  showOnLogin: false
  userAgreementMarkdown: |
    # 用户协议

    **账户使用条款**

    - 请妥善保管账户凭据。
  privacyPolicyMarkdown: |
    # 隐私政策

    注册资料用于账户管理，会话信息用于身份认证。
  # 可选 URL；同主题同时配置 Markdown 和 URL 时，弹窗优先显示 Markdown。
  # userAgreementUrl: https://example.com/terms
  # privacyPolicyUrl: https://example.com/privacy
```



AuthPanel accepts public IAM config and actions for password/LDAP/email/SMS login, registration and recovery. config.ui supplies layout, branding and images. LoginForm supports methods, onsendotp, otpLength and resendInterval; password forms accept passwordPolicy. Network and token storage remain in actions.

Use `authErrorMessage(error)` from `@h-ai/ui/components/scenes/iam/index` for authentication failures. It maps public codes to the current UI language, combines username/password failures, hides raw unknown/server errors and preserves a valid `traceId`. AuthPanel, OTP sending, sensitive confirmation and fullstack password changes share this mapping. Initial/expired passwords, reuse of the current password (`hai:iam:034`) and session limits have actionable messages. Authentication errors and successful operations use the unified Toast. Password confirmation compares exact strings without Unicode normalization or trimming and reports mismatches through Toast while retaining field associations.

AuthPanel disables native form controls during SSR and enables input after client mount binds events, preventing early input from being lost during hydration. Applications need no extra readiness code. E2E tests wait for editable controls and cover delayed client scripts.

When an authentication link points to the current complete URL, AuthPanel switches scenes without navigating again, so input entered after returning to login is preserved. Links with a different path, query, or hash use application routing. Modified clicks such as Ctrl/Cmd retain browser behavior.

`createSensitiveActions` can refresh database rules before an action through standard `actions.publicConfig()`. `SensitiveOperationsForm` shares line-based input, deduplication, validation and errors. Pass `operations`, async `onsubmit(operations)` returning HaiResult, and optional `ondone` for successful saves. Clearing database additions does not remove file rules.

Use `createSessionRecovery()` with `SessionRecoveryDialog` for expired sessions. Configure it with the public config and original `{ id, username }`, pass `recovery.recover` as Kit/API client's `recoverSession`, and give the dialog the same controller and standard actions. Call `cancel()` on teardown. The UI stores no passwords or business requests. `expectedUserId` restricts server session issuance to the original principal; captcha, lockout, access and password-renewal policies remain active. Cancellation preserves input and stops continuation; ambiguous network writes are never replayed. Reloaded/closed documents cannot recover lost in-memory drafts.

`createSensitiveActions(actions)` accepts Kit/API client authentication actions and shares confirmation, cancellation, retry, duplicate-submit and late-response handling. Create one per application root layout, update it with `configure(publicPolicy)`, and call `cancel()` on teardown. `authorize(operation)` returns undefined when confirmation is unnecessary, null when cancelled/busy, or the proof for that action. Do not send the business request on cancellation; pass a proof only to its intended request, never to global headers or persistent storage. Bind `ReauthenticationDialog` to the controller’s `open/loading/error/submit/cancel`; confirmation grants no permissions. `Input` supports `datetime-local`: convert its browser-local value to an explicit timestamp in the service layer.

```svelte
<!-- actions comes from Kit/API client; policy is the public IAM reauthentication policy. -->
<script lang='ts'>
  import type { SensitiveActionsOptions } from '@h-ai/ui'
  import { createSensitiveActions, ReauthenticationDialog } from '@h-ai/ui'

  const { actions, policy }: { actions: SensitiveActionsOptions, policy: { enabled: boolean, operations: string[] } } = $props()
  const confirmation = createSensitiveActions(actions)
  $effect(() => {
    confirmation.configure(policy)
    return () => confirmation.cancel()
  })
// Await confirmation.authorize(operation) in the business action; stop on null.
</script>
<ReauthenticationDialog
  open={confirmation.open}
  loading={confirmation.loading}
  error={confirmation.error}
  onsubmit={password => confirmation.submit(password)}
  onclose={() => confirmation.cancel()}
/>
```

[完整 IAM 配置 / IAM configuration](../iam/README.en.md)

### Onboarding and help center

Import `createGuide`, `GuideHost` and `HelpCenter` from `@h-ai/ui/guide`. No init/close is required. The tour engine loads when a tour starts; controls follow the current theme and include Chinese/English/Japanese translations. Business text uses application i18n callbacks.

The same entry exports `resolveGuideText(text?)` to evaluate strings or i18n callbacks; host components resolve text automatically.

Create the controller inside a layout component, register tours with id/title/steps and optional route/version, then mount `<GuideHost {guide} {locale} scope={user.id} autoStart='overview' />`. Add `data-guide` to existing target components. Supply the application's NavAdapter for SPA navigation.

```svelte
<script lang='ts'>
  import { createGuide, GuideHost } from '@h-ai/ui/guide'

  const guide = createGuide({
    nav,
    persistKey: 'my-app-guide',
    tours: [{
      id: 'users',
      version: 1,
      route: '/users',
      title: () => m.guide_users_title(),
      description: () => m.guide_users_description(),
      steps: [{
        target: 'users-create',
        title: () => m.guide_create_title(),
        description: () => m.guide_create_description(),
      }],
    }],
    articles: [{
      id: 'users-help',
      title: () => m.guide_users_title(),
      content: () => m.guide_users_markdown(),
      tourId: 'users',
    }],
  })
</script>

<GuideHost {guide} {locale} scope={user.id} autoStart='users' />
<Button onclick={() => guide.openHelp()}>{m.help()}</Button>
<!-- 在目标页面为现有按钮添加锚点，无需额外包装。 -->
<Button data-guide='users-create' onclick={createUser}>{m.create_user()}</Button>
```

`start(id)` returns Promise<boolean> and always allows replay; failure returns false and sets error. `startIfNeeded(id)` returns boolean and offers a first-use invitation. `openHelp(articleId?)` opens searchable Markdown help; `stop()` cancels without marking completion; `reset(id)` clears the current user's preference.

The close button, Escape, and overlay clicks cancel pending highlighting and clear `busy` even before the first positioning frame completes. A pending `start()` resolves to false without recording completion.

Persistence supports cookie (default), localStorage and memory, with an in-instance fallback when storage is restricted. Preferences are isolated by user and version. Later delays reminders for one day; Cookie preferences expire after one year. The default full-page navigation uses a short-lived sessionStorage record to start on the destination page.

Use `() => m.key()` for localized content and pass the current locale. Steps render as plain text; help uses the existing safe Markdown renderer with raw HTML disabled. Targets wait up to 3000ms by default; before(signal) prepares tabs or drawers, optional skips nonessential missing targets, and missing required targets stop the tour. Unmounting cancels pending work. Never share controllers across SSR users.

HelpCenter can also render a standalone page using articles, optional tours, locale, selectedId and onstart. The admin-console example and CLI fullstack Web/App/Desktop include first-use invitations, help and profile tours by default. See the [complete integration guide](../cli/templates/skills/hai-ui/guide.md).

### Other exports

```ts
// 类型
import type { ButtonProps, InputProps, ModalProps } from '@h-ai/ui'
```

```ts
// 样式工具
import { cn, generateId, getSizeClass, getVariantClass } from '@h-ai/ui'
```

```ts
// Toast 单例
import { toast } from '@h-ai/ui'
```

Agreements open in a Modal and preserve form input. Pages must allow iframe embedding; scripts are disabled and a new-window fallback is provided. LoginForm/RegisterForm expose `header/extraFields/footer`. AuthPanel forwards `loginHeader/loginFields/loginFooter` and `registerHeader/registerFields/registerFooter` while preserving navigation. Bind additional fields to application state and handle them in custom actions; they are not automatically sent to IAM. Use `type="button"` for extension buttons.

```svelte
<!-- config 来自 IAM 公开配置，actions 来自 Kit/API client；m 为应用翻译。 -->
<AuthPanel {config} {actions}>
  {#snippet loginHeader()}
    <p>{m.loginHelp()}</p>
  {/snippet}
  {#snippet registerFields()}
    <label><input type='checkbox' bind:checked={subscribe} />{m.subscribe()}</label>
  {/snippet}
</AuthPanel>
```


Component subpaths expose only explicit barrels in package.exports, such as `@h-ai/ui/components/primitives/index`. Component internals and storage helpers stay private; host clipboard registration remains public.

### Request locale isolation

Wrap Node requests and SSR in `core.i18n.runWithLocale(locale, () => handleRequest())`. SvelteKit can use `kit.i18n.runWithLocale(locale, () => resolve(event))`; serv creates the scope automatically from request headers. Async descendants inherit it. Explicit `MessageOptions.locale` takes precedence over the request locale and the startup default. Within a scope, `setGlobalLocale` only changes that request; outside a scope it configures the startup default and must not be called by request hooks.

Browsers keep application-level `setGlobalLocale` / `createLocaleStore`. During SSR, UI store initialization and setters only update the store; messages read the request scope. `runWithLocale` requires the Node entry; browser translations use explicit locale options or application state.

## Input limits and HTTP capabilities

Object keys are limited to 1024 UTF-8 bytes and reject absolute paths, backslashes, control characters and dot segments. Each public HTTP batch delete accepts 1–1000 entries. `@h-ai/storage/schemas` exposes the shared browser-safe rules. Presign expiry is an integer from 1 to 604800 seconds (Node default 3600, HTTP default 900). Upload signing accepts only key/contentType/expiresIn; contentLength/maxSize/metadata/checksum are unsupported. Invalid input returns HTTP 400 and the typed client maps it to VALIDATION_FAILED. FileUpload limits guide file selection; applications must validate actual objects on the server. Node streaming/checksum/conditional-write options have no default HTTP endpoints. See the [capability and authorization matrix (Chinese)](../storage/README.md#存储输入约束与跨端能力).

## Compact workspaces and collapsible filters

`WorkspaceLayout` shares a compact navigation header, a content area with 12/16px padding and an optional footer. An omitted footer reserves no space. title is the page title in navigation; leading/actions/footer are snippets. data-* attributes reach the content main. The host must pass down available height and min-height: 0.

A matching `PageHeader` omits the repeated title and retains its description and actions; `SettingsLayout` shares this behavior. Inside a workspace, `CrudPage` defaults to one navigation title and keeps actions in its toolbar. Standalone usage retains its title; showHeader explicitly overrides the default.

`FilterBar` keeps leading and actions visible, with children collapsed by default. bind:expanded controls disclosure, activeCount reports active conditions, and onreset supplies the built-in localized reset button. Collapsing preserves controls and values. The host resets state and performs queries. `TableToolbar` reuses this layout with a native query form; `CrudFilterBar` shares its implementation. `onsearch` submits the current bound search and filter drafts; `onfilterchange` only reports draft changes. `onreset` (`onclearfilters` on TableToolbar) must clear applied host conditions and query again. The old `toolbarStyle`, sorting popup and TableToolbar sorting props were removed; use DataTable `sortKey`, `sortDir` and `onsort`. Expanded filters adapt to 1/2/4/6 columns with 20px horizontal and 16px vertical gaps, aligned labels and equal control heights. Date ranges span two columns or the full row on narrow screens.

In this example, m, statusOptions, clearFilters and loadRows belong to the host application. The reset callback must clear search and all conditions.

```svelte
<script lang="ts">
  import { Button, FilterBar, Input, Select, WorkspaceLayout } from '@h-ai/ui'
  let search = $state('')
  let status = $state('')
</script>

<div class="flex h-dvh min-h-0">
  <WorkspaceLayout title={m.page_title()}>
    <FilterBar activeCount={status ? 1 : 0} onreset={clearFilters}>
      {#snippet leading()}<Input size="sm" bind:value={search} placeholder={m.search()} />{/snippet}
      {#snippet actions()}<Button size="sm" onclick={loadRows}>{m.search()}</Button>{/snippet}
      <div class="w-40"><Select size="sm" bind:value={status} options={statusOptions} /></div>
    </FilterBar>
  </WorkspaceLayout>
</div>
```

## Design and interaction acceptance

Use [hai-ui-design](../cli/templates/skills/hai-ui-design/SKILL.md) for page decisions, [hai-ui](../cli/templates/skills/hai-ui/SKILL.md) for implementation, and [hai-ui-review](../cli/templates/skills/hai-ui-review/SKILL.md) for rendered UI review. See the [shared design guidance](../../.agents/instructions/ui-design.md).

Tabs support arrow/Home/End navigation, disabled items and one Tab stop. Tables expose sort/loading state and keyboard row activation. Pagination labels follow locale and external page changes update the jump input. Expanded filters follow document focus order and view buttons expose selection. Empty/Alert wrap long content. theme.css imports shared tokens; focus follows the current theme and global.css respects reduced motion. Applications still implement filtering, sorting, paging and recovery.

## Error messages and correlated logs

HTTP errors carry safe localized messages and a reference ID. ToastContainer shows only the readable message by default; its diagnostic icon reveals the ID and copy action. The same ID remains in `error.traceId` and `X-Trace-Id`. The framework reuses the request ID to correlate browser and server logs. Sanitized exceptions, stacks and operation context remain in logs; internal cause/ext are not exposed. Field validation returns localized field names and messages only.

Use `core.error.toPublic(error, traceId?)` at HTTP/UI boundaries and `core.error.formatMessage(error)` after translating messages; formatting is idempotent. Pass complete Error objects to logs instead of discarding their context. Database failures log driver codes, sanitized messages/stacks and table/column context; SQL text, bound values and connection credentials are excluded.

## Optional interactive challenges

AuthPanel uses actions.createCaptcha to automatically create and asynchronously solve self-hosted ALTCHA when config.captcha.enabled, submitting one-use proofs for login/register/sendOtp/passwordReset/renewPassword. The solver is not loaded when disabled. createAuthActions supplies the action; custom actions must preserve captcha and missing actions fail closed. Proofs stay in request memory and are always verified/consumed on the server.

See policy, defaults and recovery boundaries in [IAM](../iam/README.en.md).

## Development and testing

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## License

Apache-2.0
