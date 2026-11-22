# @h-ai/ui API reference

<!-- translation: partial -->

[Chinese source](ui.md) · [Configuration](../configuration/ui.en.md) · [Data structures](../data/ui.en.md)

## Quick start

Import components through the public UI entry points. Keep authorization and persistence in the application. Supply controlled values and callbacks for interactive scenes.

Put this in a Svelte 5 page, such as `+page.svelte`.

```svelte
<script lang='ts'>
  import { Button, Card, Input } from '@h-ai/ui'

  let name = $state('')
  let submittedName = $state('')
</script>

<!-- Render a titled card containing the name controls and their preview. -->
<Card title='Preview a greeting'>
  <label for='greeting-name'>Name</label>
  <!-- Bind the text input to name and pair it with the matching label. Typing updates name. -->
  <Input id='greeting-name' bind:value={name} />
  <!-- Disable preview for blank names. Clicking when enabled trims name and shows the greeting. -->
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
<!-- The configured preprocessor supplies Button. This renders the primary Preview action. -->
<Button variant='primary'>Preview</Button>
```

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

<a id="api-reference"></a>

## Features

UI has no init/close lifecycle. Svelte owns component mounting. Each task lists interfaces and example inputs/results; callbacks, authorization and persistence belong to the host. Advanced walkthroughs remain partially translated and link to the corresponding Chinese section.

<a id="styles"></a>

### Integrate styles and imports: `autoImportHaiUi`

Load styles during the app build; the preprocessor imports actual template components.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `autoImportHaiUi()` | Add imports for components used in Svelte templates | No arguments. Register the returned preprocessor with Svelte to handle markup and file names. | `PreprocessorGroup; synchronous { code }` | `autoImportHaiUi()` |

#### Scenario: Configure styles and component imports

Enable component imports in the Svelte build and load shared styles in application CSS. The preprocessor adds imports during compilation. For extended examples, see the [Chinese walkthrough](ui.md#styles).

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { autoImportHaiUi } from '@h-ai/ui/auto-import'

export default {
  // Install the Hai UI preprocessor before Vite's Svelte preprocessor. It supplies imports for Hai components in templates.
  preprocess: [autoImportHaiUi(), vitePreprocess()],
}
```

<a id="forms"></a>

### Enter and submit data: form components

Keep field values in page state and update them through bindings. The application handles validated submissions.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<Button>` | click increments count | `variant` selects the visual style or state. `size` sets the component size. `loading` shows a pending state. `disabled` disables user interaction. `outline` uses the outlined style. `circle` renders a circular button. | click increments count | `<Button onclick={() => count += 1}>Add</Button>` |
| `<IconButton>` | Icon button and tooltip | `icon` supplies a trusted SVG string or a Svelte `Snippet` that renders the icon. `variant` selects the visual style or state. `size` sets the component size. `tooltip` sets the hover hint. `loading` shows a pending state. | Icon button and tooltip | `<IconButton icon='<svg viewBox="0 0 24 24"></svg>' tooltip='Save' />` |
| `<BareButton>` | Native button with accessible name | `class` adds CSS classes. `ariaLabel` sets the accessible name. `role` sets the accessibility role. `tabindex` controls keyboard focus order. | Native button with accessible name | `<BareButton ariaLabel='Save'>Save</BareButton>` |
| `<Input>` | Input updates name | `type` selects the input or display type. `value` supplies the current value and can be bound when supported. `size` sets the component size. `error` supplies an error message or state. `validationMessage` sets the text shown after validation fails. | Input updates name | `<Input bind:value={name} />` |
| `<BareInput>` | Input updates name | `type` selects the input or display type. `class` adds CSS classes. `accept` limits file types offered by the picker. `multiple` allows multiple selections. | Input updates name | `<BareInput type='text' bind:value={name} />` |
| `<Textarea>` | Multiline input updates notes | `value` supplies the current value and can be bound when supported. `rows` sets the initial visible line count. `size` sets the component size. `autoResize` adjusts height to the entered text. `error` supplies an error message or state. | Multiline input updates notes | `<Textarea bind:value={notes} rows={3} />` |
| `<Select>` | Selection updates status | `options` supplies the choices available to the user. `value` supplies the current value and can be bound when supported. `placeholder` sets the hint shown before input or selection. `size` sets the component size. `clearable` adds a control to clear the current value. `filterable` lets users filter choices by typing. [choice fields](#choice-options). | Selection updates status | `<Select options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `<Checkbox>` | Toggle updates enabled | `checked` sets whether the control is checked. `label` sets the displayed label. `size` sets the component size. `indeterminate` displays a partially checked state. | Toggle updates enabled | `<Checkbox bind:checked={enabled} label='Enabled' />` |
| `<Switch>` | Toggle updates enabled | `checked` sets whether the control is checked. `label` sets the displayed label. `size` sets the component size. | Toggle updates enabled | `<Switch bind:checked={enabled} label='Enabled' />` |
| `<Radio>` | Selection updates status | `options` supplies the choices available to the user. `value` supplies the current value and can be bound when supported. `direction` sets horizontal or vertical layout. `size` sets the component size. [choice fields](#choice-options). | Selection updates status | `<Radio options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `<ToggleCheckbox>` | Checked state updates enabled | `checked` sets whether the control is checked. `name` sets the name used for identification or grouping. `onchange` runs when the value changes. | Checked state updates enabled | `<ToggleCheckbox bind:checked={enabled} name='enabled' />` |
| `<ToggleInput>` | Checked state updates enabled | `checked` sets whether the control is checked. `name` sets the name used for identification or grouping. | Checked state updates enabled | `<ToggleInput bind:checked={enabled} name='enabled' />` |
| `<ToggleRadio>` | Selected radio control | `checked` sets whether the control is checked. `name` sets the name used for identification or grouping. `onchange` runs when the value changes. | Selected radio control | `<ToggleRadio name='choice' checked />` |
| `<Range>` | Dragging updates score | `value` supplies the current value and can be bound when supported. `min` sets the minimum allowed value. `max` sets the upper limit. `step` sets the interval between adjacent values. | Dragging updates score | `<Range min={0} max={100} bind:value={score} />` |
| `<Rating>` | Rating updates score | `value` supplies the current value and can be bound when supported. `max` sets the upper limit. | Rating updates score | `<Rating max={5} bind:value={score} />` |
| `<Badge>` | Badge showing New | `variant` selects the visual style or state. `size` sets the component size. `outline` uses the outlined style. | Badge showing New | `<Badge variant='info'>New</Badge>` |
| `<Avatar>` | Name-based avatar fallback | `src` supplies the image URL. `name` supplies a name for initials when no image is available. `size` sets the component size. `shape` sets the shape. `ring` toggles the surrounding ring. | Name-based avatar fallback | `<Avatar name='Ada' />` |
| `<Tag>` | Rendered tag | `text` supplies display text. `variant` selects the visual style or state. `size` sets the component size. `closable` shows a close control. | Rendered tag | `<Tag text='Release' />` |
| `<Spinner>` | Loading indicator | `size` sets the component size. `variant` selects the visual style or state. | Loading indicator | `<Spinner size='sm' />` |
| `<Progress>` | 30% progress | `value` supplies the current value and can be bound when supported. `max` sets the upper limit. `variant` selects the visual style or state. `striped` applies stripes. `animated` animates the progress indicator. | 30% progress | `<Progress value={3} max={10} />` |
| `<Form>` | Valid submission calls save | `columns` sets the number of columns or supplies column definitions. `labelPosition` places labels relative to fields. `labelWidth` sets the label column width. `loading` shows a pending state. `disabled` disables user interaction. `onsubmit` runs on form submission. | Valid submission calls save | `<Form onsubmit={save}><Input bind:value={name} /></Form>` |
| `<FormField>` | Label associated with input | `label` sets the displayed label. `for` associates the label with the input ID. `colSpan` sets the number of columns spanned by the field. `labelPosition` places labels relative to fields. `error` supplies an error message or state. `hint` supplies help text for the field. `required` marks the field as required. | Label associated with input | `<FormField label='Name' for='name'><Input id='name' bind:value={name} /></FormField>` |
| `<FormLayout>` | Two columns collapse on small screens | `columns` sets the number of columns or supplies column definitions. `labelPosition` places labels relative to fields. `labelWidth` sets the label column width. | Two columns collapse on small screens | `<FormLayout columns={2}><FormField label='Name'><Input bind:value={name} /></FormField></FormLayout>` |
| `<TagInput>` | Editing updates tags | `tags` supplies the current tags. `maxTags` limits the number of tags. `allowDuplicates` allows duplicate tags. `size` sets the component size. | Editing updates tags | `<TagInput bind:tags={tags} maxTags={5} />` |
| `<Combobox>` | Search and update selected value | `options` supplies the choices available to the user. `value` supplies the current value and can be bound when supported. `multiple` allows multiple selections. `placeholder` sets the hint shown before input or selection. `size` sets the component size. | Search and update selected value | `<Combobox options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `<Calendar>` | Selection updates DateValue | `value` supplies the current value and can be bound when supported. `minValue` sets the earliest selectable date. `maxValue` sets the latest selectable date. | Selection updates DateValue | `<Calendar bind:value={date} />` |
| `<DatePicker>` | Calendar popup updates date | `value` supplies the current value and can be bound when supported. `minValue` sets the earliest selectable date. `maxValue` sets the latest selectable date. `error` supplies an error message or state. `size` sets the component size. | Calendar popup updates date | `<DatePicker bind:value={date} />` |

<a id="choice-options"></a>

#### Choice fields

| Field | Type | Default | Purpose and when it applies |
| --- | --- | --- | --- |
| `value` | `T` | Required | Value written to the binding when this choice is selected. |
| `label` | `string` | Required | Choice label displayed to the user. |
| `disabled` | `boolean` | Unset (selectable) | Set `true` to prevent selection. |

```svelte
<script lang="ts">
  import { Select } from '@h-ai/ui'

  let status = $state('draft')
  const options = [
    { value: 'draft', label: 'Draft' },
    { value: 'done', label: 'Done' },
    { value: 'archived', label: 'Archived', disabled: true },
  ]
</script>

<Select {options} bind:value={status} />
<output>{status}</output>
```

Selecting Done displays `done`. Archived is disabled and leaves `status` unchanged.

#### Scenario: Select the same date in two controls

Keep field values in page state and update them through bindings. The application handles validated submissions. For extended examples, see the [Chinese walkthrough](ui.md#forms).

```svelte
<script lang='ts'>
  import { Calendar, DatePicker } from '@h-ai/ui'
  import { CalendarDate } from '@internationalized/date'
  let date = $state(new CalendarDate(2026, 11, 17))
</script>
<!-- Display the initial November 17 date in the calendar. Selection updates the shared bound date. -->
<Calendar bind:value={date} />
<!-- Bind the picker to the same date. Picking a day updates both controls. -->
<DatePicker bind:value={date} />
```

<a id="overlays"></a>

### Open dialogs and menus: overlay components

Control dialogs, drawers and confirmation with open state; attach menus and hints to page controls.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<Modal>` | Open and close update open | `open` controls whether it is open. `title` sets the title. `size` sets the component size. `radius` sets the corner radius. `bodyOverflow` controls how overflowing content is handled. `showClose` toggles the close button. | Open and close update open | `<Modal bind:open={open} title='Details'>Order 42</Modal>` |
| `<Drawer>` | Drawer with bound open state | `open` controls whether it is open. `position` sets placement. `title` sets the title. `size` sets the component size. `width` sets the displayed width. `resizable` allows resizing the drawer by dragging. `widthStorageKey` sets the storage key for remembering drawer width. | Drawer with bound open state | `<Drawer bind:open={open} title='Details'>Order 42</Drawer>` |
| `<Confirm>` | Confirmation calls confirm | `open` controls whether it is open. `title` sets the title. `message` supplies the message body. `variant` selects the visual style or state. `onconfirm` runs when the user confirms. | Confirmation calls confirm | `<Confirm bind:open={open} message='Continue?' onconfirm={confirm} />` |
| `<Popover>` | Click opens; Escape closes | `open` controls whether it is open. `position` sets placement. `trigger` chooses the trigger content or interaction. `offset` sets the gap between the overlay and its trigger. `portal` moves the overlay outside clipping containers. | Click opens; Escape closes | `<Popover>{#snippet trigger()}<Button>Open</Button>{/snippet}Details</Popover>` |
| `<Dropdown>` | Action menu | `items` supplies the items in display order. `trigger` chooses the trigger content or interaction. `triggerClass` adds CSS classes to the trigger. `position` sets placement. | Action menu | `<Dropdown items={menuItems}><Button>Actions</Button></Dropdown>` |
| `<Tooltip>` | Help on hover or focus | `content` supplies the body or snippet to render. `position` sets placement. `delay` sets the delay before the hint appears. `portal` moves the overlay outside clipping containers. | Help on hover or focus | `<Tooltip content='Save order'><Button>Save</Button></Tooltip>` |

#### Scenario: Open and close order details

Control dialogs, drawers and confirmation with open state; attach menus and hints to page controls. For extended examples, see the [Chinese walkthrough](ui.md#overlays).

```svelte
<script lang='ts'>
  import { Button, Modal } from '@h-ai/ui'
  let open = $state(false)
</script>
<!-- Open the details dialog when the button is clicked. -->
<Button onclick={() => open = true}>Details</Button>
<!-- Display Order 42 when open is true. Dismissing the dialog updates the bound state. -->
<Modal bind:open title='Details'>Order 42</Modal>
```

<a id="tables"></a>

### Display records and navigation: data components

Pass loaded records and column definitions. Application callbacks load data when the user changes pages, sort order or tabs.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<Card>` | Title and content | `title` sets the title. `bordered` toggles the border. `shadow` sets the shadow. `padding` sets the inner spacing. | Title and content | `<Card title='Order'>Order 42</Card>` |
| `<JsonViewer>` | Expandable JSON | `value` supplies the current value and can be bound when supported. `defaultExpandedDepth` sets the initially expanded JSON depth. `maxScalarLength` limits the scalar preview length. `showCopy` toggles the copy button. `onCopy` handles the copy action. | Expandable JSON | `<JsonViewer value={{ status: 'pending' }} />` |
| `<DataTable>` | Rows rendered by columns; host loads data | `data` provides the data to display. `columns` defines display and sorting for each column. `keyField` chooses the field that uniquely identifies a row. `loading` shows a pending state. `sortKey` sets the active sort column. `sortDir` sets the active sort direction. `onsort` receives the requested sorting change. `cell` customizes table cell content. `onrowclick` receives the row the user clicked. [field table](#datatable-options) | Rows rendered by columns; host loads data | `<DataTable data={rows} {columns} keyField='id' />` |
| `<Accordion>` | Expand and collapse supplied content | `items` supplies the items in display order. | Expand and collapse supplied content | `<Accordion items={accordionItems} />` |
| `<Timeline>` | Timeline in supplied order | `items` supplies the items in display order. | Timeline in supplied order | `<Timeline items={timelineItems} />` |
| `<Tabs>` | Tab selection updates activeTab | `items` supplies the items in display order. `active` selects the active item. `type` selects the input or display type. `size` sets the component size. `lazy` defers rendering a pane until it is first opened. `onactivate` runs the first time a tab is activated. | Tab selection updates activeTab | `<Tabs items={tabItems} bind:active={activeTab} />` |
| `<Pagination>` | Three pages; navigation updates page | `page` sets the current page, starting at 1. `total` supplies the total number of matching records. `pageSize` sets the number of records per page. `showTotal` shows the total record count. `showJumper` shows the page jump input. `showSizeChanger` shows the page size selector. `showPageInfo` shows page information. `showFirstLast` shows first and last page buttons. [field table](#pagination-options) | Three pages; navigation updates page | `<Pagination total={42} pageSize={20} bind:page />` |
| `<Breadcrumb>` | Hierarchy and links | `items` supplies the items in display order. `separator` sets the separator between adjacent items. | Hierarchy and links | `<Breadcrumb items={[{ label: 'Orders', href: '/orders' }, { label: '42' }]} />` |
| `<Steps>` | Current step indicator | `items` supplies the items in display order. `current` identifies the current step. `direction` sets horizontal or vertical layout. `clickable` lets users click a step. | Current step indicator | `<Steps items={stepItems} current={1} />` |
| `<Skeleton>` | Three placeholders | `variant` selects the visual style or state. `width` sets the displayed width. `height` sets the height. `count` sets how many items are rendered. | Three placeholders | `<Skeleton count={3} />` |
| `<Empty>` | Empty state | `title` sets the title. `description` supplies explanatory text. `icon` sets the displayed icon. | Empty state | `<Empty title='No orders' />` |
| `<Result>` | Result state | `status` selects the outcome or status to display. `title` sets the title. `description` supplies explanatory text. | Result state | `<Result status='success' title='Saved' />` |
| `<PageHeader>` | Page heading and actions | `title` sets the title. `description` supplies explanatory text. `actions` supplies available actions or action content. | Page heading and actions | `<PageHeader title='Orders' description='Current orders' />` |

<a id="datatable-options"></a>

#### Data table columns and sorting

| Field | Type | Default | Purpose and when it applies |
| --- | --- | --- | --- |
| `columns[].key` | `keyof T` / `string` | Required | Selects the field used for display and sorting. |
| `columns[].label` | `string` | Required | Text displayed in the column heading. |
| `columns[].width` | `string` | Automatic | Sets a CSS width such as `8rem`. |
| `columns[].align` | `left` / `center` / `right` | Inherited table styles | Sets horizontal cell alignment. |
| `columns[].sortable` | `boolean` | Off | Enables sorting via the column heading. Without `onsort`, only the current `data` is sorted. |
| `columns[].render` | `(item: T) => string` | Field value | Receives the row and formats cell text. A `cell` snippet takes over rendering when supplied. |
| `columns[].onclick` | `(item: T) => void` | Unset | Receives the corresponding row when its cell in this column is clicked. |
| `sortKey / sortDir` | `string` / `asc` / `desc` / `null` | Unsorted | Control the active sorting when `onsort` is supplied. |
| `onsort` | `(key, dir) => void` | Table sorts the current data | When supplied, the host receives sort requests and passes in the updated rows. The table leaves their order intact. |

<a id="pagination-options"></a>

#### Pagination control fields

| Field | Type | Default | Purpose and when it applies |
| --- | --- | --- | --- |
| `page / total` | `number` | Supplied by the caller | Current page and total matching rows. Page numbers start at 1. |
| `pageSize` | `number` | `10` | Used to calculate the number of pages. |
| `showTotal / showPageInfo / showFirstLast` | `boolean` | `true` | Show the total row count, page information, and first/last buttons respectively. |
| `showJumper / showSizeChanger` | `boolean` | `false` | Show the page jump input and the page size selector respectively. |
| `pageSizeOptions` | `number[]` | `[10, 20, 50, 100]` | Supplies choices only when the page size selector is displayed. |
| `labels` | `PaginationProps["labels"]` | Current component translations | Overrides pager text. The `total` label uses `{count}`, `pageSize` uses `{size}`, and `pageInfo` uses `{page}` and `{total}`. |

```svelte
<script lang="ts">
  import { DataTable, Pagination } from '@h-ai/ui'

  let page = $state(1)
  const data = [{ id: 'b2', name: 'Bex' }, { id: 'a1', name: 'Ada' }]
  const columns = [{ key: 'name', label: 'Name', sortable: true }]
</script>

<DataTable {data} {columns} keyField="id" />
<Pagination bind:page total={42} pageSize={10} showJumper />
<output>{page}</output>
```

The table starts with Bex, Ada. Clicking Name once reorders it to Ada, Bex. There are five pages and jumping to page 3 displays `3`.

#### Scenario: Display records and handle pagination

Pass loaded records and column definitions. Application callbacks load data when the user changes pages, sort order or tabs. For extended examples, see the [Chinese walkthrough](ui.md#tables).

```svelte
<script lang='ts'>
  import { Button, Input, Modal } from '@h-ai/ui'
  let username = $state('')
  let open = $state(false)
</script>
<!-- Forward the supplied test and analytics attributes. Clicking Save opens the bound dialog. -->
<Button data-testid='save-button' data-analytics-id='settings.save' onclick={() => { open = true }}>保存</Button>
<!-- Render the identified input and sync edits to username. -->
<Input data-testid='username-input' bind:value={username} />
<!-- Use the bound open state to show confirmation for the entered username, with the given test ID. -->
<Modal data-testid='confirm-modal' bind:open>确认保存 {username}？</Modal>
```

<a id="mobile"></a>

### Handle mobile interaction: mobile components

Provide mobile navigation, action sheets and refresh gestures. Application callbacks perform the requests.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<ActionSheet>` | Selection calls selectAction | `open` controls whether it is open. `title` sets the title. `items` supplies the items in display order. `cancelText` sets the cancel button label. `onselect` receives the selected item. | Selection calls selectAction | `<ActionSheet bind:open={open} items={sheetItems} onselect={selectAction} />` |
| `<AppBar>` | Title and back navigation | `title` sets the title. `backHref` sets the back link destination. `onback` handles the back action. `fixed` fixes the component to the viewport. `safeArea` reserves device safe-area space. | Title and back navigation | `<AppBar title='Orders' backHref='/orders' />` |
| `<BottomNav>` | Navigation controls | `items` supplies the items in display order. `active` selects the active item. `centered` centers the navigation. `maxWidth` sets the maximum width. | Navigation controls | `<BottomNav items={navItems} active='home' />` |
| `<InfiniteScroll>` | Boundary calls loadMore | `loading` shows a pending state. `finished` stops loading after all results are fetched. `threshold` sets the trigger threshold. `onload` requests more data when the scroll condition is met. | Boundary calls loadMore | `<InfiniteScroll loading={loading} finished={finished} onload={loadMore} />` |
| `<PullRefresh>` | Pull gesture calls refresh | `refreshing` indicates that a refresh is in progress. `threshold` sets the trigger threshold. `onrefresh` requests a refresh when the pull gesture meets the threshold. | Pull gesture calls refresh | `<PullRefresh refreshing={loading} onrefresh={refresh}>Orders</PullRefresh>` |
| `<SafeArea>` | Safe-area padding | `top` reserves the top safe area. `bottom` reserves the bottom safe area. `left` reserves the left safe area. `right` reserves the right safe area. | Safe-area padding | `<SafeArea top bottom>Orders</SafeArea>` |
| `<SwipeCell>` | Swipe reveals actions and reports selection | `leftActions` supplies actions revealed on the left. `rightActions` supplies actions revealed on the right. `threshold` sets the trigger threshold. `onaction` handles the selected swipe action. | Swipe reveals actions and reports selection | `<SwipeCell rightActions={swipeActions} onaction={selectAction}>Order 42</SwipeCell>` |

#### Scenario: Handle mobile navigation, refresh and loading

Provide mobile navigation, action sheets and refresh gestures. Application callbacks perform the requests. For extended examples, see the [Chinese walkthrough](ui.md#mobile).

<a id="workspace"></a>

### Organize workspaces and settings: layouts

Arrange headings, actions and content in a workspace while retaining query fields in page state.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<SettingsModal>` | Settings modal | `open` controls whether it is open. `onclose` handles the close event. | Settings modal | `<SettingsModal bind:open={open} />` |
| `<SettingsLayout>` | Settings navigation and content | `title` sets the title. `description` supplies explanatory text. `sections` supplies the settings sections. `active` selects the active item. `onselect` receives the selected item. | Settings navigation and content | `<SettingsLayout title='Settings' sections={sections} active='profile'>Profile</SettingsLayout>` |
| `<WorkspaceLayout>` | Workspaces | `title` sets the title. `leading` supplies the leading content snippet. | Content fills available height | `<WorkspaceLayout title='Orders'>Orders</WorkspaceLayout>` |
| `<FilterBar>` | Collapsible filters | `activeCount` shows how many filters are active. `onreset` handles reset. `expanded` controls whether filters are expanded. | Collapse retains input values | `<FilterBar activeCount={0}>Filters</FilterBar>` |
| `<TableToolbar>` | Table query toolbar | `searchValue` sets the current search text. `onsearch` receives search input or the submitted query. `onclearfilters` handles clearing the filters. | Submission notifies host | `<TableToolbar bind:searchValue={search} onsearch={query} />` |

#### Scenario: Combine filters and records in a workspace

Arrange headings, actions and content in a workspace while retaining query fields in page state. For extended examples, see the [Chinese walkthrough](ui.md#workspace).

```svelte
<script lang='ts'>
  import { Button, FilterBar, Input, Select, WorkspaceLayout } from '@h-ai/ui'

  let search = $state('')
  let status = $state('')
</script>

<div class='flex h-dvh min-h-0'>
  <!-- Render the translated workspace title and its filter toolbar. -->
  <WorkspaceLayout title={m.page_title()}>
    <!-- Show the active status count and call the app's clearFilters when reset is requested. -->
    <FilterBar activeCount={status ? 1 : 0} onreset={clearFilters}>
      <!-- Put the small search input in the leading slot and update search as the user types. -->
      {#snippet leading()}<Input size='sm' bind:value={search} placeholder={m.search()} />{/snippet}
      <!-- Put the small search button in the actions slot and invoke loadRows on click. -->
      {#snippet actions()}<Button size='sm' onclick={loadRows}>{m.search()}</Button>{/snippet}
      <!-- Offer the app's status choices and write the selected value to status. -->
      <div class='w-40'><Select size='sm' bind:value={status} options={statusOptions} /></div>
    </FilterBar>
  </WorkspaceLayout>
</div>
```

<a id="notifications"></a>

### Report operation results: `toast`, `messageBox`

Send results, errors and confirmation to shared hosts; use returned IDs to remove individual notifications.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `useToastFeedback(message, variant?)` | Show a reactive error or status in the shared toast host | `message` provides a localized message or no value. Optional `variant` defaults to `error`. | `void; source-owned toast lifecycle` | `useToastFeedback(() => errorMessage(error))` |
| `notifySuccess(message, duration?)` | Report a successful operation | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `toast ID string` | `notifySuccess(m.saved())` |
| `notifyInfo(message, duration?)` | Show an informational result | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `toast ID string` | `notifyInfo(m.loading())` |
| `notifyWarning(message, duration?)` | Show a warning the user can act on | `message` is the localized warning. `duration` is the time before dismissal in milliseconds. It defaults to 5000. Use 0 to keep it visible. | `toast ID string` | `notifyWarning(m.warning())` |
| `notifyError(error, fallback?, duration?)` | Show a safe error message | `error` supplies the failure from which to extract a safe message and trace ID. `fallback` is localized text for failures without a displayable message. `duration` defaults to 5000 ms. Use 0 to keep it visible. | `toast ID string; internal exception text hidden` | `notifyError(error, m.retry())` |
| `errorMessage(error, fallback?)` | Extract a message safe to show to the user | `error` is the failure to read for a safe display message. `fallback` is localized text to use when no displayable message is available. | `safe localized string` | `errorMessage(error, m.retry())` |
| `toast.add(props)` | Add a notification | `props` sets the text, style, duration, position and dismiss controls. See [notification fields](#toast-options). | `string item ID` | `toast.add({ message: m.saved(), variant: "success" })` |
| `toast.success(message, duration?)` | Report success | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `string item ID` | `toast.success(m.result())` |
| `toast.info(message, duration?)` | Show information | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `string item ID` | `toast.info(m.result())` |
| `toast.warning(message, duration?)` | Show a warning | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `string item ID` | `toast.warning(m.result())` |
| `toast.error(message, duration?)` | Show a safe error | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `string item ID` | `toast.error(m.result())` |
| `toast.remove(id)` | Remove one notification by ID | `id` is the identifier returned when the notification was created. It selects the notification to act on. | `void` | `toast.remove(id)` |
| `toast.clear()` | Clear all notifications | No arguments. | `void` | `toast.clear()` |
| `message.add(options)` | Add a notification | `options` is localized text or an object specifying text, style, duration and dismiss controls. See [message fields](#message-options). | `string item ID` | `message.add({ message: m.saved(), type: "success" })` |
| `message.success(message, duration?)` | Report success | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `string item ID` | `message.success(m.result())` |
| `message.info(message, duration?)` | Show information | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `string item ID` | `message.info(m.result())` |
| `message.warning(message, duration?)` | Show a warning | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `string item ID` | `message.warning(m.result())` |
| `message.error(message, duration?)` | Show a safe error | `message` is the localized text to display. `duration` is the time before automatic dismissal in milliseconds. It defaults to 3000. Use 0 to keep it visible. | `string item ID` | `message.error(m.result())` |
| `message.remove(id)` | Remove one notification by ID | `id` is the identifier returned when the notification was created. It selects the notification to act on. | `void` | `message.remove(id)` |
| `message.clear()` | Clear all notifications | No arguments. | `void` | `message.clear()` |
| `toast.pause(id)` | Pause automatic dismissal | `id` is the identifier returned when the notification was created. It selects the notification to act on. | `void` | `toast.pause(id)` |
| `toast.resume(id)` | Resume automatic dismissal | `id` is the identifier returned when the notification was created. It selects the notification to act on. | `void` | `toast.resume(id)` |
| `messageBox.confirm(options)` | Wait for confirmation or cancellation | `options` is localized text or an object configuring the title, buttons and closing behavior. See [dialog fields](#message-box-options). | `Promise<boolean>; host handles confirmation/cancellation` | `messageBox.confirm({ message: m.confirm() })` |
| `messageBox.alert(options)` | Wait for acknowledgement | `options` is localized text or an object configuring the title, buttons and closing behavior. See [dialog fields](#message-box-options). | `Promise<boolean>; host handles confirmation/cancellation` | `messageBox.alert({ message: m.confirm() })` |
| `<Alert>` | Persistent informational state | `variant` selects the visual style or state. `title` sets the title. `dismissible` controls whether a dismiss button appears. | Persistent informational state | `<Alert variant='info' title='Saved' />` |
| `<ToastContainer>` | Global toast queue | Mount once in the root layout. `toast` and `message` push into its shared queue. | Global toast queue | `<ToastContainer />` |
| `<ErrorPage>` | 503 state and home navigation | `status` selects the outcome or status to display. `code` sets the error or tracking code to display. `title` sets the title. `description` supplies explanatory text. `homeUrl` sets the home link destination. `onhome` handles the home action. `onback` handles the back action. | 503 state and home navigation | `<ErrorPage status={503} homeUrl='/' />` |

#### Scenario: Show results and manage notification lifetime

Send results, errors and confirmation to shared hosts; use returned IDs to remove individual notifications. For extended examples, see the [Chinese walkthrough](ui.md#notifications).

```svelte
<script>
  import { toast, ToastContainer } from '@h-ai/ui'

  function notify() {
    // Queue the supplied message as a success toast.
    toast.success('操作成功')
    // Queue the supplied message using the error style.
    toast.error('操作失败')
    // Queue the supplied caution message as a warning.
    toast.warning('请注意')
    // Queue the info message with a 5,000 ms lifetime.
    toast.info('提示信息', 5000) // 自定义持续时间
  }
</script>

<button onclick={notify}>通知</button>
<!-- Mount the view that renders the four notifications queued by notify. -->
<ToastContainer />
```

<a id="auth"></a>

### Connect sign-in and permission UI: auth components

Forms collect credentials and call host authentication actions. Public policy controls available choices; the server verifies access.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `matchPermission(required, userPermissions)` | Check permission for frontend presentation | `required` is the permission the UI action needs. `userPermissions` lists the permission keys granted to the current user. | `boolean; not server authorization` | `matchPermission("orders:read", ["orders:*"])` |
| `setPermissionContext(getPermissions)` | Provide current permissions to descendant components | `getPermissions` returns the current permission keys. Register it during component initialization. | `void` | `setPermissionContext(() => user.permissions)` |
| `usePermission()` | Read the current permission context | `none; component initialization only` | `PermissionContext with hasPerm/hasAnyPerm/hasAllPerms` | `usePermission()` |
| `createSensitiveActions(options)` | Request proof for one sensitive operation | `options` provides the `reauthenticate` callback for step-up verification and an optional `publicConfig` callback for reading public policy. | `SensitiveActions: configure/authorize/submit/cancel` | `createSensitiveActions(actions)` |
| `createSessionRecovery()` | Coordinate signing the same user back in | `none; configure public config and current user afterward` | `SessionRecovery controller` | `createSessionRecovery()` |
| `<AuthPanel>` | Policy-driven authentication actions | `config` sets public policy for sign-in methods and entry points. `actions` implements sign-in, registration, recovery and other authentication requests. `loginHeader` customizes the top of the sign-in form. `registerHeader` customizes the top of the registration form. `loginFields` inserts extra sign-in fields. `loginFooter` customizes the sign-in form footer. `registerFields` inserts extra registration fields. `registerFooter` customizes the registration form footer. | Policy-driven authentication actions | `<AuthPanel {config} {actions} />` |
| `<AuthShell>` | Authentication layout | `variant` selects the visual style or state. `title` sets the title. `subtitle` sets the subtitle. `brandTitle` sets the brand heading. `brandText` sets the brand description. `illustration` supplies the illustration. `description` supplies explanatory text. `highlights` supplies the highlighted points. | Authentication layout | `<AuthShell title='Sign in'>Account form</AuthShell>` |
| `<LoginForm>` | Login fields passed to login | `loading` shows a pending state. `errors` supplies server validation errors by field. `showForgotPassword` toggles the forgot-password entry. `onsubmit` runs on form submission. | Login fields passed to login | `<LoginForm onsubmit={login} />` |
| `<RegisterForm>` | Registration fields passed to register | `loading` shows a pending state. `errors` supplies server validation errors by field. `fields` selects the fields to display or collect. `onsubmit` runs on form submission. | Registration fields passed to register | `<RegisterForm onsubmit={register} />` |
| `<ForgotPasswordForm>` | Password recovery submission | `mode` selects the component mode. `loading` shows a pending state. `errors` supplies server validation errors by field. `onsubmit` runs on form submission. | Password recovery submission | `<ForgotPasswordForm onsubmit={sendReset} />` |
| `<ResetPasswordForm>` | Password reset submission | `loading` shows a pending state. `errors` supplies server validation errors by field. `showCode` toggles the verification code input. `onsubmit` runs on form submission. | Password reset submission | `<ResetPasswordForm onsubmit={resetPassword} />` |
| `<ChangePasswordForm>` | Password change submission | `loading` shows a pending state. `errors` supplies server validation errors by field. `requireOldPassword` decides whether the old password is required. `onsubmit` runs on form submission. | Password change submission | `<ChangePasswordForm onsubmit={changePassword} />` |
| `<PasswordInput>` | Updates password and displays strength | `value` supplies the current value and can be bound when supported. `showToggle` toggles the password visibility control. `showStrength` toggles the strength indicator. `minLength` sets the minimum length used for password checks. | Updates password and displays strength | `<PasswordInput bind:value={password} showStrength />` |
| `<ReauthenticationDialog>` | Reauthentication submit/cancel callbacks | `open` controls whether it is open. `loading` shows a pending state. `error` supplies an error message or state. `onsubmit` runs on form submission. `onclose` handles the close event. | Reauthentication submit/cancel callbacks | `<ReauthenticationDialog open={confirmation.open} onsubmit={confirmation.submit} onclose={confirmation.cancel} />` |
| `<PermGuard>` | Permission-based visibility; server still authorizes | `permissions` lists the permission keys to check before showing content. `mode` chooses whether all or any requested permissions are required. `fallback` supplies fallback content. | Permission-based visibility; server still authorizes | `<PermGuard permissions='orders:read'>Orders</PermGuard>` |
| `<UserProfile>` | Only true completes editing | `user` supplies the user profile to show or edit. `editable` enables editing. `fields` selects the fields to display or collect. `avatarAccept` limits the allowed avatar file types. `avatarHint` sets help text for avatar input. `onsubmit` runs on form submission. | Only true completes editing | `<UserProfile {user} editable onsubmit={saveProfile} />` |
| `<SessionRecoveryDialog>` | Recover original user session or cancel | `recovery` supplies the session recovery controller and state. `actions` supplies available actions or action content. | Recover original user session or cancel | `<SessionRecoveryDialog {recovery} {actions} />` |
| `<SensitiveOperationsForm>` | Sensitive-operation policy submission | `operations` supplies the sensitive operations to configure. `onsubmit` runs on form submission. `ondone` handles completion. | Sensitive-operation policy submission | `<SensitiveOperationsForm {operations} onsubmit={saveOperations} />` |

#### Scenario: Connect public policy and authentication actions

Forms collect credentials and call host authentication actions. Public policy controls available choices; the server verifies access. For extended examples, see the [Chinese walkthrough](ui.md#auth).

```svelte
<!-- actions 为 Kit/API client 的标准认证动作；policy 为 IAM 公开再认证策略。 -->
<script lang='ts'>
  import type { SensitiveActionsOptions } from '@h-ai/ui'
  import { createSensitiveActions, ReauthenticationDialog } from '@h-ai/ui'

  const { actions, policy }: { actions: SensitiveActionsOptions, policy: { enabled: boolean, operations: string[] } } = $props()
  // Create a reauthentication controller using the application's auth actions. It tracks the pending challenge and result.
  const confirmation = createSensitiveActions(actions)
  $effect(() => {
    // Configure which operations require confirmation using the supplied IAM policy.
    confirmation.configure(policy)
    // Cancel the pending confirmation on effect cleanup, resolving the pending authorizer without a credential.
    return () => confirmation.cancel()
  })
// 业务动作 await confirmation.authorize(operation)；null 时中止该动作。
</script>
<!-- Show the challenge, loading state, and last error from the controller. Submit forwards the entered password and close cancels the request. -->
<ReauthenticationDialog
  open={confirmation.open}
  loading={confirmation.loading}
  error={confirmation.error}
  onsubmit={password => /* Send the entered password to the controller. Success resolves the operation credential, and failure updates the dialog error. */ confirmation.submit(password)}
  onclose={() => /* Cancel the pending request and resolve it without a credential. */ confirmation.cancel()}
/>
```

<a id="uploads"></a>

### Select and upload files: storage components

Call uploadHandler after selection; image controls update their URL on success. The application owns file storage.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<FileUpload>` | Selected files passed to upload | `accept` limits file types offered by the picker. `maxSize` limits each file’s size. `maxFiles` limits the number of selectable files. `multiple` allows multiple selections. `uploadHandler` performs the host upload and returns the result used to update the UI. | Selected files passed to upload | `<FileUpload accept='.txt' uploadHandler={upload} />` |
| `<ImageUpload>` | Successful upload updates image URL | `value` supplies the current value and can be bound when supported. `accept` limits file types offered by the picker. `maxSize` limits each file’s size. `aspectRatio` sets the preview or crop aspect ratio. `uploadHandler` performs the host upload and returns the result used to update the UI. | Successful upload updates image URL | `<ImageUpload bind:value={imageUrl} uploadHandler={uploadImage} />` |
| `<AvatarUpload>` | Successful upload updates avatar URL | `value` supplies the current value and can be bound when supported. `size` sets the component size. `maxSize` limits each file’s size. `fallback` supplies fallback content. `uploadHandler` performs the host upload and returns the result used to update the UI. | Successful upload updates avatar URL | `<AvatarUpload bind:value={imageUrl} uploadHandler={uploadImage} />` |
| `<FileList>` | Displays supplied files | `files` supplies the files to display. `layout` selects the file layout. `showDelete` shows the delete control. `showDownload` shows the download control. | Displays supplied files | `<FileList files={files} />` |

#### Scenario: Choose files and call an upload service

Call uploadHandler after selection; image controls update their URL on success. The application owns file storage. For extended examples, see the [Chinese walkthrough](ui.md#uploads).

<a id="crypto"></a>

### Display encryption results: crypto components

Display real computed results; these components do not own keys or verify signatures.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<EncryptedInput>` | Updates current ciphertext only on success | `value` supplies the current value and can be bound when supported. `encryptedValue` supplies the encrypted result to show. `algorithm` supplies the algorithm name shown by the UI. `showEncrypted` toggles the encrypted value display. | Updates current ciphertext only on success | `<EncryptedInput bind:value={plain} bind:encryptedValue={cipher} onencrypt={encrypt} />` |
| `<HashDisplay>` | Displays an existing digest | `value` supplies the current value and can be bound when supported. `algorithm` supplies the algorithm name shown by the UI. `copyable` enables the copy action. `truncate` controls truncation of long values. | Displays an existing digest | `<HashDisplay value={digest} algorithm='SM3' />` |
| `<SignatureDisplay>` | Displays supplied signature and verified state | `signature` supplies the signature to display. `publicKey` supplies the public key to display. `algorithm` supplies the algorithm name shown by the UI. `verified` shows the verification result supplied by the host. | Displays supplied signature and verified state | `<SignatureDisplay {signature} {publicKey} verified />` |

#### Scenario: Display ciphertext, digests and verification

Display computed ciphertext, digests and verification results; provide EncryptedInput encryption through onencrypt. For extended examples, see the [Chinese walkthrough](ui.md#crypto).

<a id="documents"></a>

### Read, edit and download documents: AI content

A Web Worker parses and highlights long Markdown documents in the browser. Streaming updates are coalesced. Multi-page PDF export captures the DOM first, then uses a Worker to find page breaks and encode page PNGs when OffscreenCanvas is available.

Pass text, Markdown, tables or document data to viewers and connect editing, downloads and citation actions.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `parseMarkdown(content, options?)` | Convert Markdown to safe display HTML | `content: string` is the Markdown source. See [parse options](#markdown-parse-options) for optional `options: MarkdownParseOptions`. | `HTML string; raw HTML escaped or allowlisted` | `parseMarkdown("# Hello", { allowHtmlTags: false })` |
| `renderMarkdownDocument(content, options?)` | Parse content with outline and code-block metadata | `content: string` is the Markdown source. See [parse options](#markdown-parse-options) for optional `options: MarkdownDocumentParseOptions`. | `MarkdownRenderResult with outline/codeBlocks/blocks` | `renderMarkdownDocument("# Report", { allowHtmlTags: false })` |
| `isLanguageSupported(lang)` | Check whether syntax highlighting supports a language | `lang` is the language identifier to check, such as `typescript`. | `boolean` | `isLanguageSupported("typescript")` |
| `highlightCode(text, lang)` | Escape and highlight source code for display | `text` is the original code. `lang` selects its highlighting rules. | `escaped/highlighted HTML string` | `highlightCode("const total = 1", "typescript")` |
| `resolveDocumentMarkdownContent(value, kind?, language?)` | Prepare document content as Markdown | `value` is the source content. `kind` defaults to `markdown`; `code` wraps the source in a fence. `language` labels that fence in code mode. | `Markdown string with a safe fence length` | `resolveDocumentMarkdownContent("const x = 1", "code", "ts")` |
| `resolveDocumentDownloadActions(actions?)` | Resolve configured document download choices | `actions` selects the download menu entries. Omit it or pass an empty array for Word, PDF and Markdown. See [download fields](#document-download-options). | `AiDocumentResolvedDownloadAction[]` | `resolveDocumentDownloadActions([{ id: "markdown", label: "Markdown" }])` |
| `downloadAiDocument(request)` | Download a document using the selected action | `request` specifies the download action, content, file name and source format. See [download fields](#document-download-options). | `Promise<void>; browser failure rejects, SSR does nothing` | `downloadAiDocument({ actionId: "markdown", content: "# Report", filename: "report.md" })` |
| `<MarkdownRenderer>` | Safe Markdown rendering | `content` supplies the body or snippet to render. `fontSize` sets the text size in the reading area. `allowHtmlTags` selects which HTML tags can be retained. `showCopyButton` toggles the copy control. `enableHighlight` toggles syntax highlighting. | Safe Markdown rendering | `<MarkdownRenderer content='# Hello' allowHtmlTags={false} />` |
| `<AiDocumentDownloadMenu>` | Selection invokes download action | `actions` supplies available actions or action content. `ondownload` handles the requested download. [download fields](#document-download-options). | Selection invokes download action | `<AiDocumentDownloadMenu {actions} ondownload={download} />` |
| `<AiDocumentEditor>` | Editing updates markdown | `content` supplies the body or snippet to render. `fontSize` sets the text size in the reading area. `allowHtmlTags` selects which HTML tags can be retained. `showRunButton` toggles the Run button. `showCodePreviewToggle` shows the control for switching code and preview. `allowUnsafeCodePreview` explicitly enables code preview for trusted content. `remoteImages` controls network image requests. `onrewrite` can receive a verified source range. | Editing updates markdown | `<AiDocumentEditor bind:content={markdown} showToolbar />` |
| `<AiTableEditor>` | Displays cells and reports edits | `columns` defines the columns of the editable data. `rows` supplies the rows to show or edit. `editable` enables editing. `ondownload` handles the requested download. | Displays cells and reports edits | `<AiTableEditor {columns} {rows} editable />` |

<a id="document-download-options"></a>

#### Download menu and export fields

| Field | Type | Default | Purpose and when it applies |
| --- | --- | --- | --- |
| `actions[].id` | `string` | Required | Selects a built-in action (`word`, `pdf`, `markdown`) or a host-defined menu action. |
| `actions[].label` | `string` | Built-in name or ID | Overrides the menu label. |
| `actions[].badgeLabel` | `string` | Built-in abbreviation or uppercased first four ID characters | Overrides the compact badge label. |
| `request.actionId` | `string` | Required | Chooses the built-in exporter for a direct download. |
| `request.content` | `string` | Required | Supplies Markdown, document text or raw code for the file. |
| `request.title` | `string` | Unset | Supplies export metadata and a name when no filename is given. |
| `request.filename` | `string` | Unset | Overrides the title-derived file name. |
| `request.sourceKind` | `MarkdownSourceKind` | `markdown` | Pass `code` for raw code. It is wrapped in a Markdown fence before export. |
| `request.codeLanguage` | `string` | Unset | Labels the fence when `sourceKind: "code"`. |

```ts
import { resolveDocumentDownloadActions, resolveDocumentMarkdownContent } from '@h-ai/ui'

const menu = resolveDocumentDownloadActions([{ id: 'raw', label: 'Source' }])
// [{ id: 'raw', label: 'Source', badgeLabel: 'RAW' }]

const markdown = resolveDocumentMarkdownContent('const count = 42', 'code', 'typescript')
// '```typescript\nconst count = 42\n```'
```

The custom action creates one menu entry with a `RAW` badge. Raw code becomes a language-tagged Markdown code block before export.

#### Scenario: Parse and preview document content

Pass text, Markdown, tables or document data to viewers and connect editing, downloads and citation actions. For extended examples, see the [Chinese walkthrough](ui.md#documents).

```ts
import { parseMarkdown, renderMarkdownDocument, isLanguageSupported, highlightCode, resolveDocumentMarkdownContent, resolveDocumentDownloadActions, downloadAiDocument } from '@h-ai/ui'
// Parse the supplied heading as HTML. Raw HTML input is escaped with this option.
const html = parseMarkdown('# Hello', { allowHtmlTags: false }) // heading HTML
// Parse the heading into a Markdown document result with an outline and blocks.
const document = renderMarkdownDocument('# Hello') // outline and parsed blocks
// Check support for the TypeScript grammar. It returns true here.
isLanguageSupported('typescript') // true
// Highlight the supplied TypeScript statement and return its safe HTML.
highlightCode('const total = 1', 'typescript') // highlighted HTML
// Convert the supplied code to a TypeScript fenced Markdown block.
resolveDocumentMarkdownContent('const total = 1', 'code', 'typescript') // fenced Markdown
// Resolve the supplied Markdown option into the enabled download actions.
const actions = resolveDocumentDownloadActions([{ id: 'markdown', label: 'Markdown' }])
// Export # Hello through the Markdown browser download action as hello.md. Browser or export failures reject.
await downloadAiDocument({ actionId: 'markdown', content: '# Hello', filename: 'hello.md' }) // browser download
```

<a id="markdown-parse-options"></a>

#### Markdown parse options

Both parsers accept optional `options`. Override only the fields you need.

| Field | Default | Effect |
| --- | --- | --- |
| `enableHighlight` | `true` | Highlight code blocks. |
| `showCopyButton` | `true` | Show the copy button on code blocks. |
| `breaks` | `true` | Render ordinary line breaks as `<br>`. Use `false` for Markdown paragraph rules. |
| `allowHtmlTags` | `false` | When enabled, only allowlisted raw HTML is rendered. |
| `showRunButton` | `false` | Document mode only. Shows a run entry point. The host authorizes execution. |
| `showCodePreviewToggle` | `false` | Document mode only. Add a code/preview toggle. |
| `codeViewCodeLabel / codeViewPreviewLabel` | `Code / Preview` | Document mode only. Labels for the two views when the toggle is enabled. |
| `codePreviewHint` | `''` | Document mode only. Optional text alongside the language label. |

<a id="private-document-media"></a>

#### Scenario: Restrict images and identify Markdown source selections

Set `remoteImages={false}` on private documents to keep the rich text layout and display alternative text for images that require a request. Inline data images may still render. HTML run previews and Mermaid show source. Network images are allowed by default.

```svelte
<!-- Keep formatting for private Markdown. A remote image is replaced by its alternative text. -->
<AiDocumentEditor content={markdown} remoteImages={false} onrewrite={handleRewrite} />
```

The rewrite callback receives a `sourceRange` when the selection can be verified against the current `content` prop. Its offsets are half-open UTF-16 positions. The second word in `**repeat** / **repeat**` maps to `[15, 21)` with text `repeat`. Recheck the current revision and source slice before editing.

<a id="tool-workspaces"></a>

### Run tools and edit artifacts: workspaces

The host supplies tool catalogs, submission callbacks and accessible artifacts; the workspace displays progress and results.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<ArtifactWorkspace>` | Artifact editor | `artifacts` supplies the workspace artifacts. `onread` loads the selected artifact. `onsave` saves the edited content. | Save increments version; conflicts retain draft | `<ArtifactWorkspace artifacts={[report]} onread={readArtifact} onsave={saveArtifact} />` |
| `<ToolWorkspace>` | Tool runner | `tools` supplies the tools available in the workspace. `onrun` submits a tool run. `onstatus` looks up state and progress by run receipt ID. `oncancel` requests cancellation of a running task. | Example input 2 and 3 produces total=5 | `<ToolWorkspace tools={catalog} onrun={run} />` |

#### Scenario: Run tools and continue editing artifacts

The host supplies tool catalogs, submission callbacks and accessible artifacts; the workspace displays progress and results. For extended examples, see the [Chinese walkthrough](ui.md#tool-workspaces).

```svelte
<script lang="ts">
  import { ArtifactWorkspace, type ArtifactDocument, type ArtifactSaveRequest, type ArtifactSaveResponse } from '@h-ai/ui/components/scenes/tools/index'

  let report: ArtifactDocument = {
    id: 'report', title: '报告', kind: 'markdown', version: 1,
    content: '# 简介\n\n产品介绍。', editable: true,
  }
  async function readArtifact() { return report }
  async function saveArtifact(request: ArtifactSaveRequest): Promise<ArtifactSaveResponse> {
    if (request.baseVersion !== report.version)
      return { status: 'conflict', currentVersion: report.version }
    report = { ...report, version: report.version + 1, content: request.content }
    return { status: 'saved', document: report }
  }
</script>

<!-- Open the supplied editable report. Reading returns its current snapshot. Saving updates the version or reports a conflict when the base version is stale. -->
<ArtifactWorkspace artifacts={[report]} onread={readArtifact} onsave={saveArtifact} />
```

<a id="charts"></a>

### Display metrics and charts: chart components

Charts consume supplied data and fields; metric cards display computed values without querying business services.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<Chart>` | Chart | `type` selects the input or display type. `preset` chooses chart defaults that explicit props can override. `data` supplies records to plot. `x` sets the horizontal accessor. `y` sets the vertical accessor. | Grouped bars | `<Chart preset='grouped-bar' {data} x='month' y={['revenue', 'cost']} />` |
| `<DashboardGrid>` | Dashboard grid | `columns` sets the number of columns or supplies column definitions. `label` sets the accessible grid name. `children` supplies the main content. | Two columns, responsive collapse | `<DashboardGrid columns={2} label='Metrics'><MetricCard title='Orders' value={42} /></DashboardGrid>` |
| `<MetricCard>` | Metric card | `title` sets the title. `value` displays the host-calculated metric. `unit` adds a unit to the metric. `trend` supplies the percentage change. | Shows 42 and +12.8% | `<MetricCard title='Orders' value={42} trend={12.8} />` |
| `<ReportCard>` | Report card | `title` sets the title. `loading` shows a pending state. `children` supplies the main content. | Title and content region | `<ReportCard title='Revenue'>Chart content</ReportCard>` |

#### Scenario: Display records as charts and metrics

Charts consume supplied data and fields; metric cards display computed values without querying business services. For extended examples, see the [Chinese walkthrough](ui.md#charts).

```svelte
<script lang='ts'>
  import { Chart, DashboardGrid, MetricCard, ReportCard } from '@h-ai/ui/components/scenes/charts/index'

  const data = [
    { month: 'Jan', revenue: 42, cost: 24 },
    { month: 'Feb', revenue: 58, cost: 31 },
  ]
</script>

<!-- Lay out the metric cards in a labelled four-column grid. -->
<DashboardGrid label='Key metrics' columns={4}>
  <!-- Show the supplied revenue value, CNY unit, and positive 12.8 trend. -->
  <MetricCard title='Revenue' value='128,430' unit='CNY' trend={12.8} trendTone='success' trendLabel='vs previous month' />
</DashboardGrid>
<!-- Group the chart under the Revenue and cost report heading. -->
<ReportCard title='Revenue and cost'>
  <!-- Render the Jan and Feb revenue and cost values side by side using the grouped-bar preset. -->
  <Chart preset='grouped-bar' {data} x='month' y={['revenue', 'cost']} />
</ReportCard>
```

<a id="crud"></a>

### Build query and edit workflows: `CrudPage`

Resource definitions connect list, create, update and delete callbacks; controllers manage loading, navigation and editing.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `defineCrud(resource)` | Connect fields and CRUD callbacks in one resource | `resource` defines the resource name, fields and callbacks for page queries and writes. [field table](#crud-resource-options) | `CrudDef for CrudPage` | `defineCrud(resourceDefinition)` |
| `createCrudController(crud, options?)` | Manage record loading, navigation and query state | `crud` is the definition returned by `defineCrud`. `options` configures initial loading, retention of old data and URL syncing. See [controller fields](#crud-controller-options). | `controller data/nav/loading/loaded/error/load/reload` | `createCrudController(crud, { autoLoad: false })` |
| `mapPaginated(result, map)` | Map page items while retaining pagination metadata | `result` is the original page. `map` receives each item and its index and transforms only `items`. | `PaginatedResult<R> retaining total/page/pageSize` | `mapPaginated(page, item => ({ ...item, selected: false }))` |
| `createBrowserNavAdapter()` | Connect CRUD state to browser navigation | No arguments. | `NavAdapter` | `createBrowserNavAdapter()` |
| `<CrudPage>` | List, forms and resource callbacks | `crud` passes the resource definition from `defineCrud`. `data` provides the data to display. `permissions` supplies permission information used by the UI. `form` configures the container and size for create/edit forms. `pagination` configures controls and information in the pager. `density` sets the density of rows and controls. `detailColumns` limits which columns open details when clicked. `showHeader` toggles the page header. `toolbarLeading` supplies leading toolbar content. `toolbarActions` supplies additional toolbar actions. `card` configures the card list layout. `tableCell` customizes a cell using its row and column key. `onrowclick` receives the row the user clicked. `sortableColumns` selects the sortable columns. `nav` supplies the list navigation adapter. `loading` shows a pending state. `loaded` distinguishes an initial load from a completed load. `error` supplies an error message or state. `onRetry` handles retry after a failed load. `keepPreviousData` controls whether old data stays visible during refresh. | List, forms and resource callbacks | `<CrudPage {crud} data={controller.data} nav={controller.nav} />` |
| `<CrudFilterBar>` | Submits query criteria | `filterFields` sets which fields can be filtered. `searchValue` sets the current search text. `onsearch` receives search input or the submitted query. `onfilterchange` receives filter changes. `onreset` handles reset. | Submits query criteria | `<CrudFilterBar filterFields={filters} onsearch={search} />` |
| `<CrudDetailPanel>` | Displays selected record | `open` controls whether it is open. `item` supplies the record to display. `fields` selects the fields to display or collect. `variant` selects the visual style or state. `drawerWidth` sets the width in drawer mode. `modalSize` sets the size in modal mode. | Displays selected record | `<CrudDetailPanel bind:open={open} item={selected} fields={fields} />` |
| `<CrudEditPanel>` | Submits declared writable fields | `open` controls whether it is open. `fields` selects the fields to display or collect. `variant` selects the visual style or state. `drawerWidth` sets the width in drawer mode. `modalSize` sets the size in modal mode. `onsubmit` runs on form submission. | Submits declared writable fields | `<CrudEditPanel bind:open={open} fields={fields} onsubmit={save} />` |
| `<CrudDeleteConfirm>` | Confirmation calls remove | `open` controls whether it is open. `loading` shows a pending state. `onconfirm` runs when the user confirms. | Confirmation calls remove | `<CrudDeleteConfirm bind:open={open} onconfirm={remove} />` |

<a id="crud-resource-options"></a>

#### Resource definition fields

| Field | Type | Default | Purpose and when it applies |
| --- | --- | --- | --- |
| `name / label` | `string` / `CrudText` | Required | Identify the resource and set the page title. |
| `keyField` | `string` | `id` | Selects the field used to identify rows, details and write targets. |
| `fields` | `CrudFieldDef[]` | Required | Defines fields for display, filtering and editing. For example, `id` is the record key, `label` is displayed, and `type` selects the input type. |
| `defaultPageSize` | `number` | `10` | Sets the page size for the initial query. |
| `searchable` | `boolean` | `true` | Toggles the text search control. |
| `searchPlaceholder` | `CrudText` | Current component translation | Overrides the search placeholder when the field is shown. |
| `api.list` | `CrudApi["list"]` | Required | Receives the criteria and an optional cancellation signal. Returns `items`, `total`, `page` and `pageSize`. |
| `api.get / create / update / remove` | `CrudApi` | Unset | Supply the corresponding callback when the page needs to read one record, create, update or delete. |

The controller example below uses `name: "jobs"` and an `api.list` that returns the single job `j1`.

<a id="crud-controller-options"></a>

#### List controller options

| Field | Type | Default | Purpose and when it applies |
| --- | --- | --- | --- |
| `autoLoad` | `boolean` | `true` | Runs the query when the controller is created. Use `false` for a lazy tab and call `load()` when it opens. |
| `keepPreviousData` | `boolean` | `true` | Keeps the current list during reload and when a request fails. Set `false` to clear it when a reload starts. |
| `syncUrl` | `boolean` | `true` | Syncs the controller’s query parameters to the browser address bar and preserves the path and fragment. |

```ts
import { createCrudController, defineCrud } from '@h-ai/ui'

const crud = defineCrud<{ id: string }>({
  name: 'jobs',
  label: 'Jobs',
  fields: [{ id: 'id', label: 'ID', type: 'text' }],
  api: {
    list: async () => ({ items: [{ id: 'j1' }], total: 1, page: 1, pageSize: 20 }),
  },
})
const controller = createCrudController(crud, { autoLoad: false, syncUrl: false })
await controller.load()
```

Creation does not query. After `load()`, `controller.data.items` is `[{ id: "j1" }]` and the browser URL is unchanged.

#### Scenario: Build list and edit screens from a resource

This follows CrudPage with createCrudController. The component displays state while the controller calls the application-provided data service.

![CRUD lists: query, previous data and latest response](../images/function-ui-crud-loading.en.svg)

Editing filters alone does not query; submit with Search/Enter. Paging and sorting use committed filters. Only the latest response can update the controller. Initial failure shows retry; refresh failure retains old data by default. Empty state requires loaded and total=0.

Resource definitions connect list, create, update and delete callbacks; controllers manage loading, navigation and editing. For extended examples, see the [Chinese walkthrough](ui.md#crud).

```svelte
<script lang='ts'>
  import { createCrudController, CrudPage, defineCrud } from '@h-ai/ui'

  // Define the users CRUD resource and its name field. The example list callback supplies one Ada record.
  const crud = defineCrud({
    name: 'users', label: 'Users',
    fields: [{ id: 'name', label: 'Name', type: 'text' }],
    api: {
      list: async () => ({ items: [{ id: 'u1', name: 'Ada' }], total: 1, page: 1, pageSize: 10 }),
    },
  })
  // Create the controller for that resource without synchronizing filters to the URL. It exposes data, loading and error state, and reload.
  const controller = createCrudController(crud, { syncUrl: false })
</script>
<!-- Show the users resource and the controller's current results. A load error is shown with the supplied retry action. -->
<CrudPage
  {crud} data={controller.data} nav={controller.nav}
  loading={controller.loading} loaded={controller.loaded}
  error={controller.error} onRetry={controller.reload}
/>
```

The demo list callback returns one Ada record; it does not make an HTTP request or persist changes. createCrudController loads by default; use autoLoad: false and call load when a lazy tab first opens.

<a id="code"></a>

### Browse source code: `CodeWorkspace`

Display source with a file list and lazy read callback. The host controls file access and writes.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<CodeWorkspace>` | Source workspace | `source` supplies the workspace source for reading and saving code. | Open README.md to display # Hello | `<CodeWorkspace {source} />` |

#### Scenario: Browse files and inspect code

Display source with a file list and lazy read callback. The host controls file access and writes. For extended examples, see the [Chinese walkthrough](ui.md#code).

```svelte
<script lang='ts'>
  import type { CodeWorkspaceSource } from '@h-ai/ui/components/scenes/code/index'
  import { CodeWorkspace } from '@h-ai/ui/components/scenes/code/index'

  const source: CodeWorkspaceSource = {
    listChildren: () => [
      { kind: 'file', id: 'readme', name: 'README.md' },
    ],
    readFile: () => ({ text: '# Hello', language: 'markdown' }),
  }
</script>

<!-- Load the tree through the supplied source. Opening README.md reads its Markdown text into the workspace. -->
<CodeWorkspace {source} />
```

<a id="guide"></a>

### Provide tours and help: `createGuide`

Define tour steps, targets and articles; the controller starts, advances and ends tours and records completion.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `createGuide(options)` | Create a tour and help controller | Required `options: GuideOptions` configures tours, navigation and progress storage. See [call arguments](#call-options). | `GuideController; no init/close` | `createGuide({ tours: [], persistence: "memory" })` |
| `resolveGuideText(text?)` | Resolve static or deferred guide text | Optional `text` is display text or a callback that reads the translation for the current locale. | `string` | `resolveGuideText(() => m.help())` |
| `<GuideHost>` | Tour and help UI | `guide` supplies the guide controller. `locale` sets the displayed language. `scope` sets the page or workspace in which tours are eligible. `autoStart` lets eligible tours start automatically. | Tour and help UI | `<GuideHost {guide} locale='en-US' scope='demo-user' />` |
| `<HelpCenter>` | Search and read help | `articles` supplies the help articles. `tours` supplies the available tours. `locale` sets the displayed language. `selectedId` selects the current help entry. `onstart` handles starting a tour. | Search and read help | `<HelpCenter articles={articles} tours={tours} locale='en-US' />` |

#### Scenario: Start a tour and open help articles

Define tour steps, targets and articles; the controller starts, advances and ends tours and records completion. For extended examples, see the [Chinese walkthrough](ui.md#guide).

```svelte
<script lang='ts'>
  import { createGuide, GuideHost } from '@h-ai/ui/guide'

  // Create a guide for the users route with a named anchor and help article, using the supplied navigation adapter and persistence key.
  const guide = createGuide({
    nav,
    persistKey: 'my-app-guide',
    tours: [
      {
        id: 'users',
        version: 1,
        route: '/users',
        title: () => m.guide_users_title(),
        description: () => m.guide_users_description(),
        steps: [
          {
            target: 'users-create',
            title: () => m.guide_create_title(),
            description: () => m.guide_create_description(),
          },
        ],
      },
    ],
    articles: [
      {
        id: 'users-help',
        title: () => m.guide_users_title(),
        content: () => m.guide_users_markdown(),
        tourId: 'users',
      },
    ],
  })
</script>

<!-- Mount the guide for the active locale and user. Starting the users tour targets the configured route and step. -->
<GuideHost {guide} {locale} scope={user.id} autoStart='users' />
<!-- Open the guide's help panel when this button is clicked. -->
<Button onclick={() => guide.openHelp()}>{m.help()}</Button>
<!-- Use the users tour anchor on the existing create button. A click still calls the app's createUser handler. -->
<Button data-guide='users-create' onclick={createUser}>{m.create_user()}</Button>
```

<a id="theme"></a>

### Switch themes: `@h-ai/ui/theme`

Apply a trusted default before first paint, then let theme controls read and update browser preferences.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `getThemeInfo(themeId)` | Find metadata for a supported theme | `themeId` selects the theme whose properties or light/dark classification are queried. | `ThemeInfo or undefined` | `getThemeInfo("light")` |
| `isDarkTheme(themeId)` | Check whether a theme uses dark colors | `themeId` selects the theme whose properties or light/dark classification are queried. | `boolean` | `isDarkTheme("dark")` |
| `normalizeThemeId(themeId, fallbackThemeId?)` | Select a supported theme or the fallback | `themeId` is the candidate from settings or external input. `fallbackThemeId` is used for an invalid candidate and defaults to `light`. | `supported theme ID` | `normalizeThemeId("unknown", "light")` |
| `normalizeHexColor(value)` | Normalize a supported hex color | `value` is the candidate hex color from theme settings. It may be null or undefined. | `six-digit lowercase hex string or null` | `normalizeHexColor("#5765F0")` |
| `resolveThemeTone(themeId)` | Read a theme’s light or dark tone | `themeId` selects the theme whose properties or light/dark classification are queried. | `light or dark` | `resolveThemeTone("light")` |
| `createThemeBootstrapScript(options)` | Apply the trusted theme before first paint | Pass required `options: ThemeBootstrapScriptOptions` from the trusted host configuration. See [call arguments](#call-options). | `script string for the application HTML shell` | `createThemeBootstrapScript({ storageKey: "theme", defaultThemeId: "light" })` |
| `getThemeInitScript()` | Get the default initial theme script | No arguments. | `script string` | `getThemeInitScript()` |
| `applyTheme(theme, persist?)` | Apply a theme and optionally save the preference | `theme` selects the theme applied to the page. `persist` defaults to `true` and saves the choice for later visits. | `void; updates DOM/browser preference` | `applyTheme("dark")` |
| `getCurrentTheme()` | Read the theme currently applied to the page | No arguments. | `theme ID string` | `getCurrentTheme()` |
| `getSavedTheme(fallbackTheme?)` | Read the saved theme preference | `fallbackTheme` is the theme returned when no valid preference can be read. It defaults to `light`. | `theme ID string` | `getSavedTheme("light")` |
| `<ThemeColorPicker>` | Updates chosen color | `value` supplies the current value and can be bound when supported. `presets` supplies color choices the user can pick. `onchange` runs when the value changes. | Updates chosen color | `<ThemeColorPicker bind:value={color} />` |
| `<ThemeSelector>` | Selects a theme | `themeIds` restricts the displayed theme IDs. | Optionally limits the built-in choices | `<ThemeSelector />` |
| `<ThemeToggle>` | Toggles light/dark theme | No props | Toggles light/dark theme | `<ThemeToggle />` |

#### Scenario: Read preferences and change theme

Apply a trusted default before first paint, then let theme controls read and update browser preferences. For extended examples, see the [Chinese walkthrough](ui.md#theme).

The shared `@h-ai/ui/styles/theme.css` includes `liquid-glass`, a light theme with translucent surfaces. Dialogs and drawers soften the layer beneath them, and menus soften the area they cover. Foreground content stays sharp, with refraction at the edges. Highlights follow the mouse over controls and stay still with reduced motion enabled. Choose “Liquid glass” in the theme selector to keep using it after a reload. CLI projects with a UI offer Liquid glass by default. If a Fullstack project explicitly sets `fullstack.theme.themes`, include `liquid-glass` in that list to make it selectable. Pass `themeIds` to `ThemeSelector` to limit the built-in choices. Omit the prop to show every built-in theme.

```ts
import {
  applyTheme, // 应用主题（自动持久化到 localStorage）
  createThemeBootstrapScript, // 生成可注入 app.html 的首屏主题恢复脚本
  getCurrentTheme, // 获取当前主题
  getSavedTheme, // 读取安全缓存，可传入应用配置的默认主题
  getThemeInitScript, // 返回可注入到 HTML shell 的防闪烁脚本文本
  isDarkTheme, // 检查是否暗色主题
  normalizeHexColor, // 归一化 #RGB / #RRGGBB 主题色
  normalizeThemeId, // 校验主题 ID 并自动回退
  THEME_GROUPS, // 按亮色/暗色分组
  THEMES, // Metadata for 19 themes, typed as ThemeInfo[]
} from '@h-ai/ui/theme'
```

<a id="locale"></a>

### Switch locales and isolate requests: `@h-ai/ui/i18n`

Keep browser locale in page state and select server locale per request to prevent cross-user changes.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `createLocaleStore(options?)` | Manage the browser page’s current language | Optional `options` chooses the default locale, supported locales, browser detection and storage key. See [call arguments](#call-options). | `locale store with current/set/isSupported` | `createLocaleStore({ defaultLocale: "zh-CN", detectBrowser: false })` |
| `getGlobalLocale()` | Read the locale for the current context | No arguments. | `locale string from current context` | `getGlobalLocale()` |
| `setGlobalLocale(locale)` | Set the current request or page locale | `locale` is the language tag to apply to global translation functions. | `void; use request context for SSR` | `setGlobalLocale("en-US")` |
| `detectBrowserLocale(supportedLocales?)` | Choose a supported browser language | `supportedLocales` limits acceptable browser languages. It defaults to the framework list. | `supported locale or null` | `detectBrowserLocale()` |
| `isLocaleSupported(locale, supportedLocales?)` | Check whether a locale is enabled | `locale` is the language to check. `supportedLocales` restricts matching and defaults to the framework list. | `boolean` | `isLocaleSupported("ja-JP")` |
| `resolveLocale(locale, supportedLocales?, defaultLocale?)` | Resolve a supported locale or fallback | `locale` is the candidate. `supportedLocales` lists allowed languages. `defaultLocale` is tried when the candidate fails to match and defaults to the framework locale. | `supported locale` | `resolveLocale("en")` |
| `interpolate(template, params?)` | Insert named values into a message template | `template` contains the placeholders. `params` supplies the replacements by key. Omit it to keep the original template. | `string` | `interpolate("Hello {name}", { name: "Ada" })` |
| `<LanguageSwitch>` | Changes global UI locale | No props | Changes global UI locale | `<LanguageSwitch />` |

#### Scenario: Choose a page language and interpolate text

Keep browser locale in page state and select server locale per request to prevent cross-user changes. For extended examples, see the [Chinese walkthrough](ui.md#locale).

```svelte
<script>
  import { createLocaleStore } from '@h-ai/ui/i18n'
  import { setLocale } from '#lib/paraglide/runtime.js'

  // Create a reactive language store with browser and framework defaults.
  const localeStore = createLocaleStore()

  function changeLocale(code) {
    // Update the UI store and the framework locale with the chosen supported code.
    localeStore.set(code) // 更新 UI store + 同步到 @h-ai/core
    // Apply the same selected code to the app's Paraglide runtime.
    setLocale(code) // 同步到 Paraglide（应用层）
  }
</script>

<select value={localeStore.current} onchange={e => changeLocale(e.currentTarget.value)}>
  {#each localeStore.supported as locale (locale.code)}
    <option value={locale.code}>{locale.label}</option>
  {/each}
</select>
```

<a id="feedback"></a>

### Display feedback and evidence: feedback components

The host supplies sanitized evidence and authorized callbacks; components report user actions.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `<FeedbackModal>` | Submit to host; retain input on failure | `open` controls whether it is open. `onsubmit` runs on form submission. | Submit to host; retain input on failure | `<FeedbackModal bind:open={open} onsubmit={submitFeedback} />` |
| `<FeedbackForm>` | Submission data and attachment changes | `attachments` supplies the attachments to show or edit. `evidenceSummary` shows a summary of diagnostic evidence to collect. `onsubmit` runs on form submission. `onfileschange` receives attachment selection changes. | Submission data and attachment changes | `<FeedbackForm attachments={attachments} onsubmit={submitFeedback} />` |
| `<FeedbackList>` | Query/action callbacks; no internal requests | `data` provides the data to display. `query` supplies the current list query. `permissions` supplies permission information used by the UI. `onquerychange` receives changes to the query. `onstatus` receives a report status change requested by the user. | Query/action callbacks; no internal requests | `<FeedbackList data={feedbackRows} onquerychange={queryFeedback} />` |
| `<FeedbackDetail>` | Report and authorized evidence | `report` supplies the current feedback report. `evidence` supplies diagnostic evidence visible to the user. `attachments` supplies the attachments to show or edit. `history` supplies processing history. `webhook` supplies the webhook delivery state for display. `onretry` handles retrying a delivery. `onexport` handles the requested export. | Report and authorized evidence | `<FeedbackDetail report={report} />` |
| `FeedbackScreenshot` | Annotation callback | `attachment`, `onannotate` | Annotation callback | `<FeedbackScreenshot attachment={attachment} onannotate={annotate} />` |

#### Scenario: Display evidence and submit feedback

Forms display captured evidence and report file, annotation and submit actions; list and detail views consume authorized data. For extended examples, see the [Chinese walkthrough](ui.md#feedback).

<a id="utilities"></a>

### Handle classes, platform and clipboard: UI utilities

Compose class names, create UI IDs and select platform styles. Clipboard and portal operations require browser capabilities.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `registerClipboardHostWriter(writer)` | Connect or remove a WebView clipboard writer | `writer` receives text and asynchronously reports whether the host wrote it. Pass `null` to unregister it. | `void` | `registerClipboardHostWriter(null)` |
| `writeTextToClipboard(text)` | Copy text and report whether writing succeeded | `text` is the literal string to copy to the clipboard. | `Promise<boolean>; true only when write succeeds` | `writeTextToClipboard("trace-001")` |
| `cn(...classes)` | Combine conditional class names | `classes` is the list of class names to join in order. Falsy values are skipped. | `string` | `cn("flex", active && "text-primary")` |
| `getDataAttributes(props)` | Forward only data-* attributes | `props` is the component property record to extract `data-*` attributes from. | `ForwardedDataAttributes` | `getDataAttributes({ "data-testid": "save" })` |
| `generateId(prefix?)` | Create an identifier for a UI element | `prefix` labels the generated DOM ID. Omitting it uses the UI library’s default prefix. | `string` | `generateId("field")` |
| `portal(node, target?)` | Move a mounted node to its target container | `node` is the DOM element to move. `target` is a destination element or selector and defaults to `document.body`. | `Svelte action result with cleanup` | `portal(node, document.body)` |
| `detectPlatform()` | Detect the current platform | No arguments. | `Platform` | `detectPlatform()` |
| `isMobile()` | Check whether the platform is mobile | No arguments. | `boolean` | `isMobile()` |
| `isNativeApp()` | Check whether the page runs in a native shell | No arguments. | `boolean` | `isNativeApp()` |
| `usePlatform()` | Read reactive platform information | `none; component initialization` | `{ current, isMobile, isApp }` | `usePlatform()` |
| `getVariantClass(variant, prefix?)` | Map a variant to a component class | `variant` chooses the style. `prefix` selects the class prefix and defaults to `btn`. | `string class name` | `getVariantClass("primary", "btn")` |
| `getSizeClass(size, prefix?)` | Map a size to a component class | `size` chooses the component size. `prefix` selects the class prefix and defaults to `btn`. | `string class name` | `getSizeClass("sm", "btn")` |
| `getInputSizeClass(size)` | Get input size classes | `size` is the component size to turn into a CSS class. | `string class name` | `getInputSizeClass("sm")` |
| `getBadgeVariantClass(variant)` | Get badge color classes | `variant` is the visual state to turn into a CSS class. | `string class name` | `getBadgeVariantClass("info")` |
| `getBadgeSizeClass(size)` | Get badge size classes | `size` is the component size to turn into a CSS class. | `string class name` | `getBadgeSizeClass("sm")` |
| `getAlertVariantClass(variant)` | Get alert color classes | `variant` is the visual state to turn into a CSS class. | `string class name` | `getAlertVariantClass("info")` |
| `getProgressVariantClass(variant)` | Get progress color classes | `variant` is the visual state to turn into a CSS class. | `string class name` | `getProgressVariantClass("primary")` |

#### Scenario: Compose styles and copy a diagnostic ID

Compose class names, create UI IDs and select platform styles. Clipboard and portal operations require browser capabilities. For extended examples, see the [Chinese walkthrough](ui.md#utilities).

```ts
import { cn, generateId, getDataAttributes, getVariantClass, writeTextToClipboard } from '@h-ai/ui'
// Combine the given class with the falsy conditional. The result is flex.
cn('flex', false && 'hidden') // 'flex'
// Keep the data-testid attribute from this object and discard the unrelated property.
getDataAttributes({ 'data-testid': 'save', secret: 'ignored' }) // only data-testid
// Combine the primary variant and btn prefix into btn-primary.
getVariantClass('primary', 'btn') // 'btn-primary'
// Generate a unique field identifier with the requested prefix.
const id = generateId('field') // generated field identifier
// Copy the supplied trace ID. true means the browser copied it and false means it could not.
const copied = await writeTextToClipboard('trace-001') // true if copied; false on failure
```

<a id="call-options"></a>

## Call arguments

| Option | Default or requirements |
| --- | --- |
| `createLocaleStore: defaultLocale, supportedLocales` | Defaults to `zh-CN` and the built-in language list. Each supported locale has a `code` and `label`. |
| `createLocaleStore: detectBrowser, persistKey` | Defaults to `true` and `hai-locale`. Set detection to `false` to skip browser preferences. |
| `createGuide: tours, articles, nav` | Pass the required `tours` array. Help `articles` and a `nav` adapter are optional. |
| `createGuide: persistence, persistKey, waitTimeout` | Defaults to `cookie`, `hai-guide`, and 3000 milliseconds per step target. Use `memory` for progress that resets on reload. |
| `createThemeBootstrapScript: storageKey, defaultThemeId, defaultThemeColor` | Pass `storageKey`; the fallback theme is `light`. An omitted color skips setting the initial custom color. |
| `createThemeBootstrapScript: colorCssVar, toneDatasetKey, locale` | Optional output keys for the CSS color and light/dark attribute. For locale bootstrap, supply `key`, `defaultValue`, and `supportedValues`. |

<a id="form-layout-guide"></a>

## Form layout

Details remain in the [Chinese guide](ui.md#form-layout-guide).

<a id="toast-options"></a>

## Toast fields

| Field | Type | Default | Purpose and when it applies |
| --- | --- | --- | --- |
| `message` | `string` | Required | Localized text displayed in the toast. |
| `variant` | `Variant` | `info` | Sets the toast’s visual style. |
| `duration` | `number` | `3000` ms | Starts when the toast becomes visible. Zero disables automatic dismissal. |
| `position` | `ToastProps["position"]` | `bottom-right` | Chooses one of six placements. All placements share a queue. |
| `dismissible` | `boolean` | `true` | Controls the manual dismiss button. |
| `traceId` | `string` | Unset | A valid public trace ID enables the disclosure that shows it on demand. |

```ts
import { toast } from '@h-ai/ui/toast'

toast.add({ message: '2 items still need review', variant: 'warning', duration: 0, position: 'top-right' })
```

The warning appears in the top right and stays until dismissed.

<a id="message-options"></a>

## Message fields

| Field | Type | Default | Purpose and when it applies |
| --- | --- | --- | --- |
| `message` | `string` | Required | Localized message to display. A direct string supplies this field. |
| `type` | `MessageOptions["type"]` | `info` | Sets this message’s appearance in the shared queue. |
| `duration` | `number` | `3000` ms | Time before automatic dismissal in milliseconds. Use 0 to disable automatic dismissal. |
| `closable` | `boolean` | `true` | Shows or hides the manual dismiss button. |

```ts
import { message } from '@h-ai/ui'

const id = message.add({ message: 'Saved 2 records', type: 'success', duration: 2000 })
```

The call returns a notification ID. The success message disappears after two seconds.

<a id="message-box-options"></a>

## Message box fields

| Field | Type | Default | Purpose and when it applies |
| --- | --- | --- | --- |
| `message` | `string` | Required | Dialog body. A direct string supplies this field. HTML markup is displayed literally. |
| `title` | `string` | Localized title | Overrides the title. |
| `type` | `confirm` / `alert` | Set by the method | Overrides the mode selected by the method. `showCancel` controls whether the cancel button is visible. |
| `iconType` | `MessageBoxIconType` | `warning` for confirm, `info` for alert | Overrides the icon next to the message. |
| `confirmText` | `string` | Localized confirm label | Overrides the confirm label. |
| `cancelText` | `string` | Localized cancel label | Applies when the cancel button is visible. |
| `confirmVariant` | `MessageBoxOptions["confirmVariant"]` | `primary` | Styles the confirm button. |
| `showCancel` | `boolean` | `true` for confirm, `false` for alert | Toggles the cancel button. |
| `closeOnClickModal` | `boolean` | `true` | Allows clicking the backdrop to initiate closing. |
| `showClose` | `boolean` | `true` | Shows the close button in the top corner. |
| `beforeClose` | `MessageBoxOptions["beforeClose"]` | Unset | Receives the action and an instance that can set loading state. Returning or resolving to `false` keeps the dialog open. |

Mount `MessageBoxContainer` in the root layout before running this example.

```ts
import { messageBox } from '@h-ai/ui'

const accepted = await messageBox.confirm({
  message: 'Submit 2 drafts?',
  closeOnClickModal: false,
})
```

Clicking the backdrop leaves the dialog open. Confirm resolves `accepted` to `true`; Cancel resolves it to `false`.

<a id="theme-locale-guide"></a>

## Theme and locale guide

Details remain in the [Chinese guide](ui.md#theme-locale-guide).
