# @h-ai/ui データ構造

[原文（中国語）](ui.md) · [設定](../configuration/ui.ja.md) · [API リファレンス](../function/ui.ja.md)

UI は入力中の状態をコンポーネントに保持します。フォームの送信、ツール、成果物の永続化・認可・競合検知はホストで管理します。SSR ではリクエストごとに状態を分離します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `theme` | localStorage のテーマ ID。独自の起動処理は `themeId`、任意の色と言語を JSON で保持できる。設定がなければ `light`。 |
| `hai-locale` | 保存された言語。`persistKey` でキー名を変更。未保存時はアプリとブラウザーの設定に従う。 |
| `<persistKey>:<scope>:<id>` | アプリのスコープとツアーごとの進捗。既定のキーは `hai-guide`、方式は Cookie。 |
| `<persistKey>-pending` | 画面移動後にガイドを再開するための sessionStorage の記録。 |
| Component preferences / コンポーネント設定 | 列幅などの設定に使うアプリ指定キー。保存が使えない場合はメモリーで保持。 |

ArtifactWorkspace は下書き、履歴一覧、競合をインスタンスに保持します。ToolWorkspace はフォーム、ポーリングのタイマー、中断シグナルを保持します。版、実行の控えと状態はホストが管理します。
