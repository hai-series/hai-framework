# @h-ai/cli 設定

[原文（中国語）](cli.md) · [データ構造](../data/cli.ja.md) · [API リファレンス](../function/cli.ja.md)

ビルドとデプロイの既定値を `hai.json` に設定します。コマンドが対応するオプションで上書きできます。非公開の上書きは dotenv のローカルファイルに置きます。

<a id="haijson"></a>

## `hai.json` の項目

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `build.images` | 必須 | コンテナイメージの作成時に必須。`name` は重複しない `serv` または `web`。`dockerfile` は必須、`context` は既定で `.`、`containerPort` は任意。 |
| `build.app`, `build.desktop` | 省略可 | Capacitor と Tauri のネイティブプロジェクト一覧。 |
| `build.sources.image.type`, `build.sources.npm.type` | `official` | official、cn、custom から選択。custom ではそれぞれ `registries` または `registry` が必要。 |
| `build.proxy.mode`, `url`, `bypass` | `inherit` | 環境変数を継承するか system/custom/none を指定。custom で URL が必要。bypass は任意。 |
| `deploy`, `hai deploy --env` | `deploy.environment` | 対象と環境を選択。[デプロイ設定](deploy.ja.md)を参照。 |
| `--yes` | 省略可 | 取得元の選択を省略。設定がなければ公式を使用。 |
| `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` | 省略可 | 取得用のプロキシ設定を継承。小文字の名前も使用可能。 |
| `HAI_BUILD_ID`, `HAI_BUILD_COMMIT` | CLI | 子プロセスへ渡すビルド ID とコミット。 |
| `PUBLIC_*`, `VITE_*`, `.env.<mode>.local`, `.env.local` | 省略可 | 前二者はブラウザーに公開され得る。認証情報はサーバーの非公開変数に置く。 |
