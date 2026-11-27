# @h-ai/tools 設定

<a id="h-aitools-ファイル設定"></a>

[简体中文](tools.md) · [English](tools.en.md)

[設定一覧](README.ja.md) · [API リファレンス](../function/tools.ja.md) · [データ構造](../data/tools.ja.md)

<a id="configuration-fields"></a>

## 設定の読み込み

アプリが Tools のファクトリーにオプションを直接渡します。`tools.define()` で入力 Schema、処理関数、タイムアウトを設定し、`tools.createRegistry()` でレジストリの `authorize` を指定します。成果物ツールには信頼済みの主体とホストのファイル操作を渡します。 [呼び出し引数](../function/tools.ja.md#call-options) · [成果物の利用例](../function/tools.ja.md#artifact-example)

アプリは独自の設定からオプションを取得し、通常の読み込み手順で反映できます。永続実行、データベース、コンテナーの対応付けはホストで構成します。

成果物ファクトリーに正の整数 `maxArtifactBytes` を渡すと、作成・編集・読み取り時の UTF-8 本文の上限を設定できます。既定値は 1,048,576 バイトです。 [設定とページ単位の読み取り](../function/tools.ja.md#artifact-byte-limit)

<a id="local-service"></a>
<a id="job-environments"></a>

永続サービスの使用範囲とコンテナー環境は [Tools Runner の設定](tools-runner.ja.md) を参照してください。
