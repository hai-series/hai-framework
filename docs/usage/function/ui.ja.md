# @h-ai/ui API リファレンス

<!-- translation: partial -->

[原文（中国語）](ui.md) · [設定](../configuration/ui.ja.md) · [データ構造](../data/ui.ja.md)

<a id="quick-start"></a>

## クイックスタート

<a id="module-dependencies"></a>

### 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| `svelte` | Svelte 5 コンポーネントをコンパイルして描画 | UI コンポーネントの利用時に必須 | Svelte 5 プロジェクトでコンポーネントをインポート。マウントは Svelte が担当 |
| `tailwindcss` 4、`daisyui` 5 | コンポーネントのスタイルとテーマを生成 | 標準スタイルを使う場合 | ビルド前に [スタイルの導入例](#styles) に沿って CSS エントリーとコンポーネントのスキャンを設定 |
| `@tailwindcss/vite` | Vite のビルドで Tailwind CSS を処理 | Tailwind の Vite 統合を使う場合 | ビルド前に Vite の設定にプラグインを登録 |
| `@h-ai/core` | 組み込みメッセージと結果型を提供 | UI とともにインストール | コンポーネントをそのままインポート可能 |

### 利用例

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
import { THEMES, ui } from '@h-ai/ui/theme'
```

<a id="api-reference"></a>

## 機能

UI に init/close はありません。Svelte がマウントを管理します。各機能で入出力と例を示し、認可と保存はホストが担当します。詳細手順の未訳部分は対応する中国語節へリンクします。

<a id="styles"></a>

### スタイルと自動インポート：`ui.autoImport`

ビルド時にスタイルを読み、自動インポートは実際のテンプレート部品を対象にします。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `ui.autoImport()` | テンプレートで使う部品のインポートを追加 | 引数なし。返されたプリプロセッサーを Svelte に登録し、マークアップとファイル名を処理します。 | `PreprocessorGroup; synchronous { code }` | `ui.autoImport()` |

#### 利用例：スタイルと部品のインポートを設定する

Svelte のビルド設定で自動インポートを有効にし、アプリの CSS に共通スタイルを読み込みます。実行時に部品を探す機能ではありません。 詳細は[中国語の手順](ui.md#styles)を参照してください。

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { ui } from '@h-ai/ui/auto-import'

export default {
  // Install the Hai UI preprocessor before Vite's Svelte preprocessor. It supplies imports for Hai components in templates.
  preprocess: [ui.autoImport(), vitePreprocess()],
}
```

<a id="forms"></a>

### 入力と送信：フォーム部品

値をページの状態に保存し、バインディングで更新します。検証後の送信はアプリのコールバックが処理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `<Button>` | クリックで count が1増加 | `variant` は外観や状態を選択。`size` はコンポーネントのサイズ。`loading` は処理中の状態を表示。`disabled` は利用者による操作を無効化。`outline` は枠線付きの表示。`circle` は円形ボタンを表示。 | クリックで count が1増加 | `<Button onclick={() => count += 1}>Add</Button>` |
| `<IconButton>` | アイコンボタンとヒント | `icon` は信頼できる SVG 文字列か、アイコンを描画する Svelte の `Snippet`。`variant` は外観や状態を選択。`size` はコンポーネントのサイズ。`tooltip` はホバー時のヒント。`loading` は処理中の状態を表示。 | アイコンボタンとヒント | `<IconButton icon='<svg viewBox="0 0 24 24"></svg>' tooltip='Save' />` |
| `<BareButton>` | 名前付きボタン | `class` はCSS クラスを追加。`ariaLabel` は支援技術向けの名前。`role` はアクセシビリティ上の役割。`tabindex` はキーボードフォーカスの順序。 | 名前付きボタン | `<BareButton ariaLabel='Save'>Save</BareButton>` |
| `<Input>` | 入力で name を更新 | `type` は入力または表示の種類。`value` は現在値を指定。対応時は双方向バインド可。`size` はコンポーネントのサイズ。`error` はエラーメッセージやエラー状態。`validationMessage` は入力検証に失敗したときの文言。 | 入力で name を更新 | `<Input bind:value={name} />` |
| `<BareInput>` | 入力で name を更新 | `type` は入力または表示の種類。`class` はCSS クラスを追加。`accept` はファイル選択で許可する種類。`multiple` は複数選択を許可。 | 入力で name を更新 | `<BareInput type='text' bind:value={name} />` |
| `<Textarea>` | 複数行入力で notes を更新 | `value` は現在値を指定。対応時は双方向バインド可。`rows` は最初に表示する行数。`size` はコンポーネントのサイズ。`autoResize` は入力に合わせて高さを調整。`error` はエラーメッセージやエラー状態。 | 複数行入力で notes を更新 | `<Textarea bind:value={notes} rows={3} />` |
| `<Select>` | 選択で status を更新 | `options` は利用者が選べる候補。`value` は現在値を指定。対応時は双方向バインド可。`placeholder` は入力や選択がない場合のヒント。`size` はコンポーネントのサイズ。`clearable` は現在値を消す操作を表示。`filterable` は入力した文字で候補を絞る。[選択肢のフィールド](#choice-options)。 上下の矢印キーで候補を移動し、Enter で決定、Escape で閉じます。絞り込みの入力にはスペースも使用できます。 | 選択で status を更新 | `<Select options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `<Checkbox>` | 選択で enabled を更新 | `checked` は選択状態。`label` は表示するラベル。`size` はコンポーネントのサイズ。`indeterminate` は一部選択の状態を表示。 | 選択で enabled を更新 | `<Checkbox bind:checked={enabled} label='Enabled' />` |
| `<Switch>` | 切替で enabled を更新 | `checked` は選択状態。`label` は表示するラベル。`size` はコンポーネントのサイズ。 | 切替で enabled を更新 | `<Switch bind:checked={enabled} label='Enabled' />` |
| `<Radio>` | 選択で status を更新 | `options` は利用者が選べる候補。`value` は現在値を指定。対応時は双方向バインド可。`direction` は横並びか縦並びかを指定。`size` はコンポーネントのサイズ。[選択肢のフィールド](#choice-options)。 | 選択で status を更新 | `<Radio options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `<ToggleCheckbox>` | チェック状態を enabled に反映 | `checked` は選択状態。`name` は識別やグループ化に使う名前。`onchange` は値の変更時に呼び出す。 | チェック状態を enabled に反映 | `<ToggleCheckbox bind:checked={enabled} name='enabled' />` |
| `<ToggleInput>` | チェック状態を enabled に反映 | `checked` は選択状態。`name` は識別やグループ化に使う名前。 | チェック状態を enabled に反映 | `<ToggleInput bind:checked={enabled} name='enabled' />` |
| `<ToggleRadio>` | 選択済みラジオ | `checked` は選択状態。`name` は識別やグループ化に使う名前。`onchange` は値の変更時に呼び出す。 | 選択済みラジオ | `<ToggleRadio name='choice' checked />` |
| `<Range>` | ドラッグで score を更新 | `value` は現在値を指定。対応時は双方向バインド可。`min` は許可する最小値。`max` は上限。`step` は隣り合う値の間隔。 | ドラッグで score を更新 | `<Range min={0} max={100} bind:value={score} />` |
| `<Rating>` | 評価で score を更新 | `value` は現在値を指定。対応時は双方向バインド可。`max` は上限。 | 評価で score を更新 | `<Rating max={5} bind:value={score} />` |
| `<Badge>` | New のバッジ | `variant` は外観や状態を選択。`size` はコンポーネントのサイズ。`outline` は枠線付きの表示。 | New のバッジ | `<Badge variant='info'>New</Badge>` |
| `<Avatar>` | 名前のアバター | `src` は画像 URL。`name` は画像がないときに使うイニシャルの元になる名前。`size` はコンポーネントのサイズ。`shape` は形状。`ring` は周囲のリングを切り替え。 | 名前のアバター | `<Avatar name='Ada' />` |
| `<Tag>` | タグ表示 | `text` は表示する文言。`variant` は外観や状態を選択。`size` はコンポーネントのサイズ。`closable` は閉じる操作を表示。 | タグ表示 | `<Tag text='Release' />` |
| `<Spinner>` | 読み込み表示 | `size` はコンポーネントのサイズ。`variant` は外観や状態を選択。 | 読み込み表示 | `<Spinner size='sm' />` |
| `<Progress>` | 進捗30% | `value` は現在値を指定。対応時は双方向バインド可。`max` は上限。`variant` は外観や状態を選択。`striped` は縞模様を表示。`animated` は進捗表示にアニメーションを付ける。 | 進捗30% | `<Progress value={3} max={10} />` |
| `<Form>` | 検証後 save を呼出 | `columns` は列数または列定義。`labelPosition` は入力欄に対するラベルの位置。`labelWidth` はラベル欄の幅。`loading` は処理中の状態を表示。`disabled` は利用者による操作を無効化。`onsubmit` はフォームの送信時に呼び出す。 | 検証後 save を呼出 | `<Form onsubmit={save}><Input bind:value={name} /></Form>` |
| `<FormField>` | ラベルと入力を関連付け | `label` は表示するラベル。`for` はラベルと入力欄の ID を関連付ける。`colSpan` はフィールドが占める列数。`labelPosition` は入力欄に対するラベルの位置。`error` はエラーメッセージやエラー状態。`hint` は入力欄の補足説明。`required` は必須項目として表示。 | ラベルと入力を関連付け | `<FormField label='Name' for='name'><Input id='name' bind:value={name} /></FormField>` |
| `<FormLayout>` | 2列から狭い画面で1列へ | `columns` は列数または列定義。`labelPosition` は入力欄に対するラベルの位置。`labelWidth` はラベル欄の幅。 | 2列から狭い画面で1列へ | `<FormLayout columns={2}><FormField label='Name'><Input bind:value={name} /></FormField></FormLayout>` |
| `<TagInput>` | 編集で tags を更新 | `tags` は現在のタグ一覧。`maxTags` はタグの件数上限。`allowDuplicates` は同じタグの重複を許可。`size` はコンポーネントのサイズ。 | 編集で tags を更新 | `<TagInput bind:tags={tags} maxTags={5} />` |
| `<Combobox>` | 検索して選択値を更新 | `options` は利用者が選べる候補。`value` は現在値を指定。対応時は双方向バインド可。`multiple` は複数選択を許可。`placeholder` は入力や選択がない場合のヒント。`size` はコンポーネントのサイズ。 | 検索して選択値を更新 | `<Combobox options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `<Calendar>` | 選択で DateValue を更新 | `value` は現在値を指定。対応時は双方向バインド可。`minValue` は選択可能な最も早い日。`maxValue` は選択可能な最も遅い日。 | 選択で DateValue を更新 | `<Calendar bind:value={date} />` |
| `<DatePicker>` | ポップアップで日付を更新 | `value` は現在値を指定。対応時は双方向バインド可。`minValue` は選択可能な最も早い日。`maxValue` は選択可能な最も遅い日。`error` はエラーメッセージやエラー状態。`size` はコンポーネントのサイズ。 `ariaLabel` は日付入力のアクセシブルな名前を指定します。 | ポップアップで日付を更新 | `<DatePicker bind:value={date} />` |
| `<ScheduleInput>` | 実行日時を編集 | `config` はタイムゾーン、精度、Cron の使用可否を指定します。`value` と `valid` は値と検証状態を双方向でバインドできます。`name` は送信フィールド名、`id` は表示中のコントロールに対応します。 | UTC オフセット付きの ISO 文字列または5フィールドの Cron | `<ScheduleInput name='scheduled_at' bind:value={schedule} required />` |
| `<CronExpressionBuilder>` | Cron と手入力式を編集 | `value` は式、`presets` は定型式です。`labels` と `weekdayOptions` は表示、`error` と `describedBy` は検証の文言を指定します。 | 手動で調整する式は入力を保持 | `<CronExpressionBuilder bind:value={cron} />` |
| `ui.normalizeScheduleInputConfig(value)` | 調度スキーマを判定 | `value` は `x-hai-input` の値です。`kind: 'schedule'`、有効な IANA `timezone`、`precision: 'minute'` を指定します。`allowCron` は省略できます。 | 正規化した `ScheduleInputConfig`。無効な値は `undefined` | `ui.normalizeScheduleInputConfig(rawMetadata)` |
| `ui.createDefaultCronBuilderState()` | 初期状態を生成 | 引数なし。 | 毎日 10:00 の `CronBuilderState` | `ui.createDefaultCronBuilderState()` |
| `ui.cronExpressionToBuilderState(expression)` | 編集状態へ変換 | `expression` に Cron 文字列を渡します。 | `CronBuilderState`。複雑または無効な値は手入力状態に保持 | `ui.cronExpressionToBuilderState('0 10 * * *')` |
| `ui.cronBuilderStateToExpression(state)` | 編集状態を式へ変換 | `state` に現在の `CronBuilderState` を渡します。 | ビジュアルモードは5フィールド、手入力モードは入力したテキスト | `ui.cronBuilderStateToExpression(state)` |
| `ui.isCronExpressionValid(expression)` | Cron 構文を検証 | `expression` に検証する文字列を渡します。ホストはフィールド数を制限できます。 | `boolean` | `ui.isCronExpressionValid('0 10 * * *')` |
| `CRON_BUILDER_WEEKDAY_ORDER` | 曜日の並びを取得 | 引数なし。 | 月曜から日曜の数字文字列。日曜は `'0'` | `[...CRON_BUILDER_WEEKDAY_ORDER]` |

<a id="choice-options"></a>

#### 選択肢のフィールド

| フィールド | 型 | 既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `value` | `T` | 必須 | 選択したときにバインドに書き込む値。 |
| `label` | `string` | 必須 | 利用者に表示する選択肢の名前。 |
| `disabled` | `boolean` | 未設定（選択可） | `true` でこの項目を選択できなくします。 |

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

Done を選ぶと `done` が表示されます。Archived は選択不可で、`status` は変化しません。

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

<a id="schedule-input"></a>

#### シナリオ：実行日時を選択して Cron を編集する

ホストのスキーマから `x-hai-input` を取得し、正規化した設定をコントロールへ渡します。コンポーネントの既定値は北京時間と分精度です。`allowCron` を省略すると `false` になります。この例ではロサンゼルス時間の日時と5フィールドの Cron を選べます。

```svelte
<script lang='ts'>
  import { Form, FormField, ScheduleInput, ui } from '@h-ai/ui'

  let schedule = $state('')
  let result = $state('')
  const rawMetadata = {
    kind: 'schedule', timezone: 'America/Los_Angeles', precision: 'minute', allowCron: true,
  }
  // Parse the schema metadata. Invalid zones or precision return undefined.
  const config = ui.normalizeScheduleInputConfig(rawMetadata)
</script>
{#if config}
  <!-- Use the named form field to receive the selected schedule string. -->
  <Form onsubmit={fields => { result = String(fields.scheduled_at) }}>
    <!-- Associate the label with the mode's visible input. -->
    <FormField label='Scheduled time' for='when' required>
      <!-- A valid date-time includes an offset. Cron mode writes a five-field expression. -->
      <ScheduleInput id='when' name='scheduled_at' {config} bind:value={schedule} required />
    </FormField>
    <button type='submit'>Save</button>
  </Form>
  <output>{result}</output>
{/if}
```

2030年7月22日10:05を選ぶと、`2030-07-22T10:05:00-07:00` が送信されます。夏時間で存在しない分は修正が必要です。重複する分は早い方を選び、既存値の有効なオフセットは保持します。期限切れの時刻を送信すると表示中の入力へフォーカスが戻ります。Cron の実行方法はホストが決めます。

Node のスキーマ処理では、正規化関数と型を `@h-ai/ui/components/compounds/schedule-input` から取得できます。この入口は Svelte を読み込みません。

<a id="overlays"></a>

### ダイアログとメニュー：オーバーレイ

open 状態でダイアログ、ドロワー、確認操作を制御し、ページのボタンにメニューやヒントを付けます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `<Modal>` | 開閉で open を更新 | `open` は開閉状態。`title` はタイトル。`size` はコンポーネントのサイズ。`radius` は角の丸み。`bodyOverflow` はコンテンツがはみ出した場合の動作。`showClose` は閉じるボタンの表示を切り替え。 | 開閉で open を更新 | `<Modal bind:open={open} title='Details'>Order 42</Modal>` |
| `<Drawer>` | 開閉をバインドしたドロワー | `open` は開閉状態。`position` は表示位置。`title` はタイトル。`size` はコンポーネントのサイズ。`width` は表示幅。`resizable` はドラッグによるドロワーの幅変更を許可。`widthStorageKey` はドロワーの幅を保存するキー。 | 開閉をバインドしたドロワー | `<Drawer bind:open={open} title='Details'>Order 42</Drawer>` |
| `<Confirm>` | 確認で confirm を呼出 | `open` は開閉状態。`title` はタイトル。`message` は利用者に表示する本文。`variant` は外観や状態を選択。`onconfirm` は利用者が確認したときに呼び出す。 `onconfirm` が `false` を返すか、非同期に `false` に解決するとダイアログを開いたままにします。 | 確認で confirm を呼出 | `<Confirm bind:open={open} message='Continue?' onconfirm={confirm} />` |
| `<Popover>` | クリックで開き Escape で閉じる | `open` は開閉状態。`position` は表示位置。`trigger` は起点となる内容または操作。`offset` はオーバーレイと起点の間隔。`ui.portal` はオーバーレイをクリッピングの外に配置。 | クリックで開き Escape で閉じる | `<Popover>{#snippet trigger()}<Button>Open</Button>{/snippet}Details</Popover>` |
| `<Dropdown>` | 操作メニュー | `items` は表示順の項目一覧。`trigger` は起点となる内容または操作。`triggerClass` は起点となるコントロールに CSS クラスを追加。`position` は表示位置。 | 操作メニュー | `<Dropdown items={menuItems}><Button>Actions</Button></Dropdown>` |
| `<Tooltip>` | ホバー・フォーカスで説明 | `content` は表示する本文またはスニペット。`position` は表示位置。`delay` はヒントの表示まで待つ時間。`ui.portal` はオーバーレイをクリッピングの外に配置。 | ホバー・フォーカスで説明 | `<Tooltip content='Save order'><Button>Save</Button></Tooltip>` |

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
| `<Card>` | 見出しと内容 | `title` はタイトル。`bordered` は枠線の表示を切り替え。`shadow` は影。`padding` はコンテンツの内側の余白。 | 見出しと内容 | `<Card title='Order'>Order 42</Card>` |
| `<JsonViewer>` | 展開可能な JSON | `value` は現在値を指定。対応時は双方向バインド可。`defaultExpandedDepth` はJSON ツリーを最初に展開する深さ。`maxScalarLength` は個々のスカラー値のプレビュー長を制限。`showCopy` はコピーのボタンを切り替え。`onCopy` はコピー操作を処理。 | 展開可能な JSON | `<JsonViewer value={{ status: 'pending' }} />` |
| `<DataTable>` | 列に従い rows を表示 | `data` は表示するデータ。`columns` は列ごとの表示方法と並べ替えを定義。`keyField` は各行の一意キーとなるフィールド。`loading` は処理中の状態を表示。`sortKey` は現在の並べ替え列。`sortDir` は現在の並べ替え方向。`onsort` は利用者が指定した並べ替えの変更を受け取る。`cell` はセルの表示内容を変更。`onrowclick` は利用者がクリックした行を受け取る。 [フィールド表](#datatable-options) | 列に従い rows を表示 | `<DataTable data={rows} {columns} keyField='id' />` |
| `<Accordion>` | 指定内容を開閉 | `items` は表示順の項目一覧。 | 指定内容を開閉 | `<Accordion items={accordionItems} />` |
| `<Timeline>` | 指定順のタイムライン | `items` は表示順の項目一覧。 | 指定順のタイムライン | `<Timeline items={timelineItems} />` |
| `<Tabs>` | タブ選択で activeTab を更新 | `items` は表示順の項目一覧。`active` は現在選択中の項目。`type` は入力または表示の種類。`size` はコンポーネントのサイズ。`lazy` は初めて開くまで内容の描画を遅延。`onactivate` はタブが初めて有効になったときに呼び出す。 | タブ選択で activeTab を更新 | `<Tabs items={tabItems} bind:active={activeTab} />` |
| `<Pagination>` | 全3ページ、page を更新 | `page` は1 から始まる現在のページ番号。`total` は該当するレコードの総件数。`pageSize` はページごとの件数。`showTotal` はレコードの総件数を表示。`showJumper` はページ移動用の入力欄を表示。`showSizeChanger` はページサイズの選択欄を表示。`showPageInfo` はページ情報を表示。`showFirstLast` は先頭・最終ページのボタンを表示。 [フィールド表](#pagination-options) | 全3ページ、page を更新 | `<Pagination total={42} pageSize={20} bind:page />` |
| `<Breadcrumb>` | 階層とリンク | `items` は表示順の項目一覧。`separator` は項目間の区切り。 | 階層とリンク | `<Breadcrumb items={[{ label: 'Orders', href: '/orders' }, { label: '42' }]} />` |
| `<Steps>` | 現在ステップを表示 | `items` は表示順の項目一覧。`current` は現在のステップ。`direction` は横並びか縦並びかを指定。`clickable` はステップのクリックを許可。 | 現在ステップを表示 | `<Steps items={stepItems} current={1} />` |
| `<Skeleton>` | 3項目のプレースホルダー | `variant` は外観や状態を選択。`width` は表示幅。`height` は高さ。`count` は描画する数。 | 3項目のプレースホルダー | `<Skeleton count={3} />` |
| `<Empty>` | 空状態 | `title` はタイトル。`description` は補足説明。`icon` は表示するアイコン。 | 空状態 | `<Empty title='No orders' />` |
| `<Result>` | 結果表示 | `status` は表示する結果や状態。`title` はタイトル。`description` は補足説明。 | 結果表示 | `<Result status='success' title='Saved' />` |
| `<PageHeader>` | ページ見出しと操作 | `title` はタイトル。`description` は補足説明。`actions` は利用可能な操作、または操作欄の内容。 | ページ見出しと操作 | `<PageHeader title='Orders' description='Current orders' />` |

<a id="datatable-options"></a>

#### データテーブルの列と並べ替え

キーが `At` または `_at` で終わる数値は、時刻を表すミリ秒値として表示します。その他の数値は受け取った値を表示します。独自の書式には列の `render` を使います。

| フィールド | 型 | 既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `columns[].key` | `keyof T` / `string` | 必須 | 表示と並べ替えに使うフィールド。 |
| `columns[].label` | `string` | 必須 | 列見出しに表示する文言。 |
| `columns[].width` | `string` | 自動 | `8rem` などの CSS 幅を指定。 |
| `columns[].align` | `left` / `center` / `right` | テーブルのスタイルを継承 | セルの水平方向の配置。 |
| `columns[].sortable` | `boolean` | 無効 | 列見出しのクリックで並べ替えを有効にします。`onsort` がなければ現在の `data` だけを並べ替えます。 |
| `columns[].render` | `(item: T) => string` | フィールドの値 | 行全体を受け取りセルの文言を整形します。`cell` スニペットがある場合はそちらで描画します。 |
| `columns[].onclick` | `(item: T) => void` | 未設定 | この列のセルをクリックすると対象行を受け取ります。 |
| `sortKey / sortDir` | `string` / `asc` / `desc` / `null` | 未設定 | `onsort` がある場合に現在の並べ替えを制御します。 |
| `onsort` | `(key, dir) => void` | コンポーネントが現在のデータを並べ替え | 指定するとホストが並べ替え要求を受け取り、新しいデータを渡します。コンポーネントはその順序を保持します。 |

<a id="pagination-options"></a>

#### ページ移動欄のフィールド

| フィールド | 型 | 既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `page / total` | `number` | 呼び出し元が指定 | 現在のページ番号と該当する全件数。ページ番号は 1 から始まります。 |
| `pageSize` | `number` | `10` | ページ数の計算に使います。 |
| `showTotal / showPageInfo / showFirstLast` | `boolean` | `true` | 総件数、ページ情報、先頭・最終ページボタンをそれぞれ表示します。 |
| `showJumper / showSizeChanger` | `boolean` | `false` | ページ移動用の入力欄とページサイズセレクターをそれぞれ表示します。 |
| `pageSizeOptions` | `number[]` | `[10, 20, 50, 100]` | ページサイズセレクターが表示される場合だけ選択肢に使います。 |
| `labels` | `PaginationProps["labels"]` | 現在のコンポーネントの翻訳 | ページ移動欄の文言を上書きします。`total` に `{count}`、`pageSize` に `{size}`、`pageInfo` に `{page}` と `{total}` を使えます。 |

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

表の初期表示は Bex、Ada です。Name を一度クリックすると Ada、Bex の順になります。全 5 ページで、3 ページ目に移動すると `3` が表示されます。

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

移動、操作シート、更新ジェスチャー、ページ分割された一覧をモバイル画面に組み込みます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `<ActionSheet>` | 選択で selectAction を呼出 | `open` は開閉状態。`title` はタイトル。`items` は表示順の項目一覧。`cancelText` はキャンセルボタンのラベル。`onselect` は選択した項目を受け取る。 | 選択で selectAction を呼出 | `<ActionSheet bind:open={open} items={sheetItems} onselect={selectAction} />` |
| `<AppBar>` | タイトルと戻るリンク | `title` はタイトル。`backHref` は戻るリンクの移動先。`onback` は戻る操作を処理。`fixed` はビューポートに固定。`safeArea` は端末のセーフエリアの余白を確保。 | タイトルと戻るリンク | `<AppBar title='Orders' backHref='/orders' />` |
| `<BottomNav>` | ナビゲーション | `items` は表示順の項目一覧。`active` は現在選択中の項目。`centered` はナビゲーションを中央に配置。`maxWidth` は最大幅。 | ナビゲーション | `<BottomNav items={navItems} active='home' />` |
| `<InfiniteScroll>` | 一覧の末尾付近で追加取得 | `hasMore` は次ページの有無で、既定値は `true`。`threshold` は発火距離で、既定値は 100 px。`onloadmore` は次ページを非同期で取得し、`noMoreText` は末尾の文言を指定します。 | ページまたは一覧を末尾付近までスクロールすると `loadMore` を呼び、取得中の重複呼び出しを防ぎます | `<InfiniteScroll {hasMore} onloadmore={loadMore}>注文一覧</InfiniteScroll>` |
| `<PullRefresh>` | プル操作で更新 | `threshold` は操作のしきい値、`onrefresh` は非同期の更新処理です。更新中の状態はコンポーネントが管理します。 | 失敗時はエラーを通知して表示を元に戻し、再試行できます | `<PullRefresh onrefresh={refresh}>注文</PullRefresh>` |
| `<SafeArea>` | セーフエリアの余白 | `top` は上側のセーフエリアの余白を確保。`bottom` は下側のセーフエリアの余白を確保。`left` は左側のセーフエリアの余白を確保。`right` は右側のセーフエリアの余白を確保。 | セーフエリアの余白 | `<SafeArea top bottom>Orders</SafeArea>` |
| `<SwipeCell>` | スワイプで操作を表示 | `leftActions` は左側に表示する操作。`rightActions` は右側に表示する操作。`threshold` は操作を開始するしきい値。`onaction` は選択したスワイプ操作を処理。 | スワイプで操作を表示 | `<SwipeCell rightActions={swipeActions} onaction={selectAction}>Order 42</SwipeCell>` |

#### 利用例：モバイルの移動・更新・読み込みを処理する

移動、操作シート、スワイプ操作の項目はアプリが提供します。`loadMore` は次ページを一覧に追加し、最終ページを取得したら `hasMore` を `false` にします。`refresh` は最初のページを取得し直します。ページ全体と独立した一覧のどちらでも、末尾付近で追加取得が始まります。

<a id="workspace"></a>

### ワークスペースと設定：レイアウト

見出し、操作、内容をワークスペースに配置し、検索条件はページの状態として保持します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `<SettingsModal>` | 設定ダイアログ | `open` は開閉状態。`onclose` は閉じる操作を処理。 | 設定ダイアログ | `<SettingsModal bind:open={open} />` |
| `<SettingsLayout>` | 設定ナビと内容 | `title` はタイトル。`description` は補足説明。`sections` は設定のセクション一覧。`active` は現在選択中の項目。`onselect` は選択した項目を受け取る。 | 設定ナビと内容 | `<SettingsLayout title='Settings' sections={sections} active='profile'>Profile</SettingsLayout>` |
| `<WorkspaceLayout>` | ワークスペース | `title` はタイトル。`leading` は先頭に表示するスニペット。 | 内容が残り高さを使用 | `<WorkspaceLayout title='Orders'>Orders</WorkspaceLayout>` |
| `<FilterBar>` | 折り畳みフィルター | `activeCount` は適用中のフィルター数を表示。`onreset` は条件のリセットを処理。`expanded` はフィルター欄の展開状態。 | 折畳みで入力値を保持 | `<FilterBar activeCount={0}>Filters</FilterBar>` |
| `<TableToolbar>` | 一覧検索バー | `searchValue` は現在の検索文字列。`onsearch` は入力された検索文字列や検索操作を受け取る。`onclearfilters` はフィルターの一括解除を処理。 | 送信時ホストへ通知 | `<TableToolbar bind:searchValue={search} onsearch={query} />` |

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
| `ui.useToastFeedback(message, variant?)` | 状態の変化を共通通知領域に表示 | `message` は翻訳済みの文言または空値を返す関数です。`variant` の既定値は `error`。 | `void; source-owned toast lifecycle` | `ui.useToastFeedback(() => ui.errorMessage(error))` |
| `ui.notifySuccess(message, duration?)` | 成功した操作を通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `toast ID string` | `ui.notifySuccess(m.saved())` |
| `ui.notifyInfo(message, duration?)` | 情報を通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `toast ID string` | `ui.notifyInfo(m.loading())` |
| `ui.notifyWarning(message, duration?)` | 対応が必要な注意を通知 | `message` は翻訳済みの警告です。`duration` は閉じるまでのミリ秒数で、既定は 5000、0 なら表示を保持します。 | `toast ID string` | `ui.notifyWarning(m.warning())` |
| `ui.notifyError(error, fallback?, duration?)` | 安全なエラーメッセージを表示 | `error` から表示可能な文言と追跡 ID を抽出します。`fallback` は表示可能な文言がない場合の翻訳済みテキストです。`duration` の既定は 5000 ms で、0 なら表示を保持します。 | `toast ID string; internal exception text hidden` | `ui.notifyError(error, m.retry())` |
| `ui.errorMessage(error, fallback?)` | 利用者に表示できるメッセージを取得 | `error` は表示できる文言を取り出すエラー、`fallback` は取り出せない場合の翻訳済みテキストです。 | `safe localized string` | `ui.errorMessage(error, m.retry())` |
| `ui.toast.add(props)` | 通知を追加 | `props` は本文、種類、表示時間、位置、閉じ方を指定します。[通知のフィールド](#toast-options)を参照。 | `string item ID` | `ui.toast.add({ message: m.saved(), variant: "success" })` |
| `ui.toast.success(message, duration?)` | 成功を通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `string item ID` | `ui.toast.success(m.result())` |
| `ui.toast.info(message, duration?)` | 情報を通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `string item ID` | `ui.toast.info(m.result())` |
| `ui.toast.warning(message, duration?)` | 注意を通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `string item ID` | `ui.toast.warning(m.result())` |
| `ui.toast.error(message, duration?)` | 安全なエラーを通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `string item ID` | `ui.toast.error(m.result())` |
| `ui.toast.remove(id)` | ID で通知を削除 | `id` は通知の作成時に返る識別子で、操作対象の通知を指定します。 | `void` | `ui.toast.remove(id)` |
| `ui.toast.clear()` | すべての通知を削除 | 引数はありません。 | `void` | `ui.toast.clear()` |
| `ui.message.add(options)` | 通知を追加 | `options` は翻訳済み本文、または本文、種類、表示時間、閉じ方を指定するオブジェクトです。[メッセージのフィールド](#message-options)を参照。 | `string item ID` | `ui.message.add({ message: m.saved(), type: "success" })` |
| `ui.message.success(message, duration?)` | 成功を通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `string item ID` | `ui.message.success(m.result())` |
| `ui.message.info(message, duration?)` | 情報を通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `string item ID` | `ui.message.info(m.result())` |
| `ui.message.warning(message, duration?)` | 注意を通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `string item ID` | `ui.message.warning(m.result())` |
| `ui.message.error(message, duration?)` | 安全なエラーを通知 | `message` は表示する翻訳済み本文です。`duration` は自動で閉じるまでのミリ秒数で、既定は 3000、0 なら表示を保持します。 | `string item ID` | `ui.message.error(m.result())` |
| `ui.message.remove(id)` | ID で通知を削除 | `id` は通知の作成時に返る識別子で、操作対象の通知を指定します。 | `void` | `ui.message.remove(id)` |
| `ui.message.clear()` | すべての通知を削除 | 引数はありません。 | `void` | `ui.message.clear()` |
| `ui.toast.pause(id)` | 自動消去を一時停止 | `id` は通知の作成時に返る識別子で、操作対象の通知を指定します。 | `void` | `ui.toast.pause(id)` |
| `ui.toast.resume(id)` | 自動消去を再開 | `id` は通知の作成時に返る識別子で、操作対象の通知を指定します。 | `void` | `ui.toast.resume(id)` |
| `ui.messageBox.confirm(options)` | 確認またはキャンセルを待つ | `options` は翻訳済み本文、またはタイトル、ボタン、閉じ方を設定するオブジェクトです。[ダイアログのフィールド](#message-box-options)を参照。 | `Promise<boolean>; host handles confirmation/cancellation` | `ui.messageBox.confirm({ message: m.confirm() })` |
| `ui.messageBox.alert(options)` | 確認操作を待つ | `options` は翻訳済み本文、またはタイトル、ボタン、閉じ方を設定するオブジェクトです。[ダイアログのフィールド](#message-box-options)を参照。 | `Promise<boolean>; host handles confirmation/cancellation` | `ui.messageBox.alert({ message: m.confirm() })` |
| `<Alert>` | 継続的な情報表示 | `variant` は外観や状態を選択。`title` はタイトル。`dismissible` は閉じるボタンの表示を切り替え。 | 継続的な情報表示 | `<Alert variant='info' title='Saved' />` |
| `<ToastContainer>` | 通知キュー表示 | ルートレイアウトに一度だけ配置します。`toast` と `message` は共通のキューに通知を追加します。 | 通知キュー表示 | `<ToastContainer />` |
| `<ErrorPage>` | 503 状態と戻るリンク | `status` は表示する結果や状態。`code` は表示するエラーコードや追跡コード。`title` はタイトル。`description` は補足説明。`homeUrl` はホームへのリンク先。`onhome` はホームに戻る操作を処理。`onback` は戻る操作を処理。 | 503 状態と戻るリンク | `<ErrorPage status={503} homeUrl='/' />` |

<a id="toast-options"></a>

##### 通知の設定

| フィールド | 型 | 既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `message` | `string` | 必須 | 通知に表示する翻訳済み本文。 |
| `variant` | `Variant` | `info` | 通知の見た目を指定します。 |
| `duration` | `number` | `3000` ms | 表示時から計測します。0 は自動で閉じません。 |
| `position` | `top-right` / `top-center` / `top-left` / `bottom-right` / `bottom-center` / `bottom-left` | `bottom-right` | 通知の位置を上下・左中右の組み合わせから選びます。キューは共通です。 |
| `dismissible` | `boolean` | `true` | 手動で閉じるボタンの表示を切り替えます。 |
| `traceId` | `string` | 未設定 | 公開可能な追跡 ID があると、利用者が展開して ID を確認できます。 |

<a id="message-options"></a>

##### メッセージのフィールド

| フィールド | 型 | 既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `message` | `string` | 必須 | 表示する翻訳済みメッセージ。文字列を直接渡すと本文になります。 |
| `type` | `info` / `success` / `warning` / `error` | `info` | 共通キュー内のこのメッセージの見た目を選びます。 |
| `duration` | `number` | `3000` ms | 自動で閉じるまでのミリ秒数。0 は自動で閉じません。 |
| `closable` | `boolean` | `true` | 手動で閉じるボタンの表示を切り替えます。 |

<a id="message-box-options"></a>

##### 確認ダイアログのフィールド

| フィールド | 型 | 既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `message` | `string` | 必須 | ダイアログ本文。文字列を直接渡すと本文になり、HTML タグも文字として表示します。 |
| `title` | `string` | 現在の言語のタイトル | タイトルを上書きします。 |
| `type` | `confirm` / `alert` | メソッドで設定 | メソッドで選んだモードを上書きします。キャンセルボタンの表示は `showCancel` で指定します。 |
| `iconType` | `info` / `success` / `warning` / `error` | 確認は `warning`、通知は `info` | 本文の横に表示するアイコンを上書きします。 |
| `confirmText` | `string` | 現在の言語の確認ラベル | 確認ボタンのラベルを上書きします。 |
| `cancelText` | `string` | 現在の言語のキャンセルラベル | キャンセルボタンが表示される場合に使います。 |
| `confirmVariant` | `default` / `primary` / `warning` / `error` | `primary` | 確認ボタンの見た目を指定します。 |
| `showCancel` | `boolean` | 確認は `true`、通知は `false` | キャンセルボタンの表示を切り替えます。 |
| `closeOnClickModal` | `boolean` | `true` | 背景のクリックで閉じる操作を開始するか指定します。 |
| `showClose` | `boolean` | `true` | 右上の閉じるボタンを表示するか指定します。 |
| `beforeClose` | `MessageBoxOptions["beforeClose"]` | 未設定 | 確認・キャンセル・閉じる操作と、読み込み状態を変更できるインスタンスを受け取ります。`false` を返すか非同期に解決すると表示を継続します。 |

#### 利用例：操作結果を表示して通知を管理する

操作結果、エラー、確認を共通の表示領域に渡します。返された ID で個別の通知を削除できます。 詳細は[中国語の手順](ui.md#notifications)を参照してください。

```svelte
<script>
  import { ToastContainer, ui } from '@h-ai/ui'

  function notify() {
    // Queue the supplied message as a success toast.
    ui.toast.success('操作成功')
    // Queue the supplied message using the error style.
    ui.toast.error('操作失败')
    // Queue the supplied caution message as a warning.
    ui.toast.warning('请注意')
    // Queue the info message with a 5,000 ms lifetime.
    ui.toast.info('提示信息', 5000) // 自定义持续时间
  }
</script>

<button onclick={notify}>通知</button>
<!-- Mount the view that renders the four notifications queued by notify. -->
<ToastContainer />
```

#### 利用例：警告を閉じるまで表示する

```ts
import { ui } from '@h-ai/ui/toast'

ui.toast.add({ message: '未確認の項目が 2 件あります', variant: 'warning', duration: 0, position: 'top-right' })
```

右上に警告が表示され、手動で閉じるまで残ります。

#### 利用例：保存後に短い通知を表示する

```ts
import { ui } from '@h-ai/ui'

const id = ui.message.add({ message: '2 件を保存しました', type: 'success', duration: 2000 })
```

通知 ID が返り、成功メッセージが 2 秒で消えます。

#### 利用例：利用者に確認する

例の実行前に、ルートレイアウトに `MessageBoxContainer` を配置します。

```ts
import { ui } from '@h-ai/ui'

const accepted = await ui.messageBox.confirm({
  message: '下書き 2 件を送信しますか？',
  closeOnClickModal: false,
})
```

背景をクリックしても開いたままです。確認を押すと `accepted` は `true`、キャンセルでは `false` になります。

<a id="auth"></a>

### ログインと権限 UI：認証部品

フォームは資格情報を集め、ホストの認証処理を呼び出します。公開ポリシーで選択肢を表示し、サーバーで認証します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `ui.matchPermission(required, userPermissions)` | 表示用の権限を照合 | `required` は画面操作に必要な権限、`userPermissions` は現在の利用者に付与された権限キーの一覧です。 | `boolean; not server authorization` | `ui.matchPermission("orders:read", ["orders:*"])` |
| `ui.setPermissionContext(getPermissions)` | 子部品に現在の権限を提供 | `getPermissions` は現在の権限キーを返す関数です。コンポーネントの初期化時に設定します。 | `void` | `ui.setPermissionContext(() => user.permissions)` |
| `ui.usePermission()` | 現在の権限コンテキストを取得 | `none; component initialization only` | `PermissionContext with hasPerm/hasAnyPerm/hasAllPerms` | `ui.usePermission()` |
| `ui.createSensitiveActions(options)` | 指定した重要操作の再認証を要求 | `options` には追加認証を行う `reauthenticate` と、公開ポリシーを読み取る任意の `publicConfig` を渡します。 | `SensitiveActions: configure/authorize/submit/cancel` | `ui.createSensitiveActions(actions)` |
| `ui.createSessionRecovery()` | 同じ利用者の再ログインを管理 | `none; configure public config and current user afterward` | `SessionRecovery controller` | `ui.createSessionRecovery()` |
| `<AuthPanel>` | 認証方針に従い actions を呼出 | `config` は認証方式や入口の公開ポリシー。`actions` はホスト側でログイン・登録・回復などの認証リクエストを実装。`loginHeader` はログインフォームの上部を変更。`registerHeader` は登録フォームの上部を変更。`loginFields` はログインフォームに追加の入力欄を挿入。`loginFooter` はログインフォームの下部を変更。`registerFields` は登録フォームに追加の入力欄を挿入。`registerFooter` は登録フォームの下部を変更。 | 認証方針に従い actions を呼出 | `<AuthPanel {config} {actions} />` |
| `<AuthShell>` | 認証レイアウト | `variant` は外観や状態を選択。`title` はタイトル。`subtitle` はサブタイトル。`brandTitle` はブランドの見出し。`brandText` はブランドの説明。`illustration` はイラストの内容。`description` は補足説明。`highlights` は強調表示する情報。 | 認証レイアウト | `<AuthShell title='Sign in'>Account form</AuthShell>` |
| `<LoginForm>` | ログイン項目を login へ | `loading` は処理中の状態を表示。`errors` はサーバーの検証エラーをフィールド別に指定。`showForgotPassword` はパスワードを忘れた場合のリンクを切り替え。`onsubmit` はフォームの送信時に呼び出す。 | ログイン項目を login へ | `<LoginForm onsubmit={login} />` |
| `<RegisterForm>` | 登録項目を register へ | `loading` は処理中の状態を表示。`errors` はサーバーの検証エラーをフィールド別に指定。`fields` は表示・入力するフィールドを指定。`onsubmit` はフォームの送信時に呼び出す。 | 登録項目を register へ | `<RegisterForm onsubmit={register} />` |
| `<ForgotPasswordForm>` | パスワード回復要求 | `mode` はコンポーネントのモード。`loading` は処理中の状態を表示。`errors` はサーバーの検証エラーをフィールド別に指定。`onsubmit` はフォームの送信時に呼び出す。 | パスワード回復要求 | `<ForgotPasswordForm onsubmit={sendReset} />` |
| `<ResetPasswordForm>` | パスワード再設定要求 | `loading` は処理中の状態を表示。`errors` はサーバーの検証エラーをフィールド別に指定。`showCode` は確認コード入力欄を切り替え。`onsubmit` はフォームの送信時に呼び出す。 | パスワード再設定要求 | `<ResetPasswordForm onsubmit={resetPassword} />` |
| `<ChangePasswordForm>` | パスワード変更要求 | `loading` は処理中の状態を表示。`errors` はサーバーの検証エラーをフィールド別に指定。`requireOldPassword` は現在のパスワードが必要か指定。`onsubmit` はフォームの送信時に呼び出す。 | パスワード変更要求 | `<ChangePasswordForm onsubmit={changePassword} />` |
| `<PasswordInput>` | password と強度を更新 | `value` は現在値を指定。対応時は双方向バインド可。`showToggle` はパスワード表示切り替え用ボタンを表示。`showStrength` はパスワード強度の表示を切り替え。`minLength` はパスワード検証に使う最小文字数。 | password と強度を更新 | `<PasswordInput bind:value={password} showStrength />` |
| `<ReauthenticationDialog>` | 再認証の送信・取消 | `open` は開閉状態。`loading` は処理中の状態を表示。`error` はエラーメッセージやエラー状態。`onsubmit` はフォームの送信時に呼び出す。`onclose` は閉じる操作を処理。 | 再認証の送信・取消 | `<ReauthenticationDialog open={confirmation.open} onsubmit={confirmation.submit} onclose={confirmation.cancel} />` |
| `<PermGuard>` | 権限に応じた表示、サーバー認可は別途 | `permissions` は内容の表示に必要な権限キー。`mode` はすべての権限が必要か、いずれかでよいかを選択。`fallback` は代替表示の内容。 | 権限に応じた表示、サーバー認可は別途 | `<PermGuard permissions='orders:read'>Orders</PermGuard>` |
| `<UserProfile>` | true のときだけ編集完了 | `user` は表示または編集する利用者情報。`editable` は編集を許可。`fields` は表示・入力するフィールドを指定。`avatarAccept` は選択できるアバターファイルの種類。`avatarHint` はアバター入力欄の補足説明。`onsubmit` はフォームの送信時に呼び出す。 | true のときだけ編集完了 | `<UserProfile {user} editable onsubmit={saveProfile} />` |
| `<SessionRecoveryDialog>` | 元のユーザーの再ログイン・取消 | `recovery` はセッション復旧コントローラーと状態。`actions` は利用可能な操作、または操作欄の内容。 | 元のユーザーの再ログイン・取消 | `<SessionRecoveryDialog {recovery} {actions} />` |
| `<SensitiveOperationsForm>` | 機密操作ルールを送信 | `operations` は設定する機密操作の識別子。`onsubmit` はフォームの送信時に呼び出す。`ondone` は操作の完了を処理。 | 機密操作ルールを送信 | `<SensitiveOperationsForm {operations} onsubmit={saveOperations} />` |

#### 利用例：公開ポリシーと認証処理をページに接続する

フォームは資格情報を集め、ホストの認証処理を呼び出します。公開ポリシーで選択肢を表示し、サーバーで認証します。 詳細は[中国語の手順](ui.md#auth)を参照してください。

```svelte
<!-- actions 为 Kit/API client 的标准认证动作；policy 为 IAM 公开再认证策略。 -->
<script lang='ts'>
  import { type SensitiveActionsOptions, ReauthenticationDialog, ui } from '@h-ai/ui'

  const { actions, policy }: { actions: SensitiveActionsOptions, policy: { enabled: boolean, operations: string[] } } = $props()
  // Create a reauthentication controller using the application's auth actions. It tracks the pending challenge and result.
  const confirmation = ui.createSensitiveActions(actions)
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
| `<FileUpload>` | 選択ファイルを upload へ | `accept` はファイル選択で許可する種類。`maxSize` はファイル 1 件のサイズ上限。`maxFiles` は選べるファイルの件数上限。`multiple` は複数選択を許可。`uploadHandler` はホスト側で実際にアップロードし、表示更新用の結果を返す。 | 選択ファイルを upload へ | `<FileUpload accept='.txt' uploadHandler={upload} />` |
| `<ImageUpload>` | 成功後画像 URL を更新 | `value` は現在値を指定。対応時は双方向バインド可。`accept` はファイル選択で許可する種類。`maxSize` はファイル 1 件のサイズ上限。`aspectRatio` はプレビューや切り抜き領域の縦横比。`uploadHandler` はホスト側で実際にアップロードし、表示更新用の結果を返す。 | 成功後画像 URL を更新 | `<ImageUpload bind:value={imageUrl} uploadHandler={uploadImage} />` |
| `<AvatarUpload>` | 成功後アバター URL を更新 | `value` は現在値を指定。対応時は双方向バインド可。`size` はコンポーネントのサイズ。`maxSize` はファイル 1 件のサイズ上限。`fallback` は代替表示の内容。`uploadHandler` はホスト側で実際にアップロードし、表示更新用の結果を返す。 | 成功後アバター URL を更新 | `<AvatarUpload bind:value={imageUrl} uploadHandler={uploadImage} />` |
| `<FileList>` | 指定ファイルを表示 | `files` は表示するファイル一覧。`layout` はファイルの並べ方。`showDelete` は削除ボタンを表示。`showDownload` はダウンロードボタンを表示。 `onpreview(file)` で組み込みプレビューを差し替えられます。 | 指定ファイルを表示 | `<FileList files={files} />` |

#### 利用例：ファイルを選んでアップロード処理に渡す

ファイル選択後に uploadHandler を呼び、画像部品は成功時に URL を更新します。保存先はアプリが管理します。 詳細は[中国語の手順](ui.md#uploads)を参照してください。

転送に失敗したファイルは再試行できます。サイズや種類の検証に失敗したファイルは再試行できません。一覧の消去、ファイルの削除、コンポーネントのアンマウントで該当する待機中の項目を取り除き、処理中のアップロードに取消シグナルを送ります。画像とアバターは、取り消されていない最新リクエストの結果を反映します。

<a id="file-preview"></a>

#### 利用例：閲覧権限のある PDF をプレビューする

`FileList` に `type: 'application/pdf'` とファイル URL を含む認可済みのレコードを渡します。組み込みプレビューは同一オリジンの HTTP(S)、CORS で読み取れる URL、同一オリジンの Blob URL に対応します。応答には `application/pdf` と有効な PDF ヘッダーが必要です。ファイルの上限は 20 MiB です。ファイルを直接返す URL を指定します。ページを順にキャンバスに描画し、閉じると取得処理と描画リソースを解放します。取得や描画に失敗した場合はプレビューを再試行できます。アプリ独自のプレビューで表示する場合は `onpreview(file)` を使います。

<a id="crypto"></a>

### 暗号化結果の表示：暗号部品

実際の計算結果を表示し、部品は鍵を保持せず署名検証もしません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `<EncryptedInput>` | 成功時だけ現在入力の暗号文を更新 | `value` は現在値を指定。対応時は双方向バインド可。`encryptedValue` は表示する暗号化結果。`algorithm` は画面に表示するアルゴリズム名。`showEncrypted` は暗号化した値の表示を切り替え。 | 成功時だけ現在入力の暗号文を更新 | `<EncryptedInput bind:value={plain} bind:encryptedValue={cipher} onencrypt={encrypt} />` |
| `<HashDisplay>` | 既存のダイジェストを表示 | `value` は現在値を指定。対応時は双方向バインド可。`algorithm` は画面に表示するアルゴリズム名。`copyable` はコピー操作を有効化。`truncate` は長い値の省略表示。 | 既存のダイジェストを表示 | `<HashDisplay value={digest} algorithm='SM3' />` |
| `<SignatureDisplay>` | 署名と指定した検証状態を表示 | `signature` は表示する署名。`publicKey` は表示する公開鍵。`algorithm` は画面に表示するアルゴリズム名。`verified` はホストから渡された検証結果を表示。 | 署名と指定した検証状態を表示 | `<SignatureDisplay {signature} {publicKey} verified />` |

#### 利用例：実際の暗号文・要約・検証結果を表示する

アプリが計算した暗号文、要約、検証結果を表示します。EncryptedInput の暗号化処理は onencrypt で渡します。 詳細は[中国語の手順](ui.md#crypto)を参照してください。

<a id="documents"></a>

### 文書の閲覧・編集・保存：AI コンテンツ

ブラウザーでは長い Markdown の解析と強調表示を Web Worker に渡し、ストリーミング更新をまとめます。複数ページ PDF は DOM を撮影し、OffscreenCanvas を利用できる場合は Worker が改ページ位置を調べて各ページの PNG を作ります。

テキスト、Markdown、表、文書データを表示し、必要に応じて編集、ダウンロード、引用操作に接続します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `ui.parseMarkdown(content, options?)` | Markdown を表示用の安全な HTML に変換 | `content: string` は Markdown 原文です。省略可能な `options: MarkdownParseOptions` は[解析オプション](#markdown-parse-options)を参照。 | `HTML string; raw HTML escaped or allowlisted` | `ui.parseMarkdown("# Hello", { allowHtmlTags: false })` |
| `ui.renderMarkdownDocument(content, options?)` | 本文・見出し・コード情報を解析 | `content: string` は Markdown 原文です。省略可能な `options: MarkdownDocumentParseOptions` は[解析オプション](#markdown-parse-options)を参照。 | `MarkdownRenderResult with outline/codeBlocks/blocks` | `ui.renderMarkdownDocument("# Report", { allowHtmlTags: false })` |
| `ui.isLanguageSupported(lang)` | 構文強調が対応する言語か確認 | `lang` は `typescript` など、確認する言語 ID です。 | `boolean` | `ui.isLanguageSupported("typescript")` |
| `ui.highlightCode(text, lang)` | ソースをエスケープして構文を強調 | `text` はコードの原文、`lang` は強調表示に使う言語規則です。 | `escaped/highlighted HTML string` | `ui.highlightCode("const total = 1", "typescript")` |
| `ui.resolveDocumentMarkdownContent(value, kind?, language?)` | 文書内容を Markdown に整形 | `value` は元の本文です。`kind` の既定は `markdown` で、`code` のときにフェンスで囲み、`language` を言語ラベルに使います。 | `Markdown string with a safe fence length` | `ui.resolveDocumentMarkdownContent("const x = 1", "code", "ts")` |
| `ui.resolveDocumentDownloadActions(actions?)` | 文書のダウンロード選択肢を解決 | `actions` はダウンロードメニューに表示する項目です。省略か空配列の場合は Word、PDF、Markdown を表示します。[ダウンロードのフィールド](#document-download-options)を参照。 | `AiDocumentResolvedDownloadAction[]` | `ui.resolveDocumentDownloadActions([{ id: "markdown", label: "Markdown" }])` |
| `ui.downloadAiDocument(request)` | 選択した形式で文書をダウンロード | `request` はダウンロード操作、本文、ファイル名、元データの形式を指定します。[ダウンロードのフィールド](#document-download-options)を参照。 | `Promise<void>; browser failure rejects, SSR does nothing` | `ui.downloadAiDocument({ actionId: "markdown", content: "# Report", filename: "report.md" })` |
| `<MarkdownRenderer>` | 安全な Markdown 表示 | `content` は表示する本文またはスニペット。`fontSize` は本文の文字サイズ。`allowHtmlTags` は保持を許可する HTML タグ。`showCopyButton` はコピー操作用のボタンを切り替え。`enableHighlight` は構文強調表示を切り替え。 | 安全な Markdown 表示 | `<MarkdownRenderer content='# Hello' allowHtmlTags={false} />` |
| `<AiDocumentDownloadMenu>` | 選択でダウンロードを呼出 | `actions` は利用可能な操作、または操作欄の内容。`ondownload` は選択したダウンロードを処理。[ダウンロードのフィールド](#document-download-options)。 | 選択でダウンロードを呼出 | `<AiDocumentDownloadMenu {actions} ondownload={download} />` |
| `<AiDocumentEditor>` | 編集で markdown を更新 | `content` は表示する本文またはスニペット。`fontSize` は本文の文字サイズ。`allowHtmlTags` は保持を許可する HTML タグ。`showRunButton` は実行ボタンを切り替え。`showCodePreviewToggle` はコードとプレビューの切り替えボタンを表示。`allowUnsafeCodePreview` は信頼できる内容のコードプレビューを明示的に許可。 `remoteImages` で外部画像への通信を制御し、`onrewrite` で検証済みの原文範囲を受け取れます。 | 編集で markdown を更新 | `<AiDocumentEditor bind:content={markdown} showToolbar />` |
| `<AiTableEditor>` | 表のセルを表示・編集 | `tableData` に `table_columns` と `table_rows` を渡すと `content` より優先されます。`editable` は編集を許可し、`ontablechange` は `nextData` を含む変更、`ondownloadtable` は CSV と推奨ファイル名を受け取ります。 | セルを表示し、編集やダウンロードをホストに通知 | `<AiTableEditor {tableData} editable ontablechange={updateTable} />` |

<a id="document-download-options"></a>

#### ダウンロードメニューと出力のフィールド

| フィールド | 型 | 既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `actions[].id` | `string` | 必須 | 組み込みの `word`、`pdf`、`markdown`、またはホスト独自の操作を選びます。 |
| `actions[].label` | `string` | 組み込み名または ID | メニューの表示名を上書きします。 |
| `actions[].badgeLabel` | `string` | 組み込み略称または ID 先頭 4 文字を大文字化 | 短いバッジラベルを上書きします。 |
| `request.actionId` | `string` | 必須 | 直接ダウンロードに使う組み込みエクスポーターを選びます。 |
| `request.content` | `string` | 必須 | ファイルに書き込む Markdown、文書本文、またはコードです。 |
| `request.title` | `string` | 未設定 | ファイル名を省略した場合の名前や、出力メタデータに使います。 |
| `request.filename` | `string` | 未設定 | タイトルから生成されるファイル名を上書きします。 |
| `request.sourceKind` | `MarkdownSourceKind` | `markdown` | 元データがコードなら `code` を指定します。出力前に Markdown のフェンスで囲みます。 |
| `request.codeLanguage` | `string` | 未設定 | `sourceKind: "code"` の場合にフェンスの言語ラベルになります。 |

```ts
import { ui } from '@h-ai/ui'

const menu = ui.resolveDocumentDownloadActions([{ id: 'raw', label: 'Source' }])
// [{ id: 'raw', label: 'Source', badgeLabel: 'RAW' }]

const markdown = ui.resolveDocumentMarkdownContent('const count = 42', 'code', 'typescript')
// '```typescript\nconst count = 42\n```'
```

独自の操作は `RAW` バッジ付きの 1 項目になり、コードは出力前に言語付きの Markdown コードブロックになります。

<a id="markdown-parse-options"></a>

##### Markdown の解析オプション

どちらのパーサーも `options` を省略でき、必要な項目だけ変更できます。

| 項目 | 既定値 | 動作 |
| --- | --- | --- |
| `enableHighlight` | `true` | コードブロックを強調表示します。 |
| `showCopyButton` | `true` | コードブロックにコピーボタンを表示します。 |
| `breaks` | `true` | 通常の改行に `<br>` を使います。`false` で Markdown の段落規則に従います。 |
| `allowHtmlTags` | `false` | 有効時も許可リスト内の生 HTML のみを表示します。 |
| `showRunButton` | `false` | 文書モードのみ。実行用の入口を表示します。実行はホストが許可します。 |
| `showCodePreviewToggle` | `false` | 文書モードのみ。コードとプレビューの切り替えを表示します。 |
| `codeViewCodeLabel / codeViewPreviewLabel` | `Code / Preview` | 文書モードのみ。切り替えが有効な場合の 2 つのラベルです。 |
| `codePreviewHint` | `''` | 文書モードのみ。言語ラベル横の任意のテキストです。 |

#### 利用例：文書を解析してプレビューする

テキスト、Markdown、表、文書データを表示し、必要に応じて編集、ダウンロード、引用操作に接続します。 詳細は[中国語の手順](ui.md#documents)を参照してください。

```ts
import { ui } from '@h-ai/ui'
// Parse the supplied heading as HTML. Raw HTML input is escaped with this option.
const html = ui.parseMarkdown('# Hello', { allowHtmlTags: false }) // heading HTML
// Parse the heading into a Markdown document result with an outline and blocks.
const document = ui.renderMarkdownDocument('# Hello') // outline and parsed blocks
// Check support for the TypeScript grammar. It returns true here.
ui.isLanguageSupported('typescript') // true
// Highlight the supplied TypeScript statement and return its safe HTML.
ui.highlightCode('const total = 1', 'typescript') // highlighted HTML
// Convert the supplied code to a TypeScript fenced Markdown block.
ui.resolveDocumentMarkdownContent('const total = 1', 'code', 'typescript') // fenced Markdown
// Resolve the supplied Markdown option into the enabled download actions.
const actions = ui.resolveDocumentDownloadActions([{ id: 'markdown', label: 'Markdown' }])
// Export # Hello through the Markdown browser download action as hello.md. Browser or export failures reject.
await ui.downloadAiDocument({ actionId: 'markdown', content: '# Hello', filename: 'hello.md' }) // browser download
```

<a id="edit-sales-table"></a>

#### 利用例：販売数を編集する

販売数の列と1件のレコードを渡します。最初の行の販売数を42から43に変更すると、`ontablechange` に更新後の表全体が渡されます。ホストはそのデータを保存サービスに渡せます。

```svelte
<script lang='ts'>
  import { AiTableEditor, type AiTableData, type AiTableEditorChangePayload } from '@h-ai/ui'

  let tableData = $state<AiTableData>({
    table_columns: [{ key: 'sales', label: '販売数', type: 'number' }],
    table_rows: [{ row_id: 'row-1', sales: 42 }],
  })

  function updateTable({ nextData }: AiTableEditorChangePayload) {
    tableData = nextData
  }
</script>

<AiTableEditor {tableData} editable ontablechange={updateTable} />
```

<a id="private-document-media"></a>

#### 利用例：画像を制限して Markdown 原文の範囲を取得する

非公開文書で `remoteImages={false}` を指定すると本文のレイアウトを保ち、通信が必要な画像を代替テキストで表示します。インラインデータ画像は表示でき、HTML 実行プレビューと Mermaid はソース表示になります。既定値ではネットワーク画像を許可します。

```svelte
<!-- 非公開 Markdown のレイアウトを保ち、通信が必要な画像は代替テキストに置き換えます。 -->
<AiDocumentEditor content={
;(markdown} remoteImages={false} onrewrite={handleRewrite} />
```

書き換えコールバックの `sourceRange` は現在の `content` で確認できる選択範囲です。UTF-16 の開始位置と終了位置、および元テキストを含みます。`**同じ** / **同じ**` の二つ目の語は `[11, 13)` です。アプリは書き換え前に版と元の文字列を再確認します。

<a id="tool-workspaces"></a>

### ツール実行と成果物編集：ワークスペース

ホストがツール一覧、送信処理、アクセス可能な成果物を渡し、ワークスペースが進行状況と結果を表示します。

保存の応答を待つ間にも、取得済みの書き換え案を適用できます。応答で保存済みバージョンが進み、その間の変更は未保存の下書きとして残ります。取消リクエストの処理中は手動の再照会を一時停止します。処理後も実行中なら、再照会や再度の取消ができます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `<ArtifactWorkspace>` | 成果物編集 | `artifacts` はワークスペースの成果物一覧。`onread` は選択した成果物の内容を読み込む。`onsave` は編集した内容を保存。 | 保存で版更新、競合時草稿保持 | `<ArtifactWorkspace artifacts={[report]} onread={readArtifact} onsave={saveArtifact} />` |
| `<ToolWorkspace>` | ツール実行 | `tools` はワークスペースで実行できるツール。`onrun` はツール実行を依頼。`onstatus` は実行受付 ID で現在の状態と進捗を取得。`oncancel` は実行中タスクの取り消しを要求。 | 2 と3 の入力で total=5 | `<ToolWorkspace tools={catalog} onrun={run} />` |

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
| `<Chart>` | グラフ | `type` は入力または表示の種類。`preset` はグラフの既定設定。明示プロパティを優先。`data` は描画するレコード。`x` は横軸の値の取得方法。`y` は縦軸の値の取得方法。 | グループ棒グラフ | `<Chart preset='grouped-bar' {data} x='month' y={['revenue', 'cost']} />` |
| `<DashboardGrid>` | ダッシュボードグリッド | `columns` は列数または列定義。`label` はグリッドのアクセシブルな名前。`children` は本体のコンテンツ。 | 2列、狭い画面で縮小 | `<DashboardGrid columns={2} label='Metrics'><MetricCard title='Orders' value={42} /></DashboardGrid>` |
| `<MetricCard>` | 指標カード | `title` はタイトル。`value` はホスト側で計算した指標値。`unit` は指標の単位を追加。`trend` は変化量をパーセントで指定。 | 42 と+12.8% を表示 | `<MetricCard title='Orders' value={42} trend={12.8} />` |
| `<ReportCard>` | レポートカード | `title` はタイトル。`loading` は処理中の状態を表示。`children` は本体のコンテンツ。 | 見出しと内容 | `<ReportCard title='Revenue'>Chart content</ReportCard>` |

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
| `ui.defineCrud(resource)` | フィールドと CRUD 処理をリソースとして定義 | `resource` にはリソース名、フィールド、画面での検索・書き込み用コールバックを定義します。 [フィールド表](#crud-resource-options) | `CrudDef for CrudPage` | `ui.defineCrud(resourceDefinition)` |
| `ui.createCrudController(crud, options?)` | 記録の読み込み・移動・検索状態を管理 | `crud` は `ui.defineCrud` の戻り値です。`options` は初回読み込み、既存データの保持、URL の同期を設定します。[コントローラーのフィールド](#crud-controller-options)を参照。 | `controller data/nav/loading/loaded/error/load/reload` | `ui.createCrudController(crud, { autoLoad: false })` |
| `ui.mapPaginated(result, map)` | ページ情報を保って各要素を変換 | `result` は元のページです。`map` は各項目とその位置を受け取り、`items` を変換します。 | `PaginatedResult<R> retaining total/page/pageSize` | `ui.mapPaginated(page, item => ({ ...item, selected: false }))` |
| `ui.createBrowserNavAdapter()` | CRUD の状態をブラウザー移動に接続 | 引数はありません。 | `NavAdapter` | `ui.createBrowserNavAdapter()` |
| `<CrudPage>` | 一覧・フォームとリソース操作 | `crud` は`ui.defineCrud` が返したリソース定義。`data` は表示するデータ。`permissions` は画面上の操作可否を決める権限情報。`form` は新規・編集フォームの容器やサイズ。`pagination` はページ移動欄の操作と表示情報。`density` は一覧の行や操作欄の密度。`detailColumns` はクリックで詳細を開ける列を限定。`showHeader` はページ見出しの表示を切り替え。`toolbarLeading` はツールバーの先頭に置く内容。`toolbarActions` はツールバーに追加する操作。`card` はカード形式の一覧表示を設定。`tableCell` は行と列キーを受け取りセルを描画。`onrowclick` は利用者がクリックした行を受け取る。`sortableColumns` は並べ替え可能な列を指定。`nav` は一覧のナビゲーションアダプター。`loading` は処理中の状態を表示。`loaded` は初回読み込み前と読み込み済みを区別。`error` はエラーメッセージやエラー状態。`onRetry` は読み込み失敗後の再試行を処理。`keepPreviousData` は更新中に既存データを表示し続けるか指定。 | 一覧・フォームとリソース操作 | `<CrudPage {crud} data={controller.data} nav={controller.nav} />` |
| `<CrudFilterBar>` | 検索条件を送信 | `filterFields` は絞り込み対象のフィールド。`searchValue` は現在の検索文字列。`onsearch` は入力された検索文字列や検索操作を受け取る。`onfilterchange` は絞り込み条件の変更を受け取る。`onreset` は条件のリセットを処理。 | 検索条件を送信 | `<CrudFilterBar filterFields={filters} onsearch={search} />` |
| `<CrudDetailPanel>` | 指定レコードの詳細 | `open` は開閉状態。`item` は詳細を表示するレコード。`fields` は表示・入力するフィールドを指定。`variant` は外観や状態を選択。`drawerWidth` はドロワーモードでの幅。`modalSize` はダイアログモードでのサイズ。 | 指定レコードの詳細 | `<CrudDetailPanel bind:open={open} item={selected} fields={fields} />` |
| `<CrudEditPanel>` | 宣言した書込項目を送信 | `open` は開閉状態。`fields` は表示・入力するフィールドを指定。`variant` は外観や状態を選択。`drawerWidth` はドロワーモードでの幅。`modalSize` はダイアログモードでのサイズ。`onsubmit` はフォームの送信時に呼び出す。 | 宣言した書込項目を送信 | `<CrudEditPanel bind:open={open} fields={fields} onsubmit={save} />` |
| `<CrudDeleteConfirm>` | 確認で remove を呼出 | `open` は開閉状態。`loading` は処理中の状態を表示。`onconfirm` は利用者が確認したときに呼び出す。 `onconfirm` が `false` を返す場合、ダイアログは開いたままです。 | 確認で remove を呼出 | `<CrudDeleteConfirm bind:open={open} onconfirm={remove} />` |

<a id="crud-resource-options"></a>

#### リソース定義のフィールド

| フィールド | 型 | 既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `name / label` | `string` / `CrudText` | 必須 | 業務リソースの識別名と画面タイトル。 |
| `keyField` | `string` | `id` | 一覧の行、詳細、書き込み対象を識別するフィールド。 |
| `fields` | `CrudFieldDef[]` | 必須 | 表示・絞り込み・編集用のフィールドを定義します。`id` はレコードのキー、`label` は表示名、`type` は入力の種類です。 |
| `defaultPageSize` | `number` | `10` | 初回検索のページサイズ。 |
| `searchable` | `boolean` | `true` | テキスト検索欄の表示を切り替えます。 |
| `searchPlaceholder` | `CrudText` | 現在のコンポーネントの翻訳 | 検索欄を表示する場合のプレースホルダーを上書きします。 |
| `api.list` | `CrudApi["list"]` | 必須 | 検索条件と任意のキャンセルシグナルを受け取り、`items`、`total`、`page`、`pageSize` を返します。 |
| `api.get / create / update / remove` | `CrudApi` | 未設定 | 単件取得、作成、更新、削除が必要な場合は対応するコールバックを指定します。 |

下のコントローラー例では `name: "jobs"` と、ジョブ `j1` だけを返す `api.list` を指定します。

<a id="crud-controller-options"></a>

#### 一覧コントローラーのオプション

| フィールド | 型 | 既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `autoLoad` | `boolean` | `true` | コントローラーの作成直後に検索します。遅延タブでは `false` を指定し、開いたときに `load()` を呼びます。 |
| `keepPreviousData` | `boolean` | `true` | 再取得中や失敗時に一覧を保持します。`false` なら再取得の開始時に空にします。 |
| `syncUrl` | `boolean` | `true` | 検索パラメーターをブラウザーのアドレスバーと同期し、パスとフラグメントは保持します。 |

```ts
import { ui } from '@h-ai/ui'

const crud = ui.defineCrud<{ id: string }>({
  name: 'jobs',
  label: 'Jobs',
  fields: [{ id: 'id', label: 'ID', type: 'text' }],
  api: {
    list: async () => ({ items: [{ id: 'j1' }], total: 1, page: 1, pageSize: 20 }),
  },
})
const controller = ui.createCrudController(crud, { autoLoad: false, syncUrl: false })
await controller.load()
```

作成時に検索しません。`load()` 後の `controller.data.items` は `[{ id: "j1" }]` で、ブラウザーの URL は変わりません。

#### 利用例：リソース定義から一覧・編集画面を作る

CrudPage と createCrudController の検索です。コンポーネントが状態を表示し、controller がアプリのデータサービスを呼びます。

クライアントコントローラーは日付範囲の両端を検索に渡し、取得後に絞り込みと並べ替えを画面に反映します。リソースのページサイズを省略すると、最初の取得は10件です。20件を選択すると、取得とページ表示の両方に20件を使います。削除前チェックはその確認操作に対して行われ、待機中に取り消すと結果を破棄します。削除リクエストが失敗した場合、確認ダイアログから再試行できます。

![CRUD 一覧：検索・前回データ・最新応答](../images/function-ui-crud-loading.ja.svg)

条件の編集中は検索せず、検索／Enter で確定します。ページ・並べ替えは確定済み条件を使い、最新の応答だけを反映します。初回失敗は再試行を表示し、更新失敗では既存データを保持します。空表示は loaded かつ total=0 の時だけです。

リソース定義で検索、作成、更新、削除を接続し、コントローラーで読み込み、移動、編集状態を管理します。 詳細は[中国語の手順](ui.md#crud)を参照してください。

```svelte
<script lang='ts'>
  import { CrudPage, ui } from '@h-ai/ui'

  // Define the users CRUD resource and its name field. The example list callback supplies one Ada record.
  const crud = ui.defineCrud({
    name: 'users', label: 'Users',
    fields: [{ id: 'name', label: 'Name', type: 'text' }],
    api: {
      list: async () => ({ items: [{ id: 'u1', name: 'Ada' }], total: 1, page: 1, pageSize: 10 }),
    },
  })
  // Create the controller for that resource without synchronizing filters to the URL. It exposes data, loading and error state, and reload.
  const controller = ui.createCrudController(crud, { syncUrl: false })
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
| `<CodeWorkspace>` | 読み取り専用のソースワークスペース | `source` はファイルツリー、必要に応じた読み込み、オプションのページ分割検索を提供します。 | README.md で # Hello を表示 | `<CodeWorkspace {source} />` |

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

### ガイドとヘルプ：`ui.createGuide`

手順、対象、記事をアプリで定義し、コントローラーで開始、次の手順、終了、完了記録を管理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `ui.createGuide(options)` | 導覧とヘルプのコントローラーを作成 | 必須の `options: GuideOptions` でツアー、ナビゲーション、進捗保存を設定します。[呼び出し引数](#call-options)を参照。 | `GuideController; no init/close` | `ui.createGuide({ tours: [], persistence: "memory" })` |
| `ui.resolveGuideText(text?)` | 固定値または遅延翻訳の案内文を取得 | 任意の `text` は表示する文字列、または現在の言語の翻訳を取得する関数です。 | `string` | `ui.resolveGuideText(() => m.help())` |
| `<GuideHost>` | ガイドとヘルプ画面 | `guide` はガイドのコントローラーを指定。`locale` は表示する言語。`scope` はツアーの対象ページまたはワークスペースを限定。`autoStart` は条件に合うツアーの自動開始を許可。 | ガイドとヘルプ画面 | `<GuideHost {guide} locale='en-US' scope='demo-user' />` |
| `<HelpCenter>` | ヘルプの検索と閲覧 | `articles` はヘルプ記事の一覧。`tours` は利用可能なツアーの一覧。`locale` は表示する言語。`selectedId` は現在表示するヘルプ項目。`onstart` はツアーの開始操作を処理。 | ヘルプの検索と閲覧 | `<HelpCenter articles={articles} tours={tours} locale='en-US' />` |

#### 利用例：ガイドを開始してヘルプ記事を開く

手順、対象、記事をアプリで定義し、コントローラーで開始、次の手順、終了、完了記録を管理します。 詳細は[中国語の手順](ui.md#guide)を参照してください。

```svelte
<script lang='ts'>
  import { GuideHost, ui } from '@h-ai/ui/guide'

  // Create a guide for the users route with a named anchor and help article, using the supplied navigation adapter and persistence key.
  const guide = ui.createGuide({
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
| `ui.getThemeInfo(themeId)` | 対応テーマの情報を取得 | `themeId` は属性やライト・ダークの分類を取得するテーマを指定します。 | `ThemeInfo or undefined` | `ui.getThemeInfo("light")` |
| `ui.isDarkTheme(themeId)` | ダーク配色のテーマか確認 | `themeId` は属性やライト・ダークの分類を取得するテーマを指定します。 | `boolean` | `ui.isDarkTheme("dark")` |
| `ui.normalizeThemeId(themeId, fallbackThemeId?)` | 対応テーマまたは代替テーマを選択 | `themeId` は設定などから読み取った候補です。無効なときは `fallbackThemeId` を使い、既定は `light` です。 | `supported theme ID` | `ui.normalizeThemeId("unknown", "light")` |
| `ui.normalizeHexColor(value)` | 対応する16進色を正規化 | `value` はテーマ設定から取得した 16 進色の候補で、null や undefined も指定できます。 | `six-digit lowercase hex string or null` | `ui.normalizeHexColor("#5765F0")` |
| `ui.resolveThemeTone(themeId)` | テーマの明暗を取得 | `themeId` は属性やライト・ダークの分類を取得するテーマを指定します。 | `light or dark` | `ui.resolveThemeTone("light")` |
| `ui.createThemeBootstrapScript(options)` | 初回表示前に信頼済みテーマを適用 | 必須の `options: ThemeBootstrapScriptOptions` は信頼できるホストの設定から渡します。[呼び出し引数](#call-options)を参照。 | `script string for the application HTML shell` | `ui.createThemeBootstrapScript({ storageKey: "theme", defaultThemeId: "light" })` |
| `ui.getThemeInitScript()` | 既定テーマ初期化スクリプトを取得 | 引数はありません。 | `script string` | `ui.getThemeInitScript()` |
| `ui.applyTheme(theme, persist?)` | テーマを適用し、必要に応じて設定を保存 | `theme` はページに適用するテーマです。`persist` の既定は `true` で、次回の訪問に備えて選択を保存します。 | `void; updates DOM/browser preference` | `ui.applyTheme("dark")` |
| `ui.getCurrentTheme()` | ページに適用中のテーマを取得 | 引数はありません。 | `theme ID string` | `ui.getCurrentTheme()` |
| `ui.getSavedTheme(fallbackTheme?)` | 保存されたテーマ設定を取得 | `fallbackTheme` は有効な設定を読み取れない場合に返すテーマで、既定は `light` です。 | `theme ID string` | `ui.getSavedTheme("light")` |
| `<ThemeColorPicker>` | 選択色を更新 | `value` は現在値を指定。対応時は双方向バインド可。`presets` は利用者が選べる色の一覧。`onchange` は値の変更時に呼び出す。 | 選択色を更新 | `<ThemeColorPicker bind:value={color} />` |
| `<ThemeSelector>` | テーマを選択 | `themeIds` は表示するテーマ ID を限定。 | 組み込みテーマの候補を指定できる | `<ThemeSelector />` |
| `<ThemeToggle>` | 明暗を切替 | なし | 明暗を切替 | `<ThemeToggle />` |

#### 利用例：設定を読み込んでテーマを切り替える

最初の表示前に信頼済みの既定テーマを適用し、ページの選択部品で設定を読み取り、更新します。 詳細は[中国語の手順](ui.md#theme)を参照してください。

共有スタイルの `@h-ai/ui/styles/theme.css` には、半透明の面を使った明るいテーマ `liquid-glass` が含まれます。ダイアログやドロワーは背後のレイヤーをぼかし、メニューは重なる領域だけをぼかします。前面のコンテンツはくっきりと表示され、縁では光が屈折します。コントロールのハイライトはマウスに追従し、モーションを減らす設定では静止します。テーマセレクターで「リキッドガラス」を選ぶと、再読み込み後も選択が維持されます。UI のある CLI プロジェクトでは、標準でリキッドガラスを選べます。Fullstack プロジェクトで `fullstack.theme.themes` を明示的に設定する場合は、一覧に `liquid-glass` を追加してください。`ThemeSelector` の `themeIds` で組み込みテーマの候補を絞り込めます。省略するとすべての組み込みテーマを表示します。

```ts
import { THEME_GROUPS, THEMES, ui } from '@h-ai/ui/theme'
```

<a id="locale"></a>

### 言語切替とリクエスト分離：`@h-ai/ui/i18n`

ブラウザーではページの言語を保持し、サーバーではリクエストごとに言語を設定して他の利用者と混在させません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `ui.createLocaleStore(options?)` | ブラウザーページの言語を管理 | `options` は省略可能です。既定の言語、対応言語、ブラウザーでの判定、保存キーを指定できます。[呼び出し引数](#call-options)を参照。 | `locale store with current/set/isSupported` | `ui.createLocaleStore({ defaultLocale: "zh-CN", detectBrowser: false })` |
| `ui.getGlobalLocale()` | 現在のコンテキストの言語を取得 | 引数はありません。 | `locale string from current context` | `ui.getGlobalLocale()` |
| `ui.setGlobalLocale(locale)` | ブラウザーの UI 言語を設定 | `locale` は内蔵 UI メッセージに適用する言語タグです。 | `void`。SSR では処理を行いません | `ui.setGlobalLocale("en-US")` |
| `ui.detectBrowserLocale(supportedLocales?)` | ブラウザーから対応言語を選択 | `supportedLocales` は受け付けるブラウザー言語の一覧で、省略するとフレームワークの対応一覧を使います。 | `supported locale or null` | `ui.detectBrowserLocale()` |
| `ui.isLocaleSupported(locale, supportedLocales?)` | 有効な言語か確認 | `locale` は確認する言語です。`supportedLocales` は照合対象を限定し、既定ではフレームワークの対応一覧を使います。 | `boolean` | `ui.isLocaleSupported("ja-JP")` |
| `ui.resolveLocale(locale, supportedLocales?, defaultLocale?)` | 対応言語または代替言語を取得 | `locale` は候補、`supportedLocales` は許可される言語一覧です。`defaultLocale` は候補が一致しない場合に優先し、省略時はフレームワークの既定言語を使います。 | `supported locale` | `ui.resolveLocale("en")` |
| `ui.interpolate(template, params?)` | メッセージ中の名前付き変数を置換 | `template` はプレースホルダーを含む文字列です。`params` はキー別の置換値を指定し、省略時は元の文字列を返します。 | `string` | `ui.interpolate("Hello {name}", { name: "Ada" })` |
| `<LanguageSwitch>` | UI 言語を変更 | なし | UI 言語を変更 | `<LanguageSwitch />` |

#### 利用例：ページの言語を選んで文言を整える

サーバーでは `core.i18n.runWithLocale(locale, render)` で描画を囲みます。コールバックとその非同期処理で同じリクエストの言語を使います。`core.i18n.setGlobalLocale(locale)` は起動時にはプロセスの既定値を、リクエスト内ではそのリクエストの言語を設定します。UI の設定関数はブラウザーで使います。

```svelte
<script>
  import { ui } from '@h-ai/ui/i18n'
  import { setLocale } from '#lib/paraglide/runtime.js'

  // Create a reactive language store with browser and framework defaults.
  const localeStore = ui.createLocaleStore()

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
| `<FeedbackModal>` | ホストへ送信、失敗時入力保持 | `open` は開閉状態。`onsubmit` はフォームの送信時に呼び出す。 | ホストへ送信、失敗時入力保持 | `<FeedbackModal bind:open={open} onsubmit={submitFeedback} />` |
| `<FeedbackForm>` | 送信データと添付変更 | `attachments` は表示・編集する添付ファイル。`evidenceSummary` は収集する診断資料の概要を表示。`onsubmit` はフォームの送信時に呼び出す。`onfileschange` は添付ファイル選択の変更を受け取る。 | 送信データと添付変更 | `<FeedbackForm attachments={attachments} onsubmit={submitFeedback} />` |
| `<FeedbackList>` | 照会コールバック、通信はホスト | `data` は表示するデータ。`query` は現在の一覧の検索条件。`permissions` は画面上の操作可否を決める権限情報。`onquerychange` は検索条件の変更を受け取る。`onstatus` は利用者が要求した報告の状態変更を受け取る。 | 照会コールバック、通信はホスト | `<FeedbackList data={feedbackRows} onquerychange={queryFeedback} />` |
| `<FeedbackDetail>` | 報告と許可済み証拠 | `report` は現在のフィードバック報告。`evidence` は表示を許可された診断資料。`attachments` は表示・編集する添付ファイル。`history` は対応履歴。`webhook` は表示する Webhook 配信状態。`onretry` は配信の再試行を処理。`onexport` は利用者の出力操作を処理。 | 報告と許可済み証拠 | `<FeedbackDetail report={report} />` |
| `FeedbackScreenshot` | 注釈コールバック | `attachment`, `onannotate` | 注釈コールバック | `<FeedbackScreenshot attachment={attachment} onannotate={annotate} />` |

#### 利用例：証拠を表示してフィードバックを送る

収集済みの証拠を表示し、添付、注釈、送信操作を通知します。一覧と詳細には許可済みのデータを渡します。 詳細は[中国語の手順](ui.md#feedback)を参照してください。

<a id="utilities"></a>

### クラス・端末・クリップボード：UI ツール

クラス名、画面用 ID、端末別スタイルを作ります。クリップボードと portal は対応するブラウザー機能を使います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `ui.registerClipboardHostWriter(writer)` | WebView のコピー処理を登録・解除 | `writer` は文字列を受け取り、ホストでの書き込み成功を非同期で返します。`null` で登録を解除します。 | `void` | `ui.registerClipboardHostWriter(null)` |
| `ui.writeTextToClipboard(text)` | テキストをコピーし成否を返す | `text` はクリップボードに書き込む文字列です。 | `Promise<boolean>; true only when write succeeds` | `ui.writeTextToClipboard("trace-001")` |
| `ui.cn(...classes)` | 条件付きのクラス名を結合 | `classes` は順に連結する可変個のクラス名です。偽値は無視します。 | `string` | `ui.cn("flex", active && "text-primary")` |
| `ui.getDataAttributes(props)` | data-* 属性だけを引き継ぐ | `props` は `data-*` 属性の抽出元となるコンポーネント属性です。 | `ForwardedDataAttributes` | `ui.getDataAttributes({ "data-testid": "save" })` |
| `ui.generateId(prefix?)` | 画面要素用の識別子を作成 | `prefix` は生成する DOM ID の接頭辞です。省略時は UI ライブラリの既定値を使います。 | `string` | `ui.generateId("field")` |
| `ui.portal(node, target?)` | マウント済みノードを指定先へ移動 | `node` は移動する DOM 要素です。`target` は移動先の要素またはセレクターで、既定は `document.body` です。 | `Svelte action result with cleanup` | `ui.portal(node, document.body)` |
| `ui.detectPlatform()` | 現在の端末種別を検出 | 引数はありません。 | `Platform` | `ui.detectPlatform()` |
| `ui.isMobile()` | モバイル端末か確認 | 引数はありません。 | `boolean` | `ui.isMobile()` |
| `ui.isNativeApp()` | ネイティブアプリ内で動作しているか確認 | 引数はありません。 | `boolean` | `ui.isNativeApp()` |
| `ui.usePlatform()` | 端末情報をリアクティブに取得 | `none; component initialization` | `{ current, isMobile, isApp }` | `ui.usePlatform()` |
| `ui.getVariantClass(variant, prefix?)` | 表示種別を部品のクラス名へ変換 | `variant` は外観の種類、`prefix` はクラスの接頭辞で、既定は `btn` です。 | `string class name` | `ui.getVariantClass("primary", "btn")` |
| `ui.getSizeClass(size, prefix?)` | サイズを部品のクラス名へ変換 | `size` はコンポーネントのサイズ、`prefix` はクラスの接頭辞で、既定は `btn` です。 | `string class name` | `ui.getSizeClass("sm", "btn")` |
| `ui.getInputSizeClass(size)` | 入力部品のサイズクラスを取得 | `size` は CSS クラスに変換するコンポーネントのサイズです。 | `string class name` | `ui.getInputSizeClass("sm")` |
| `ui.getBadgeVariantClass(variant)` | バッジの配色クラスを取得 | `variant` は CSS クラスに変換する表示状態です。 | `string class name` | `ui.getBadgeVariantClass("info")` |
| `ui.getBadgeSizeClass(size)` | バッジのサイズクラスを取得 | `size` は CSS クラスに変換するコンポーネントのサイズです。 | `string class name` | `ui.getBadgeSizeClass("sm")` |
| `ui.getAlertVariantClass(variant)` | 通知の配色クラスを取得 | `variant` は CSS クラスに変換する表示状態です。 | `string class name` | `ui.getAlertVariantClass("info")` |
| `ui.getProgressVariantClass(variant)` | 進捗表示の配色クラスを取得 | `variant` は CSS クラスに変換する表示状態です。 | `string class name` | `ui.getProgressVariantClass("primary")` |

#### 利用例：スタイルを組み立てて診断番号をコピーする

クラス名、画面用 ID、端末別スタイルを作ります。クリップボードと portal は対応するブラウザー機能を使います。 詳細は[中国語の手順](ui.md#utilities)を参照してください。

```ts
import { ui } from '@h-ai/ui'
// Combine the given class with the falsy conditional. The result is flex.
ui.cn('flex', false && 'hidden') // 'flex'
// Keep the data-testid attribute from this object and discard the unrelated property.
ui.getDataAttributes({ 'data-testid': 'save', secret: 'ignored' }) // only data-testid
// Combine the primary variant and btn prefix into btn-primary.
ui.getVariantClass('primary', 'btn') // 'btn-primary'
// Generate a unique field identifier with the requested prefix.
const id = ui.generateId('field') // generated field identifier
// Copy the supplied trace ID. true means the browser copied it and false means it could not.
const copied = await ui.writeTextToClipboard('trace-001') // true if copied; false on failure
```

<a id="call-options"></a>

## 呼び出し引数

| 項目 | 既定値または必須条件 |
| --- | --- |
| `createLocaleStore: defaultLocale, supportedLocales` | 既定値は `zh-CN` と組み込み言語一覧です。対応言語には `code` と `label` を指定します。 |
| `createLocaleStore: detectBrowser, persistKey` | 既定値は `true` と `hai-locale`。`false` にするとブラウザーの言語設定を調べません。 |
| `createGuide: tours, articles, nav` | `tours` 配列は必須です。ヘルプ記事 `articles` とナビゲーション `nav` は任意です。 |
| `createGuide: persistence, persistKey, waitTimeout` | 既定値は `cookie`、`hai-guide`、対象要素ごとに 3000 ミリ秒です。`memory` では再読み込み時に進捗を失います。 |
| `createThemeBootstrapScript: storageKey, defaultThemeId, defaultThemeColor` | `storageKey` は必須。テーマの既定値は `light` です。色を省略すると初期のカスタム色は設定されません。 |
| `createThemeBootstrapScript: colorCssVar, toneDatasetKey, locale` | CSS 色と明暗属性の出力キーは任意。言語も初期化する場合は `key`、`defaultValue`、`supportedValues` を指定します。 |

<a id="form-layout-guide"></a>

## フォーム配置

詳細は[中国語ガイド](ui.md#form-layout-guide).

<a id="theme-locale-guide"></a>

## テーマと言語

詳細は[中国語ガイド](ui.md#theme-locale-guide).
