# @h-ai/deploy

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

自動デプロイモジュールです。SvelteKit アプリをクラウド基盤の作成とともに Vercel へ展開する方式と、コンテナー化して任意の Linux ホストへ SSH で展開する方式（docker-ssh）に対応します。

## 対応デプロイ方式

| Provider     | 展開先              | 説明                                                    |
| ------------ | ------------------- | ------------------------------------------------------- |
| `vercel`     | Vercel              | SvelteKit + adapter-vercel、クラウド Provisioner と連携 |
| `docker-ssh` | 任意の Linux ホスト | SvelteKit + adapter-node / Node サービスを SSH で展開   |

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
const scan = await deploy.scan('./apps/my-app', { environment: 'test' })

// 开通基础设施
const provisions = await deploy.provisionAll('my-app')

// 完整部署
const result = await deploy.deployApp('./apps/my-app', { environment: 'test' })

await deploy.close()
```

## 環境とミドルウェア

`hai deploy --env test` を実行するか、対話端末で最初に環境を入力します。対応する `.env.test` がなければ作成を案内して停止します。環境変数とモジュール依存を解析し、現在のバックエンド・用途・検出元を表示して、既定設定・カスタム接続・変更しないを項目ごとに選択します。変更しないは対象環境に完全な設定がある場合だけ表示され、書き込み・認証・作成を省略します。`--yes` は完全な既存設定を維持し、それ以外は現在のバックエンドの既定値を使います。`--env-dir` で環境ファイルの場所を指定できます。

既定設定は Compose のサービス・ボリュームまたは対応するクラウド Provisioner を作成します。未対応のクラウド接続はカスタム設定を利用します。SQLite/memory/local/disabled の動作は維持されます。公開値は対象環境ファイル、認証情報を含む JSON/URL は `.env.local` に保存し、表示はマスクします。[バックエンドと接続項目](../cli/templates/skills/hai-deploy/middleware.md)を参照してください。

## 設定

Git に保存できる設定は `config/_deploy.yml`、秘密情報は `~/.hai/credentials.yml` で管理します：

```yaml
# config/_deploy.yml
provider:
  type: vercel
  token: ${HAI_DEPLOY_PROVIDER_TOKEN}

services:
  db:
    provisioner: neon
    apiKey: ${HAI_DEPLOY_SERVICES_DB_APIKEY}
  cache:
    provisioner: upstash
    email: ${HAI_DEPLOY_SERVICES_CACHE_EMAIL}
    apiKey: ${HAI_DEPLOY_SERVICES_CACHE_APIKEY}
```

ここでの変数は `deploy.credentials` が管理する明示的な特殊マッピングです。YAML パスから生成する
`HAI_DEPLOY_PROVIDER_TOKEN` なども指定した場合、規約に沿う変数が優先されます。

スクリプト・CLI で認証情報ファイルを明示的に管理するには `deploy.credentials.*` を使います：

```typescript
deploy.credentials.load()
deploy.credentials.save('HAI_DEPLOY_PROVIDER_TOKEN', 'vel_xxx')
deploy.credentials.saveAll({
  HAI_DEPLOY_SERVICES_DB_APIKEY: 'neon_xxx',
})
```

> `deploy.scan()` と `deploy.credentials.*()` はローカルファイルシステムの機能で、`deploy.init()` に依存しません。

`pnpm-lock.yaml` の対象 workspace importer から実行依存と workspace link のみを辿り、開発依存、peer、他アプリの未参照依存を除外します。古い設定ファイルだけではモジュールを有効化しません。lockfile、importer、ノードがなければ `pnpm install` で修復します。デプロイ先ディレクトリーを指定します。package.json、pnpm-workspace.yaml、プロジェクト構成の推測を走査に使いません。`serv` の任意 AI peer によって AI/CUDA を有効化しません。

## docker-ssh デプロイ

アプリをコンテナー化して SSH で任意の Linux ホストへ展開します。クラウドアカウントは不要です。

### 前提条件

- **ローカル**：docker または podman をインストール（`auto` は podman を優先）。
- **リモート**：SSH 接続可能、docker/podman と compose が導入済み、ログインユーザーがコンテナーを実行可能。
- **アプリ**：SvelteKit に `@sveltejs/adapter-node` を使用（付属 `Dockerfile` は対応済み）。不足時は `ADAPTER_MISSING`。

### 使用手順

1. SSH 秘密鍵のパスをリポジトリー外の認証情報ファイルに保存します。`~/.hai/credentials.yml` を編集するか API を使います：

```typescript
deploy.credentials.save('HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE', '~/.ssh/hai_deploy')
```

2. `config/_deploy.yml` に対象ホストを定義します：

```yaml
provider:
  type: docker-ssh
  ssh:
    host: 10.0.0.20 # 主机 IP 或 ~/.ssh/config 别名
    port: 22
    username: deploy
    identityFile: ${HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE} # 私钥文件路径，省略则用 ssh-agent
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
hai deploy --env test # 读取 config/_deploy.yml，输出访问地址
```

```typescript
import { deploy } from '@h-ai/deploy'

deploy.credentials.load() // 注入 HAI_DEPLOY_* 环境变量
await deploy.init(dockerSshConfig)
const result = await deploy.deployApp('./apps/my-app', { environment: 'test' })
if (result.success) {
  result.data.url // http://<host>:<hostPort>
  result.data.healthCheck // 'passed'（HTTP 探测成功）
}
await deploy.close()
```

### 処理の流れ

docker-ssh の `deployApp()` は次の順で処理します：

1. **走査**：対象 importer の `pnpm-lock.yaml` と `config/*.yml` から `@sveltejs/adapter-node`、必要なサービス、バックエンド種別を判定。
2. **ローカルビルド**：プロジェクトの `Dockerfile` で `hai-<app>:<deploymentId>` を作成（podman は `--format docker --jobs=1` を追加）。
3. **出力**：`docker/podman save` で tar に保存。
4. **事前確認**：SSH 接続とリモートの `docker/podman version` / `compose version` を確認。
5. **転送・読み込み**：`scp` で tar を転送し、リモートで `load` 後、誤った registry 取得を防ぐため `localhost/` タグを付与。
6. **実行定義**：走査結果から `compose.yml`（app + sidecar）と `.env.runtime`（`HAI_*` 上書き・認証情報）を生成し、`<baseDir>/<app>/` に転送。`.env.runtime` は `600` に設定。
7. **起動**：`start-<mode>.sh` が `HAI_DEPLOY_ENVIRONMENT`/`HAI_CORE_ENV` を明示して Compose を実行します。環境別のプロジェクト名とボリュームを使い、変更しないサービスは維持します。
8. **ヘルスチェック**：SvelteKit は `/`、Node サービスは `/health` の成功応答を確認します。

> イメージ、`compose.yml`、`.env.runtime` はアプリの `.hai/deploy/<mode>/` に保存し、テンプレートの `.gitignore` で除外済みです。

### 機能に応じた compose sidecar

`deploy.scan()` は必要なサービスと**実際のバックエンド種別**（`_db.yml` / `_vecdb.yml` などの `type`）を読み、対応する sidecar と `HAI_*` 上書き変数を生成します：

| 検出サービス | バックエンド（`type`） | 追加 sidecar                             | 注入する変数                  |
| ------------ | ---------------------- | ---------------------------------------- | ----------------------------- |
| `db`         | `postgresql`           | `postgres:16-alpine`                     | `HAI_DB`                      |
| `db`         | `mysql`                | `mysql:8.4`                              | `HAI_DB`                      |
| `db`         | `sqlite`               | なし（`/app/data` ボリュームをマウント） | —                             |
| `cache`      | `redis`                | `redis:7-alpine`                         | `HAI_CACHE`                   |
| `storage`    | `s3`                   | RustFS / MinIO + バケット初期化                 | `HAI_STORAGE`                 |
| `vecdb`      | `qdrant`               | `qdrant/qdrant`                          | `HAI_VECDB`                   |
| `vecdb`      | `pgvector`             | `pgvector/pgvector`                      | `HAI_VECDB`                   |
| `vecdb`      | `chroma`               | `chromadb/chroma`                        | `HAI_VECDB`                   |
| `ldap`       | `ldap`                 | OpenLDAP                                 | `HAI_IAM_LDAP`                |
| `email`      | `smtp`                 | Mailpit (test capture)                   | `HAI_REACH_PROVIDERS_<index>` |
| `vecdb`      | `lancedb`              | なし（`/app/data` ボリュームをマウント） | —                             |

- memory、無効な LDAP、console は外部サービスを作成しません。local はボリュームを使います。既定 SMTP はテスト受信用です。本番配信にはカスタム SMTP/Resend を利用してください。
- 同じサービスにクラウド Provisioner がある場合（Neon の `HAI_DB` など）、クラウドを優先し sidecar を重複作成しません。
- パスワードは Git 対象外のローカル秘密設定とリモート `.env.runtime`（`600`）に保存し、公開環境ファイルや `compose.yml` に含めません。

> セキュリティ：`identityFile` は秘密鍵の**パス**で、内容ではありません。`strictHostKeyChecking: true`（既定）は
> accept-new を使い、初回は信頼し、鍵変更は拒否します。未知のホストには先に手動で `ssh` 接続できます。

## エラー処理

```typescript
import { HaiDeployError } from '@h-ai/deploy'

const result = await deploy.deployApp('./apps/my-app', { environment: 'test' })
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

`pnpm --filter @h-ai/cli test:deploy-gates` validates current package archives with a generated fullstack project, Podman/SSH, the selected environment, login and repeat deployment. Logs and acceptance artifacts stay in ignored temporary directories.

```bash
pnpm --filter @h-ai/deploy test
```

## License

Apache-2.0

クラウド設定の利用：Neon は HAI_DB（PostgreSQL JSON）、Upstash は HAI_CACHE（Redis rediss URL JSON）、R2 は HAI_STORAGE（フラットな S3 JSON）を出力します。メール・SMS は HAI_REACH_PROVIDERS を出力し、deployApp が両チャネルと YAML のメッセージテンプレートを統合して元の providers 配列を置換します。Core はオブジェクト・配列全体の上書きをサポートし、親ノードを末端より優先して Schema 検証を維持します。ビルド子プロセスと対象環境は同じ値を使います。R2 は既存の S3 accessKeyId/secretAccessKey、Resend は検証済みドメインの from、Alibaba Cloud は承認済み signName・テンプレートが必要です。アプリは対応する `_db.yml` / `_cache.yml` / `_storage.yml` / `_reach.yml` を起動時に読み込み、ネットワーククライアントには Node が必要です。

設定の参照：[Upstash TLS](https://upstash.com/docs/redis/features/security)、[Resend SMTP](https://resend.com/docs/send-with-smtp)。決定的な検証では実際のアプリを生成して Core・各モジュールの Schema を確認します。クラウドリソースの作成やメール・SMS 送信は行わず、クラウドの読み書き検証済みとは言えません。

デプロイ失敗からの復旧：`ProvisionResult.resourceStatus` は created/reused を示します。`getDeployRecovery(result.error)` で projectName、stage、platformProjectId、リソース一覧を取得し、unknown は結果不明なので先にサービス側の管理画面で確認します。失敗リソースの ID が返った場合は保持します。復旧情報に envVars・元の例外・接続認証情報は含まれず、CLI が一覧と提案を表示します。同名の再試行は既存リソースを再利用し、自動削除しません。新規作成分も未使用を人が確認した後にのみ削除します。
