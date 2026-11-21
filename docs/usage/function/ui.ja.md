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

<!-- Render a titled card containing the name controls and their preview. -->
<Card title='挨拶をプレビュー'>
  <label for='greeting-name'>名前</label>
  <!-- Bind the text input to name and pair it with the matching label. Typing updates name. -->
  <Input id='greeting-name' bind:value={name} />
  <!-- Disable preview for blank names. Clicking when enabled trims name and shows the greeting. -->
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
<!-- The configured preprocessor supplies Button. This renders the primary preview action. -->
<Button variant='primary'>プレビュー</Button>
```

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

<a id="api-reference"></a>

## 機能

UI に init/close はありません。Svelte がマウントを管理します。各機能で入出力と例を示し、認可と保存はホストが担当します。詳細手順の未訳部分は対応する中国語節へリンクします。

<a id="styles"></a>

### スタイルと自動インポート：`autoImportHaiUi`

ビルド時にスタイルを読み、自動インポートは実際のテンプレート部品を対象にします。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `autoImportHaiUi` | テンプレートで使う部品のインポートを追加 | `preprocessed Svelte source and filename through markup` | `PreprocessorGroup; synchronous { code }` | `autoImportHaiUi()` |

#### 利用例：スタイルと部品のインポートを設定する

Svelte のビルド設定で自動インポートを有効にし、アプリの CSS に共通スタイルを読み込みます。実行時に部品を探す機能ではありません。 詳細は[中国語の手順](ui.md#styles)を参照してください。

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { autoImportHaiUi } from '@h-ai/ui/auto-import'

export default {
  // Install the Hai UI preprocessor before Vite's Svelte preprocessor. It supplies imports for Hai components in templates.
  preprocess: [autoImportHaiUi(), vitePreprocess()],
}
```

<a id="forms"></a>

### 入力と送信：フォーム部品

値をページの状態に保存し、バインディングで更新します。検証後の送信はアプリのコールバックが処理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `Button` | クリックで count が1増加 | `variant`, `size`, `loading`, `disabled`, `outline`, `circle` | クリックで count が1増加 | `<Button onclick={() => count += 1}>Add</Button>` |
| `IconButton` | アイコンボタンとヒント | `icon: trusted SVG string \| Snippet`, `variant`, `size`, `tooltip`, `loading` | アイコンボタンとヒント | `<IconButton icon='<svg viewBox="0 0 24 24"></svg>' tooltip='Save' />` |
| `BareButton` | 名前付きボタン | `class`, `ariaLabel`, `role`, `tabindex` | 名前付きボタン | `<BareButton ariaLabel='Save'>Save</BareButton>` |
| `Input` | 入力で name を更新 | `type`, `value`, `size`, `error`, `validationMessage` | 入力で name を更新 | `<Input bind:value={name} />` |
| `BareInput` | 入力で name を更新 | `type`, `class`, `accept`, `multiple` | 入力で name を更新 | `<BareInput type='text' bind:value={name} />` |
| `Textarea` | 複数行入力で notes を更新 | `value`, `rows`, `size`, `autoResize`, `error` | 複数行入力で notes を更新 | `<Textarea bind:value={notes} rows={3} />` |
| `Select` | 選択で status を更新 | `options`, `value`, `placeholder`, `size`, `clearable`, `filterable` | 選択で status を更新 | `<Select options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `Checkbox` | 選択で enabled を更新 | `checked`, `label`, `size`, `indeterminate` | 選択で enabled を更新 | `<Checkbox bind:checked={enabled} label='Enabled' />` |
| `Switch` | 切替で enabled を更新 | `checked`, `label`, `size` | 切替で enabled を更新 | `<Switch bind:checked={enabled} label='Enabled' />` |
| `Radio` | 選択で status を更新 | `options`, `value`, `direction`, `size` | 選択で status を更新 | `<Radio options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `ToggleCheckbox` | チェック状態を enabled に反映 | `checked`, `name`, `onchange` | チェック状態を enabled に反映 | `<ToggleCheckbox bind:checked={enabled} name='enabled' />` |
| `ToggleInput` | チェック状態を enabled に反映 | `checked`, `name` | チェック状態を enabled に反映 | `<ToggleInput bind:checked={enabled} name='enabled' />` |
| `ToggleRadio` | 選択済みラジオ | `checked`, `name`, `onchange` | 選択済みラジオ | `<ToggleRadio name='choice' checked />` |
| `Range` | ドラッグで score を更新 | `value`, `min`, `max`, `step` | ドラッグで score を更新 | `<Range min={0} max={100} bind:value={score} />` |
| `Rating` | 評価で score を更新 | `value`, `max` | 評価で score を更新 | `<Rating max={5} bind:value={score} />` |
| `Badge` | New のバッジ | `variant`, `size`, `outline` | New のバッジ | `<Badge variant='info'>New</Badge>` |
| `Avatar` | 名前のアバター | `src`, `name`, `size`, `shape`, `ring` | 名前のアバター | `<Avatar name='Ada' />` |
| `Tag` | タグ表示 | `text`, `variant`, `size`, `closable` | タグ表示 | `<Tag text='Release' />` |
| `Spinner` | 読み込み表示 | `size`, `variant` | 読み込み表示 | `<Spinner size='sm' />` |
| `Progress` | 進捗30% | `value`, `max`, `variant`, `striped`, `animated` | 進捗30% | `<Progress value={3} max={10} />` |
| `Form` | 検証後 save を呼出 | `columns`, `labelPosition`, `labelWidth`, `loading`, `disabled`, `onsubmit` | 検証後 save を呼出 | `<Form onsubmit={save}><Input bind:value={name} /></Form>` |
| `FormField` | ラベルと入力を関連付け | `label`, `for`, `colSpan`, `labelPosition`, `error`, `hint`, `required` | ラベルと入力を関連付け | `<FormField label='Name' for='name'><Input id='name' bind:value={name} /></FormField>` |
| `FormLayout` | 2列から狭い画面で1列へ | `columns`, `labelPosition`, `labelWidth` | 2列から狭い画面で1列へ | `<FormLayout columns={2}><FormField label='Name'><Input bind:value={name} /></FormField></FormLayout>` |
| `TagInput` | 編集で tags を更新 | `tags`, `maxTags`, `allowDuplicates`, `size` | 編集で tags を更新 | `<TagInput bind:tags={tags} maxTags={5} />` |
| `Combobox` | 検索して選択値を更新 | `options`, `value`, `multiple`, `placeholder`, `size` | 検索して選択値を更新 | `<Combobox options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `Calendar` | 選択で DateValue を更新 | `value: DateValue`, `minValue`, `maxValue` | 選択で DateValue を更新 | `<Calendar bind:value={date} />` |
| `DatePicker` | ポップアップで日付を更新 | `value: DateValue`, `minValue`, `maxValue`, `error`, `ariaLabel`, `size` | ポップアップで日付を更新 | `<DatePicker ariaLabel='Date' bind:value={date} />` |
| `CronExpressionBuilder` | よく使う Cron 式を視覚的に編集 | `value`, `disabled`, `required`, `error`, `presets`, `labels`, `weekdayOptions`, `onchange` | 5フィールド Cron 式を返す | `<CronExpressionBuilder bind:value={cron} />` |
| `ScheduleInput` | 日時と高度な Cron のスケジュール入力 | `config: ScheduleInputConfig`（正規化済み）, `value`, `required`, `disabled`, `valid`, `onchange` | 固定 `+08:00` の日時または Cron 値を検証して返す | `<ScheduleInput config={scheduleConfig} bind:value={schedule} />` |
| `normalizeScheduleInputConfig` | スケジュール schema メタデータを検証・正規化 | `value: unknown`；`allowCron` は省略可能 | `ScheduleInputConfig`；未対応の場合は `undefined`、省略した `allowCron` は `false` に正規化 | `normalizeScheduleInputConfig(rawSchema)` |
| `ScheduleInputConfig` | 正規化済み `ScheduleInput` schema 型 | `kind: 'schedule'`, `timezone: 'Asia/Shanghai'`, `precision: 'minute'`, `allowCron: boolean` | `ScheduleInput.config` に渡せる設定 | `const config: ScheduleInputConfig = { kind: 'schedule', timezone: 'Asia/Shanghai', precision: 'minute', allowCron: false }` |
| `CRON_BUILDER_WEEKDAY_ORDER` | Cron builder の月曜から日曜の順序 | なし | `readonly CronWeekdayValue[]` | `[...CRON_BUILDER_WEEKDAY_ORDER]` |
| `createDefaultCronBuilderState` | Cron builder の既定状態を作成 | なし | `CronBuilderState` | `createDefaultCronBuilderState()` |
| `cronExpressionToBuilderState` | よく使う Cron 式を builder 状態へ解析 | `expression: string` | `CronBuilderState`；未対応の式は `custom` モードに保持 | `cronExpressionToBuilderState('0 10 * * *')` |
| `cronBuilderStateToExpression` | builder 状態を Cron 式へシリアライズ | `state: CronBuilderState` | 5フィールド Cron 文字列 | `cronBuilderStateToExpression(state)` |
| `isCronExpressionValid` | Cron parser で式を検証 | `expression: string` | `boolean` | `isCronExpressionValid('0 10 * * *')` |
| `CronBuilderMode`, `CronWeekdayValue`, `CronBuilderState`, `CronExpressionBuilderLabels`, `CronExpressionBuilderPreset`, `CronExpressionBuilderWeekdayOption` | Cron builder のモード、状態、ラベル、プリセット、曜日オプションの型 | TypeScript 型 | builder helper とコンポーネント設定を型付け | `import type { CronBuilderState } from '@h-ai/ui'` |
| `@h-ai/ui/components/compounds/schedule-input` | Node/schema 消費者向けの軽量入口 | `normalizeScheduleInputConfig` と `ScheduleInputConfig` のみ | Svelte を読み込まず schema の正規化結果を返す | `import { normalizeScheduleInputConfig, type ScheduleInputConfig } from '@h-ai/ui/components/compounds/schedule-input'` |

#### 利用例：二つの入力で同じ日付を選ぶ

値をページの状態に保存し、バインディングで更新します。検証後の送信はアプリのコールバックが処理します。 詳細は[中国語の手順](ui.md#forms)を参照してください。

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

#### 利用例：日時または Cron スケジュールを入力する

schema メタデータをコントロールへ渡す前に `normalizeScheduleInputConfig` を呼び出します。元の schema では `allowCron` を省略でき、正規化時に `false` が補われます。未対応の種別、タイムゾーン、精度、フィールドは `undefined` になります。`ScheduleInput.config` には正規化済みの `ScheduleInputConfig` を渡します。Node/schema 消費者は `@h-ai/ui/components/compounds/schedule-input` から normalizer と型だけを読み込めます。この入口は Svelte を読み込みません。

`ScheduleInput` は既定で北京時間の分精度を使い、日時を固定 `+08:00` オフセットでシリアライズします。`allowCron` を `true` にすると、日時と5フィールド Cron モードを切り替えられます。`valid` は現在の草稿、必須条件、未来時刻の検証結果を示します。

```svelte
<script lang='ts'>
  import { ScheduleInput } from '@h-ai/ui'

  let schedule = $state('')
  let scheduleValid = $state(false)
  const scheduleConfig = {
    kind: 'schedule', timezone: 'Asia/Shanghai', precision: 'minute', allowCron: true,
  } as const
</script>
<ScheduleInput config={scheduleConfig} bind:value={schedule} bind:valid={scheduleValid} required />
```

<a id="overlays"></a>

### ダイアログとメニュー：オーバーレイ

open 状態でダイアログ、ドロワー、確認操作を制御し、ページのボタンにメニューやヒントを付けます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `Modal` | 開閉で open を更新 | `open`, `title`, `size`, `radius`, `bodyOverflow`, `showClose` | 開閉で open を更新 | `<Modal bind:open={open} title='Details'>Order 42</Modal>` |
| `Drawer` | 開閉をバインドしたドロワー | `open`, `position`, `title`, `size`, `width`, `resizable`, `widthStorageKey` | 開閉をバインドしたドロワー | `<Drawer bind:open={open} title='Details'>Order 42</Drawer>` |
| `Confirm` | 確認で confirm を呼出 | `open`, `title`, `message`, `variant`, `onconfirm` | 確認で confirm を呼出 | `<Confirm bind:open={open} message='Continue?' onconfirm={confirm} />` |
| `Popover` | クリックで開き Escape で閉じる | `open`, `position`, `trigger`, `offset`, `portal` | クリックで開き Escape で閉じる | `<Popover>{#snippet trigger()}<Button>Open</Button>{/snippet}Details</Popover>` |
| `Dropdown` | 操作メニュー | `items`, `trigger`, `triggerClass`, `position` | 操作メニュー | `<Dropdown items={menuItems}><Button>Actions</Button></Dropdown>` |
| `Tooltip` | ホバー・フォーカスで説明 | `content`, `position`, `delay`, `portal`（裁剪容器内使用） | ホバー・フォーカスで説明 | `<Tooltip content='Save order'><Button>Save</Button></Tooltip>` |

#### 利用例：注文詳細を開いて閉じる

open 状態でダイアログ、ドロワー、確認操作を制御し、ページのボタンにメニューやヒントを付けます。 詳細は[中国語の手順](ui.md#overlays)を参照してください。

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

### データ表示と移動：表示部品

読み込み済みの記録と列定義を渡します。ページ、並び順、タブの変更時はアプリのコールバックが必要なデータを読み込みます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `Card` | 見出しと内容 | `title`, `bordered`, `shadow`, `padding` | 見出しと内容 | `<Card title='Order'>Order 42</Card>` |
| `JsonViewer` | 展開可能な JSON | `value`, `defaultExpandedDepth`, `maxScalarLength`, `showCopy`, `onCopy`；循环引用自动替换为占位符 | 展開可能な JSON | `<JsonViewer value={{ status: 'pending' }} />` |
| `DataTable` | 列に従い rows を表示 | `data`, `columns`, `keyField`, `loading`, `sortKey`, `sortDir`, `onsort`，`cell` 单元格插槽、`onrowclick`（列 `sortable` 可排序） | 列に従い rows を表示 | `<DataTable data={rows} {columns} keyField='id' />` |
| `Accordion` | 指定内容を開閉 | `items: AccordionItem[]` | 指定内容を開閉 | `<Accordion items={accordionItems} />` |
| `Timeline` | 指定順のタイムライン | `items: TimelineItem[]` | 指定順のタイムライン | `<Timeline items={timelineItems} />` |
| `Tabs` | タブ選択で activeTab を更新 | `items`, `active`, `type`, `size`, `lazy`, `onactivate` | タブ選択で activeTab を更新 | `<Tabs items={tabItems} bind:active={activeTab} />` |
| `Pagination` | 全3ページ、page を更新 | `page`, `total`, `pageSize`, `showTotal`, `showJumper`, `showSizeChanger`, `showPageInfo`, `showFirstLast` | 全3ページ、page を更新 | `<Pagination total={42} pageSize={20} bind:page />` |
| `Breadcrumb` | 階層とリンク | `items`, `separator` | 階層とリンク | `<Breadcrumb items={[{ label: 'Orders', href: '/orders' }, { label: '42' }]} />` |
| `Steps` | 現在ステップを表示 | `items`, `current`, `direction`, `clickable` | 現在ステップを表示 | `<Steps items={stepItems} current={1} />` |
| `Skeleton` | 3項目のプレースホルダー | `variant`, `width`, `height`, `count` | 3項目のプレースホルダー | `<Skeleton count={3} />` |
| `Empty` | 空状態 | `title`, `description`, `icon` | 空状態 | `<Empty title='No orders' />` |
| `Result` | 結果表示 | `status`, `title`, `description` | 結果表示 | `<Result status='success' title='Saved' />` |
| `PageHeader` | ページ見出しと操作 | `title`, `description`，支持 `actions` 插槽 | ページ見出しと操作 | `<PageHeader title='Orders' description='Current orders' />` |

#### 利用例：記録を表示してページを切り替える

読み込み済みの記録と列定義を渡します。ページ、並び順、タブの変更時はアプリのコールバックが必要なデータを読み込みます。 詳細は[中国語の手順](ui.md#tables)を参照してください。

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

### モバイル操作：モバイル部品

下部ナビゲーション、操作シート、更新ジェスチャーを提供します。通信処理はアプリのコールバックが実行します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `ActionSheet` | 選択で selectAction を呼出 | `open`, `title`, `items`, `cancelText`, `onselect` | 選択で selectAction を呼出 | `<ActionSheet bind:open={open} items={sheetItems} onselect={selectAction} />` |
| `AppBar` | タイトルと戻るリンク | `title`, `backHref`, `onback`, `fixed`, `safeArea` | タイトルと戻るリンク | `<AppBar title='Orders' backHref='/orders' />` |
| `BottomNav` | ナビゲーション | `items`, `active`, `centered`, `maxWidth` | ナビゲーション | `<BottomNav items={navItems} active='home' />` |
| `InfiniteScroll` | 末尾で loadMore を呼出 | `loading`, `finished`, `threshold`, `onload` | 末尾で loadMore を呼出 | `<InfiniteScroll loading={loading} finished={finished} onload={loadMore} />` |
| `PullRefresh` | プル操作で refresh を呼出 | `refreshing`, `threshold`, `onrefresh` | プル操作で refresh を呼出 | `<PullRefresh refreshing={loading} onrefresh={refresh}>Orders</PullRefresh>` |
| `SafeArea` | セーフエリアの余白 | `top`, `bottom`, `left`, `right` | セーフエリアの余白 | `<SafeArea top bottom>Orders</SafeArea>` |
| `SwipeCell` | スワイプで操作を表示 | `leftActions`, `rightActions`, `threshold`, `onaction` | スワイプで操作を表示 | `<SwipeCell rightActions={swipeActions} onaction={selectAction}>Order 42</SwipeCell>` |

#### 利用例：モバイルの移動・更新・読み込みを処理する

下部ナビゲーション、操作シート、更新ジェスチャーを提供します。通信処理はアプリのコールバックが実行します。 詳細は[中国語の手順](ui.md#mobile)を参照してください。

<a id="workspace"></a>

### ワークスペースと設定：レイアウト

見出し、操作、内容をワークスペースに配置し、検索条件はページの状態として保持します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `SettingsModal` | 設定ダイアログ | `open`, `onclose` | 設定ダイアログ | `<SettingsModal bind:open={open} />` |
| `SettingsLayout` | 設定ナビと内容 | `title`, `description`, `sections`, `active`, `onselect` | 設定ナビと内容 | `<SettingsLayout title='Settings' sections={sections} active='profile'>Profile</SettingsLayout>` |
| `WorkspaceLayout` | ワークスペース | `title`, `leading/actions/footer` snippets | 内容が残り高さを使用 | `<WorkspaceLayout title='Orders'>Orders</WorkspaceLayout>` |
| `FilterBar` | 折り畳みフィルター | `activeCount`, `onreset`, `expanded` | 折畳みで入力値を保持 | `<FilterBar activeCount={0}>Filters</FilterBar>` |
| `TableToolbar` | 一覧検索バー | `searchValue`, `onsearch`, `onclearfilters` | 送信時ホストへ通知 | `<TableToolbar bind:searchValue={search} onsearch={query} />` |

#### 利用例：絞り込みと一覧をワークスペースに配置する

見出し、操作、内容をワークスペースに配置し、検索条件はページの状態として保持します。 詳細は[中国語の手順](ui.md#workspace)を参照してください。

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

### 操作結果の通知：`toast`、`messageBox`

操作結果、エラー、確認を共通の表示領域に渡します。返された ID で個別の通知を削除できます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `useToastFeedback` | 状態の変化を共通通知領域に表示 | `() => safely localized message, variant?` | `void; source-owned toast lifecycle` | `useToastFeedback(() => errorMessage(error))` |
| `notifySuccess` | 成功した操作を通知 | `localized message, duration?` | `toast ID string` | `notifySuccess(m.saved())` |
| `notifyInfo` | 情報を通知 | `localized message, duration?` | `toast ID string` | `notifyInfo(m.loading())` |
| `notifyWarning` | 対応が必要な注意を通知 | `localized message, duration?` | `toast ID string` | `notifyWarning(m.warning())` |
| `notifyError` | 安全なエラーメッセージを表示 | `unknown error, safe fallback?, duration?` | `toast ID string; internal exception text hidden` | `notifyError(error, m.retry())` |
| `errorMessage` | 利用者に表示できるメッセージを取得 | `unknown error, safe fallback?` | `safe localized string` | `errorMessage(error, m.retry())` |
| `toast.add` | 通知を追加 | `localized options/message` | `string item ID` | `toast.add({ message: m.saved(), variant: "success" })` |
| `toast.success` | 成功を通知 | `localized safe message, duration?` | `string item ID` | `toast.success(m.result())` |
| `toast.info` | 情報を通知 | `localized safe message, duration?` | `string item ID` | `toast.info(m.result())` |
| `toast.warning` | 注意を通知 | `localized safe message, duration?` | `string item ID` | `toast.warning(m.result())` |
| `toast.error` | 安全なエラーを通知 | `localized safe message, duration?` | `string item ID` | `toast.error(m.result())` |
| `toast.remove` | ID で通知を削除 | `item ID` | `void` | `toast.remove(id)` |
| `toast.clear` | すべての通知を削除 | `none` | `void` | `toast.clear()` |
| `message.add` | 通知を追加 | `localized options/message` | `string item ID` | `message.add({ message: m.saved(), type: "success" })` |
| `message.success` | 成功を通知 | `localized safe message, duration?` | `string item ID` | `message.success(m.result())` |
| `message.info` | 情報を通知 | `localized safe message, duration?` | `string item ID` | `message.info(m.result())` |
| `message.warning` | 注意を通知 | `localized safe message, duration?` | `string item ID` | `message.warning(m.result())` |
| `message.error` | 安全なエラーを通知 | `localized safe message, duration?` | `string item ID` | `message.error(m.result())` |
| `message.remove` | ID で通知を削除 | `item ID` | `void` | `message.remove(id)` |
| `message.clear` | すべての通知を削除 | `none` | `void` | `message.clear()` |
| `toast.pause` | 自動消去を一時停止 | `toast ID` | `void` | `toast.pause(id)` |
| `toast.resume` | 自動消去を再開 | `toast ID` | `void` | `toast.resume(id)` |
| `messageBox.confirm` | 確認またはキャンセルを待つ | `localized string or MessageBoxOptions` | `Promise<boolean>; host handles confirmation/cancellation` | `messageBox.confirm({ message: m.confirm() })` |
| `messageBox.alert` | 確認操作を待つ | `localized string or MessageBoxOptions` | `Promise<boolean>; host handles confirmation/cancellation` | `messageBox.alert({ message: m.confirm() })` |
| `Alert` | 継続的な情報表示 | `variant`, `title`, `dismissible` | 継続的な情報表示 | `<Alert variant='info' title='Saved' />` |
| `ToastContainer` | 通知キュー表示 | Mount once with `toast` | 通知キュー表示 | `<ToastContainer />` |
| `ErrorPage` | 503 状態と戻るリンク | `status`, `code`, `title`, `description`, `homeUrl`, `onhome`, `onback` | 503 状態と戻るリンク | `<ErrorPage status={503} homeUrl='/' />` |

#### 利用例：操作結果を表示して通知を管理する

操作結果、エラー、確認を共通の表示領域に渡します。返された ID で個別の通知を削除できます。 詳細は[中国語の手順](ui.md#notifications)を参照してください。

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

### ログインと権限 UI：認証部品

フォームは資格情報を集め、ホストの認証処理を呼び出します。公開ポリシーで選択肢を表示し、サーバーで認証します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `matchPermission` | 表示用の権限を照合 | `required permission, userPermissions[]` | `boolean; not server authorization` | `matchPermission("orders:read", ["orders:*"])` |
| `setPermissionContext` | 子部品に現在の権限を提供 | `() => current permissions; component initialization only` | `void` | `setPermissionContext(() => user.permissions)` |
| `usePermission` | 現在の権限コンテキストを取得 | `none; component initialization only` | `PermissionContext with hasPerm/hasAnyPerm/hasAllPerms` | `usePermission()` |
| `createSensitiveActions` | 指定した重要操作の再認証を要求 | `standard auth actions providing reauthenticate/publicConfig?` | `SensitiveActions: configure/authorize/submit/cancel` | `createSensitiveActions(actions)` |
| `createSessionRecovery` | 同じ利用者の再ログインを管理 | `none; configure public config and current user afterward` | `SessionRecovery controller` | `createSessionRecovery()` |
| `AuthPanel` | 認証方針に従い actions を呼出 | `config`, `actions`, `loginHeader/loginFields/loginFooter`, `registerHeader/registerFields/registerFooter` | 認証方針に従い actions を呼出 | `<AuthPanel {config} {actions} />` |
| `AuthShell` | 認証レイアウト | `variant`, `title`, `subtitle`, `brandTitle`, `brandText`, `illustration`, `description`, `highlights` | 認証レイアウト | `<AuthShell title='Sign in'>Account form</AuthShell>` |
| `LoginForm` | ログイン項目を login へ | `loading`, `errors`, `showForgotPassword`, `onsubmit` | ログイン項目を login へ | `<LoginForm onsubmit={login} />` |
| `RegisterForm` | 登録項目を register へ | `loading`, `errors`, `fields`, `onsubmit` | 登録項目を register へ | `<RegisterForm onsubmit={register} />` |
| `ForgotPasswordForm` | パスワード回復要求 | `mode`, `loading`, `errors`, `onsubmit` | パスワード回復要求 | `<ForgotPasswordForm onsubmit={sendReset} />` |
| `ResetPasswordForm` | パスワード再設定要求 | `loading`, `errors`, `showCode`, `onsubmit` | パスワード再設定要求 | `<ResetPasswordForm onsubmit={resetPassword} />` |
| `ChangePasswordForm` | パスワード変更要求 | `loading`, `errors`, `requireOldPassword`, `onsubmit` | パスワード変更要求 | `<ChangePasswordForm onsubmit={changePassword} />` |
| `PasswordInput` | password と強度を更新 | `value`, `showToggle`, `showStrength`, `minLength` | password と強度を更新 | `<PasswordInput bind:value={password} showStrength />` |
| `ReauthenticationDialog` | 再認証の送信・取消 | `open`, `loading`, `error`, `onsubmit`, `onclose` | 再認証の送信・取消 | `<ReauthenticationDialog open={confirmation.open} onsubmit={confirmation.submit} onclose={confirmation.cancel} />` |
| `PermGuard` | 権限に応じた表示、サーバー認可は別途 | `permissions`, `mode`, `fallback` | 権限に応じた表示、サーバー認可は別途 | `<PermGuard permissions='orders:read'>Orders</PermGuard>` |
| `UserProfile` | true のときだけ編集完了 | `user`, `editable`, `fields`, `avatarAccept`, `avatarHint`, `onsubmit` | true のときだけ編集完了 | `<UserProfile {user} editable onsubmit={saveProfile} />` |
| `SessionRecoveryDialog` | 元のユーザーの再ログイン・取消 | `recovery`, `actions` | 元のユーザーの再ログイン・取消 | `<SessionRecoveryDialog {recovery} {actions} />` |
| `SensitiveOperationsForm` | 機密操作ルールを送信 | `operations`, `onsubmit`, `ondone` | 機密操作ルールを送信 | `<SensitiveOperationsForm {operations} onsubmit={saveOperations} />` |

#### 利用例：公開ポリシーと認証処理をページに接続する

フォームは資格情報を集め、ホストの認証処理を呼び出します。公開ポリシーで選択肢を表示し、サーバーで認証します。 詳細は[中国語の手順](ui.md#auth)を参照してください。

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

### ファイル選択とアップロード：ストレージ部品

ファイル選択後に uploadHandler を呼び、画像部品は成功時に URL を更新します。保存先はアプリが管理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `FileUpload` | 選択ファイルを upload へ | `accept`, `maxSize`, `maxFiles`, `multiple`, `uploadHandler` | 選択ファイルを upload へ | `<FileUpload accept='.txt' uploadHandler={upload} />` |
| `ImageUpload` | 成功後画像 URL を更新 | `value`, `accept`, `maxSize`, `aspectRatio`, `uploadHandler` | 成功後画像 URL を更新 | `<ImageUpload bind:value={imageUrl} uploadHandler={uploadImage} />` |
| `AvatarUpload` | 成功後アバター URL を更新 | `value`, `size`, `maxSize`, `fallback`, `uploadHandler` | 成功後アバター URL を更新 | `<AvatarUpload bind:value={imageUrl} uploadHandler={uploadImage} />` |
| `FileList` | 指定ファイルを表示 | `files`, `layout`, `showDelete`, `showDownload` | 指定ファイルを表示 | `<FileList files={files} />` |

#### 利用例：ファイルを選んでアップロード処理に渡す

ファイル選択後に uploadHandler を呼び、画像部品は成功時に URL を更新します。保存先はアプリが管理します。 詳細は[中国語の手順](ui.md#uploads)を参照してください。

<a id="crypto"></a>

### 暗号化結果の表示：暗号部品

実際の計算結果を表示し、部品は鍵を保持せず署名検証もしません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `EncryptedInput` | 成功時だけ現在入力の暗号文を更新 | `value`, `encryptedValue`, `algorithm`, `showEncrypted` | 成功時だけ現在入力の暗号文を更新 | `<EncryptedInput bind:value={plain} bind:encryptedValue={cipher} onencrypt={encrypt} />` |
| `HashDisplay` | 既存のダイジェストを表示 | `value`, `algorithm`, `copyable`, `truncate` | 既存のダイジェストを表示 | `<HashDisplay value={digest} algorithm='SM3' />` |
| `SignatureDisplay` | 署名と指定した検証状態を表示 | `signature`, `publicKey`, `algorithm`, `verified` | 署名と指定した検証状態を表示 | `<SignatureDisplay {signature} {publicKey} verified />` |

#### 利用例：実際の暗号文・要約・検証結果を表示する

アプリが計算した暗号文、要約、検証結果を表示します。EncryptedInput の暗号化処理は onencrypt で渡します。 詳細は[中国語の手順](ui.md#crypto)を参照してください。

<a id="documents"></a>

### 文書の閲覧・編集・保存：AI コンテンツ

ブラウザーでは長い Markdown の解析と強調表示を Web Worker に渡し、ストリーミング更新をまとめます。複数ページ PDF は DOM を撮影し、OffscreenCanvas を利用できる場合は Worker が改ページ位置を調べて各ページの PNG を作ります。

テキスト、Markdown、表、文書データを表示し、必要に応じて編集、ダウンロード、引用操作に接続します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `parseMarkdown` | Markdown を表示用の安全な HTML に変換 | `Markdown source, MarkdownParseOptions?` | `HTML string; raw HTML escaped or allowlisted` | `parseMarkdown("# Hello", { allowHtmlTags: false })` |
| `renderMarkdownDocument` | 本文・見出し・コード情報を解析 | `Markdown source, MarkdownDocumentParseOptions?` | `MarkdownRenderResult with outline/codeBlocks/blocks` | `renderMarkdownDocument("# Report", { allowHtmlTags: false })` |
| `isLanguageSupported` | 構文強調が対応する言語か確認 | `language name` | `boolean` | `isLanguageSupported("typescript")` |
| `highlightCode` | ソースをエスケープして構文を強調 | `code text, supported language` | `escaped/highlighted HTML string` | `highlightCode("const total = 1", "typescript")` |
| `resolveDocumentMarkdownContent` | 文書内容を Markdown に整形 | `text, sourceKind?, language?` | `Markdown string with a safe fence length` | `resolveDocumentMarkdownContent("const x = 1", "code", "ts")` |
| `resolveDocumentDownloadActions` | 文書のダウンロード選択肢を解決 | `MarkdownToolbarDownloadAction[]?` | `AiDocumentResolvedDownloadAction[]` | `resolveDocumentDownloadActions([{ id: "markdown", label: "Markdown" }])` |
| `downloadAiDocument` | 選択した形式で文書をダウンロード | `AiDocumentDownloadRequest` | `Promise<void>; browser failure rejects, SSR does nothing` | `downloadAiDocument({ actionId: "markdown", content: "# Report", filename: "report.md" })` |
| `MarkdownRenderer` | 安全な Markdown 表示 | `content`, `fontSize`, `allowHtmlTags`, `showCopyButton`, `enableHighlight` | 安全な Markdown 表示 | `<MarkdownRenderer content='# Hello' allowHtmlTags={false} />` |
| `AiDocumentDownloadMenu` | 選択でダウンロードを呼出 | `actions`, `ondownload` | 選択でダウンロードを呼出 | `<AiDocumentDownloadMenu {actions} ondownload={download} />` |
| `AiDocumentEditor` | 編集で markdown を更新 | `content`, `fontSize`, `allowHtmlTags`, `showRunButton`, `showCodePreviewToggle`, `allowUnsafeCodePreview` | 編集で markdown を更新 | `<AiDocumentEditor bind:content={markdown} showToolbar />` |
| `AiTableEditor` | セル表示と編集通知 | `columns`, `rows`, `editable`, `ondownload` | セル表示と編集通知 | `<AiTableEditor {columns} {rows} editable />` |

#### 利用例：文書を解析してプレビューする

テキスト、Markdown、表、文書データを表示し、必要に応じて編集、ダウンロード、引用操作に接続します。 詳細は[中国語の手順](ui.md#documents)を参照してください。

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

<a id="tool-workspaces"></a>

### ツール実行と成果物編集：ワークスペース

ホストがツール一覧、送信処理、アクセス可能な成果物を渡し、ワークスペースが進行状況と結果を表示します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `ArtifactWorkspace` | 成果物編集 | `artifacts`, `onread`, `onsave?` | 保存で版更新、競合時草稿保持 | `<ArtifactWorkspace artifacts={[report]} onread={readArtifact} onsave={saveArtifact} />` |
| `ToolWorkspace` | ツール実行 | `tools`, `onrun`, `onstatus?`, `oncancel?` | 2 と3 の入力で total=5 | `<ToolWorkspace tools={catalog} onrun={run} />` |

#### 利用例：ツールを実行して成果物を編集する

ホストがツール一覧、送信処理、アクセス可能な成果物を渡し、ワークスペースが進行状況と結果を表示します。 詳細は[中国語の手順](ui.md#tool-workspaces)を参照してください。

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

### 指標とグラフの表示：チャート

グラフにはデータと項目を渡し、指標カードには計算済みの値を渡します。部品が業務サービスを検索することはありません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `Chart` | グラフ | `type?`, `preset?`, `data`, `x`, `y` | グループ棒グラフ | `<Chart preset='grouped-bar' {data} x='month' y={['revenue', 'cost']} />` |
| `DashboardGrid` | ダッシュボードグリッド | `columns`, `label`, children | 2列、狭い画面で縮小 | `<DashboardGrid columns={2} label='Metrics'><MetricCard title='Orders' value={42} /></DashboardGrid>` |
| `MetricCard` | 指標カード | `title`, `value`, `unit?`, `trend?` | 42 と+12.8% を表示 | `<MetricCard title='Orders' value={42} trend={12.8} />` |
| `ReportCard` | レポートカード | `title`, `loading?`, children | 見出しと内容 | `<ReportCard title='Revenue'>Chart content</ReportCard>` |

#### 利用例：業務データをグラフと指標で表示する

グラフにはデータと項目を渡し、指標カードには計算済みの値を渡します。部品が業務サービスを検索することはありません。 詳細は[中国語の手順](ui.md#charts)を参照してください。

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

### 照会と編集フロー：`CrudPage`

リソース定義で検索、作成、更新、削除を接続し、コントローラーで読み込み、移動、編集状態を管理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `defineCrud` | フィールドと CRUD 処理をリソースとして定義 | `CrudResource with fields/API callbacks` | `CrudDef for CrudPage` | `defineCrud(resourceDefinition)` |
| `createCrudController` | 記録の読み込み・移動・検索状態を管理 | `CrudDef, { autoLoad? }?` | `controller data/nav/loading/loaded/error/load/reload` | `createCrudController(crud, { autoLoad: false })` |
| `mapPaginated` | ページ情報を保って各要素を変換 | `PaginatedResult<T>, (item,index) => R` | `PaginatedResult<R> retaining total/page/pageSize` | `mapPaginated(page, item => ({ ...item, selected: false }))` |
| `createBrowserNavAdapter` | CRUD の状態をブラウザー移動に接続 | `none` | `NavAdapter` | `createBrowserNavAdapter()` |
| `CrudPage` | 一覧・フォームとリソース操作 | `crud`, `data`, `permissions`, `form`, `pagination`, `density`, `detailColumns`, `showHeader`, `toolbarLeading`, `toolbarActions`, `card`, `tableCell`, `onrowclick`, `sortableColumns`, `nav`, `loading`, `loaded`, `error`, `onRetry`, `keepPreviousData` | 一覧・フォームとリソース操作 | `<CrudPage {crud} data={controller.data} nav={controller.nav} />` |
| `CrudFilterBar` | 検索条件を送信 | `filterFields`, `searchValue`, `onsearch`, `onfilterchange`, `onreset` | 検索条件を送信 | `<CrudFilterBar filterFields={filters} onsearch={search} />` |
| `CrudDetailPanel` | 指定レコードの詳細 | `open`, `item`, `fields`, `variant`, `drawerWidth`, `modalSize` | 指定レコードの詳細 | `<CrudDetailPanel bind:open={open} item={selected} fields={fields} />` |
| `CrudEditPanel` | 宣言した書込項目を送信 | `open`, `fields`, `variant`, `drawerWidth`, `modalSize`, `onsubmit` | 宣言した書込項目を送信 | `<CrudEditPanel bind:open={open} fields={fields} onsubmit={save} />` |
| `CrudDeleteConfirm` | 確認で remove を呼出 | `open`, `loading`, `onconfirm` | 確認で remove を呼出 | `<CrudDeleteConfirm bind:open={open} onconfirm={remove} />` |

#### 利用例：リソース定義から一覧・編集画面を作る

CrudPage と createCrudController の検索です。コンポーネントが状態を表示し、controller がアプリのデータサービスを呼びます。

![CRUD 一覧：検索・前回データ・最新応答](../images/function-ui-crud-loading.ja.svg)

条件の編集中は検索せず、検索／Enter で確定します。ページ・並べ替えは確定済み条件を使い、最新の応答だけを反映します。初回失敗は再試行を表示し、更新失敗では既存データを保持します。空表示は loaded かつ total=0 の時だけです。

リソース定義で検索、作成、更新、削除を接続し、コントローラーで読み込み、移動、編集状態を管理します。 詳細は[中国語の手順](ui.md#crud)を参照してください。

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

デモの list は Ada を1件返し、HTTP 通信や永続化は行いません。createCrudController は既定で読み込みを開始します。遅延タブでは autoLoad: false にし、初めて開くときに load を呼びます。

<a id="code"></a>

### ソースコードの閲覧：`CodeWorkspace`

ファイル一覧と必要時の読み込み処理でコードを表示します。アクセス権と書き込みはホストが管理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `CodeWorkspace` | ソースワークスペース | `source: CodeWorkspaceSource` | README.md で # Hello を表示 | `<CodeWorkspace {source} />` |

#### 利用例：ファイルとコードを閲覧する

ファイル一覧と必要時の読み込み処理でコードを表示します。アクセス権と書き込みはホストが管理します。 詳細は[中国語の手順](ui.md#code)を参照してください。

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

### ガイドとヘルプ：`createGuide`

手順、対象、記事をアプリで定義し、コントローラーで開始、次の手順、終了、完了記録を管理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `createGuide` | 導覧とヘルプのコントローラーを作成 | `GuideOptions: tours, articles?, nav?, persistence?, persistKey?` | `GuideController; no init/close` | `createGuide({ tours: [], persistence: "memory" })` |
| `resolveGuideText` | 固定値または遅延翻訳の案内文を取得 | `string or translation callback?` | `string` | `resolveGuideText(() => m.help())` |
| `GuideHost` | ガイドとヘルプ画面 | `guide`, `locale`, `scope`, `autoStart` | ガイドとヘルプ画面 | `<GuideHost {guide} locale='en-US' scope='demo-user' />` |
| `HelpCenter` | ヘルプの検索と閲覧 | `articles`, `tours`, `locale`, `selectedId`, `onstart` | ヘルプの検索と閲覧 | `<HelpCenter articles={articles} tours={tours} locale='en-US' />` |

#### 利用例：ガイドを開始してヘルプ記事を開く

手順、対象、記事をアプリで定義し、コントローラーで開始、次の手順、終了、完了記録を管理します。 詳細は[中国語の手順](ui.md#guide)を参照してください。

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

### テーマ切替：`@h-ai/ui/theme`

最初の表示前に信頼済みの既定テーマを適用し、ページの選択部品で設定を読み取り、更新します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `getThemeInfo` | 対応テーマの情報を取得 | `theme ID` | `ThemeInfo or undefined` | `getThemeInfo("light")` |
| `isDarkTheme` | ダーク配色のテーマか確認 | `theme ID` | `boolean` | `isDarkTheme("dark")` |
| `normalizeThemeId` | 対応テーマまたは代替テーマを選択 | `candidate theme ID, fallback?` | `supported theme ID` | `normalizeThemeId("unknown", "light")` |
| `normalizeHexColor` | 対応する16進色を正規化 | `string or null/undefined` | `six-digit lowercase hex string or null` | `normalizeHexColor("#5765F0")` |
| `resolveThemeTone` | テーマの明暗を取得 | `theme ID` | `light or dark` | `resolveThemeTone("light")` |
| `createThemeBootstrapScript` | 初回表示前に信頼済みテーマを適用 | `ThemeBootstrapScriptOptions from trusted host config` | `script string for the application HTML shell` | `createThemeBootstrapScript({ storageKey: "theme", defaultThemeId: "light" })` |
| `getThemeInitScript` | 既定テーマ初期化スクリプトを取得 | `none` | `script string` | `getThemeInitScript()` |
| `applyTheme` | テーマを適用し、必要に応じて設定を保存 | `theme ID, persist? (default true)` | `void; updates DOM/browser preference` | `applyTheme("dark")` |
| `getCurrentTheme` | ページに適用中のテーマを取得 | `none` | `theme ID string` | `getCurrentTheme()` |
| `getSavedTheme` | 保存されたテーマ設定を取得 | `fallback theme ID?` | `theme ID string` | `getSavedTheme("light")` |
| `ThemeColorPicker` | 選択色を更新 | `value`, `presets`, `onchange` | 選択色を更新 | `<ThemeColorPicker bind:value={color} />` |
| `ThemeSelector` | テーマを選択 | `themeIds?: readonly string[]` | 組み込みテーマの候補を指定できる | `<ThemeSelector />` |
| `ThemeToggle` | 明暗を切替 | なし | 明暗を切替 | `<ThemeToggle />` |

#### 利用例：設定を読み込んでテーマを切り替える

最初の表示前に信頼済みの既定テーマを適用し、ページの選択部品で設定を読み取り、更新します。 詳細は[中国語の手順](ui.md#theme)を参照してください。

共有スタイルの `@h-ai/ui/styles/theme.css` には、半透明の面を使った明るいテーマ `liquid-glass` が含まれます。ダイアログやドロワーは背後のレイヤーをぼかし、メニューは重なる領域だけをぼかします。前面のコンテンツはくっきりと表示され、縁では光が屈折します。コントロールのハイライトはマウスに追従し、モーションを減らす設定では静止します。テーマセレクターで「リキッドガラス」を選ぶと、再読み込み後も選択が維持されます。UI のある CLI プロジェクトでは、標準でリキッドガラスを選べます。Fullstack プロジェクトで `fullstack.theme.themes` を明示的に設定する場合は、一覧に `liquid-glass` を追加してください。`ThemeSelector` の `themeIds` で組み込みテーマの候補を絞り込めます。省略するとすべての組み込みテーマを表示します。

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
  THEMES, // 19 種類のテーマのメタデータ（ThemeInfo[] 型）
} from '@h-ai/ui/theme'
```

<a id="locale"></a>

### 言語切替とリクエスト分離：`@h-ai/ui/i18n`

ブラウザーではページの言語を保持し、サーバーではリクエストごとに言語を設定して他の利用者と混在させません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `createLocaleStore` | ブラウザーページの言語を管理 | `{ defaultLocale?, supportedLocales?, detectBrowser?, persistKey? }` | `locale store with current/set/isSupported` | `createLocaleStore({ defaultLocale: "zh-CN", detectBrowser: false })` |
| `getGlobalLocale` | 現在のコンテキストの言語を取得 | `none` | `locale string from current context` | `getGlobalLocale()` |
| `setGlobalLocale` | 現在のリクエストまたはページの言語を設定 | `locale` | `void; use request context for SSR` | `setGlobalLocale("en-US")` |
| `detectBrowserLocale` | ブラウザーから対応言語を選択 | `supportedLocales?` | `supported locale or null` | `detectBrowserLocale()` |
| `isLocaleSupported` | 有効な言語か確認 | `locale, supportedLocales?` | `boolean` | `isLocaleSupported("ja-JP")` |
| `resolveLocale` | 対応言語または代替言語を取得 | `locale, supportedLocales?, fallback?` | `supported locale` | `resolveLocale("en")` |
| `interpolate` | メッセージ中の名前付き変数を置換 | `template string, InterpolationParams` | `string` | `interpolate("Hello {name}", { name: "Ada" })` |
| `LanguageSwitch` | UI 言語を変更 | なし | UI 言語を変更 | `<LanguageSwitch />` |

#### 利用例：ページの言語を選んで文言を整える

ブラウザーではページの言語を保持し、サーバーではリクエストごとに言語を設定して他の利用者と混在させません。 詳細は[中国語の手順](ui.md#locale)を参照してください。

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

### フィードバックと証拠：フィードバック部品

ホストが保護済みの証拠と認可済み操作を渡し、部品がユーザー操作を通知します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `FeedbackModal` | ホストへ送信、失敗時入力保持 | `open`, `onsubmit` | ホストへ送信、失敗時入力保持 | `<FeedbackModal bind:open={open} onsubmit={submitFeedback} />` |
| `FeedbackForm` | 送信データと添付変更 | `attachments`, `evidenceSummary`, `onsubmit`, `onfileschange` | 送信データと添付変更 | `<FeedbackForm attachments={attachments} onsubmit={submitFeedback} />` |
| `FeedbackList` | 照会コールバック、通信はホスト | `data`, `query`, `permissions`, `onquerychange`, `onstatus` | 照会コールバック、通信はホスト | `<FeedbackList data={feedbackRows} onquerychange={queryFeedback} />` |
| `FeedbackDetail` | 報告と許可済み証拠 | `report`, `evidence`, `attachments`, `history`, `webhook`, `onretry`, `onexport` | 報告と許可済み証拠 | `<FeedbackDetail report={report} />` |
| `FeedbackScreenshot` | 注釈コールバック | `attachment`, `onannotate` | 注釈コールバック | `<FeedbackScreenshot attachment={attachment} onannotate={annotate} />` |

#### 利用例：証拠を表示してフィードバックを送る

収集済みの証拠を表示し、添付、注釈、送信操作を通知します。一覧と詳細には許可済みのデータを渡します。 詳細は[中国語の手順](ui.md#feedback)を参照してください。

<a id="utilities"></a>

### クラス・端末・クリップボード：UI ツール

クラス名、画面用 ID、端末別スタイルを作ります。クリップボードと portal は対応するブラウザー機能を使います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `registerClipboardHostWriter` | WebView のコピー処理を登録・解除 | `async text => boolean or null to unregister` | `void` | `registerClipboardHostWriter(null)` |
| `writeTextToClipboard` | テキストをコピーし成否を返す | `text: string` | `Promise<boolean>; true only when write succeeds` | `writeTextToClipboard("trace-001")` |
| `cn` | 条件付きのクラス名を結合 | `...string\|boolean\|null\|undefined values` | `string` | `cn("flex", active && "text-primary")` |
| `getDataAttributes` | data-* 属性だけを引き継ぐ | `props record` | `ForwardedDataAttributes` | `getDataAttributes({ "data-testid": "save" })` |
| `generateId` | 画面要素用の識別子を作成 | `prefix?; not a security token generator` | `string` | `generateId("field")` |
| `portal` | マウント済みノードを指定先へ移動 | `HTMLElement, target HTMLElement or selector?` | `Svelte action result with cleanup` | `portal(node, document.body)` |
| `detectPlatform` | 現在の端末種別を検出 | `none` | `Platform` | `detectPlatform()` |
| `isMobile` | モバイル端末か確認 | `none` | `boolean` | `isMobile()` |
| `isNativeApp` | ネイティブアプリ内で動作しているか確認 | `none` | `boolean` | `isNativeApp()` |
| `usePlatform` | 端末情報をリアクティブに取得 | `none; component initialization` | `{ current, isMobile, isApp }` | `usePlatform()` |
| `getVariantClass` | 表示種別を部品のクラス名へ変換 | `Variant, prefix?` | `string class name` | `getVariantClass("primary", "btn")` |
| `getSizeClass` | サイズを部品のクラス名へ変換 | `Size, prefix?` | `string class name` | `getSizeClass("sm", "btn")` |
| `getInputSizeClass` | 入力部品のサイズクラスを取得 | `Size` | `string class name` | `getInputSizeClass("sm")` |
| `getBadgeVariantClass` | バッジの配色クラスを取得 | `Variant` | `string class name` | `getBadgeVariantClass("info")` |
| `getBadgeSizeClass` | バッジのサイズクラスを取得 | `Size` | `string class name` | `getBadgeSizeClass("sm")` |
| `getAlertVariantClass` | 通知の配色クラスを取得 | `Variant` | `string class name` | `getAlertVariantClass("info")` |
| `getProgressVariantClass` | 進捗表示の配色クラスを取得 | `Variant` | `string class name` | `getProgressVariantClass("primary")` |

#### 利用例：スタイルを組み立てて診断番号をコピーする

クラス名、画面用 ID、端末別スタイルを作ります。クリップボードと portal は対応するブラウザー機能を使います。 詳細は[中国語の手順](ui.md#utilities)を参照してください。

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

## 呼び出し引数

詳細は[中国語ガイド](ui.md#call-options).

<a id="form-layout-guide"></a>

## フォーム配置

詳細は[中国語ガイド](ui.md#form-layout-guide).

<a id="toast-options"></a>

## 通知オプション

詳細は[中国語ガイド](ui.md#toast-options).

<a id="theme-locale-guide"></a>

## テーマと言語

詳細は[中国語ガイド](ui.md#theme-locale-guide).
