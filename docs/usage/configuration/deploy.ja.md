# @h-ai/deploy 設定

<!-- translation: partial -->

[原文（中国語）](deploy.md) · [データ構造](../data/deploy.ja.md) · [API リファレンス](../function/deploy.ja.md)

`hai.json.deploy` にデプロイ設定を書き、対象環境ごとに上書きを選びます。認証情報は公開アプリファイルの外に置きます。

## 設定例

```yaml schema=@h-ai/deploy:DeployConfigSchema
provider:
  type: docker-ssh
  ssh:
    host: staging.example.com
    username: deployer
  expose:
    hostPort: 8080
```

### コンテナの 3000 番をホストの 8080 番に公開する

ルートの `hai.json` の外側の構造も含めた例です。配備先にコンテナ実行環境があり、配備用アカウントが操作できる必要があります。SSH 秘密鍵は配備マシンの非公開環境から渡します。`expose` は入口のポート設定で、業務 API の認証を解除するものではありません。

```json
{
  "deploy": {
    "environment": "staging",
    "provider": {
      "type": "docker-ssh",
      "ssh": { "host": "staging.example.com", "username": "deployer" },
      "expose": { "hostPort": 8080 }
    }
  }
}
```

### 配備に使う環境ファイルを選ぶ

`environment` を `prod` にすると、CLI は prod モードの環境ファイルを読み、非公開の値は `.env.prod.local` に置けます。ホストとアカウントは例です。環境名を変えても接続先は自動で修正されないため、実行前に実際の配備先を確認します。

```json
{
  "deploy": {
    "environment": "prod",
    "provider": {
      "type": "docker-ssh",
      "ssh": { "host": "production.example.com", "username": "deployer" },
      "expose": { "hostPort": 8080 }
    }
  }
}
```

## 設定一覧


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
