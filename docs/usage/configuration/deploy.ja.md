# @h-ai/deploy 設定

<!-- translation: partial -->

[原文（中国語）](deploy.md) · [データ構造](../data/deploy.ja.md) · [API リファレンス](../function/deploy.ja.md)

`hai.json.deploy` にデプロイ設定を書き、対象環境ごとに上書きを選びます。認証情報は公開アプリファイルの外に置きます。

```yaml schema=@h-ai/deploy:DeployConfigSchema
provider:
  type: docker-ssh
  ssh:
    host: staging.example.com
    username: deployer
  expose:
    hostPort: 8080
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `environment`, `provider.type` | 省略可 | 対象環境と方式（`vercel` または `docker-ssh`）を指定。 |

<a id="provider"></a>

## デプロイ方式

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `provider.token`, `provider.ssh` | バックエンドによる | Vercel のトークン、または SSH のホスト・ユーザー・検証・認証設定。 |
| `provider.remote`, `provider.expose` | バックエンドによる | リモートのリリースディレクトリとコンテナランタイム、ポート対応、HTTPS 設定。 |

<a id="services"></a>

## サービス

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `services.db`, `services.cache`, `services.storage` | 省略可 | 任意のサービス作成設定。有効にした場合にプロバイダーと認証情報を指定。 |

未翻訳：プロバイダー、HTTPS、SSH、ミドルウェアの全設定。[中国語の該当節](deploy.md#configuration-fields)を参照してください。
