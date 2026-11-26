# @h-ai/ui データ構造

[简体中文](ui.md) · [English](ui.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/ui.ja.md) · [コンポーネントと利用例](../function/ui.ja.md#component-catalog)

ページを開き直すと、ブラウザーはテーマ、言語、ガイドの進捗、ドロワーの幅を復元できます。UI はデータベースのテーブル、Redis キー、業務ファイルを作成しません。検索、アップロード、認可、業務データの保存はホストアプリが管理します。

<a id="browser-storage"></a>

## ブラウザーのストレージ

| キー | 保存先と値 | 読み書きと有効期間 |
| --- | --- | --- |
| `theme` | localStorage のテーマ ID 文字列。例は `dark`。 | `ui.applyTheme(id)` が既定で保存し、`ui.getSavedTheme(fallback)` が読みます。既定の代替値は `light` です。自動失効はありません。 |
| ホストが指定する `storageKey` | localStorage の JSON。必須の `themeId` と、任意の色およびホストが命名する言語フィールドを含みます。 | `ui.createThemeBootstrapScript(options)` の HTML シェル用スクリプトが読み込み、値を補正します。画面で選択した値との同期はホストが行います。自動失効はありません。 |
| `hai-locale` | localStorage の言語コード。`createLocaleStore({ persistKey })` で変更できます。 | ブラウザーで初期化時に読み、ストアの `set(locale)` で保存します。SSR のストアはアクセスしません。自動失効はありません。 |
| `<persistKey>:<scope>:<id>` | ガイド進捗の JSON。既定は Cookie で、localStorage とコントローラーのメモリーも選べます。 | 既定の接頭辞は `hai-guide`、スコープは `anonymous`、`id` はガイド ID です。既定の Cookie は1年で失効し、`guide.reset(id)` で該当スコープの進捗を消せます。 |
| `<persistKey>-pending` | sessionStorage に保存されるガイド起動情報の JSON | 別画面への移動前に保存し、再開時に読み取って消去します。5分以内で、スコープと対象のパスが一致すると起動します。 |
| `Drawer.widthStorageKey` または `hai-ui:crud:<resource.name>:drawer-width` | localStorage に格納された幅のピクセル数。十進の文字列です。 | 横から開くドロワーで幅変更を有効にすると読み込み、ドラッグ終了時やキー操作による変更時に保存します。CrudPage は同一リソースの詳細と編集でキーを共有します。自動失効はありません。 |

ブラウザーが保存を拒否しても、テーマとドロワーの幅は開いているページで変更できます。ガイドの進捗はメモリーに保持されます。SSR ではリクエストまたはレイアウトごとに言語とガイドの状態を作り、ブラウザーの設定はクライアントで復元します。

<a id="example-data"></a>

### 選んだテーマを記憶

`ui.applyTheme('dark')` は文字列 `dark` を `theme` に保存します。次回の表示時にレイアウトから読み取れるように、ダークテーマの CSS もビルドに含めます。

HTML シェルで JSON 設定を使う場合は `orders-display` などの専用キーを選びます。以下には独自のテーマ色と名前が `language` の言語フィールドが含まれます。

```json
{ "themeId": "dark", "themeColor": "#5765f0", "language": "en-US" }
```

JSON の起動スクリプトとテーマ ID 文字列の読み書きには別々のキーを使います。`ui.getThemeInitScript()` を使うと `theme` に JSON が保存されるため、レイアウト側も同じ形式で読み書きします。`ui.getSavedTheme` と `ui.applyTheme` を使う場合は、起動スクリプトに専用のキーを指定するか、HTML シェルも同じ文字列形式に合わせます。

### 選んだ言語を記憶

`localeStore.set('ja-JP')` は文字列 `ja-JP` を `hai-locale` または指定したキーに保存します。次回も対応言語に含まれていれば、ブラウザーの優先言語より先に使われます。Paraglide などのアプリ翻訳はアプリが管理します。

### ガイド完了を記憶

キー `hai-guide:orders:intro` は `orders` スコープの `intro` ガイドを指します。この値は第1版の完了を表します。

```json
{ "version": 1, "status": "completed", "updatedAt": 1794873600000 }
```

`status` は `completed`、`dismissed`、`deferred` のいずれかです。完了と非表示は同じバージョンの案内を抑止し、延期は24時間だけ抑止します。`version` を上げると再案内できます。`updatedAt` は Unix 時刻のミリ秒です。

### ページ移動後にガイドを続ける

`hai-guide-pending` は以下の起動要求を一時保存します。スコープが一致し、`/orders` に到達すると、`createdAt`（Unix 時刻のミリ秒）から5分以内か確認します。

```json
{ "id": "intro", "scope": "orders", "route": "/orders", "createdAt": 1794873600000 }
```

### ドロワーの幅を記憶

注文編集のドロワーを480ピクセルにすると、`hai-ui:crud:orders:drawer-width` は文字列 `480` になります。幅はコンポーネントの上下限とビューポートの範囲に収まります。キーを削除するとホストの初期幅を使います。

<a id="runtime-data"></a>

## ホストとコンポーネントの受け渡しデータ

| 公開型 | 作成・使用する処理 | 保持期間 |
| --- | --- | --- |
| `CrudData<T>` | ホストの検索処理または `ui.createCrudController()` から `CrudPage` にデータ、件数、ページ、ページサイズ、確定済みの条件を渡します。 | コンポーネントまたはコントローラーの寿命に従います。業務記録と認可はホストが管理します。 |
| `ArtifactDocument` と `ArtifactSaveRequest` | ホストが版と内容を渡し、UI は保存時に `id`、`baseVersion`、下書きを返します。 | 下書きと競合表示はワークスペースに保持します。永続化、履歴、版の競合検出はホストが管理します。 |
| `ToolRun` | ホストが実行の控えを返し、状態照会に応答します。UI は進捗、結果、成果物を表示します。 | 現在の控え、タイマー、取消シグナルはワークスペースが保持します。実行の永続化、認可、再試行は実行サービスが管理します。 |
| `FeedbackViewActions` | ホストが一覧、会話、添付の操作を渡します。 | 現在の表示は画面内、問題票と会話はサービス側で保持します。 |

たとえば `{ "id": "report-42", "baseVersion": 3, "content": "# Updated report" }` は第3版から下書きを保存する要求です。すでにサーバーが第4版なら、ホストが競合を返し、ワークスペースは下書きを保持します。`{ "id": "run-42", "status": "running", "progress": 0.5 }` は実行中で半分まで完了したことを示します。進捗は0から1の割合で、省略すると進捗率を表示せず処理中であることを示します。[ツールと成果物のワークスペース](../function/ui.ja.md#tool-workspaces)

### 検索結果と受付控え

注文一覧のデータはホストの検索処理が返します。次の例は2ページ目の1件、該当する総件数、適用中の条件を示します。コントローラーは1ページ目から始まり、リソースのページサイズ指定がなければ1ページ10件です。

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
