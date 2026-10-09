# @h-ai/deploy

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

自動デプロイモジュールです。SvelteKit アプリをクラウド基盤の作成とともに Vercel へ展開する方式と、コンテナー化して任意の Linux ホストへ SSH で展開する方式（docker-ssh）に対応します。

## 対応デプロイ方式

| Provider     | 展開先              | 説明                                                    |
| ------------ | ------------------- | ------------------------------------------------------- |
| `vercel`     | Vercel              | SvelteKit + adapter-vercel、クラウド Provisioner と連携 |
| `docker-ssh` | 任意の Linux ホスト | SvelteKit + adapter-node、コンテナー化して SSH で展開   |

## 対応クラウドサービス（Provisioner）

| サービス種別 | Provisioner   | 説明                           |
| ------------ | ------------- | ------------------------------ |
| データベース | Neon          | PostgreSQL Serverless          |
| キャッシュ   | Upstash       | Redis TCP + TLS                |
| ストレージ   | Cloudflare R2 | S3 互換オブジェクトストレージ  |
| メール       | Resend        | SMTP（検証済みドメインが必要） |
| SMS          | Alibaba Cloud | Alibaba Cloud SMS              |

## クイックスタート

```typescript
import { deploy } from '@h-ai/deploy'

// 可选：从 ~/.hai/credentials.yml 注入 HAI_DEPLOY_* 环境变量
deploy.credentials.load()

// 初始化
await deploy.init({
  provider: { type: 'vercel', token: 'vel_xxx' },
  services: {
    db: { provisioner: 'neon', apiKey: 'neon_xxx' },
    cache: { provisioner: 'upstash', email: 'a@b.com', apiKey: 'up_xxx' },
  },
})

// 扫描应用依赖
const scan = await deploy.scan('./apps/my-app')

// 开通基础设施
const provisions = await deploy.provisionAll('my-app')

// 完整部署
const result = await deploy.deployApp('./apps/my-app')

await deploy.close()
```

## 設定

Git に保存できる設定は `config/_deploy.yml`、秘密情報は `~/.hai/credentials.yml` で管理します：

```yaml
# config/_deploy.yml
provider:
  type: vercel
  token: ${HAI_DEPLOY_VERCEL_TOKEN}

services:
  db:
    provisioner: neon
    apiKey: ${HAI_DEPLOY_NEON_API_KEY}
  cache:
    provisioner: upstash
    email: ${HAI_DEPLOY_UPSTASH_EMAIL}
    apiKey: ${HAI_DEPLOY_UPSTASH_API_KEY}
```

ここでの変数は `deploy.credentials` が管理する明示的な特殊マッピングです。YAML パスから生成する
`HAI_DEPLOY_PROVIDER_TOKEN` なども指定した場合、規約に沿う変数が優先されます。

スクリプト・CLI で認証情報ファイルを明示的に管理するには `deploy.credentials.*` を使います：

```typescript
deploy.credentials.load()
deploy.credentials.save('HAI_DEPLOY_VERCEL_TOKEN', 'vel_xxx')
deploy.credentials.saveAll({
  HAI_DEPLOY_NEON_API_KEY: 'neon_xxx',
})
```

> `deploy.scan()` と `deploy.credentials.*()` はローカルファイルシステムの機能で、`deploy.init()` に依存しません。

## docker-ssh デプロイ

アプリをコンテナー化して SSH で任意の Linux ホストへ展開します。クラウドアカウントは不要です。

### 前提条件

- **ローカル**：docker または podman をインストール（`auto` は podman を優先）。
- **リモート**：SSH 接続可能、docker/podman と compose が導入済み、ログインユーザーがコンテナーを実行可能。
- **アプリ**：SvelteKit に `@sveltejs/adapter-node` を使用（付属 `Dockerfile` は対応済み）。不足時は `ADAPTER_MISSING`。

### 使用手順

1. SSH 秘密鍵のパスをリポジトリー外の認証情報ファイルに保存します。`~/.hai/credentials.yml` を編集するか API を使います：

```typescript
deploy.credentials.save('HAI_DEPLOY_SSH_KEY', '~/.ssh/hai_deploy')
```

2. `config/_deploy.yml` に対象ホストを定義します：

```yaml
provider:
  type: docker-ssh
  ssh:
    host: 10.0.0.20 # 主机 IP 或 ~/.ssh/config 别名
    port: 22
    username: deploy
    identityFile: ${HAI_DEPLOY_SSH_KEY} # 私钥文件路径，省略则用 ssh-agent
  remote:
    baseDir: /opt/hai/apps # 远程部署根目录
    runtime: auto # 远程运行时；auto 优先 podman，其次 docker
  expose:
    type: port
    containerPort: 3000 # 容器内端口（adapter-node 默认 3000）
    hostPort: 18080 # 宿主机端口 → 访问地址 http://10.0.0.20:18080

container:
  runtime: auto # 本地构建运行时（可选）

services: {} # 启用的服务会自动生成 compose sidecar，见下
```

3. CLI または API で展開・検証します（動作は同じ）：

```bash
hai deploy            # 读取 config/_deploy.yml，输出访问地址
```

```typescript
import { deploy } from '@h-ai/deploy'

deploy.credentials.load() // 注入 HAI_DEPLOY_* 环境变量
await deploy.init(dockerSshConfig)
const result = await deploy.deployApp('./apps/my-app')
if (result.success) {
  result.data.url // http://<host>:<hostPort>
  result.data.healthCheck // 'passed'（HTTP 探测成功）
}
await deploy.close()
```

### 処理の流れ

docker-ssh の `deployApp()` は次の順で処理します：

1. **走査**：`package.json` と `config/*.yml` から `@sveltejs/adapter-node`、必要なサービス、バックエンド種別を判定。
2. **ローカルビルド**：プロジェクトの `Dockerfile` で `hai-<app>:<deploymentId>` を作成（podman は `--format docker --jobs=1` を追加）。
3. **出力**：`docker/podman save` で tar に保存。
4. **事前確認**：SSH 接続とリモートの `docker/podman version` / `compose version` を確認。
5. **転送・読み込み**：`scp` で tar を転送し、リモートで `load` 後、誤った registry 取得を防ぐため `localhost/` タグを付与。
6. **実行定義**：走査結果から `compose.yml`（app + sidecar）と `.env.runtime`（`HAI_*` 上書き・認証情報）を生成し、`<baseDir>/<app>/` に転送。`.env.runtime` は `600` に設定。
7. **起動**：固定プロジェクト名 `hai-<app>` で `compose up -d`。再展開は冪等。
8. **ヘルスチェック**：`http://<host>:<hostPort>/` を監視し、200 応答でのみ `ready` と判定。

> イメージ、`compose.yml`、`.env.runtime` はアプリの `.hai/deploy/` に保存し、テンプレートの `.gitignore` で除外済みです。

### 機能に応じた compose sidecar

`deploy.scan()` は必要なサービスと**実際のバックエンド種別**（`_db.yml` / `_vecdb.yml` などの `type`）を読み、対応する sidecar と `HAI_*` 上書き変数を生成します：

| 検出サービス | バックエンド（`type`） | 追加 sidecar                             | 注入する変数  |
| ------------ | ---------------------- | ---------------------------------------- | ------------- |
| `db`         | `postgresql`           | `postgres:16-alpine`                     | `HAI_DB`      |
| `db`         | `mysql`                | `mysql:8.4`                              | `HAI_DB`      |
| `db`         | `sqlite`               | なし（`/app/data` ボリュームをマウント） | —             |
| `cache`      | `redis`                | `redis:7-alpine`                         | `HAI_CACHE`   |
| `storage`    | `s3`                   | `minio` + バケット初期化                 | `HAI_STORAGE` |
| `vecdb`      | `qdrant`               | `qdrant/qdrant`                          | `HAI_VECDB`   |
| `vecdb`      | `pgvector`             | `pgvector/pgvector`                      | `HAI_VECDB`   |
| `vecdb`      | `chroma`               | `chromadb/chroma`                        | `HAI_VECDB`   |
| `vecdb`      | `lancedb`              | なし（`/app/data` ボリュームをマウント） | —             |

- `memory` の `cache` と外部 API の `reach`（メール・SMS）は sidecar を生成しません。
- 同じサービスにクラウド Provisioner がある場合（Neon の `HAI_DB` など）、クラウドを優先し sidecar を重複作成しません。
- sidecar のパスワードなどはリモートの `.env.runtime`（`600`）のみに保存し、`compose.yml` には含めません。

> セキュリティ：`identityFile` は秘密鍵の**パス**で、内容ではありません。`strictHostKeyChecking: true`（既定）は
> accept-new を使い、初回は信頼し、鍵変更は拒否します。未知のホストには先に手動で `ssh` 接続できます。

## エラー処理

```typescript
import { HaiDeployError } from '@h-ai/deploy'

const result = await deploy.deployApp('./apps/my-app')
if (!result.success) {
  switch (result.error.code) {
    case HaiDeployError.AUTH_FAILED.code:
      // Vercel Token 无效
      break
    case HaiDeployError.BUILD_FAILED.code:
      // 构建失败
      break
  }
}
```

主なエラーコード：

| エラーコード                      | code             | 説明                 |
| --------------------------------- | ---------------- | -------------------- |
| `HaiDeployError.DEPLOY_FAILED`    | `hai:deploy:001` | デプロイに失敗       |
| `HaiDeployError.BUILD_FAILED`     | `hai:deploy:003` | ビルドに失敗         |
| `HaiDeployError.AUTH_FAILED`      | `hai:deploy:006` | 認証に失敗           |
| `HaiDeployError.PROVISION_FAILED` | `hai:deploy:007` | リソースの作成に失敗 |
| `HaiDeployError.NOT_INITIALIZED`  | `hai:deploy:010` | 未初期化             |
| `HaiDeployError.ENV_VAR_FAILED`   | `hai:deploy:011` | 環境変数の処理に失敗 |

docker-ssh 専用エラーコード：

| エラーコード                                 | code             | 説明                               |
| -------------------------------------------- | ---------------- | ---------------------------------- |
| `HaiDeployError.CONTAINER_RUNTIME_NOT_FOUND` | `hai:deploy:015` | コンテナーランタイムが見つからない |
| `HaiDeployError.CONTAINER_BUILD_FAILED`      | `hai:deploy:016` | イメージのビルドに失敗             |
| `HaiDeployError.REMOTE_CONNECT_FAILED`       | `hai:deploy:017` | リモート接続に失敗                 |
| `HaiDeployError.REMOTE_COMMAND_FAILED`       | `hai:deploy:018` | リモートコマンドに失敗             |
| `HaiDeployError.IMAGE_TRANSFER_FAILED`       | `hai:deploy:019` | イメージ転送に失敗                 |
| `HaiDeployError.HEALTH_CHECK_FAILED`         | `hai:deploy:020` | ヘルスチェックに失敗               |

## テスト

```bash
pnpm --filter @h-ai/deploy test
```

## License

Apache-2.0

クラウド設定の利用：Neon は HAI_DB（PostgreSQL JSON）、Upstash は HAI_CACHE（Redis rediss URL JSON）、R2 は HAI_STORAGE（フラットな S3 JSON）を出力します。メール・SMS は HAI_REACH_PROVIDERS を出力し、deployApp が両チャネルと YAML のメッセージテンプレートを統合して元の providers 配列を置換します。Core はオブジェクト・配列全体の上書きをサポートし、親ノードを末端より優先して Schema 検証を維持します。ビルド子プロセスと対象環境は同じ値を使います。R2 は既存の S3 accessKeyId/secretAccessKey、Resend は検証済みドメインの from、Alibaba Cloud は承認済み signName・テンプレートが必要です。アプリは対応する `_db.yml` / `_cache.yml` / `_storage.yml` / `_reach.yml` を起動時に読み込み、ネットワーククライアントには Node が必要です。

設定の参照：[Upstash TLS](https://upstash.com/docs/redis/features/security)、[Resend SMTP](https://resend.com/docs/send-with-smtp)。決定的な検証では実際のアプリを生成して Core・各モジュールの Schema を確認します。クラウドリソースの作成やメール・SMS 送信は行わず、クラウドの読み書き検証済みとは言えません。

デプロイ失敗からの復旧：`ProvisionResult.resourceStatus` は created/reused を示します。`getDeployRecovery(result.error)` で projectName、stage、platformProjectId、リソース一覧を取得し、unknown は結果不明なので先にサービス側の管理画面で確認します。失敗リソースの ID が返った場合は保持します。復旧情報に envVars・元の例外・接続認証情報は含まれず、CLI が一覧と提案を表示します。同名の再試行は既存リソースを再利用し、自動削除しません。新規作成分も未使用を人が確認した後にのみ削除します。
