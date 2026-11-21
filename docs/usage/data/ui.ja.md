# @h-ai/ui データ構造

[原文（中国語）](ui.md) · [設定](../configuration/ui.ja.md) · [API リファレンス](../function/ui.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### 選んだテーマを記憶

対応する構造：`theme`。

次回も選択したテーマを使うために保存します。

```json
"dark"
```

dark は深色の指定で、localStorage に期限なしで保存し、対応 CSS も必要です。

### 選んだ言語を記憶

対応する構造：`hai-locale`。

再表示時に保存した言語を選びます。

```json
"zh-CN"
```

zh-CN は簡体中国語で、翻訳自体はアプリに必要です。

### ガイド完了を記憶

対応する構造：`hai-guide:orders:intro`。

完了済みの案内を毎回出さないための値です。

```json
{
  "version": 1,
  "status": "completed",
  "updatedAt": 1794873600000
}
```

orders の intro 第1版が完了しています。既定は Cookie 保存で、版を変えると再表示できます。updatedAt は完了状態の更新時刻で、Unix ミリ秒です。

### 遷移後にガイドを開始する

対応する構造：`hai-guide-pending`。

遷移前の開始予定を一時保存し、移動先で確認します。

```json
{
  "id": "intro",
  "scope": "orders",
  "route": "/orders",
  "createdAt": 1794873600000
}
```

5分以内かつ範囲・経路が一致すれば intro を開始し、完了記録ではありません。

## 項目・保存・削除のリファレンス

UI は入力中の状態をコンポーネントに保持します。フォームの送信、ツール、成果物の永続化・認可・競合検知はホストで管理します。SSR ではリクエストごとに状態を分離します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `theme` | localStorage のテーマ ID。独自の起動処理は `themeId`、任意の色と言語を JSON で保持できる。設定がなければ `light`。 |
| `hai-locale` | 保存された言語。`persistKey` でキー名を変更。未保存時はアプリとブラウザーの設定に従う。 |
| `<persistKey>:<scope>:<id>` | アプリのスコープとツアーごとの進捗。既定のキーは `hai-guide`、方式は Cookie。 |
| `<persistKey>-pending` | 画面移動後にガイドを再開するための sessionStorage の記録。 |
| Component preferences / コンポーネント設定 | 列幅などの設定に使うアプリ指定キー。保存が使えない場合はメモリーで保持。 |

ArtifactWorkspace は下書き、履歴一覧、競合をインスタンスに保持します。ToolWorkspace はフォーム、ポーリングのタイマー、中断シグナルを保持します。版、実行の控えと状態はホストが管理します。
