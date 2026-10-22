# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

## 概要

既存イメージまたは Vercel prebuilt 成果物を配布します。完全オフライン、サービス選択、SSH 自動化、OS 別の手動配布スクリプトに対応します。SDK は成果物を消費し、CLI --build は構築から配布を明示的に実行します。

## 主な機能

- CLI でビルド、梱包、SSH 転送、起動、アクセス確認を実行。
- アプリと自前ミドルウェアのイメージを同梱し、選択したサービスだけの更新にも対応。
- オフライン用 tar と Windows/Linux/macOS 操作スクリプトを生成し、手順の結果と失敗時の復元を扱う。

## 使い始める

### 4. ソースをコンパイルし、配布物を作る

デプロイツールは作成時に既定で含まれます。不要な場合は `hai create my-app --no-deploy` を指定します。SDK は開発依存に配置し、実行イメージには含めません。

```sh
pnpm build
pnpm build --target docker
pnpm build --target docker --images web
pnpm build --target desktop --platform windows --arch x64
```

#### build のオプション

`--target` は compile（既定）、docker、desktop を選択します。`--images app|web|app,web` は対象イメージを、`--runtime auto|podman|docker` はローカルエンジンを選択します。auto は接続可能な Podman を優先します。`--network` は構築ネットワーク、`--no-http-proxy` は Podman のプロキシ継承無効、`--sqlite-prebuild-mirror` は信頼できる HTTP(S) バイナリ配布元です。ネイティブ配布物には対象 OS の SDK と Rust ツールチェーンが必要です。構築時にデプロイ環境や秘密情報を読み込みません。

#### hai.build.json でパッケージの構成を指定する

```json
{ "images": [{ "name": "app", "context": ".", "dockerfile": "images/app.Dockerfile", "containerPort": 3000 }, { "name": "web", "context": ".", "dockerfile": "images/web.Dockerfile", "containerPort": 8080 }] }
```

各イメージに独立した Dockerfile を用意します。Web 用設定は images/web/ に置きます。Dockerfile 内の構築・実行段階は維持しますが、設定から段階を選びません。不要なイメージ項目は削除し、desktop ディレクトリは対象プロジェクトのみ設定します。

生成する `web.conf` は API location に `client_max_body_size 2129920`（2 MiB + 32 KiB）を設定し、`proxy_request_buffering` / `proxy_buffering` を無効にします。transport の平文 1 MiB を暗号化した JSON を通過させ、アプリ側では鍵交換 16 KiB、公開鍵 4 KiB、平文 1 MiB の制限を逐次検証します。独自プロキシでも暗号文の上限を許可し、キャンセルを伝播してください。プロキシ上限の変更だけでは serv/kit の有界読み取りを代替できません。大容量アップロードは専用パスと容量ポリシーを用意します。

本文なし認証封装には X-Hai-Transport を使います。生成設定は large_client_header_buffers 4 32k と proxy_buffer_size 32k を指定します。独自プロキシもこのヘッダーを保持し、通過させてください。

構築器はパッケージ情報、ローカルアーカイブとパッチを images/dependencies/ に準備し、pnpm store と依存レイヤーをキャッシュします。通常のソース変更で全依存を再ダウンロードしない構成です。キャッシュが空でもオンライン構築できます。Windows の node_modules は Linux のネイティブ依存を代替できません。完全オフライン構築には基底イメージ、ツールと一致する ABI・アーキテクチャ・libc のバイナリも準備します。

アプリの版はルート package.json.version で管理します。`.hai/build/docker/<buildId>/` に形式 3 の manifest.json、選択イメージの tar と SHA-256 を出力します。partial は部分構築、hasWeb は構成を記録します。appContainerPort と webContainerPort は明示した app/web の待受ポートを保持し、部分構築で選ばなかったイメージのポートも失いません。未指定のポートにはデプロイ時の既定値を使います。同じアプリ版でも再構築可能で、構築 ID とイメージ参照で内容を区別します。全出力に成功してからローカルの構築参照を更新します。基底・ミドルウェア・ツールは版を固定し、latest を使いません。

### 5. 成果物を対象環境へデプロイする

#### 環境と接続先を用意する

`.env.<環境>` とサービスの config/_deploy.yml を用意します。fullstack の deploy は packages/<プロジェクト>-serv、API workspace は apps/<プロジェクト>-service を指定します。これは設定と実行依存の走査入口で、成果物は構築設定のルートから読み込みます。

```yaml
provider:
  type: docker-ssh
  expose:
    hostPort: 18080
container:
  s3Engine: rustfs
```

ウィザードはサーバー、SSH ユーザー、任意の鍵・指紋ファイル、公開ポートを説明付きで質問します。有効な設定は再利用し、接続情報は .env.local、秘密鍵はパスのみ保存します。パッケージ生成だけなら SSH は不要です。

#### 本当に必要なミドルウェアだけを設定する

実行依存と設定に基づき、既定、自分の接続、設定維持を選びます。--skip-middleware は設定と開通を省略します。SQLite、メモリーキャッシュ、ローカル保存には外部イメージがありません。完全配布物には自前ミドルウェアのイメージも自動で含めます。外部サービスは接続先への到達性が必要で、クラウド開通はオフライン処理ではありません。

#### deploy のオプション

--env/--env-dir は環境、--build は先行する選択イメージ構築、--services は更新対象、--artifact-dir は既存成果物を指定します。--bundle-only は SSH 接続なしで tar と OS 別スクリプトを生成します。--runtime はローカル構築・イメージ出力エンジン、--output は版付きファイル名です。--yes は有効な設定を非対話で使い、不足値はエラーで示します。一体化構築でも --network、--no-http-proxy、--sqlite-prebuild-mirror を指定できます。

#### マシン同士が接続できる場合：自動デプロイ

```sh
pnpm run deploy --env prod --build
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --build --services web
```

部分更新には成功済みの完全インストールと一致するポート・構成が必要です。Compose 標準の設定合成で未選択サービス、設定、ボリュームを保持します。スクリプトはプロジェクト名とサービス名で選択した旧コンテナーだけを削除し、ボリュームを保持します。その後 `compose up -d --no-deps --no-build --pull never --no-recreate web` で新しいコンテナーを作成します。他のコンテナーは稼働したままで、全体の down は実行しません。storage-init は S3 バケットの一時初期化処理で、ストレージ初期化を伴う場合に限り実行します。

`-d` はバックグラウンド起動、`--no-deps` は依存サービスを更新しない指定、`--no-build` はサーバーでの構築禁止、`--pull never` は取得禁止、`--no-recreate` は残っているコンテナーを保持します。選択した旧コンテナーは事前に削除されているため、新しいコンテナーが作成されます。末尾の `web` は Compose サービス名で、複数指定は空白で区切ります。

`storage-init` はアプリの S3 SDK でストレージの準備を待ち、不足するバケットを作成します。既存データは削除しません。storage 起動後に `compose up --no-deps --no-build --pull never --force-recreate --exit-code-from storage-init storage-init` を実行し、終了コード 0 を確認してアプリを起動します。 部分更新では旧 storage-init コンテナーを先に削除し、このコマンドの `--force-recreate` を `--no-recreate` に替えて、稼働中のアプリを保持します。`storage` だけを更新する場合も、初期化のために `app` イメージを含む成果物が必要です。直近のビルドが Web のみなら、`--artifact-dir` で元の完全な成果物を選ぶか、先に `pnpm build --target docker --images app` を実行します。このイメージは初期化に使い、稼働中の `app` サービスは更新しません。

#### マシン同士が接続できない場合：パッケージをコピー

```sh
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

版 1.2.3 なら release-prod-1.2.3.tar と隣接する -deploy/ を生成します。tar は選択アプリ・ミドルウェアのイメージ、設定、秘密の環境ファイル、チェックサム、README、apply.sh を含みます。Windows は deploy.ps1、Linux/macOS は deploy.sh でアップロードし、同じサーバー処理を実行します。別の PC・OS に移す場合、秘密鍵とサーバー指紋ファイルのパスを移動先に合わせます。Windows は deploy-target.json、Linux/macOS は HAI_DEPLOY_IDENTITY_FILE と HAI_DEPLOY_KNOWN_HOSTS_FILE で指定します。

隔離された Linux では独立ディレクトリに展開し、`sh apply.sh` を実行します。引数で配置先を上書きできます。各段階の失敗は非ゼロ終了し、イメージ導入・起動・HTTP 検査を別々に報告します。result-<配置ID>.json に結果を記録し、成功時だけ current を更新します。同じ配置 ID の再適用は停止しますが、同じアプリ版から生成した新しい配布物は適用できます。更新失敗時は対象コンテナーと設定を以前の状態に戻すことを試み、データボリュームと診断情報を保持します。すでに書き込まれた業務データは元に戻しません。

#### 完全オフラインの前に確認する

完全 tar は自前ミドルウェアのアーカイブと一致するアーキテクチャを含み、起動時にレジストリーへ接続しません。Linux に Docker/Podman、Docker Compose v2 または podman-compose 1.6.0 以降、sh、tar、sha256sum、awk、curl、ディレクトリ・コンテナー権限が必要です。秘密設定を安全に転送し、版間でボリューム識別を保持します。外部ネットワークを切って起動、ログイン、再読込、再起動と永続化を検証します。HTTPS、証明書、DNS、外部サービスは別途用意します。

### SDK

```ts
import { deploy } from '@h-ai/deploy'

const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 18080 } } })
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const result = await deploy.deployApp('./packages/demo-serv', {
    environment: 'prod',
    envDir: '.',
    bundleOnly: true,
    artifactDir: './.hai/build/docker/<buildId>',
    runtime: 'auto',
  })
  if (!result.success)
    throw new Error(result.error.message)
  // result.data.bundlePath / instructions; packaged does not mean server ready.
}
finally {
  await deploy.close()
}
```

`selectedServices: ['web']` は部分更新を選択し、`onProgress` はパッケージ作成とサーバー実行の段階を通知します。`deploy.scan` と `deploy.credentials.*` は初期化前も使用できます。HaiResult.success を確認してからデータを読み取ります。Vercel は既存 .vercel/output を prebuilt API でアップロードするためネット接続が必要で、オフラインや Compose の部分公開には対応しません。

## 開発とテスト

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

実際の生成プロジェクト、SSH と手動公開を検証します。レジストリー接続禁止、部分更新、破損アーカイブ、同一版での再公開、ヘルスチェック失敗を含めます。finally/teardown ではテスト自身が作成したプロジェクト、イメージ、コンテナー、ログ、プロセスのみを削除します。

## ライセンス

Apache-2.0
