# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

## 概要

内蔵メッセージは `zh-CN`、`en-US`、`ja-JP` に対応し、言語セレクターは既定で3言語を表示します。

Svelte 5 Runes のクロスプラットフォーム UI ライブラリーです。DaisyUI v5 + Tailwind CSS v4 のスタイル、Bits UI v2 のヘッドレス UI、内蔵 i18n（zh-CN / en-US / ja-JP）、15 種類の厳選テーマ、ハイコントラストと直角のビジネステーマを提供します。

## 主な機能

- フォーム、テーブル、ダイアログ、ナビゲーション、チャートなどの部品。
- 認証、CRUD、AI コンテンツ、操作ガイド、ヘルプセンター。
- Svelte 5、テーマ、レスポンシブ表示、中国語・英語・日本語のコンポーネント文言。

## 使い始める

### インストール

```bash
npm install @h-ai/ui @h-ai/core
```

Node サーバーでは UI と core の両方を本番依存に含め、ログなどのネイティブ依存を通常どおり読み込めるようにします。

### クイックスタート

#### 1. svelte.config.js の設定

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

#### 2. vite.config.ts の設定

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

Crypto または Kit/IAM を使う場合、アプリの本番依存に `sm-crypto@0.5.7` を含めます。CLI 生成済みのプロジェクトでは設定済みです。手動導入は `pnpm add sm-crypto@0.5.7` を実行してください。adapter-node は直接の本番依存も参照するため、external 指定だけでは不十分です。

#### 3. src/app.css の設定

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

> `@source` で TailwindCSS に `@h-ai/ui` の class を走査させます。ない場合はスタイルが欠落します。monorepo 内のアプリでは依存がルート `node_modules` に置かれる場合があるため、両方のパスを残すことを推奨します。

#### 4. コンポーネントの使用

```svelte
<script>
  import { Button, Input, Card } from '@h-ai/ui'
</script>

<Card title="示例表单">
  <Input placeholder="请输入用户名" />
  <Button variant="primary" onclick={handleSubmit}>提交</Button>
</Card>
```

自動 import を有効にすると、個別の import なしでテンプレートから使えます：

```svelte
<!-- 无需 import { Button } from '@h-ai/ui' -->
<Button variant="primary">提交</Button>
```

> `toast`・型 import・DOM の `Range` と衝突する `Range` を除き、公開 Svelte コンポーネントは `@h-ai/ui/auto-import` で自動注入できます。

管理画面など一部のコンポーネントを使うページは、公開コンポーネントディレクトリーの入口から直接 import できます。テーマツールは軽量な `@h-ai/ui/theme` から読み込み、テーマの利用だけでルート入口の AI・グラフコンポーネントを読み込まないようにします。ストアの言語ツールは `@h-ai/ui/i18n` から読み込み、コンポーネントやガイド CSS を読み込みません。インストール済みパッケージの exports を確認し、内部 `src/`・`dist/` は import しないでください。

自動 import はセミコロンなし、複数行、別名の import を認識し、既存のローカル名を重複注入しません。型のみの import は実行時コンポーネントの代わりにはなりません。

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

#### data-\* 属性の転送

公開 Svelte コンポーネントは `data-*` をルート・主操作要素へ転送し、テスト・計測・自動化に使えます。通常の未知属性は転送しません。

```svelte
<Button data-testid='save-button' data-analytics-id='settings.save'>保存</Button>
<Input data-testid='username-input' bind:value={username} />
<Modal data-testid='confirm-modal' bind:open={open}>...</Modal>
```

`data-testid` のためだけにボタン・入力・ポップアップをラップする必要はありません。

### コンポーネント構成

3 層で構成します（primitives → compounds → scenes）：

```
components/
├── primitives/   # 分割できない基本 UI 部品
├── compounds/    # 基本部品 + Bits UI の組み合わせ
└── scenes/       # 業務用途の完全な UI フロー
    ├── ai/       # AI 文書 / 表計算 / Markdown プレビュー
    ├── app/      # 設定 / フィードバック / テーマ / 言語
    ├── crud/     # CRUD ページ / ドロワー / 絞り込み / 削除確認
    ├── iam/      # 認証
    ├── storage/  # ストレージ管理
    └── crypto/   # 暗号表示
```

### コンポーネント一覧

#### Primitives：基本コンポーネント（20）

| コンポーネント   | 説明                   | 主なプロパティ                                                                 |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `Button`         | ボタン                 | `variant`, `size`, `loading`, `disabled`, `outline`, `circle`                  |
| `IconButton`     | アイコンボタン         | `icon: trusted SVG string \| Snippet`, `variant`, `size`, `tooltip`, `loading` |
| `BareButton`     | スタイルなしボタン     | `class`, `ariaLabel`, `role`, `tabindex`                                       |
| `Input`          | 入力欄                 | `type`, `value`, `size`, `error`, `validationMessage`                          |
| `BareInput`      | スタイルなし入力欄     | `type`, `class`, `accept`, `multiple`                                          |
| `Textarea`       | テキストエリア         | `value`, `rows`, `size`, `autoResize`, `error`                                 |
| `Select`         | 選択リスト             | `options`, `value`, `placeholder`, `size`, `clearable`, `filterable`           |
| `Checkbox`       | チェックボックス       | `checked`, `label`, `size`, `indeterminate`                                    |
| `Switch`         | スイッチ               | `checked`, `label`, `size`                                                     |
| `Radio`          | ラジオグループ         | `options`, `value`, `direction`, `size`                                        |
| `ToggleCheckbox` | ネイティブスイッチ入力 | `checked`, `name`, `onchange`                                                  |
| `ToggleInput`    | ネイティブトグル入力   | `checked`, `name`                                                              |
| `ToggleRadio`    | ネイティブラジオ入力   | `checked`, `name`, `onchange`                                                  |
| `Range`          | スライダー             | `value`, `min`, `max`, `step`                                                  |
| `Rating`         | 評価                   | `value`, `max`                                                                 |
| `Badge`          | バッジ                 | `variant`, `size`, `outline`                                                   |
| `Avatar`         | アバター               | `src`, `name`, `size`, `shape`, `ring`                                         |
| `Tag`            | タグ                   | `text`, `variant`, `size`, `closable`                                          |
| `Spinner`        | 読み込み表示           | `size`, `variant`                                                              |
| `Progress`       | プログレスバー         | `value`, `max`, `variant`, `striped`, `animated`                               |

`BareInput` の `type="file"` では `onchange` の `event.currentTarget.files` を読み取り、ファイルパスの `value` はバインドしません。他の入力型では `bind:value` を使用できます。

#### Compounds：複合コンポーネント（37）

##### フォーム

| コンポーネント | 説明               | 主なプロパティ                               |
| -------------- | ------------------ | -------------------------------------------- |
| `Form`         | フォームコンテナー | `columns`, `labelPosition`, `labelWidth`, `loading`, `disabled`, `onsubmit`            |
| `FormField`    | フォーム項目       | `label`, `for`, `colSpan`, `labelPosition`, `error`, `hint`, `required`         |
| `FormLayout` | フォーム配置 | `columns`, `labelPosition`, `labelWidth` |
| `TagInput`     | タグ入力           | `tags`, `maxTags`, `allowDuplicates`, `size` |

##### フォームのレイアウトと検証

`Form` とネイティブ `<form>` 内で使う `FormLayout` は、`columns={1 | 2}`、`labelPosition="top" | "left"`、`labelWidth`（既定 `8rem`）を共有します。既定は1列・ラベルを上に配置します。コンテナー幅が `36rem` 未満では1列、`28rem` 未満では横並びラベルも縦並びになります。

`FormField.colSpan` の既定は `'auto'`。Textarea、ファイル・画像アップロード、TagInput、複数選択 Combobox は2列を占めます。`1` / `2` で指定でき、独自の幅広コントロールには `data-form-wide` を付けます。見出し、エラー概要、操作ボタンなどの非 FormField 要素は行全体を使用します。項目ごとに `labelPosition` / `labelWidth` を上書きできます。

ラベルは内部 UI コントロールに自動で関連付けられます。明示 ID やネイティブ要素は `<FormField for="control-id">` を使います。エラーとヒントは `aria-describedby`、無効な要素は `aria-invalid` で通知し、エラーは重複表示しません。`label` / `error` / `hint` は文字列または翻訳関数を受け取ります。

`Input`、`Textarea`、`Select`、`PasswordInput` のネイティブ検証は中国語・英語・日本語に対応します。`validationMessage` は失敗時だけ適用され、有効な入力を無効にし続けません。UI の `setGlobalLocale` / `createLocaleStore` で言語を同期すると表示中のエラーも更新されます。`Textarea` は `minlength` / `maxlength`、`Select` は `name`・必須検証・FormData に対応します。

テキスト入力後のフォーカス離脱時に検証し、修正中も更新します。未入力の空欄は送信時に検証し、初期フォーカスの移動で操作を押し下げません。CRUD も入力後のフォーカス離脱時または送信時に検証し、カスタムメッセージに対応して再表示時に検証状態をリセットします。`Select` はトリガーと選択肢の両方からフォーカスが離れた時に検証します。`PasswordInput.minLength` は長さ制約と強度計算に使い、省略時はログイン用の長さ制限を設けず、強度のみ8文字を基準にします。

`UserProfile.fieldConstraints` は項目別に `required`、`minlength`、`maxlength`、`pattern`、`validationMessage` を受け取り、ユーザー名などの業務ルールをフォーカス離脱時に検証します。`pattern` は単一行の入力に適用し、`validationMessage` は翻訳関数にも対応します。

`LoginForm`、`RegisterForm`、`ChangePasswordForm`、`ForgotPasswordForm`、`ResetPasswordForm`、`AuthPanel`、`UserProfile`、`FeedbackModal` は同じレイアウト設定に対応します。`CrudPage.form` または `CrudEditPanel` に渡します。CRUD 項目は `colSpan` と翻訳関数の `validation.message` に対応し、ボタンと Enter のどちらも送信前に検証します。入力修正でエラーが消えます。サーバー側の検証も必要です。

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

##### フィードバック

| コンポーネント   | 説明           | 主なプロパティ                           |
| ---------------- | -------------- | ---------------------------------------- |
| `Alert`          | アラート       | `variant`, `title`, `dismissible`        |
| `ToastContainer` | 通知コンテナー | 全体に配置し、`toast` シングルトンと併用 |

##### オーバーレイ

| コンポーネント | 説明           | 主なプロパティ                                                               |
| -------------- | -------------- | ---------------------------------------------------------------------------- |
| `Modal`        | モーダル（ダイアログ属性・フォーカス制御と復元） | `open`, `title`, `size`, `radius`, `bodyOverflow`, `showClose`               |
| `Drawer`       | ドロワー       | `open`, `position`, `title`, `size`, `width`, `resizable`, `widthStorageKey` |
| `Confirm`      | 確認ダイアログ | `open`, `title`, `message`, `variant`, `onconfirm`                           |
| `Popover`      | ポップオーバー | `open`, `position`, `trigger`, `offset`, `portal`                            |

##### データ表示

| コンポーネント | 説明             | 主なプロパティ                                                                                                                        |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Card`         | カードコンテナー | `title`, `bordered`, `shadow`, `padding`                                                                                              |
| `JsonViewer`   | JSON ツリービューアー | `value`, `defaultExpandedDepth`, `maxScalarLength`, `showCopy`, `onCopy`；循環参照はプレースホルダーに置換 |
| `DataTable`    | データテーブル   | `data`, `columns`, `keyField`, `loading`, `sortKey`, `sortDir`, `onsort`、`cell` スロット、`onrowclick`（列の `sortable` で並び替え） |
| `Accordion`    | アコーディオン   | `items: AccordionItem[]`                                                                                                              |
| `Timeline`     | タイムライン     | `items: TimelineItem[]`                                                                                                               |

##### Bits UI によるヘッドレス UI

| コンポーネント | 説明                       | 主なプロパティ                                              |
| -------------- | -------------------------- | ----------------------------------------------------------- |
| `Combobox`     | 検索付き選択（単一・複数） | `options`, `value`, `multiple`, `placeholder`, `size`       |
| `Calendar`     | 独立カレンダー             | `value: DateValue`, `minValue`, `maxValue`                  |
| `DatePicker`   | ポップアップ付き日付入力   | `value: DateValue`, `minValue`, `maxValue`, `error`, `size` |

> 日付値には `@internationalized/date` の `DateValue` / `CalendarDate` を使います。

##### モバイル・拡張操作

| コンポーネント   | 説明                   | 主なプロパティ                                         |
| ---------------- | ---------------------- | ------------------------------------------------------ |
| `ActionSheet`    | 下部アクションシート   | `open`, `title`, `items`, `cancelText`, `onselect`     |
| `AppBar`         | 上部ナビゲーション     | `title`, `backHref`, `onback`, `fixed`, `safeArea`     |
| `BottomNav`      | 下部ナビゲーション     | `items`, `active`, `centered`, `maxWidth`              |
| `InfiniteScroll` | 無限スクロール         | `loading`, `finished`, `threshold`, `onload`           |
| `PullRefresh`    | プル更新               | `refreshing`, `threshold`, `onrefresh`                 |
| `SafeArea`       | セーフエリアコンテナー | `top`, `bottom`, `left`, `right`                       |
| `SwipeCell`      | スワイプ操作           | `leftActions`, `rightActions`, `threshold`, `onaction` |

##### ナビゲーション

| コンポーネント | 説明                              | 主なプロパティ                                                                                             |
| -------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Tabs`         | タブ                              | `items`, `active`, `type`, `size`, `lazy`, `onactivate`                                                    |
| `Pagination`   | ページ分割（共通 table スタイル） | `page`, `total`, `pageSize`, `showTotal`, `showJumper`, `showSizeChanger`, `showPageInfo`, `showFirstLast` |
| `Breadcrumb`   | パンくず                          | `items`, `separator`                                                                                       |
| `Steps`        | ステップ                          | `items`, `current`, `direction`, `clickable`                                                               |
| `Dropdown`     | ドロップダウンメニュー            | `items`, `trigger`, `triggerClass`, `position`                                                             |
| `Tooltip`      | ツールチップ                      | `content`, `position`, `delay`                                                                             |

##### 状態表示

| コンポーネント | 説明       | 主なプロパティ                        |
| -------------- | ---------- | ------------------------------------- |
| `Skeleton`     | スケルトン | `variant`, `width`, `height`, `count` |
| `Empty`        | 空状態     | `title`, `description`, `icon`        |
| `Result`       | 結果ページ | `status`, `title`, `description`      |

##### ページ単位

| コンポーネント | 説明           | 主なプロパティ                                 |
| -------------- | -------------- | ---------------------------------------------- |
| `PageHeader`   | ページヘッダー | `title`, `description`、`actions` スロット対応 |

#### Scenes：用途別コンポーネント（41）

##### Guide：案内・ヘルプ（2）

| コンポーネント | 説明 | 主なプロパティ |
| --- | --- | --- |
| `GuideHost` | 初回案内・ガイド・ヘルプダイアログ | `guide`, `locale`, `scope`, `autoStart` |
| `HelpCenter` | 独立して使える検索付きヘルプ | `articles`, `tours`, `locale`, `selectedId`, `onstart` |

##### App：アプリ全体（13）

| コンポーネント     | 説明                                        | 主なプロパティ                                           |
| ------------------ | ------------------------------------------- | -------------------------------------------------------- |
| `FeedbackModal`    | フィードバックモーダル                      | `open`, `onsubmit`                                       |
| `FeedbackForm` | 独立したフィードバックフォーム | `attachments`, `evidenceSummary`, `onsubmit`, `onfileschange` |
| `FeedbackList` | サーバー側ページング・絞り込み・処理操作 | `data`, `query`, `permissions`, `onquerychange`, `onstatus` |
| `FeedbackDetail` | 診断情報・処理履歴・エクスポート | `report`, `evidence`, `attachments`, `history`, `webhook`, `onretry`, `onexport` |
| `FeedbackScreenshot` | 画像のプレビュー・強調・マスキング | `attachment`, `onannotate` |
| `SettingsModal`    | 設定モーダル                                | `open`, `onclose`                                        |
| `SettingsLayout`   | 設定レイアウト（区分ナビゲーション + 本文） | `title`, `description`, `sections`, `active`, `onselect` |
| `LanguageSwitch`   | 言語切り替え                                | プロパティ不要                                           |
| `ThemeColorPicker` | テーマカラー選択                            | `value`, `presets`, `onchange`                           |
| `ThemeSelector`    | テーマ選択パネル                            | プロパティ不要                                           |
| `ThemeToggle`      | ライト・ダーク切り替え                      | プロパティ不要                                           |

詳細 jobs の type: webhook を FeedbackDetail.webhook に渡すと状態・試行回数・安全なエラーコードを表示し、onretry から認可付き retry API を呼びます。「業務情報」タブは kind: business をページ取得し、圧縮添付は操作現場からダウンロードします。

説明は任意です。モーダルを開く前に `@h-ai/feedback/client` の `prepare()` で現場を固定します。`onfileschange` で添付を準備し、`onannotate` で注釈を画像のピクセルに反映します。送信失敗時は入力を保持し、ローカルに出力できます。一覧は説明またはサーバーの要約を表示し、`onquerychange` でページを取得します。UI の権限表示とは別にサーバーの認可が必要です。接続方法とオフラインツールは [feedback モジュール](../feedback/README.ja.md) を参照してください。

##### IAM：認証（13）

| コンポーネント       | 説明                                    | 主なプロパティ                                                                                         |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `AuthPanel`          | 設定による認証画面 | `config`, `actions`, `loginHeader/loginFields/loginFooter`, `registerHeader/registerFields/registerFooter` |
| `AuthShell`          | 認証ページ配置（中央カード / 左右分割） | `variant`, `title`, `subtitle`, `brandTitle`, `brandText`, `illustration`, `description`, `highlights` |
| `LoginForm`          | ログインフォーム                        | `loading`, `errors`, `showForgotPassword`, `onsubmit`                                                      |
| `RegisterForm`       | 登録フォーム                            | `loading`, `errors`, `fields`, `onsubmit`                                                              |
| `ForgotPasswordForm` | パスワード忘れ                          | `mode`, `loading`, `errors`, `onsubmit`                                                                |
| `ResetPasswordForm`  | パスワードリセット                      | `loading`, `errors`, `showCode`, `onsubmit`                                                            |
| `ChangePasswordForm` | パスワード変更                          | `loading`, `errors`, `requireOldPassword`, `onsubmit`                                                  |
| `PasswordInput`      | パスワード入力                          | `value`, `showToggle`, `showStrength`, `minLength`                                                     |
| `ReauthenticationDialog` | 機密操作の確認 | `open`, `loading`, `error`, `onsubmit`, `onclose` |
| `PermGuard`          | 権限ガード                              | `permissions`, `mode`, `fallback`                                                                      |
| `UserProfile`        | ユーザープロフィール                    | `user`, `editable`, `fields`, `avatarAccept`, `avatarHint`, `onsubmit` |
| `SessionRecoveryDialog` | 画面内のセッション復帰 | `recovery`, `actions` |
| `SensitiveOperationsForm` | 権限の重要操作編集 | `operations`, `onsubmit`, `ondone` |

##### Storage：ストレージ（4）

| コンポーネント | 説明                 | 主なプロパティ                                               |
| -------------- | -------------------- | ------------------------------------------------------------ |
| `FileUpload`   | ファイルアップロード | `accept`, `maxSize`, `maxFiles`, `multiple`, `uploadHandler` |
| `ImageUpload`  | 画像アップロード     | `value`, `accept`, `maxSize`, `aspectRatio`, `uploadHandler` |
| `AvatarUpload` | アバターアップロード | `value`, `size`, `maxSize`, `fallback`, `uploadHandler`      |
| `FileList`     | ファイル一覧         | `files`, `layout`, `showDelete`, `showDownload`              |

アップロード部品は presign・ヘッダー・PUT/POST を内蔵しません。アプリは `uploadHandler(file, { signal, onProgress })` からサービスを呼び、`{ url?, response? }` を返します。画像・アバターには表示可能な `url` が必要です。handler がなければ `FileUpload` は選択のみ、画像・アバターはローカルのプレビューのみを作成します。

##### Crypto：暗号表示（3）

入力変更で `encryptedValue` を即座に消去し、現在の入力の成功結果のみを反映します。消去・コールバック置換・破棄で旧リクエストを無効化します。失敗時は組み込みエラーを表示し暗号文は空です。暗号化対象の送信は現在の暗号文が空でない場合に限ってください。

`EncryptedInput` は `onencrypt` で実際の暗号サービスに接続する必要があり、`algorithm` はその方式の説明のみです。未設定なら利用不可を示し、暗号文を生成せず、Base64 などへの代替もありません。

| コンポーネント     | 説明         | 主なプロパティ                                          |
| ------------------ | ------------ | ------------------------------------------------------- |
| `EncryptedInput`   | 暗号化入力   | `value`, `encryptedValue`, `algorithm`, `showEncrypted` |
| `HashDisplay`      | ハッシュ表示 | `value`, `algorithm`, `copyable`, `truncate`            |
| `SignatureDisplay` | 署名表示     | `signature`, `publicKey`, `algorithm`, `verified`       |

既定は `@h-ai/crypto` と共通で、暗号化入力は `SM4`、ハッシュは `SM3`、署名は `SM2` です。

##### AI：文書・表計算（4）

| コンポーネント           | 説明                     | 主なプロパティ・機能                                                                                       |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `MarkdownRenderer`       | Markdown レンダラー      | `content`, `fontSize`, `allowHtmlTags`, `showCopyButton`, `enableHighlight`                                |
| `AiDocumentDownloadMenu` | 文書ダウンロードメニュー | `actions`, `ondownload`                                                                                    |
| `AiDocumentEditor`       | AI 文書エディター        | `content`, `fontSize`, `allowHtmlTags`, `showRunButton`, `showCodePreviewToggle`, `allowUnsafeCodePreview` |
| `AiTableEditor`          | AI 表計算エディター      | `columns`, `rows`, `editable`, `ondownload`                                                                |

> `AiDocumentEditor` は既定で Markdown の内蔵プレビューのみを許可します。HTML / JS / CSS などには明示的な `allowUnsafeCodePreview`、または `oncoderun` による制御済み結果が必要です。
>
> Mermaid は追加設定不要です。文書（`sourceKind='document'`）の ` ```mermaid ` を閲覧時に自動描画し、code モード（`sourceKind='code'` + `showCodePreviewToggle`）ではコード・プレビューを切り替えます。`securityLevel: 'strict'` と消毒済み SVG を使い、`allowUnsafeCodePreview` は不要です。
>
> `MarkdownRenderer` と `AiDocumentEditor` には表示設定もあります：
>
> - `fontSize` は px の `number`、または `1.125rem` などの CSS 長さ。
> - `allowHtmlTags` は既定で無効です。有効化すると `<b>` / `<i>` / `<u>` / `<mark>` などを安全な許可リストで解析し、危険なタグ・属性は除去します。

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

##### Charts：グラフ

`Chart type='line'` は既定で LayerChart の折れ線を使います。監視画面で分割線・点・最寄りの点への hover・縦基準線が必要な場合は `lineVariant='segmented-point'` を使います：

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

##### CRUD：一覧操作（5）

| コンポーネント      | 説明                                                   | 主なプロパティ・機能                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CrudPage`          | CRUD ページ                                            | `crud`, `data`, `permissions`, `form`, `pagination`, `density`, `detailColumns`, `showHeader`, `toolbarLeading`, `toolbarActions`, `card`, `tableCell`, `onrowclick`, `sortableColumns`, `nav`, `loading`, `loaded`, `error`, `onRetry`, `keepPreviousData` |
| `CrudFilterBar`     | 絞り込みツールバー（検索 + 各種フィルター + リセット） | `filterFields`, `searchValue`, `onsearch`, `onfilterchange`, `onreset`                                                                                                                                                                                                      |
| `CrudDetailPanel`   | 詳細パネル（ドロワー・モーダル）                       | `open`, `item`, `fields`, `variant`, `drawerWidth`, `modalSize`                                                                                                                                                                                                             |
| `CrudEditPanel`     | 編集パネル（ドロワー・モーダル）                       | `open`, `fields`, `variant`, `drawerWidth`, `modalSize`, `onsubmit`                                                                                                                                                                                                         |
| `CrudDeleteConfirm` | 削除確認                                               | `open`, `loading`, `onconfirm`                                                                                                                                                                                                                                              |

> `CrudPage` と `FeedbackList` はカード内の検索欄、独立してスクロールする表、下端のページ切り替えを共有します。検索・実行・リセットは常に表示し、追加条件は入力を保持して折りたたみます。検索ボタンまたは Enter で全条件を一度だけ送信し、編集中は検索しません。ページ移動と並べ替えは適用済み条件を使用します。リセットは検索・条件・並べ替えを初期化して先頭ページに戻します。並べ替えボタンは列見出しに表示し、`sortableColumns` にはサーバーが対応する列だけを指定します。`detailColumns` は詳細入口、`toolbarLeading` / `toolbarActions` はカード上の説明・操作、`card` / `tableCell` は独自内容に利用します。条件は `select`、`boolean`、`number`、`date`、`date-range`、`text` に対応します。 `sortableColumns` を省略すると並べ替えボタンは表示せず、サーバー対応列を明示します。
>
> ページは親の利用可能な高さを満たします。データの有無にかかわらずテーブルが残りの領域を使い、データ部分のみがスクロールします。見出しはデータ領域の上、ページ分割は一覧カードの下に固定します。
> ビューポートの外枠からコンテンツまで、各親要素に `flex flex-1 min-h-0 flex-col` などで残りの高さを渡します。中間のラッパーを内容だけの高さにしないでください。空・少数・スクロールする一覧でもページ分割は下部に配置されます。
>
> 列は先に 7rem まで縮小し長文を切り詰め、総幅が容器を超える場合のみ横スクロールを出します。操作列は右に固定し、横スクロール中も表示します。

##### エラーページ（1）

| コンポーネント | 説明                                               | 主なプロパティ・機能                                                    |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `ErrorPage`    | 401/403/404/500/503 の既定表示付き汎用エラーページ | `status`, `code`, `title`, `description`, `homeUrl`, `onhome`, `onback` |

> `CrudPage` の作成・編集の表示は `form` で設定します： `sortableColumns` を省略すると並べ替えボタンは表示せず、サーバー対応列を明示します。
>
> - `form.variant`：`'drawer'`（既定）または `'modal'`。
> - ドロワー：`form.drawerSize` は既定サイズ、`form.drawerWidth` は任意の CSS 幅で優先されます。既定で左端をドラッグでき、リソースごとに幅を記憶します。`form.drawerResizable=false` で無効化。
> - モーダル：`form.modalSize` は既定サイズ、`form.modalWidth` / `form.modalHeight` は任意の CSS サイズ。
>
> `pagination` は常時表示するページ分割欄を設定します。`showSizeChanger`、`pageSizeOptions`、`showJumper`、`showTotal` は既定で有効です。コンパクト表示では `showPageInfo` でページ文言、`showFirstLast` で先頭・末尾ボタンを非表示にできます。
>
> `density` は `'normal'`（既定）または `'compact'`。一覧の行・操作・ページ分割・作成/編集/詳細フォームに適用し、ヘッダー・フィルターには影響しません。
>
> 読み込み状態は `loading` / `loaded` / `error` / `onRetry` / `keepPreviousData` で制御します。空状態は `loaded && total === 0` の場合のみで、初回応答前の誤表示を防ぎます。初回は検索中、利用可能なデータがない失敗はエラー・再試行（`onRetry`）を表示します。`keepPreviousData`（既定 true）は更新・失敗時に旧データを保持します。
>
> SvelteKit SSR を使わないクライアントは、`defineCrud` + `createCrudController` で `data` と `nav` を管理できます。最新リクエスト優先（seq + AbortSignal）、失敗時の旧データ保持、遅延読み込み、並行呼び出しの重複排除を備えます：
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
> `Tabs` は遅延表示に対応し、`lazy` では未使用タブの内容を描画しません（`children` の `isActivated(key)` で判定）。`onactivate(key)` は初回のみ実行し、`createCrudController({ autoLoad: false })` と組み合わせて最初に表示されたときに読み込めます。

### 使用例

#### Toast 通知

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

通知は既定で右下に浮かび、ページのレイアウトを変えません。UI モジュールのテーマ色でお知らせ・成功・警告・エラーを区別し、淡い背景、細い色枠、種類別アイコンと控えめな影を使用し、手動で閉じられます。複数の通知は共通の FIFO キューから 1 件ずつ表示され、表示開始から計時します（既定 3 秒、`duration: 0` は手動で閉じるまで保持）。ルートに `<ToastContainer />` を 1 回だけ配置します。`toast.add({ message: m.saved(), variant: 'success', position: 'bottom-center' })` で位置を指定できます。`m.saved()` はアプリの翻訳関数です。位置は `bottom-right`（既定）、`top-right`、`bottom-center`、`top-center`、`bottom-left`、`top-left`。ログイン・パスワード変更・保存・削除・アップロードの成功と失敗は Toast、フィールド検証や継続的な業務状態、復旧操作はインラインで表示します。`Alert` は淡い背景を使用します。

> `notifySuccess` / `notifyError` / `notifyInfo` / `notifyWarning` を内蔵し、アプリ独自の toast ツールは不要です。`notifyError(err, fallback?)` は `Error`・文字列と代替文言を受け付け、既定は成功 3 秒・失敗 5 秒です。

コンポーネントの初期化時に `useToastFeedback(() => error)` へ安全に翻訳された操作メッセージを渡せます。同じ種類・内容の通知はキュー内で統合され、コンポーネントを破棄しても通知は表示されます。`message` API も同じキュー・外観・閉じる動作を共有します。`MessageContainer` は `ToastContainer` を表示するため、ルートには片方だけ配置します。

状態層は軽量な `@h-ai/ui/toast` から `toast`、`useToastFeedback`、`notifySuccess` / `notifyError` / `notifyInfo` / `notifyWarning`、`errorMessage` を読み込めます。コンポーネントやガイド CSS は読み込みません。`ToastContainer` はコンポーネントの入口から読み込み、ルートに配置します。

#### 通知の位置を指定する

以下の `m.saved()` はアプリの翻訳関数です。異なる位置の通知も共通のキューから順番に表示されます。

```ts
import { toast } from '@h-ai/ui/toast'

toast.add({ message: m.saved(), variant: 'success', position: 'top-right' })
toast.add({ message: m.saved(), position: 'bottom-center' })
```

#### 標準的な CRUD ページ

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

`Modal` は `title` / `header` がなくても右上の閉じるボタンを表示し、ヘッダー全体は追加しません。角丸は `radius="1.4rem"`、内部ドロップダウンなどを外に表示する場合は `bodyOverflow="visible"` を指定できます。

#### 宣言的な CRUD ページ（CrudPage）

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

> ドロワーは `form={{ variant: 'drawer', drawerWidth: '40rem' }}` に変更できます。ユーザーが変更した幅が初期幅より優先され、リソースごとに記憶されます。

#### ログインページ

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

#### PasswordInput の制御モード

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

### フィードバック収集と配布確認

フィードバックの `evidence` は脱敏済み資料の内容を表示します。`oncapture(id?)` はページ移動中に画面を閉じ、画像を追加・置換します。`onfileschange` 接続時はブラウザーの無音録画をWebM/MP4添付として確認・削除できます（最大60秒 / 5 MiB、動画は自動マスクされません）。`FeedbackDetail.onreplay` で完全な操作記録を必要時に取得して再生・移動し、ログと環境はページングで取得します。

フィードバックの資料部分は独立してスクロールし、操作ボタンを常に表示して展開内容との重なりを防ぎます。`FeedbackList` はアクセシブル名を保持し、ページ見出しはホストが表示して重複を避けます。

### スタイルの依存関係

コンポーネントは TailwindCSS v4 + DaisyUI を使います。アプリの `app.css` に次を設定します：

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

- `global.css`：HTML リセット、スクロールバー、フォームのフォーカスリング。
- `theme.css`：ブランドカラー・影・アニメーション曲線・フォント機能を含む Tailwind v4 `@theme`。
- `design-tokens.css`：余白・角丸・z-index・遷移の CSS 変数。モバイル推奨。
- `mobile.css`：セーフエリア、慣性スクロール、仮想キーボード対応、モバイルシェル（`hai-mobile-viewport` / `hai-mobile-shell` / `hai-mobile-main`）。

モバイルページは `BottomNav` の幅をページシェルに合わせ、デスクトッププレビューで画面全幅になるのを防ぎます：

```svelte
<div class="hai-mobile-viewport">
  <div class="hai-mobile-shell max-w-lg">
    <AppBar title="Home" fixed={false} safeArea />
    <main class="hai-mobile-main">...</main>
    <BottomNav items={items} active="home" centered maxWidth="lg" safeArea />
  </div>
</div>
```

#### アイコン

Iconify（Tabler Icons）を使用します：

```bash
npm install -D @iconify/tailwind4 @iconify-json/tabler
```

```css
/* app.css 中追加 */
@plugin "@iconify/tailwind4" {
  prefixes: tabler;
}
```

#### テーマ切り替え

内蔵ツールで 15 種類の厳選 DaisyUI テーマ、ハイコントラストと直角のビジネステーマを管理します：

`high-contrast` は共有 theme.css に含まれます。暗い背景と明るい文字、明確な境界線・フォーカス、補助文字とプレースホルダーの強いコントラストを提供します。ThemeSelector は3言語に対応し、サンプルと既定の生成プロジェクトで選択できます。fullstack の明示的な themes はホスト設定を尊重します。通常文字の配色目標は7:1ですが、各業務コンテンツは別途アクセシビリティ確認が必要です。

`formal` はボタン・入力欄・カード・ダイアログを直角にし、サンプルと既定テンプレートで選択できます。Button の submitHint は type=submit のネイティブ Enter 操作だけを表示します。LoginForm はデスクトップで準備完了時に既存のフォーカスがなければ識別子へ移動し、autoFocus=false で無効化できます。検索の Enter は IME 確定を除いて即時実行します。テーマは方向キー/Home/End、Enter/Space、Esc とフォーカス復帰に対応し、確認画面は取消を初期選択して Esc の状態を同期します。

```ts
import {
  applyTheme, // 应用主题（自动持久化到 localStorage）
  createThemeBootstrapScript, // 生成可注入 app.html 的首屏主题恢复脚本
  getCurrentTheme, // 获取当前主题
  getSavedTheme, // 保存済みテーマ。アプリ既定値を指定可能
  getThemeInitScript, // 返回可注入到 HTML shell 的防闪烁脚本文本
  isDarkTheme, // 检查是否暗色主题
  normalizeHexColor, // 归一化 #RGB / #RRGGBB 主题色
  normalizeThemeId, // 校验主题 ID 并自动回退
  THEME_GROUPS, // 按亮色/暗色分组
  THEMES, // ThemeInfo[] — 17 个主题元数据
} from '@h-ai/ui/theme'
```

単純な場合は `getThemeInitScript()` を使えます。独自ストレージ key・テーマカラーの CSS 変数・言語設定がある場合、サーバーの `createThemeBootstrapScript()` で生成して `app.html` に注入することを推奨します。

SvelteKit の `app.html` にプレースホルダーを置きます：

```html
<head>
  <script>%theme_bootstrap%</script>
</head>
```

次に `hooks.server.ts` で注入します：

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

### 国際化（i18n）

@h-ai/ui は**コンポーネント内蔵翻訳**を使います：

- 用途別コンポーネント（`scenes/`）は中国語・英語・日本語（zh-CN / en-US / ja-JP）を内蔵し、そのまま使えます。
- `@h-ai/core` と同期した全体 locale の変更へ自動応答します。
- アプリは**ページ単位の文言**のみを扱い、内部テキストは @h-ai/ui が管理します。
- 個別文言の変更は `submitText`・`labels` などの props で指定。

#### createLocaleStore

クライアントの locale 状態を管理し、`@h-ai/core` の全体管理器へ自動同期します：

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

`@h-ai/ui/i18n` の createLocaleStore は、解決できる保存値、navigator.languages 全体（その後 navigator.language）、defaultLocale、対応一覧の先頭の順で選択します。未対応の最初の候補で既定値に戻しません。大小文字、言語略称、地域・スクリプトの段階的フォールバックを照合し、設定済みのコードを返します。同じ言語の複数候補は supportedLocales 順です。実際の一致がなければ detectBrowserLocale は null、空の対応一覧では最終的に呼出側の既定値を返します。SSR はブラウザー候補を読まず全体の言語を変更しません。Paraglide アプリは独自の setLocale 同期が必要で、対応一覧の追加だけでは UI 内蔵辞書は増えません。

#### エクスポートされる i18n ツール

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

### 設定による認証画面

状態層では軽量入口 `@h-ai/ui/i18n` から `authErrorMessage` を読み込み、シーンコンポーネントを読み込まず同じ案内を使えます。管理台の個人パスワード変更、モバイル・デスクトップ例、生成テンプレートで共用します。

パスワードログインの送信項目は `identifier` と `password` のみです。`AuthPanel` は `LoginForm` の `username` を `identifier` に変換します。有効期間はサーバーの `session.maxAge` / `session.refreshTokenMaxAge` で設定し、フォームにログインごとの永続セッション選択肢はありません。

YAML の `|` で `agreements.userAgreementMarkdown` と `privacyPolicyMarkdown` を設定できます。Modal は本文を安全に描画し、同じ規約の URL より本文を優先します。URL のみの場合は隔離 iframe を使用します。

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



AuthPanel に IAM 公開設定と actions を渡すと、複数方式のログイン、登録、復旧、規約を利用できます。config.ui でレイアウトとブランド画像を指定し、パスワードフォームは passwordPolicy を受け取ります。通信と Token 保存は actions の責務です。

認証エラーには `@h-ai/ui/components/scenes/iam/index` の `authErrorMessage(error)` を使用します。公開コードを現在の UI 言語に変換し、ユーザー名とパスワードの誤りを区別せず、未知・サーバーエラーの原文を隠し、有効な `traceId` を保持します。AuthPanel、OTP 送信、重要操作の再認証、fullstack のパスワード変更で共用します。初期・期限切れパスワード、現在のパスワードの再使用（`hai:iam:034`）、セッション数上限には操作案内を表示します。認証エラーと操作成功は統一 Toast を使用します。確認パスワードはサーバーと同じく Unicode 正規化や空白除去をせず厳密に比較し、不一致をフィールドに表示します。

AuthPanel は SSR 中のフォーム操作を無効にし、クライアントのマウントとイベント登録が完了してから入力を有効にします。ハイドレーションによる入力の消失を防ぎ、アプリ側の追加の準備処理は不要です。E2E では入力可能な状態を待ち、クライアントスクリプトの読み込みが遅れる場合も検証します。

認証リンクが現在の完全な URL を指す場合、AuthPanel は再ナビゲーションせずに画面だけを切り替え、ログインに戻った直後の入力を保持します。パス、クエリー、hash が異なる場合はアプリのルーターに任せます。Ctrl/Cmd などの修飾キーを使ったクリックはブラウザーの動作を維持します。

`createSensitiveActions` は標準 actions の `publicConfig()` で操作前に DB 規則を更新できます。`SensitiveOperationsForm` は行入力・重複除去・検証・エラー表示を共通化します。`operations` と HaiResult を返す非同期 `onsubmit(operations)` を渡し、成功時のみ `ondone` を呼びます。DB の追加を空にしてもファイルの規則は解除しません。

期限切れの画面内復帰は `createSessionRecovery()` と `SessionRecoveryDialog` を使います。公開設定と元の `{ id, username }` を configure し、`recovery.recover` を Kit/API client の `recoverSession` に渡します。ダイアログに同じ controller と標準 actions を渡し、破棄時に `cancel()` します。UI にパスワードや業務要求を保存しません。`expectedUserId` は発行前に元の本人を検証し、通常の CAPTCHA・ロック・アクセス・改密方針を適用します。取消は入力を保持し、結果不明の通信障害では書込を再送しません。再読込や終了で失われたメモリの入力は復元できません。

`createSensitiveActions(actions)` はKit/API clientの認証アクションを受け取り、ログイン済み利用者の確認・取消・再試行・重複送信・遅延応答を共通処理します。アプリのルートレイアウトごとに生成し、`configure(公開設定)` で更新、破棄時は `cancel()` を呼びます。`authorize(operation)` は確認不要ならundefined、取消/処理中ならnull、成功なら当該操作の証明を返します。取消時は業務リクエストを送らず、証明は対象リクエストにのみ渡します。共有ヘッダーや永続ストレージには保存しません。`ReauthenticationDialog` に `open/loading/error/submit/cancel` を接続します。確認は権限を増やしません。`Input` の `datetime-local` はブラウザーのローカル時刻のため、サービスで明確なタイムスタンプへ変換して送信します。

```svelte
<!-- actionsはKit/API clientの認証アクション、policyはIAMの公開再認証設定です。 -->
<script lang='ts'>
  import type { SensitiveActionsOptions } from '@h-ai/ui'
  import { createSensitiveActions, ReauthenticationDialog } from '@h-ai/ui'

  const { actions, policy }: { actions: SensitiveActionsOptions, policy: { enabled: boolean, operations: string[] } } = $props()
  const confirmation = createSensitiveActions(actions)
  $effect(() => {
    confirmation.configure(policy)
    return () => confirmation.cancel()
  })
// 業務操作でconfirmation.authorize(operation)を待ち、nullなら中止します。
</script>
<ReauthenticationDialog
  open={confirmation.open}
  loading={confirmation.loading}
  error={confirmation.error}
  onsubmit={password => confirmation.submit(password)}
  onclose={() => confirmation.cancel()}
/>
```

[完整 IAM 配置 / IAM configuration](../iam/README.ja.md)

### 初回ガイドとヘルプセンター

`@h-ai/ui/guide` から `createGuide`、`GuideHost`、`HelpCenter` をインポートします。init/close は不要です。ガイド開始時にエンジンを読み込み、既存テーマと中国語・英語・日本語の共通文言を使用します。業務内容はアプリの翻訳関数を使います。

同じ入口の `resolveGuideText(text?)` は文字列や i18n コールバックを評価します。ホストコンポーネントは文言を自動で解析します。

レイアウト内でコントローラーを作成し、id/title/steps と任意の route/version を登録します。`<GuideHost {guide} {locale} scope={user.id} autoStart='overview' />` を配置し、対象コンポーネントに data-guide を付けます。SPA は既存の NavAdapter を提供してください。

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

start(id) は Promise<boolean> を返し、手動で再表示できます。失敗時は false と error を設定します。startIfNeeded(id) は初回案内の有無を boolean で返します。openHelp(articleId?) は検索付き Markdown ヘルプを開き、stop() は完了として記録せず終了し、reset(id) は現在のユーザーの状態を削除します。

閉じるボタン、Escape、オーバーレイのクリックは、最初の位置決めフレームが完了する前でも待機と `busy` 状態を解除します。開始中の `start()` は false を返し、完了として記録しません。

保存先は cookie（既定）、localStorage、memory です。保存が制限された環境ではインスタンス内のメモリーに戻ります。ユーザーとバージョンごとに状態を分け、後で表示は一日延期、Cookie は一年保存します。既定のページ遷移は短期 sessionStorage 記録で移動先から開始します。

文言は `() => m.key()` で遅延評価し、現在の locale を渡します。説明はプレーンテキスト、ヘルプは安全な MarkdownRenderer を使用し、生 HTML を無効にします。要素の待機は既定で 3000ms。before(signal) でタブ等を準備し、optional の要素のみ省略できます。必要な要素がなければ終了し、アンマウント時に処理を解除します。SSR ユーザー間でコントローラーを共有しないでください。

HelpCenter は articles、任意の tours、locale、selectedId、onstart で独立ページにも配置できます。admin-console と CLI fullstack Web/App/Desktop は初回案内、ヘルプ、プロフィールガイドを標準搭載します。[詳細ガイド](../cli/templates/skills/hai-ui/guide.md)を参照してください。

### その他のエクスポート

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

規約は入力を保持したまま Modal で表示します。ページは iframe 埋め込みを許可し、スクリプトを無効化して別ウィンドウ表示も用意します。LoginForm/RegisterForm は `header/extraFields/footer`、AuthPanel は `loginHeader/loginFields/loginFooter` と `registerHeader/registerFields/registerFooter` を提供し、既定ナビゲーションを保持します。追加フィールドはアプリ状態と独自 actions で処理し、IAM に自動送信しません。拡張ボタンは `type="button"` を指定します。

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


コンポーネントのサブパスは package.exports に明記した barrel（例: `@h-ai/ui/components/primitives/index`）に限定します。内部実装やストレージ補助関数は非公開で、ホストのクリップボード登録は引き続き公開します。

### リクエスト言語の分離

Node リクエストと SSR は `core.i18n.runWithLocale(locale, () => handleRequest())` で囲みます。SvelteKit は `kit.i18n.runWithLocale(locale, () => resolve(event))` を使えます。serv はリクエストヘッダーから自動設定します。非同期の子処理も言語を継承し、明示的な `MessageOptions.locale`、リクエスト言語、起動時の既定値の順で優先します。コンテキスト内の `setGlobalLocale` はそのリクエストだけを変更します。コンテキスト外の設定は起動時に限定し、リクエスト hook から呼びません。

ブラウザーはアプリ全体の `setGlobalLocale` / `createLocaleStore` を使います。SSR の UI store 初期化と setter は自身の状態のみ変更し、メッセージはリクエストコンテキストを参照します。`runWithLocale` は Node 入口専用です。

## 入力制約と HTTP 機能

キーは UTF-8 で最大 1024 バイトで、絶対パス、バックスラッシュ、制御文字、ドットセグメントを拒否します。公開 HTTP 一括削除は一度に 1–1000 件です。共通規則はブラウザー対応の `@h-ai/storage/schemas` から参照できます。署名有効期限は整数 1–604800 秒（Node 既定 3600、HTTP 既定 900）。アップロード署名の入力は key/contentType/expiresIn のみで、contentLength/maxSize/metadata/checksum は未対応です。不正入力は HTTP 400、typed client では VALIDATION_FAILED です。FileUpload の制限は選択時の補助であり、実際のオブジェクトはサーバーで検証してください。Node のストリーム/checksum/条件付き書き込みには既定の HTTP エンドポイントがありません。[機能と認可の対応表（中国語）](../storage/README.md#存储输入约束与跨端能力)を参照してください。

## コンパクトな作業領域と折りたたみ式の絞り込み

`WorkspaceLayout` はコンパクトなナビゲーション、12/16px の余白を持つ本文、任意のフッターを統一します。フッターを省略すると高さを確保しません。title はナビゲーションのページ名、leading/actions/footer は snippet です。data-* は本文の main に渡します。親レイアウトから残りの高さと min-height: 0 を引き継いでください。

同名の `PageHeader` は重複する見出しを省略し、説明と操作を保持します。`SettingsLayout` も同じ動作です。作業領域内の `CrudPage` は既定でナビゲーションの見出しだけを表示し、操作をツールバーに残します。単独利用時は見出しを表示し、showHeader で明示的に変更できます。

`FilterBar` は leading と actions を常に表示し、children を既定で折りたたみます。bind:expanded は開閉、activeCount は適用中の件数、onreset は3言語対応のリセットボタンです。折りたたんでも入力を保持し、条件の初期化と問い合わせは業務側のコールバックが担当します。`TableToolbar` は同じレイアウトとネイティブ検索フォームを提供し、`CrudFilterBar` もその実装を共有します。`onsearch` は現在の検索・条件を送信し、`onfilterchange` は編集中の変更だけを通知します。`onreset`（TableToolbar は `onclearfilters`）で適用済み条件を初期化して再検索します。旧 `toolbarStyle` と並べ替えポップアップ・属性は削除され、DataTable の `sortKey`、`sortDir`、`onsort` を使用します。 展開した条件はコンテナ幅に応じて1/2/4/6列となり、横20px・縦16pxの間隔でラベルと同じ高さの入力欄を揃えます。日付範囲は2列を占め、狭い画面では行全体に配置します。

例の m、statusOptions、clearFilters、loadRows は業務アプリが提供します。リセット時は検索語と全条件を初期化してください。

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

## デザインと操作の検証

画面設計は [hai-ui-design](../cli/templates/skills/hai-ui-design/SKILL.md)、実装は [hai-ui](../cli/templates/skills/hai-ui/SKILL.md)、実画面の確認は [hai-ui-review](../cli/templates/skills/hai-ui-review/SKILL.md) を参照してください。[共通設計指針](../../.agents/instructions/ui-design.md) も利用できます。

Tabs は方向キー・Home/End、無効項目のスキップと単一の Tab 入口に対応します。表は並べ替え・読み込み状態と行のキーボード操作を提供します。ページ切り替えのラベルは言語に従い、外部ページ変更を入力欄に同期します。展開した条件は文書のフォーカス順序に従い、表示切り替えの選択状態を提供します。Empty/Alert は長文を折り返します。theme.css は共通 tokens を読み込み、global.css は動きを減らす設定に対応します。業務側で検索、並べ替え、ページ切り替えと復旧処理を接続してください。

## エラー表示とログの関連付け

HTTP エラーはローカライズ済みの安全な表示に `(traceId: …)` を付け、同じ ID を error.traceId と X-Trace-Id に返します。requestId を traceId として共有し、ブラウザーとサーバーのログを関連付けます。脱機密化した例外・スタック・操作情報はログに残し、内部 cause/ext は公開しません。項目検証は翻訳済みの項目名とメッセージだけを返します。

HTTP/UI 境界には core.error.toPublic(error, traceId?)、再翻訳後の表示には core.error.formatMessage(error) を使い、ID を重複追加しません。ログには完全な Error を渡してください。DB ログにはドライバーコード、脱機密化したメッセージ・スタック、表・列を残し、SQL 本文、バインド値と接続認証情報を記録しません。

## 任意の対話チャレンジ

AuthPanel は config.captcha.enabled の場合 actions.createCaptcha で自己ホスト ALTCHA を自動生成・非同期求解し、login/register/sendOtp/passwordReset/renewPassword 用の単用証明を送信します。無効時は求解器を読み込みません。createAuthActions は対応済みで、独自動作は captcha を保持し、不足時は通過しません。証明は現在のメモリ内だけに保持し、サーバーで必ず検証・消費します。

方針・既定値・復旧範囲は次を参照： [IAM](../iam/README.ja.md)。

## 開発とテスト

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## ライセンス

Apache-2.0
