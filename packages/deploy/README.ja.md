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

配布ロールは、独立 API バックエンドが `serv`、静的または SSR のブラウザーサイトが `web`、Android/iOS インストーラーが `app`、デスクトップインストーラーが `desktop` です。Fullstack は serv と任意の web、API は serv、admin/website/h5/mobile-app のブラウザーイメージは web を使用します。ネイティブ app/desktop はサーバーの Compose サービスではありません。`--images` と `--services` には serv/web、ネイティブ配布には `--target app` または `--target desktop` を指定します。API サービスのディレクトリは `apps/<project>-serv` です。イメージとコンテナーはルート `package.json.name` を共通の識別名として正規化します（scope 除去、小文字化、無効文字の連続をハイフンに変換）。名前がないか無効な場合は失敗し、ディレクトリ名へフォールバックしません。イメージは `localhost/hai-<project>-<role>:<buildId>`、コンテナーは `hai-<project>-<environment>-<role>` となり、イメージは環境間で再利用できます。

```sh
pnpm build
pnpm build --target image
pnpm build --target image --images web
pnpm build --target desktop --platform windows --arch x64
```

#### build のオプション

`--target` は compile（既定）、image、app、desktop を選択します。`--images serv|web|serv,web` は対象イメージを、`--runtime auto|podman|docker` はローカルエンジンを選択します。auto は接続可能な Podman を優先します。`--network` は構築ネットワーク、`--no-http-proxy` は Podman のプロキシ継承無効、`--sqlite-prebuild-mirror` は信頼できる HTTP(S) バイナリ配布元です。ネイティブ配布物には対象 OS の SDK と Rust ツールチェーンが必要です。構築時にデプロイ環境や秘密情報を読み込みません。

#### hai.json でパッケージの構成を指定する

```json
{
  "build": {
    "images": [
      {
        "name": "serv",
        "context": ".",
        "dockerfile": "images/serv.Dockerfile",
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

アプリの版はルートpackage.json.versionで管理します。`.hai/build/docker/<buildId>/`にmanifest、選択イメージのtarとSHA-256を出力します。ルートは形式4、非ルートはwebBasePathを含む形式5です。partialは部分構築、hasWebは構成を記録します。servContainerPortとwebContainerPortは明示したserv/webの待受ポートを保持し、部分構築で選ばなかったイメージのポートも失いません。未指定のポートにはデプロイ時の既定値を使います。同じアプリ版でも再構築可能で、構築IDとイメージ参照で内容を区別します。全出力に成功してからローカルの構築参照を更新します。基底・ミドルウェア・ツールは版を固定し、latestを使いません。

#### サイトの公開ディレクトリー

`/somepath/` のみを公開する場合、`PUBLIC_BASE_PATH=/somepath` でビルドし、Serv の `http.apiPrefix`、ヘルス/準備確認、ドキュメントとストレージ `publicEndpoint` を同じディレクトリに明示設定します。SDK は実効設定からプロキシとブラウザ API アドレスを生成します。外側では接頭辞を保持し、内部プローブとルートの ACME 検証は別に扱います。[設定と検証](../../docs/usage/configuration/delivery.md#所有对外业务路径必须带同一目录)。

既定はサイトルートです。`https://example.com/yyy/`で公開する場合は、アプリ構築プロセスで`PUBLIC_BASE_PATH=/yyy`を明示します。CLIは形式5を生成し、webBasePathを保存します。これは構築情報であり、デプロイ環境で上書きする設定ではありません。各区間はASCII英数字・`_`・`.`・`-`のみ、末尾の斜線や単独の`.`/`..`区間は使用できません。形式5対応のCLI/Deployが必要で、旧ツールは拒否します。形式番号を手で変更しないでください。

SDKは対応するNginx、実行時設定URL、SSRヘルスチェック、公開URLを生成します。追加のゲートウェイは接頭辞を保持します。同一オリジンAPIはServのhttp.apiPrefixで別に決まり、CORSの許可元はスキーム・ホスト・ポートだけです。独立Viteサイトは設定済みの外部APIアドレスを維持します。servだけの部分構築も含め、全量・部分構築で同じPUBLIC_BASE_PATHを使用します。増分では置換前に不一致を拒否し、ディレクトリー変更には全量デプロイを使います。復旧時は旧公開のヘルスパスを検証します。[設定・フレームワークの違い・実行画面](../../docs/usage/configuration/delivery.md#网站部署在子目录)を参照してください。

### 5. 成果物を対象環境へデプロイする

#### 環境と接続先を用意する

既定の配置名はプロジェクトルート（最も近い `hai.json` またはロックファイルのディレクトリ）の `package.json.name` を使い、未指定または無効な名前はエラーになります。明示した環境名を末尾に追加します。fullstack の `hai-delivery` で `packages/hai-delivery-serv` を走査しても、`--env test` は `/opt/hai/apps/hai-delivery-test` と `bundle-hai-delivery-test-<配置ID>-<版>.tar.gz` を生成します。接続先ディレクトリ、配布物、Compose プロジェクト、API/Web/ミドルウェアのコンテナー、ボリューム、サーバー認証状態のファイル名、増分基準で同じ名前を使います。実際のプロジェクト名に含まれる `-serv` は削除しません。

成果物形式4・5はprimaryService（serv/web）と、工程全体のブラウザー構成を示すhasWebを記録します。形式5には非ルートのwebBasePathも含まれます。同一オリジンAPIプロキシはserv + webの場合だけ生成します。形式1～3は再構築が必要です。既存デプロイをバックアップし、プロジェクト名・ボリューム・管理対象の認証情報を確認してから、新しい完全デプロイの基準を作成してください。プロジェクト間のデータ移行は自動化しません。完全デプロイでは同じComposeプロジェクトの旧サービスコンテナーを削除するため、deploy-target.json.directoryの変更だけでは移行できません。

既存工程では、hai.json の build.images 名、Dockerfile 名と参照を先に更新します。API サービスのディレクトリ、パッケージ名と依存参照を -serv に統一し、依存を再インストールして完全な成果物を再構築してください。アーカイブ名や manifest の手動変更では再構築を代替できません。

CLI の --project-name と SDK の DeployAppOptions.projectName 上書きは廃止しました。旧引数は明示的に失敗します。工程ルートの package.json.name で識別名を管理してください。

`.env.<環境>` とプロジェクトルートの `hai.json` を用意します。`build` にイメージ・ネイティブ構築、`deploy` にアプリ全体の配置設定を保存します。fullstack は packages/<プロジェクト>-serv、API workspace は apps/<プロジェクト>-serv を実行依存とモジュール YAML の走査入口として使います。フロントとバックエンドは同じ設定を共有します。

`deploy` は `${変数:既定値}` と `HAI_DEPLOY_*` による階層的な上書き（JSON オブジェクト全体も可）をサポートします。省略された SSH ノードも Schema で定義済みの末端フィールドから補えます。優先度の高いソースの親オブジェクトは下位ソースの末端値より優先され、同一ソースでは末端値が優先されます。SSH の文字列は数値パスワード、先頭のゼロ、前後の空白もそのまま保持します。

デプロイ SDK の優先順は次のとおりです（高い順）。

- `HAI_DEPLOY_*`：プロセス > `.env.<環境>.local` > `.env.<環境>` > 旧 `.env.local` > `.env`。
- その他のモジュール：プロセス > `.env.<環境>.local` > 旧 `.env.local` > `.env.<環境>` > `.env`。既存の非公開認証情報の優先順を維持します。

新しい接続情報とミドルウェアの秘密値は Git 対象外の `.env.<環境>.local` に、公開バックエンドとアドレスは `.env.<環境>` に保存します。旧 `.env.local` は共通の互換フォールバックとして残し、自動移行・削除しません。選択環境で明示したデプロイ先が優先されます。環境別の非公開ファイルを読むのはデプロイ SDK のみで、Core の通常のアプリ読み込み規則は変わりません。構築時にはデプロイ環境や秘密値を読み込みません。

既存プロジェクトは旧構築オブジェクトを `hai.json.build`、旧配置 YAML を JSON に変換して `hai.json.deploy` に移し、元のファイルを削除します。`HAI_DEPLOY_*` は継続利用できます。既存の自前 S3 は今回の初回更新で全量配置が必要です。旧基準には終了済みの初期化サービスが残っており、新しい増分パッケージの依存稼働チェックで拒否されます。全量配置で `createBucket` 設定も更新した後は増分更新を継続できます。

直接デプロイでは、サーバー、SSH ユーザー、認証方式、ポートなどの不足項目を説明付きで質問します。有効で完全な設定は `--yes` でも再利用し、再入力を求めません。SSH は `auth: key`（秘密鍵/agent）と `auth: password` に対応します。`auth` を省略した場合、空でない `password` があるときだけパスワード認証を使い、それ以外は key/agent を維持します。明示した `key` は残存パスワードを無視します。パスワード入力は非表示で、前後の空白と先頭のゼロを保持します。有効なパスワードは CR/LF/NUL を含まず、UTF-8 で 1023 バイト以内である必要があります。秘密鍵はパスのみ参照し、内容を読み取り・コピーしません。

SSH 設定は選択環境の `.env.<環境>.local` に保存します。`--bundle-only` は構築・ミドルウェア設定後、梱包前の最後の対話で SSH 設定の追加・変更を確認します。同じ非公開ファイルに保存し、今回と次回以降の `deploy-target.json` に反映します。スキップすると既存設定を再利用し、不足項目はアップロード前に target へ補えます。`--yes` は質問せず再利用します。target の変更はその配布物だけに適用され、プロジェクトには書き戻しません。新しい配布物は保存済みの環境設定から生成します。

#### 本当に必要なミドルウェアだけを設定する

実行依存と設定に基づき、既定、自分の接続、設定維持を選びます。対象環境の設定が完全なら、`--yes` は値を保持し、再入力やクラウド資源の再作成を行いません。対話モードでは今回の処理範囲を選べます。--skip-middleware は設定と開通を省略します。SQLite、メモリーキャッシュ、ローカル保存には外部イメージがありません。完全配布物には自前ミドルウェアのイメージも自動で含めます。外部サービスは接続先への到達性が必要で、クラウド開通はオフライン処理ではありません。

既定とカスタムは同じバックエンドの有効な設定を保持します。フォームにない接続プール、操作ログ、ストレージ公開 URL/接頭辞、Redis 再試行、ベクトル検索設定も対象です。自前構成とクラウド開通は接続先・認証だけを更新し、古い URL、TLS/クラスター設定、認証情報を引き継ぎません。SMTP 送信元と LDAP 属性対応は保持します。バックエンド変更時は非互換項目を除去します。旧版が親 JSON から削除した項目は自動復元できません。元の設定やバックアップから最優先の `HAI_STORAGE` に `publicEndpoint` などを戻して配布物を再作成してください。親 JSON に隠された YAML や末端変数だけの変更では直りません。

#### 非公開オブジェクトストレージへの直接アクセス

自前 S3 の endpoint は内部接続先です。publicEndpoint に `https://app.example.com/delivery/files` などの外部アドレスを設定できます。Nginx は `/delivery/files/<bucket>/...` を受け、入口パスだけを除去し、本来のバケット URI、署名クエリ、Host を保持して storage:9000 に転送します。Serv を経由せず、パス省略時は従来のルートバケット形式です。サイト配下に置けますが API、資源、ヘルスパスの競合は拒否します。ポートと管理コンソールは非公開、バッファリングと署名ログは無効です。認可と CORS は S3 に設定し、外部プロキシは入口パスと Host を保持してください。

自前構成は bucket/region/prefix/publicEndpoint/publicUrl/operationLog を保持し、内部接続と受管認証情報だけを置き換えます。gateway 追加や公開設定変更には完全デプロイが必要で、部分更新の事前検証は設定摘要の不一致を拒否します。アプリ/ストレージ部分更新では保持プロキシの DNS を更新し、失敗時は以前の構成に復元します。外部/保持接続にローカルルートは生成せず、Local の非公開ディレクトリも公開しません。[ストレージ手引き](../../docs/usage/configuration/data.md)を参照してください。

#### deploy のオプション

--env/--env-dir は環境、--build は先行する選択イメージ構築、--services は更新対象、--artifact-dir は既存成果物を指定します。--bundle-only は SSH 接続なしで tar と OS 別スクリプトを生成します。--runtime はローカル構築・イメージ出力エンジンです。--output はコマンドの作業ディレクトリを基準とする出力先を指定し、アプリ版を末尾に付けます。--yes は有効な設定を非対話で使い、不足値はエラーで示します。一体化構築でも --network、--no-http-proxy、--sqlite-prebuild-mirror を指定できます。

#### マシン同士が接続できる場合：自動デプロイ

```sh
pnpm run deploy --env prod --build
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --build --services web
# 複数サービスは一つの --services にカンマ区切りで指定。PowerShell 向けに引用符で囲む
pnpm run deploy --env prod --build --services "serv,web"
```

部分更新には成功済みの完全インストールと一致するポート・構成が必要です。Compose 標準の設定合成で未選択サービス、設定、ボリュームを保持します。スクリプトはプロジェクト名とサービス名で選択した旧コンテナーだけを削除し、ボリュームを保持します。その後 `compose up -d --no-deps --no-build --pull never --no-recreate web` で新しいコンテナーを作成します。他のコンテナーは稼働したままで、全体の down は実行しません。自前 S3 のバケットはアプリの `storage.init()` が任意設定 `createBucket` に従って初期化します。

`-d` はバックグラウンド起動、`--no-deps` は依存サービスを更新しない指定、`--no-build` はサーバーでの構築禁止、`--pull never` は取得禁止、`--no-recreate` は残っているコンテナーを保持します。選択した旧コンテナーは事前に削除されているため、新しいコンテナーが作成されます。末尾の `web` は Compose サービス名で、複数指定は空白で区切ります。

S3 の `createBucket` は既定で `false` です。自前 S3 には `HAI_STORAGE_CREATEBUCKET=true` を設定し、アプリ初期化時に不足するバケットだけを作成します。外部 S3 は任意で有効化します。Compose は YAML アンカーを使わず `hai-app` ネットワークを使います。storage だけの更新にアプリイメージは不要で、新規バケットは次回のアプリ初期化時に作成します。

#### マシン同士が接続できない場合：パッケージをコピー

```sh
pnpm run deploy --env prod --build --bundle-only
```

毎回 `.hai/deploy/<環境>/bundle-<プロジェクト>-<配置ID>-<版>/` を一つ生成し、外側には tar、deploy.sh、deploy.ps1、deploy-target.json、read-target.awk、deploy-local.sh、README.txt だけを保存します。Compose、実行環境、web.conf、manifest.json は tar 内に置き、外側の README にも配置 ID を記録します。ディレクトリ全体をコピーしてください。`--output release-prod.tar` は作業ディレクトリを基準に `release-prod-<版>/release-prod-<版>.tar.gz` を生成し、付属ファイルも同じ場所に置きます。tar は選択アプリ・ミドルウェアのイメージ、設定、秘密の環境ファイル、チェックサム、README、apply.sh を含みます。アップロードスクリプトの実行前に、操作ディレクトリの `deploy-target.json` を開き、各項目の説明に従ってサーバー、SSH ユーザーとポート、秘密鍵・指紋ファイル、リモートディレクトリなどを変更・確認します。Windows は deploy.ps1、Linux/macOS は deploy.sh を実行します。どちらも同じ JSON を読み、SSH 転送後に同じサーバー処理を実行します。ローカルで deploy.sh を実行するには sh、awk、ssh、scp が必要です。`sh deploy.sh ホスト [ポート] [ユーザー]` で接続先を、deploy.ps1 の `-IdentityFile` で秘密鍵を上書きできます。両方のスクリプトで HAI_DEPLOY_IDENTITY_FILE と HAI_DEPLOY_KNOWN_HOSTS_FILE による鍵・指紋ファイルのパスの上書きも可能です。別の PC・OS に移す場合、これらのパスを移動先の実ファイルに合わせます。

オフラインアップロードは鍵とパスワードの両方に対応します。`deploy-target.json` に保存するのは認証方式と `passwordEnv` 名（既定 `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`）だけで、パスワード値は含めません。操作する PC の環境から与え、今回の SSH/SCP 子プロセスだけに渡します。アプリ環境、tar、manifest には入りません。Windows では永続化したユーザー環境も参照できます。Windows は PowerShell 5+ と OpenSSH、Linux/macOS は sh、awk、ssh、scp が必要で、どちらも Node/pnpm は不要です。target の変更はその配布ディレクトリだけに適用し、プロジェクトには書き戻しません。新しい配布物は保存済みの環境設定を使います。

アップロードは操作端末の環境パスワードを優先します。不足または空の場合、`deploy.sh` / `deploy.ps1` は直ちに非表示で入力を求め、今回の配置を続行します。入力はファイルに保存せず、非対話実行は待機せず明確に失敗します。POSIX の入力には端末と `stty` が必要です。不正入力・中止も案内します。受信/総バイトと割合を表示し、成功後のみ 100% を表示します。PowerShell は脱敏済み SSH 出力を継続転送します。増分配置は停止・Compose down のサービスを既存基準とローカルイメージで復旧してから依存を確認し、選択サービスを更新します。復旧失敗時は current を更新しません。

隔離された Linux では交付ディレクトリ全体をコピーし、`sh deploy-local.sh` を実行します。スクリプトが同じ場所の tar を展開し、apply.sh が内容を検証して配置します。引数で配置先を上書きできます。各段階の失敗は非ゼロ終了し、イメージ導入・起動・HTTP 検査を別々に報告します。result-<配置ID>.json に結果を記録し、成功時だけ current を更新します。同じ配置 ID の再適用は停止しますが、同じアプリ版から生成した新しい配布物は適用できます。更新失敗時は対象コンテナーと設定を以前の状態に戻すことを試み、データボリュームと診断情報を保持します。すでに書き込まれた業務データは元に戻しません。

パッケージの `manifest.json` の `partial` と `selectedServices`、実行スクリプトに配置モードと対象を記録します。完全な構築で `--services` を省略すると全量、明示的なサービス選択または部分構築では増分です。増分にはサーバーの成功済み `current` と一致する基準が必要で、初回インストールは拒否します。

サーバーは util-linux の `flock` で配置ルートの `.deploy.lock` に非ブロッキングのカーネルロックを取得し、復元処理の終了まで保持します。通常の前景配置と同期の失敗復元は、後処理と終端結果の公開後に明示解放し、背景サービスの稼働は次の配置を妨げません。このファイルは残し、削除・置換・経過時間による横取りをしないでください。対応するファイルシステムが必要です。HUP/INT/TERM または親 shell の強制終了時は、記述子を継承した実行中の子コマンドが全 holder の終了かサーバー再起動までロックを保持します。旧 `.deploy-lock` ディレクトリは判定に使わず削除もしません。更新前に旧配置プロセスを終了し、旧パッケージを併用しないでください。強制終了・停電では復元 trap が動きません。結果ファイルがなければ実行状態は不明です。コンテナー、イメージ、成功した `current` を確認して新しいパッケージで復旧してください。ロック解放は成功や副作用の取消を意味しません。

#### 失敗時の復元と公開後のロールバック

事前検証で自前 `db`、`storage`、`vecdb` の実ボリューム名とバックエンド種類を確認します。サーバーの `<remoteDir>/persistent-backends` 台帳には起動前に対応関係を保存し、サービス削除、初回配置失敗、自動復元でも記録を残します。そのため、PostgreSQL を削除してボリュームを残した後に MySQL を追加する操作も拒否します。`managed-secrets.env`、データボリュームと一緒に保護・バックアップし、旧ボリュームを強制使用するために台帳を削除・編集しないでください。これらは配置内部のメタデータで、公開設定項目の追加はありません。

旧配置の情報を補うには、成功済み基準の既知の種類と、唯一の実サービスコンテナーの名前付きボリューム・イメージ種類が一致する必要があります。削除済みサービスの未知の旧ボリュームを、名前やパスワードから推測しません。データを確認して明示的に移行します。現行基準のボリュームがなければ配置を停止し、空のデータベースを自動生成しません。新配置の `previous-state-backends` は確認済みの旧対応関係を保存し、復元前に台帳と既存ボリュームを再確認するためだけに使います。永久台帳は巻き戻しません。

別途[管理された認証情報インポート](docs/credential-import.md)による補証も可能です。台帳に対象ボリュームの記録がない場合に限り、正しい v2 状態のプロジェクト・認証情報グループ・ボリュームが完全一致し、唯一の実行中旧コンテナーの Docker/Podman ラベル、実マウント、イメージ種類でも同じプロジェクトとサービスを確認します。一つでも不足すれば拒否し、既知の台帳やエンジン識別の競合を上書きしません。インポートは成功基準を作りません。`current` がなければ現在の CLI で**新 ID の全量パッケージ**を作り、最初の完全配置が成功してから増分を使います。

この検査は **SSH 接続先の Linux サーバー**で `apply.sh` を実行するときに適用します。SSH ユーザーとローカル daemon/store を固定し、Docker は default context、Podman は実際のローカル実行が必要です。リモート接続や明示的な保存先上書きは拒否します。本番では `remote.runtime` を検証済みの `docker` または `podman` に固定してください。Podman の追加で `auto` が別エンジンを選んだ場合、まず元の runtime、SSH ユーザー、保存先に戻します。意図的なサーバー・daemon・保存先変更は個別に移行し、同じ uid やパスだけで互換性を判断しません。Windows/macOS の操作端末で Docker Desktop や Podman VM を使って構築・梱包し、SSH で配置する方法は引き続き利用できます。

検証対象はエンジンの種類で、同一エンジンのメジャー版間の保存形式互換性は保証しません。ミドルウェアイメージは現在フレームワークが版を固定しており、更新前に移行要件とバックアップを確認します。旧成果物から作る新しい全量復旧パッケージも、同じ Compose プロジェクトで未宣言になったサービスのコンテナーを削除し、ボリュームを保持します。増分は未選択サービスを維持します。新版で追加したサービスを残す必要がある場合は、構成全体を評価して復旧範囲を決めます。

自動復元は旧リリースの設定、ポート、確認パスを使い、コンテナーと HTTP の正常性を検証します。`result-<deploymentId>.json` の `recoveryStatus` は `not-needed`（復元不要）、`passed`（旧サービスの検証成功）、`failed`（復元または検証失敗）、`stopped`（初回配置失敗後に新サービスを停止）です。失敗した配置は非ゼロ終了し、`current` は最後の成功を保持します。復元失敗時は診断を確認してください。Compose の起動成功だけでは復元完了ではありません。

公開成功後に業務確認で問題が見つかった場合、旧版の完全な成果物と対応する設定・秘密環境のバックアップを用意します。データベース構造の互換性を確認するか、業務のデータ復旧手順を実施してから設定を戻し、次を実行します。

```sh
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<previousBuildId>
```

現在の CLI で `--build` と `--services` を省略し、旧成果物から新しい配置 ID の全量パッケージを作成します。ロック、台帳、検証、起動、正常性確認を適用し、オフラインでも新しいパッケージを作成します。旧ツールや旧パッケージで保護を回避しないでください。旧 buildId に残るのは通常 serv/web アプリイメージで、ミドルウェアは現在の CLI の固定版から計画するため、すべてのミドルウェア版を正確に戻す機能ではありません。メジャー版・保存形式・Schema の互換性を確認し、成果物、対応設定、台帳、認証情報、データを保存します。`current` だけの変更、ボリューム削除、手動のイメージタグ上書きは禁止です。コンテナー復元は書込み済みデータ、互換性のない移行、外部への通知を取り消しません。

SDK はサーバー内の正常性確認と `current` 更新後、操作端末から公開アドレスも確認します。この段階のネットワーク・ファイアウォール・入口代理の障害は `remoteStage: 'complete'`、`remoteExitCode: 0` を保持し、サーバー上では公開済みの場合があります。対応結果と実際のアクセスを確認してから再実行や復元を判断してください。

#### 完全オフラインの前に確認する

完全 tar は自前ミドルウェアのアーカイブと一致するアーキテクチャを含み、起動時にレジストリーへ接続しません。Linux に Docker/Podman、Docker Compose v2 または podman-compose 1.6.0 以降、sh、tar、sha256sum、awk、curl、util-linux の flock、ディレクトリ・コンテナー権限が必要です。秘密設定を安全に転送し、版間でボリューム識別を保持します。外部ネットワークを切って起動、ログイン、再読込、再起動と永続化を検証します。HTTPS、証明書、DNS、外部サービスは別途用意します。

### 構築と配布の最適化

イメージは既定で最大 2 件を並列構築し、`--concurrency 1` で資源使用量を抑えます。ソースの前に依存をインストールし、各端で必要なソースだけをコピーします。実行イメージからアプリの型宣言・source map・README を除去します。ミドルウェアのアーカイブはイメージ内容 ID で検証・再利用し、コピーと同時にハッシュを計算します。配布の既定は `.tar.gz`、明示的な `--output release.tar` は非圧縮です。README は外側だけに保持します。成功後に今回の incoming アップロードと展開先を削除し、release に復旧設定、エンジンにイメージを保持します。

### 任意の HTTPS 証明書

`pnpm run deploy` は全コンテナーテンプレートで HTTPS なし、既存 PEM 証明書・秘密鍵、Let’s Encrypt を選択できます。相対パスは工程ルート基準です。ドメイン・期限・鍵一致を検証して配布物にコピーします。版を固定した公式 Certbot イメージで申請し、12 時間ごとに更新を確認して Nginx を再読み込みします。利用規約の承認、実際のメール、公的 DNS、80 番ポート、CA 接続が必要です。隔離環境では既存証明書を使います。状態はサーバーに保持し、秘密鍵をアプリイメージに含めません。`--yes` は保存設定を使います。

`hai.json.deploy.provider.expose.https` または環境別秘密設定で指定します。既定は HTTPS 443 と HTTP リダイレクト、省略時は HTTP です。有効/無効・モード・ドメイン・ポート・持込証明書の変更は完全デプロイが必要です。[HTTPS 設定](../../docs/usage/configuration/delivery.md#可选https证书)を参照してください。計画では `root` が工程ルート、`serviceDir` がサービスのソース・設定ディレクトリです。

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

配布時には HAI 親変数で隠れるすべての子項目と、`middleware.env` が提供する `.env.runtime` の重複項目を除去します。コンテナ内パスは配布設定に保存し、この除去処理で元の環境は変更しません。残った親オブジェクトまたは管理接続ファイルを編集します。

Node バックエンド（Serv / SvelteKit SSR）は起動ごとに配布先の `.env.runtime` を既定で読み直します。編集後に `docker restart <コンテナー>` または `podman restart <コンテナー>` を実行し、イメージ再構築や追加 override は不要です。既存配置は新 CLI で一度デプロイしてください。削除した設定を旧 Compose 環境から復活させず、管理接続の `middleware.env` を優先します。私有プロキシ識別と Node 起動引数は配置設定のままです。静的 Web・ミドルウェア・ポート/マウント・Nginx の経路と制限は従来手順で更新します。ゲートウェイの経路、ポート、マウントの変更は全量デプロイを行います。手動変更をバックアップし、継続する値は元の環境にも反映してください。次のバックエンド配置時に再生成されます。

フレームワークの永続設定は `HAI_*` を使います。`POSTGRES_*`、`MYSQL_*`、`RUSTFS_*`、`MINIO_*`、`LDAP_*` はミドルウェアイメージ必須の名前を維持し、非公開の `middleware-runtime.env` にだけ生成してミドルウェアに渡します。プロジェクト環境ファイルやアプリの `.env.runtime` には新規保存しません。増分アプリ更新用の `middleware.env` は `HAI_*` 設定のみです。既存の原生変数は自動削除せず、新しいアプリ環境から除外します。未更新サービスは以前の配布ファイルを使い続けます。

サイドカーやクラウドの `HAI_*` オブジェクトで置換した古い子変数は除去し、Redis 選択後に `HAI_CACHE_TYPE=memory` を残しません。グローバル `~/.hai/credentials.yml` は不足値のみ補い、環境・プロセスの同名キーや親設定を上書きしません。選択したミドルウェアを起動し PostgreSQL/MySQL/Redis/S3 の正常性を確認後、serv/Web を起動します。増分と復旧も同じ順序で、未選択のコンテナーは維持します。

Podman では設定済みの healthcheck を明示的に実行して状態を再確認し、systemd の自動実行に依存しません。今回の検査が失敗した場合、保存状態が `healthy` でも app の起動を許可しません。

孤立コンテナーの削除は最初の起動バッチのみで行い、後続の serv/Web 起動では準備済みのミドルウェアを維持します。

作成時に `.env.dev/.env.test/.env.prod` ごとに別の初期管理者パスワードと転送鍵リングを生成し、Git に保存します。クローン後も環境ごとに共有し、ローカル秘密ファイルやプロセス環境で上書きできます。transport 有効アプリの `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` が不足・不正ならアップロード前に設定元を案内します。同じ環境の全ノードは環境ファイルまたは Secret Manager の上書きから同じ有効リングを読み込み、ノードごとに生成しないでください。CLI 完了時はログレベルによらず `HAI_ADMIN_DEFAULT_PASSWORD` の実際の保存元を案内し、値は表示しません。初回管理者作成時だけ有効です。 オフライン入口でも、サーバーの非公開 `.env.runtime` 内のパスワード変数の場所を案内します。

配布ごとに起動時読み込み用の `.hai/deploy/<環境>/bundle-.../.env.runtime` を生成します。これは生成物であり、設定の保存元ではありません。`NODE_ENV` の既定値は対象環境に従い、`test` は `test`、`dev/development` は `development`、`prod/production` とその他は `production` です。環境設定の明示的な `NODE_ENV` が優先され、構築の最適化モードとは別です。旧配布物は再度パッケージ化してください。

プロジェクトルートの `hai.json.deploy` に配置構造、`.env.<環境>` に公開設定、`.env.<環境>.local` に SSH とミドルウェアの認証情報を保存します。環境ファイルは既定でプロジェクト/workspace ルート、変更時は `--env-dir` を指定します。設定後は `pnpm run deploy --env test --build --bundle-only --yes` で再入力を省略でき、ミドルウェア設定を保持する場合は `--skip-middleware` を追加します。対話式 bundle-only は最後に SSH 設定の保存・変更を確認します。配布物の `deploy-target.json` の編集はプロジェクトに反映されません。

自前ミドルウェアのパスワードはサーバーの `<remoteDir>/managed-secrets.env`（権限 0600）で永続管理し、データボリュームと一緒にバックアップします。各パッケージは初回用の候補のみ生成し、ビルド端末のキャッシュに依存しません。オンライン SDK、deploy.sh、deploy.ps1、deploy-local.sh は配置ロック内でサーバー値を再利用し、アプリ接続とミドルウェア固有変数の両方へ反映します。配布 tar は変更せず、サーバーの非公開実行ファイルだけに確定値を反映します。対応するボリュームが存在し状態がない場合、サービス変更前に停止してバックアップ復元を求めます。自動的なパスワード変更やデータ削除は行わず、旧認証情報は下記の明示的な検証・導入手順で移行できます。

## 読み取り専用デプロイ計画

`createDeploymentPlan(appDir, config, options)` は Provider 初期化、認証情報・出力作成、対象への接続を行いません。実際の走査、環境解決、命名と checksum 検証を共用し、工程 `root`、サービスのソース・設定 `serviceDir`、版、ビルド ID、更新・保持範囲、設定元とキー名、基準要件と復旧先を返します。値と SSH 認証情報を除外します。未読の current は not-inspected とし、部分更新は実行時に成功基準を厳密に要求します。Compose 復旧は DB データや移行を戻しません。CLI は `hai deploy --env prod --plan`。

`--plan --inspect-remote`（SDK inspectRemote:true）で SSH 経由の current と成功ディレクトリーを読み取り、verified/missing/unavailable と復旧リリース ID を示します。対象への書込は行いません。

リソースは実行側の完全な構成を共用します。`containers` は今回選択した明示名のみ、Compose が命名する LDAP/SMTP は `composeManagedServices` に表示します。SSR/API のストレージ gateway も更新・保持対象に表示します。`logicalVolumes` は保持サービスとアプリが継続使用するデータを含む構成全体の論理キーで、新規作成や再作成の指示ではありません。実際の名前は Compose プロジェクトのスコープで決まります。未選択ミドルウェアの action は keep で、クラウド開通は実際の選択範囲に従い、認証値を表示しません。

## 容量の一貫性と旧認証情報のインポート

明示された平文上限を保持し、フィードバックの必要量が超える場合は競合を示して梱包を拒否します。省略/auto だけ自動計算し、Web プロキシと Kit BODY_SIZE_LIMIT は同じ暗号文予算を使います。計画の target.runtime はリモートの provider.remote.runtime を示し、ローカル梱包 options.runtime とは別です。auto を検出済みと表示しません。

`importDeploymentSecrets({ directory, inputFile, runtime })` またはサーバー上の `hai deploy-secrets <directory> --import <private.json>` で読み取り専用検査を行います。明示 `--apply` / dryRun:false のみ保存します。プロジェクト・コンテナ・ボリューム・実際の認証情報を検証し、古いパッケージからの推測、パスワード変更、サービス再作成はしません。特殊文字対応 v2 状態をデプロイ共通 flock 内で原子的に0600で保存します。通常のオフライン配布にサーバー Node は不要で、一度限りの移行ツールには対応 Node と CLI/deploy が必要です。[導入・復旧手順](docs/credential-import.ja.md)を参照してください。

## リクエストポリシーファイルと信頼する代理

Serv の `http.access` と SvelteKit の `access` は独立した yml/yaml を参照できます。配備は `HAI_SERV`、`HAI_SERV_HTTP_ACCESS`、`HAI_KIT_ACCESS` などの環境上書きを含む実効設定を読み、検証済みの正規化スナップショットを配布物へ含めます。実行時は `/run/hai/request-access.yml` を Compose の読み取り専用マウントで参照し、工程の元の参照先は変更しません。SHA-256 検証に含まれ、ファイル不足・不正はアップロード前に失敗します。アップロードするアーカイブとそのポリシースナップショットは整合性検証の対象です。SDK 管理のスナップショットを置き換える場合は新しい配布物を作成します。配置済み Node バックエンドのマウント済み `.env.runtime` は上記手順で編集・再起動できます。インライン規則の変更ではスナップショットや Nginx 設定は書き換わりません。

全量とバックエンドを含む増分は独自のスナップショットを持ち、フロントエンドだけの増分は旧バックエンドのマウントを維持します。失敗時は前回成功した Compose とポリシーへ復旧します。非 root コンテナでも私有リリースディレクトリ内のファイルを読み取れます。イメージと設定の復旧は DB 移行や実施済み業務を取り消しません。

運用側でルールを変更して再起動で反映する場合は、配布物の外で読み取り専用ファイルを管理し、Compose override で同じ `/run/hai/request-access.yml` のマウントを置き換えます。この外部ファイルは SDK の自動復旧対象外です。初回マウント適用はコンテナ再作成、以後のファイル変更は再起動で反映できます。Compose の `env_file` だけで環境変数を注入する独自コンテナは、変更後に再作成します。通常イメージ再構築は不要です。SDK の Node バックエンドはマウント済み `.env.runtime` を再起動時に読み取ります。[設定と実測の境界](../../docs/usage/configuration/request-access.md#44-运维独立管理文件修改后重启生效)を参照してください。

Web/gateway 入口がありバックエンドのポートが非公開の場合だけ、管理 Compose は `HAI_DEPLOY_PRIVATE_PROXY=1` を設定します。この構成の `trustedProxies: auto` はコンテナネットワークを採用し、他のホストでは転送ヘッダーを無視します。生成 Nginx は実接続元で転送ヘッダーを上書きします。外側の負荷分散器は Docker SSH Provider の `trustedEdgeProxies` に実 IP/CIDR を明記してください。省略時は上流を信頼せず、`[]` も同じ動作です。Nginx 到達前に失われた源 IP は復元できず、一部の rootless 構成も実測が必要です。[リクエスト制御手引き](../../docs/usage/configuration/request-access.md)に例と確認手順を記載しています。

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
