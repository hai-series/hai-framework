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

#### hai.json でパッケージの構成を指定する

```json
{
  "build": {
    "images": [
      {
        "name": "app",
        "context": ".",
        "dockerfile": "images/app.Dockerfile",
        "containerPort": 3000
      },
      {
        "name": "web",
        "context": ".",
        "dockerfile": "images/web.Dockerfile",
        "containerPort": 8080
      }
    ]
  },
  "deploy": {
    "provider": {
      "type": "docker-ssh",
      "expose": {
        "hostPort": "${HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT:18080}"
      }
    },
    "container": {
      "s3Engine": "rustfs"
    }
  }
}
```

各イメージに独立した Dockerfile を用意します。Web 用設定は images/web/ に置きます。Dockerfile 内の構築・実行段階は維持しますが、設定から段階を選びません。不要なイメージ項目は削除し、desktop ディレクトリは対象プロジェクトのみ設定します。

`transport.maxPlaintextBytes` でリクエストとレスポンスの JSON 平文容量を共通設定します。単位は UTF-8 バイト、既定値は 1 MiB、有効範囲は 1 KiB～64 MiB の整数です。クライアントは鍵交換で上限を取得し、`resolveTransportBodyLimits()` が暗号文とプロキシ容量（平文の 2 倍 + 32 KiB）を算出します。鍵交換、公開鍵、認証ヘッダー、防リプレイ制約は独立です。超過時は元ストリームを停止して reader を解放します。要求は 413、応答は暗号化された 500 容量エラーとなり、`TransportBodyTooLargeError` / `hai:crypto:070` で識別できます。 全量と app の増分デプロイは同じ `_serv.yml` からプロキシ上限を算出します。容量変更時は既存 Web イメージでプロキシを再作成し、ヘルスチェック失敗時は旧設定を復元します。SvelteKit の adapter-node `BODY_SIZE_LIMIT` も `_kit.yml` から算出します。 [Transport capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md)。

本文なし認証封装には X-Hai-Transport を使います。生成設定は large_client_header_buffers 4 32k と proxy_buffer_size 32k を指定します。独自プロキシもこのヘッダーを保持し、通過させてください。

構築器はパッケージ情報、ローカルアーカイブとパッチを images/dependencies/ に準備し、pnpm store と依存レイヤーをキャッシュします。通常のソース変更で全依存を再ダウンロードしない構成です。キャッシュが空でもオンライン構築できます。Windows の node_modules は Linux のネイティブ依存を代替できません。完全オフライン構築には基底イメージ、ツールと一致する ABI・アーキテクチャ・libc のバイナリも準備します。

アプリの版はルート package.json.version で管理します。`.hai/build/docker/<buildId>/` に形式 3 の manifest.json、選択イメージの tar と SHA-256 を出力します。partial は部分構築、hasWeb は構成を記録します。appContainerPort と webContainerPort は明示した app/web の待受ポートを保持し、部分構築で選ばなかったイメージのポートも失いません。未指定のポートにはデプロイ時の既定値を使います。同じアプリ版でも再構築可能で、構築 ID とイメージ参照で内容を区別します。全出力に成功してからローカルの構築参照を更新します。基底・ミドルウェア・ツールは版を固定し、latest を使いません。

### 5. 成果物を対象環境へデプロイする

#### 環境と接続先を用意する

既定の配置名はプロジェクトルート（最も近い `hai.json` またはロックファイルのディレクトリ）の `package.json.name` を使い、未指定ならルートディレクトリ名を使います。明示した環境名を末尾に追加します。fullstack の `hai-delivery` で `packages/hai-delivery-serv` を走査しても、`--env test` は `/opt/hai/apps/hai-delivery-test` と `bundle-hai-delivery-test-<配置ID>-<版>.tar` を生成します。接続先ディレクトリ、配布物、Compose プロジェクト、API/Web/ミドルウェアのコンテナー、ボリューム、認証キャッシュのファイル名、増分基準で同じ名前を使います。実際のプロジェクト名に含まれる `-serv` は削除しません。

名前はリソースの識別子です。既存配置のディレクトリ、ボリューム、認証情報と増分基準を継続利用する場合、プロジェクトの deploy スクリプトに `--project-name hai-delivery-serv` を保持し、元の認証キャッシュも保管してください。環境名は引き続き `--env test` で付加します。`deploy-target.json.directory` だけの変更では Compose リソースを移行できません。改名には別途データ移行と新しい基準の確立が必要で、旧リソースは自動移動・削除しません。既存のオフライン配布物は再生成してください。

`.env.<環境>` とプロジェクトルートの `hai.json` を用意します。`build` にイメージ・ネイティブ構築、`deploy` にアプリ全体の配置設定を保存します。fullstack は packages/<プロジェクト>-serv、API workspace は apps/<プロジェクト>-service を実行依存とモジュール YAML の走査入口として使います。フロントとバックエンドは同じ設定を共有します。

`deploy` は `${変数:既定値}` と `HAI_DEPLOY_*` による階層的な上書き（JSON オブジェクト全体も可）をサポートします。省略された SSH ノードも Schema で定義済みの末端フィールドから補えます。優先度の高いソースの親オブジェクトは下位ソースの末端値より優先され、同一ソースでは末端値が優先されます。SSH の文字列は数値パスワード、先頭のゼロ、前後の空白もそのまま保持します。

デプロイ SDK の優先順は次のとおりです（高い順）。

- `HAI_DEPLOY_*`：プロセス > `.env.<環境>.local` > `.env.<環境>` > 旧 `.env.local` > `.env`。
- その他のモジュール：プロセス > `.env.<環境>.local` > 旧 `.env.local` > `.env.<環境>` > `.env`。既存の非公開認証情報の優先順を維持します。

新しい接続情報とミドルウェアの秘密値は Git 対象外の `.env.<環境>.local` に、公開バックエンドとアドレスは `.env.<環境>` に保存します。旧 `.env.local` は共通の互換フォールバックとして残し、自動移行・削除しません。選択環境で明示したデプロイ先が優先されます。環境別の非公開ファイルを読むのはデプロイ SDK のみで、Core の通常のアプリ読み込み規則は変わりません。構築時にはデプロイ環境や秘密値を読み込みません。

既存プロジェクトは旧構築オブジェクトを `hai.json.build`、旧配置 YAML を JSON に変換して `hai.json.deploy` に移し、元のファイルを削除します。`HAI_DEPLOY_*` は継続利用できます。既存の自前 S3 は今回の初回更新で全量配置が必要です。旧基準には終了済みの初期化サービスが残っており、新しい増分パッケージの依存稼働チェックで拒否されます。全量配置で `createBucket` 設定も更新した後は増分更新を継続できます。

直接デプロイでは、サーバー、SSH ユーザー、認証方式、ポートなどの不足項目を説明付きで質問します。有効で完全な設定は `--yes` でも再利用し、再入力を求めません。SSH は `auth: key`（秘密鍵/agent）と `auth: password` に対応します。`auth` を省略した場合、空でない `password` があるときだけパスワード認証を使い、それ以外は key/agent を維持します。明示した `key` は残存パスワードを無視します。パスワード入力は非表示で、前後の空白と先頭のゼロを保持します。有効なパスワードは CR/LF/NUL を含まず、UTF-8 で 1023 バイト以内である必要があります。秘密鍵はパスのみ参照し、内容を読み取り・コピーしません。

SSH 設定は選択環境の `.env.<環境>.local` に保存します。`--bundle-only` は SSH を質問せず、既存の接続情報を配布ディレクトリへ引き継ぎます。不足項目はアップロード前に `deploy-target.json` に補います。target の変更はその配布物だけに適用され、プロジェクトには書き戻しません。新しい配布物は保存済みの環境設定から生成します。

#### 本当に必要なミドルウェアだけを設定する

実行依存と設定に基づき、既定、自分の接続、設定維持を選びます。対象環境の設定が完全なら、`--yes` は値を保持し、再入力やクラウド資源の再作成を行いません。対話モードでは今回の処理範囲を選べます。--skip-middleware は設定と開通を省略します。SQLite、メモリーキャッシュ、ローカル保存には外部イメージがありません。完全配布物には自前ミドルウェアのイメージも自動で含めます。外部サービスは接続先への到達性が必要で、クラウド開通はオフライン処理ではありません。

#### deploy のオプション

--env/--env-dir は環境、--build は先行する選択イメージ構築、--services は更新対象、--artifact-dir は既存成果物を指定します。--bundle-only は SSH 接続なしで tar と OS 別スクリプトを生成します。--runtime はローカル構築・イメージ出力エンジンです。--output はコマンドの作業ディレクトリを基準とする出力先を指定し、アプリ版を末尾に付けます。--yes は有効な設定を非対話で使い、不足値はエラーで示します。一体化構築でも --network、--no-http-proxy、--sqlite-prebuild-mirror を指定できます。

#### マシン同士が接続できる場合：自動デプロイ

```sh
pnpm run deploy --env prod --build
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --build --services web
```

部分更新には成功済みの完全インストールと一致するポート・構成が必要です。Compose 標準の設定合成で未選択サービス、設定、ボリュームを保持します。スクリプトはプロジェクト名とサービス名で選択した旧コンテナーだけを削除し、ボリュームを保持します。その後 `compose up -d --no-deps --no-build --pull never --no-recreate web` で新しいコンテナーを作成します。他のコンテナーは稼働したままで、全体の down は実行しません。自前 S3 のバケットはアプリの `storage.init()` が任意設定 `createBucket` に従って初期化します。

`-d` はバックグラウンド起動、`--no-deps` は依存サービスを更新しない指定、`--no-build` はサーバーでの構築禁止、`--pull never` は取得禁止、`--no-recreate` は残っているコンテナーを保持します。選択した旧コンテナーは事前に削除されているため、新しいコンテナーが作成されます。末尾の `web` は Compose サービス名で、複数指定は空白で区切ります。

S3 の `createBucket` は既定で `false` です。自前 S3 には `HAI_STORAGE_CREATEBUCKET=true` を設定し、アプリ初期化時に不足するバケットだけを作成します。外部 S3 は任意で有効化します。Compose は YAML アンカーを使わず `hai-app` ネットワークを使います。storage だけの更新にアプリイメージは不要で、新規バケットは次回のアプリ初期化時に作成します。

#### マシン同士が接続できない場合：パッケージをコピー

```sh
pnpm run deploy --env prod --build --bundle-only
```

毎回 `.hai/deploy/<環境>/bundle-<プロジェクト>-<配置ID>-<版>/` を一つ生成し、tar、Compose、環境、web.conf、マニフェストと各 OS のスクリプトを同じ場所に保存します。ディレクトリ全体をコピーしてください。`--output release-prod.tar` は作業ディレクトリを基準に `release-prod-<版>/release-prod-<版>.tar` を生成し、付属ファイルも同じ場所に置きます。tar は選択アプリ・ミドルウェアのイメージ、設定、秘密の環境ファイル、チェックサム、README、apply.sh を含みます。アップロードスクリプトの実行前に、操作ディレクトリの `deploy-target.json` を開き、各項目の説明に従ってサーバー、SSH ユーザーとポート、秘密鍵・指紋ファイル、リモートディレクトリなどを変更・確認します。Windows は deploy.ps1、Linux/macOS は deploy.sh を実行します。どちらも同じ JSON を読み、SSH 転送後に同じサーバー処理を実行します。ローカルで deploy.sh を実行するには sh、awk、ssh、scp が必要です。`sh deploy.sh ホスト [ポート] [ユーザー]` で接続先を、deploy.ps1 の `-IdentityFile` で秘密鍵を上書きできます。両方のスクリプトで HAI_DEPLOY_IDENTITY_FILE と HAI_DEPLOY_KNOWN_HOSTS_FILE による鍵・指紋ファイルのパスの上書きも可能です。別の PC・OS に移す場合、これらのパスを移動先の実ファイルに合わせます。

オフラインアップロードは鍵とパスワードの両方に対応します。`deploy-target.json` に保存するのは認証方式と `passwordEnv` 名（既定 `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`）だけで、パスワード値は含めません。操作する PC の環境から与え、今回の SSH/SCP 子プロセスだけに渡します。アプリ環境、tar、manifest には入りません。Windows では永続化したユーザー環境も参照できます。Windows は PowerShell 5+ と OpenSSH、Linux/macOS は sh、awk、ssh、scp が必要で、どちらも Node/pnpm は不要です。target の変更はその配布ディレクトリだけに適用し、プロジェクトには書き戻しません。新しい配布物は保存済みの環境設定を使います。

隔離された Linux では交付ディレクトリ全体をコピーし、`sh deploy-local.sh` を実行します。スクリプトが同じ場所の tar を展開し、apply.sh が内容を検証して配置します。引数で配置先を上書きできます。各段階の失敗は非ゼロ終了し、イメージ導入・起動・HTTP 検査を別々に報告します。result-<配置ID>.json に結果を記録し、成功時だけ current を更新します。同じ配置 ID の再適用は停止しますが、同じアプリ版から生成した新しい配布物は適用できます。更新失敗時は対象コンテナーと設定を以前の状態に戻すことを試み、データボリュームと診断情報を保持します。すでに書き込まれた業務データは元に戻しません。

パッケージの `manifest.json` の `partial` と `selectedServices`、実行スクリプトに配置モードと対象を記録します。完全な構築で `--services` を省略すると全量、明示的なサービス選択または部分構築では増分です。増分にはサーバーの成功済み `current` と一致する基準が必要で、初回インストールは拒否します。

サーバーは util-linux の `flock` で配置ルートの `.deploy.lock` に非ブロッキングのカーネルロックを取得し、復元処理の終了まで保持します。通常の前景配置と同期の失敗復元は、後処理と終端結果の公開後に明示解放し、背景サービスの稼働は次の配置を妨げません。このファイルは残し、削除・置換・経過時間による横取りをしないでください。対応するファイルシステムが必要です。HUP/INT/TERM または親 shell の強制終了時は、記述子を継承した実行中の子コマンドが全 holder の終了かサーバー再起動までロックを保持します。旧 `.deploy-lock` ディレクトリは判定に使わず削除もしません。更新前に旧配置プロセスを終了し、旧パッケージを併用しないでください。強制終了・停電では復元 trap が動きません。結果ファイルがなければ実行状態は不明です。コンテナー、イメージ、成功した `current` を確認して新しいパッケージで復旧してください。ロック解放は成功や副作用の取消を意味しません。

#### 完全オフラインの前に確認する

完全 tar は自前ミドルウェアのアーカイブと一致するアーキテクチャを含み、起動時にレジストリーへ接続しません。Linux に Docker/Podman、Docker Compose v2 または podman-compose 1.6.0 以降、sh、tar、sha256sum、awk、curl、util-linux の flock、ディレクトリ・コンテナー権限が必要です。秘密設定を安全に転送し、版間でボリューム識別を保持します。外部ネットワークを切って起動、ログイン、再読込、再起動と永続化を検証します。HTTPS、証明書、DNS、外部サービスは別途用意します。

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

コマンド出力は正しく UTF-8 デコードした論理ストリーム単位で秘匿し、stdout/stderr のチャンク境界をまたぐ既知の秘密も保護します。成功結果、エラー、出力コールバックは同じ境界を使います。内部コマンドの `secrets` に機密リテラルを指定し、変換・エンコードした値も別途指定してください。各ストリームは既定で末尾 1 Mi 文字を保持し、`maxCaptureChars` は 1～16 Mi 文字です。構造化出力の解析前に `stdoutTruncated` / `stderrTruncated` を確認します。非同期 `onOutput` を順に待ち pipe の背圧を保ち、安全な stdout 全体を渡します。進捗解析は各行の先頭 512 文字のみです。秘密の合計上限は UTF-16 で 1 Mi 単位、秘匿失敗は処理失敗とします。タイムアウトだけでリモートプロセスの終了を断定せず、終了を確認してください。

コマンド期限は helper 起動と出力処理を含みます。タイムアウト、入出力・コールバック失敗時は管理対象プロセスを終了します。POSIX は独立したプロセスグループ、Windows は内嵌 PowerShell/.NET Job Object を使い、停止状態で作成して割当成功後だけ再開します。breakaway は許可せず、helper・コンパイル・割当失敗時に裸のプロセスへ切り替えません。Windows はシステム PowerShell と Add-Type が必要です。非表示で profile を読み込まず、引数・環境・UTF-8 pipe を保持します。POSIX の子孫は同じグループを継承してください。独立したシステム daemon と遠隔サービスはローカル終了確認の対象外です。

失敗後の確認待ちは `terminationTimeoutMs`（既定 10000、最大 60000 ミリ秒）です。kill 送信だけでは確認とせず、管理対象 Job/グループの活動メンバーがなくなった場合だけ `localTermination: 'confirmed'`、確認失敗・期限切れは `unknown`、起動前は `not-started` を記録します。`if (!result.success)` 内で公開 `getDeployCommandState(result.error)` を使い、原始例外やコマンド引数を含まない状態を読みます。実行中の非同期出力 callback は取り消せませんが、失敗後に新しい出力を渡しません。

SSH 中断は最初に `remoteExecution: 'unknown'` とし、docker-ssh SDK は別接続で `result-<deploymentId>.json` を読みます。完全で未切断、ID が一致する終端結果だけ `finished` と実際の段階・終了値を確認できます。script 終了はコンテナー停止を意味しません。終了値が 0 でも元の SSH/出力失敗は失敗として残します。CLI はローカルと遠隔の状態と結果パスを別々に表示します。欠落・旧 ID・破損・再接続失敗は不明のまま、配置や rollback を自動再実行しません。手動アップロード script は SSH 失敗を不明と表示し、確認先を示します。配置 ID はパッケージの manifest で確認します。手順、`current`、実サービスとデータを確認して復旧してください。

### 実行環境ファイルと設定の再利用

フレームワークの永続設定は `HAI_*` を使います。`POSTGRES_*`、`MYSQL_*`、`RUSTFS_*`、`MINIO_*`、`LDAP_*` はミドルウェアイメージ必須の名前を維持し、非公開の `middleware-runtime.env` にだけ生成してミドルウェアに渡します。プロジェクト環境ファイルやアプリの `.env.runtime` には新規保存しません。増分アプリ更新用の `middleware.env` は `HAI_*` 設定のみです。既存の原生変数は自動削除せず、新しいアプリ環境から除外します。未更新サービスは以前の配布ファイルを使い続けます。

配布ごとに Compose 用の `.hai/deploy/<環境>/bundle-.../.env.runtime` を生成します。これは生成物であり、設定の保存元ではありません。`NODE_ENV` の既定値は対象環境に従い、`test` は `test`、`dev/development` は `development`、`prod/production` とその他は `production` です。環境設定の明示的な `NODE_ENV` が優先され、構築の最適化モードとは別です。旧配布物は再度パッケージ化してください。

プロジェクトルートの `hai.json.deploy` に配置構造、`.env.<環境>` に公開設定、`.env.<環境>.local` に SSH とミドルウェアの認証情報を保存します。自動生成した固定認証情報は走査対象サービスの `.hai/deploy/runtime/<プロジェクト>-<環境>.secrets.json` にも保持するため、既存データボリューム再利用時は削除しないでください。環境ファイルは既定でプロジェクト/workspace ルート、変更時は `--env-dir` を指定します。設定後は `pnpm run deploy --env test --build --bundle-only --yes` で再入力を省略でき、ミドルウェア設定を保持する場合は `--skip-middleware` を追加します。初回の bundle-only では SSH を質問しないため、接続先を一度プロジェクトに設定します。配布物の `deploy-target.json` の編集はプロジェクトに反映されません。

## 開発とテスト

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/deploy test:e2e
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

実配置は API、SSR、静的モバイル、fullstack を代表として選びます。admin は website/h5 と共通の SSR Dockerfile と本番配置分岐を検証し、全アプリ種別の個別インストール、コンパイル、HTTP/ブラウザー検証は八つの scaffold シナリオで維持します。実測の資源競合に基づき scaffold と生成ルート runtime は逐次バッチとし、三つの軽い CLI ゲートは runtime と最大二つの worker で並列実行できます。生成シナリオは E2E の完全構築を再利用し、本番構築分離と実成果物の検証を維持します。CLI 配置ゲートは認証/暗号化、増分更新、破損成果物と復旧を維持し、本番と同じ Nginx で公開 bundle に `nginx -t` を実行します。fixture は init を有効化し、引き取った孤児 PID の実消失を検証します。

実際の生成プロジェクト、SSH と手動公開を検証します。レジストリー接続禁止、部分更新、破損アーカイブ、同一版での再公開、ヘルスチェック失敗を含めます。finally/teardown ではテスト自身が作成したプロジェクト、イメージ、コンテナー、ログ、プロセスのみを削除します。

`test:e2e` は現在のパッケージをビルドし、子プロセスで Linux のロックとプロセスの両ゲートを有効にしてファイルを順番に実行します。ルートの `pnpm e2e` もこの入口を含みます。接続可能な Podman（優先）または Docker を使い、公開 API が生成した `apply.sh` を実行します。同時実行、親の強制終了後の子によるロック保持、全終了と再起動からの復旧を確認します。Compose/HTTP は決定的なテスト用実装で、実サービス公開の検証を代替しません。

プロセス専用ゲートは `pnpm --filter @h-ai/deploy exec vitest run tests/deploy-command-process.test.ts tests/deploy-secret-masker.test.ts` です。同じ `HAI_DEPLOY_E2E=1` を設定し、deploy をビルドしてから `tests/deploy-command-runtime.e2e.test.ts` を実行すると、実 Linux/OpenSSH、公開 dist、遠隔の継続・完了、ローカルグループを検証します。sshd 導入にネットワークが必要で、Compose/HTTP はテスト用実装です。配置期限を 2500 ミリ秒に短縮し、出力消費を停止して応答喪失を再現します。

デプロイ用 fixture は固定版の公開基盤イメージを確認し、不在を確認した場合だけ取得します。HAI_DEPLOY_E2E_MIRROR を利用でき、公開キャッシュは回収対象にしません。create 成功時のコンテナー ID を先に記録し、専用 PID namespace 内で APT/pip/sshd を非同期準備します。準備失敗、期限超過、協調的取消ではローカルクライアントの終了を待ち、記録した ID だけを削除して消失を確認します。特権を使うのはネストした Podman fixture のみです。HAI_DEPLOY_E2E_APT_MIRROR はホスト名のみを受け付け、HTTPS を維持します。所有権テストは固定公開イメージに実行専用 tag を付け、同じ内容の外部 tag、tag の付け替え、動的ポート、外部 sentinel の保護を維持します。create の応答喪失で信頼できる ID がない場合や、テストが強制終了した場合は不明状態を残し、名前や label を根拠に回収しません。

## ライセンス

Apache-2.0
