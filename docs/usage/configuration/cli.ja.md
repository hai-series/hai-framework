# @h-ai/cli 設定

[原文（中国語）](cli.md) · [データ構造](../data/cli.ja.md) · [API リファレンス](../function/cli.ja.md)

ビルドとデプロイの既定値を `hai.json` に設定します。コマンドが対応するオプションで上書きできます。非公開の上書きは dotenv のローカルファイルに置きます。

## 設定例

```json
{
  "build": {
    "images": [{ "name": "serv", "context": ".", "dockerfile": "images/serv.Dockerfile", "containerPort": 3000 }],
    "sources": { "image": { "type": "official" }, "npm": { "type": "official" } },
    "proxy": { "mode": "inherit" }
  }
}
```

### モバイルとデスクトップの工程を指定する

ルートの `hai.json` の例です。それぞれ Capacitor または Tauri 設定を持つ既存の工程を指定します。パスを書いても工程は作成されません。該当するビルド対象を選んだ際に使用されます。

```json
{
  "build": {
    "app": ["apps/orders-app"],
    "desktop": ["apps/orders-desktop"]
  }
}
```

### コンテナのビルドで社内 npm レジストリを使う

Dockerfile は実際の工程に合わせます。コンテナ構築中の npm ダウンロードを社内レジストリへ向け、プロキシを無効にします。開発マシン全体の npm 設定は変えません。ビルド環境から接続できる URL を使い、認証情報は URL に含めません。

```json
{
  "build": {
    "images": [{ "name": "serv", "context": ".", "dockerfile": "images/serv.Dockerfile", "containerPort": 3000 }],
    "sources": { "npm": { "type": "custom", "registry": "https://npm.example.com/" } },
    "proxy": { "mode": "none" }
  }
}
```

<a id="haijson"></a>

## `hai.json` の項目

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `build.images` | 必須 | コンテナイメージの作成時に必須。`name` は重複しない `serv` または `web`。`dockerfile` は必須、`context` は既定で `.`、`containerPort` は任意。 |
| `build.app`, `build.desktop` | 省略可 | Capacitor と Tauri のネイティブプロジェクト一覧。 |
| `build.sources.image.type`, `build.sources.npm.type` | `official` | official、cn、custom から選択。custom ではそれぞれ `registries` または `registry` が必要。 |
| `build.proxy.mode`, `url`, `bypass` | `inherit` | 環境変数を継承するか system/custom/none を指定。custom で URL が必要。bypass は任意。 |
| `deploy` | `deploy.environment` | 対象と環境を選択。[デプロイ設定](deploy.ja.md)を参照。 |
| `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` | 省略可 | 取得用のプロキシ設定を継承。小文字の名前も使用可能。 |
| `PUBLIC_*`, `VITE_*`, `.env.<mode>.local`, `.env.local` | 省略可 | 前二者はブラウザーに公開され得る。認証情報はサーバーの非公開変数に置く。 |
