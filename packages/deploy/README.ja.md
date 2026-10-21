# @h-ai/deploy

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワーク](../../README.ja.md) · [CLI](../cli/README.ja.md) · [環境とミドルウェア](../cli/templates/skills/hai-deploy/middleware.md)

`@h-ai/cli` の `hai deploy` が利用するデプロイ SDK です。Node.js スクリプトから単独でも利用できます。

## 機能と対象範囲

| デプロイ先   | アプリ                                       | 処理                                                                                   |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `docker-ssh` | Node サービス、adapter-node を使う SvelteKit | ローカルでイメージをビルドし、SSH で転送、Linux の Compose で起動、HTTP ヘルスチェック |
| `vercel`     | adapter-vercel を使う SvelteKit              | ビルド、転送、環境変数設定、結果の待機。インターネット接続が必要                       |

- 対象の `pnpm-lock.yaml` importer から実行依存と workspace link をたどり、開発依存・peer を除外します。アプリ設定でバックエンドを判定し、任意の AI peer だけで AI/CUDA を有効化しません。
- 最初に環境を選び `.env.<mode>` を確認します。各ミドルウェアは既定設定・カスタム接続・変更しないを選択でき、設定済みなら全処理を省略できます。
- Compose は PostgreSQL、MySQL、Redis、RustFS/MinIO、Qdrant、pgvector、Chroma、OpenLDAP、Mailpit に対応します。SQLite、memory、local、LanceDB はそれぞれのローカル保存方式を使います。Mailpit はテストメール捕捉専用です。
- クラウド作成は Neon、Upstash、Cloudflare R2、Resend、Alibaba Cloud SMS に対応します。R2 は既存の S3 鍵、Resend は検証済み送信ドメイン、SMS は承認済み署名・テンプレートが必要です。他はカスタム接続を使います。

**fullstack は一度のコマンドで API と Web を公開します。** deploy と Web を選んだテンプレートはサービス設定に `container.web` を生成します。`hai deploy packages/my-app-serv` が両イメージをビルド・転送し、一つの Compose で起動します。公開ポートは Web に割り当て、内部 API を同一 Origin で代理し、実際の API プレフィックスとページ再読み込みに対応します。Web 未設定時は単一サービスの動作を維持します。ドメイン・TLS 入口は別途準備します。

## コマンドラインでの利用

### 1. インストールと準備

Node は `^22.22.2 || ^24.15.0 || >=26.0.0` が必要です。生成プロジェクトは `pnpm@12.11.2` を固定します。Node 20 / pnpm 9.5.0 は非対応です。Windows PowerShell では `pnpm.cmd` を使います。

生成 workspace のルートでアプリのフレームワークに合う CLI/SDK をインストールし、lockfile を保持します。パッケージ配布元または完全なオフライン依存が必要です。

```powershell
pnpm.cmd add -Dw @h-ai/cli @h-ai/deploy
pnpm.cmd exec hai --help
```

作成時の `--features deploy` はローカル SDK を追加しますが、グローバル `hai` のインストールは行いません。CLI をグローバル導入済みなら `hai deploy` を直接使えます。テンプレートの `pnpm run deploy` はパッケージ作成用で、このコマンドとは異なります。

docker-ssh の前提条件：

- サーバーのアーキテクチャー向け Linux イメージをビルドできるローカル Docker/Podman エンジン。Windows は仮想化/WSL2/VM の準備・起動が必要で、クライアントだけでは不足します。`auto` は Podman 優先、Docker の明示指定も可能です。
- ローカル `ssh` / `scp`、非対話の鍵/agent 認証、サーバーのホスト指紋。
- Linux の Docker/Podman と対応する `compose` コマンド。SSH ユーザーのコンテナ実行・ディレクトリー書き込み権限。Windows から SSH とアプリ公開ポートへ接続できること。
- 対象パッケージの `config/_deploy.yml` と、環境ディレクトリーの `.env.prod` / `.env.test`。環境ファイルがなければ停止します。

### 2. 接続先と環境の設定

Docker 用の最小 `config/_deploy.yml` です。実際の接続先は `.env.local` の `HAI_DEPLOY_PROVIDER` オブジェクトで上書きします。

```yaml
provider:
  type: docker-ssh
container:
  runtime: docker
  s3Engine: rustfs
  web:
    context: ../..
    dockerfile: Dockerfile
    target: web
    containerPort: 8080
services: {}
```

ホスト、ユーザー、ポート、鍵のパスを実際の値に置き換えます。`.env.local` は Git に登録しません。

```dotenv
HAI_DEPLOY_PROVIDER='{"type":"docker-ssh","ssh":{"host":"10.0.0.20","port":22,"username":"deploy","identityFile":"C:/Users/me/.ssh/hai_deploy"},"remote":{"baseDir":"/opt/hai/apps","runtime":"docker"},"expose":{"type":"port","containerPort":3000,"hostPort":18080}}'
```

未設定の接続先はウィザードでも入力できます。`.env.local` に保存して次回再利用し、秘密鍵はパスだけを保存します。接続先の変更は `HAI_DEPLOY_PROVIDER` を編集します。

上書き順は `.env` → `.env.<mode>` → `.env.local` → プロセス環境変数です。`HAI_DB` など親 JSON が子の変数より優先されます。`.env.example` に全項目・説明・列挙値を記載し、`.env` と `.env.dev/test/prod` は Git 登録、実際の認証情報は `.env.local` に保存します。fullstack 初回起動には IAM ポリシーを満たす非公開の `HAI_ADMIN_DEFAULT_PASSWORD` も必要です。

同時デプロイは未設定/ワイルドカード CORS を公開 Origin で補い、明示値は保持します。本番 HTTPS 入口は `.env.prod` に `HAI_SERV_CORS_ORIGIN=https://app.hai.internal` などを設定します。本番 refresh Cookie は Secure のため、Web/API に信頼済み HTTPS 入口を準備します。HTTP ポートの公開だけでログイン・セッション更新まで検証済みとは判定できません。

### 3. デプロイ

fullstack ルートからサービス名を置き換えて実行します。

```powershell
pnpm.cmd exec hai deploy packages/my-app-serv --env prod --env-dir .
```

ウィザードは現在のバックエンドと用途を示します。既定設定は Compose サービス/ボリュームを作成し、カスタム接続では当該コンテナを作成しません。「変更しない」は対象環境ファイルに完全な設定が明示されている場合のみ表示します。公開値は対象環境、認証情報は `.env.local` に保存し、表示をマスクします。

DB・キャッシュ・ストレージ接続がすべて設定済みの場合：

```powershell
pnpm.cmd exec hai deploy packages/my-app-serv --env prod --env-dir . --yes --skip-middleware
```

`--skip-middleware`（別名 `--skip-provision`）はミドルウェアの入力・設定変更・リソース作成を省略します。アプリのビルド・デプロイは行い、停止中の外部サービスを起動しません。`--yes` 単独では完全な設定を維持し、それ以外は現在のバックエンド既定値を採用します。

`--project-name <name>` で名前を指定し、環境指定時は環境サフィックスが付きます。**`--skip-build` は現在 Vercel のアプリビルドのみを省略します。docker-ssh は必ずイメージをビルドし、既存イメージを直接指定するオプションはありません。** 失敗時は非ゼロ終了コードを返します。

## docker-ssh の処理とファイル

1. API は対象パッケージの Dockerfile または代替を使います。Web は明示的な `container.web` で context（サービス基準）、Dockerfile（context 基準）、target、ポートを選び、隣接アプリを推測しません。
2. 同じデプロイ ID で両イメージをビルド・エクスポートし、すべて成功してから転送します。Web ビルド失敗時は遠隔に触れません。
3. SSH で遠隔エンジンと Compose を確認し、SCP で tar を転送、遠隔で `load` します。
4. `compose.yml`、`.env.runtime`、`start-<mode>.sh` と同時デプロイ用 `web.conf` をローカル生成して個別に `<baseDir>/<projectName>-<mode>/` へ転送します。イメージとは別送で、Compose 全体の圧縮パッケージや Linux 上でのソースビルドではありません。
5. 遠隔スクリプトが `HAI_DEPLOY_ENVIRONMENT` / `HAI_CORE_ENV` を設定し、`compose --env-file .env.runtime ... up -d` を実行します。SDK は API `/health`、Web `/_hai/web-health` とホームを確認して成功を返します。単一 SvelteKit は `/` を確認します。Web に API の非公開 `.env.runtime` は渡しません。

ローカル成果物は対象パッケージの Git 対象外 `.hai/deploy/<mode>/` に保存します。遠隔 `.env.runtime` は権限 `600` です。再デプロイ用にローカル成果物を保持してください。「変更しない」は前回のローカル Compose のサービス/ボリュームを維持するもので、任意の遠隔 Compose を読み込みません。非公開環境ファイル・デプロイアーカイブはイメージに含めません。

## 完全オフラインのデプロイ

インターネットに接続しなくても、Windows と Linux 間の内部 SSH/HTTP 通信は必要です。Vercel・クラウド作成は利用できません。

### 事前に持ち込む材料

| 場所         | 必要な材料・状態                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows      | 対応 Node（条件を満たす Node 24 など）、pnpm 12.11.2、導入済み CLI/SDK と推移的依存、OpenSSH、初期化・起動済み Linux コンテナエンジン                                             |
| プロジェクト | 完全なソース・固定 lockfile・環境設定・認証情報。オフラインで `pnpm.cmd exec hai --help` が成功すること。現場での `npx` / `pnpm dlx` ダウンロードを避ける                         |
| Linux        | Docker CLI/Engine と Compose プラグイン（`docker compose version` 成功）、SSH 公開鍵登録、権限、公開ポート、書き込み先、ディスク容量。イメージ実行だけならホスト Node/pnpm は不要 |
| イメージ     | Linux の CPU 構成と一致する API・Web・ミドルウェア。Compose と完全一致する名前/tag。`docker load -i <archive.tar>` で読み込む                                                     |
| アプリ設定   | PostgreSQL DB/アカウント、Redis 接続/パスワード、RustFS 鍵/バケット、初回管理者パスワード。既存サービスは起動・到達可能にする。`localhost` はアプリコンテナ自身                   |

既定は `postgres:16-alpine`、`redis:7-alpine`、`ghcr.io/rustfs/rustfs:1.0.1` です。別 tag では自動一致しません。正しいイメージの持ち込み、互換性確認済みイメージの適切な tag 設定、またはカスタム接続が必要です。SDK はミドルウェアイメージを転送しません。他の固定イメージは [Compose 実装](src/container/deploy-container-compose.ts) を参照してください。

**既定のソースビルドは準備なしでオフライン動作しません。** Dockerfile は pnpm・パッケージ・SQLite バイナリーを取得し、fullstack ルートは `pnpm fetch` と外部 Dockerfile frontend も使用します。Windows の `node_modules` / pnpm store は Linux ビルド依存の代用になりません。現場でソースビルドする場合は Node ベースイメージ、frontend、Corepack/pnpm、Linux 依存・ネイティブキャッシュをローカルエンジン/ビルド環境に持ち込み、Dockerfile を調整し、外部接続を切って全ビルドを確認します。`pnpm install --offline --frozen-lockfile` はパッケージストア読み込みのみを対象とし、インストールスクリプトの追加取得は対象外です。

SQLite バイナリーは better-sqlite3 版、Node ABI、CPU、libc と一致する必要があります。PostgreSQL 運用でも依存導入時に必要な場合があります。Linux ビルド環境の prebuild-install キャッシュを用意するか、`container.sqlitePrebuildMirror` を内部サーバーへ向けます。どちらもなければバイナリーまたは完成イメージを事前準備します。既定の fullstack に CUDA は不要です。

### 完成イメージを SDK 経由で利用する

依存が使える準備環境で、完成イメージを事前作成すると現場の手順を減らせます。例は `my-app`、Web あり、サーバーと同じビルドアーキテクチャーです。

```powershell
docker build --target runtime -t my-app-api:offline .
docker build --target web -t my-app-web:offline .
docker save -o my-app-images.tar my-app-api:offline my-app-web:offline
```

オフライン Windows の Linux エンジンに `docker load -i my-app-images.tar` で導入します。`packages/my-app-serv/Dockerfile` は次の一行にします。

```dockerfile
FROM my-app-api:offline
```

サービスパッケージに内容 `*` の `.dockerignore` を追加します。ルートに `FROM my-app-web:offline AS web` の `Web.offline.Dockerfile` と内容 `*` の `Web.offline.Dockerfile.dockerignore` を用意します。`.env.local` の `HAI_DEPLOY_CONTAINER_WEB_DOCKERFILE=Web.offline.Dockerfile` で生成済み設定を再利用します。旧プロジェクトは先に上記 `container.web` YAML を追加します。SDK の必須ビルドは完成 API を再利用し、パッケージを取得しません。ソース変更後は完成イメージを再作成します。接続先を設定して上記デプロイを実行してください。ミドルウェアコンテナを作成するなら `.env.prod` で `HAI_DB_TYPE=postgresql`、`HAI_CACHE_TYPE=redis`、`HAI_STORAGE_TYPE=s3` を選び、ウィザードで既定設定を使います。既存サービスはカスタム接続を設定し、完了後は `--skip-middleware` も使えます。API/Web 両イメージを SDK が転送・起動します。外部接続を切ったリハーサルで、ビルダーが通信不要であることを確認します。

同じコマンドが API/Web を公開し、Web URL を返します。別の `docker run` は不要です。本番には公開ポートを代理する内網 HTTPS 入口を用意し、プロキシ設定/イメージ・証明書・DNS/hosts・クライアント信頼を準備します。ブラウザーは同一 Origin を使い、別 API ドメインは不要です。ヘルス・ログイン/業務・hash/セッション更新・再起動・永続化を確認します。この説明は実際のオフライン検証の代わりにはなりません。

公式資料：[Docker save](https://docs.docker.com/reference/cli/docker/image/save/) / [load](https://docs.docker.com/reference/cli/docker/image/load/)、[pnpm install](https://pnpm.io/cli/install)、[Compose プラグイン](https://docs.docker.com/compose/install/linux/)。

## SDK とエラー処理

スクリプト利用に CLI は不要です。解析済み設定を渡し、同じ環境解決には公開 `loadDeploymentEnvironment` / `loadDeploymentConfig` を使います。

```typescript
import type { DeployConfigInput } from '@h-ai/deploy'
import { deploy } from '@h-ai/deploy'

/**
 * 使用现有中间件发布生产 API，并释放部署模块。
 * @param config - 从部署环境解析得到的配置
 * @returns 初始化或部署的 HaiResult，由调用者检查 success
 * @example `const result = await publish(config)`
 */
export async function publish(config: DeployConfigInput) {
  const initialized = await deploy.init(config)
  if (!initialized.success)
    return initialized
  try {
    return await deploy.deployApp('./packages/my-app-serv', {
      environment: 'prod',
      envDir: '.',
      skipProvision: true,
    })
  }
  finally {
    await deploy.close()
  }
}
```

`result.success` を確認してから `error.code/message` または `data.url/healthCheck` を読みます。`deploy.scan()` / `deploy.credentials.*()` は初期化不要です。`deployApp()` がリソース作成を含むため、事前の `provisionAll()` は不要です。手動作成も結果を確認します。SDK `skipProvision` は CLI のミドルウェア省略と同じ意味です。

クラウドは `HAI_DB`、`HAI_CACHE`、`HAI_STORAGE`、`HAI_REACH_PROVIDERS` 全体を返し、アプリは対応 YAML の読み込みとモジュール初期化が必要です。`getDeployRecovery(result.error)` は段階・リソース ID を返します。`unknown` は管理画面で確認してから再試行します。同名再試行は既存リソースを再利用し、自動削除しません。型・設定・エラーコードは [公開エントリー](src/index.ts) を参照してください。

## テストと開発

依存導入後、フレームワークルートで実行します（Windows は `pnpm.cmd`）。

```powershell
pnpm.cmd --filter @h-ai/deploy typecheck
pnpm.cmd --filter @h-ai/deploy lint
pnpm.cmd --filter @h-ai/deploy build
pnpm.cmd --filter @h-ai/deploy test
pnpm.cmd check:skills
```

`src/deploy-scanner.ts` が lockfile 走査、`deploy-middleware.ts` が接続項目、`container/` がエンジン・SSH・Compose、`providers/` がデプロイ先、`provisioners/` がクラウド作成を担当します。CLI ウィザードは `../cli/src/commands/cli-deploy*.ts` です。バックエンド/設定変更時は利用側、環境例、テスト、[デプロイ skill](../cli/templates/skills/hai-deploy/SKILL.md) を同期します。

処理変更後は CLI の typecheck/lint/build/test と `pnpm.cmd --filter @h-ai/cli test:deploy-gates` を実行します。現在のパッケージから fullstack を生成し、Podman/SSH で API/Web を同時公開し、ローカル preview を起動せず遠隔 Web でヘルス・環境・ログイン・再デプロイを確認します。ローカルエンジンと OpenSSH が必要で、初回はイメージ・OS/Node 依存を取得するためオフライン検証ではありません。テンプレート変更時は `pnpm.cmd --filter @h-ai/cli test:scaffold-gates` も実行します。単体テストでクラウド作成済みとは判定せず、有料操作は別途検証します。ログ・画像・報告は Git 対象外の `tmp/` / `test-results/` に保存します。

## License

Apache-2.0
