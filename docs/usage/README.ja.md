# プロジェクト作成からアプリの公開まで

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

## 概要

このガイドでは、hai-framework を使ったアプリの作成、開発、ビルド、配布、フレームワーク更新までを説明します。例では `my-app` という名前の fullstack プロジェクトを使い、Web と API を一緒に公開します。テンプレートによる違いは、各手順で補足します。

コマンドは、このリポジトリーの CLI とテンプレートに対応しています。公開済みの CLI を使う場合は、まず `hai --version`、`hai build --help`、`hai deploy --help` で確認してください。未公開の機能は旧バージョンには含まれません。モジュールの使い方は[ルート README](../../README.ja.md)と各パッケージの README、フレームワーク自体の開発規約は [AGENTS.md](../../AGENTS.md) を参照してください。


## 主な機能

- アプリ作成と環境設定。
- 手作業・AI 開発、ソースのコンパイル、コンテナ・ネイティブ配布。
- オフライン配布、サービス単位の更新、フレームワーク更新。

## 使い始める

### 1. 開発環境を用意する

| 作業 | 必要なもの |
| --- | --- |
| 作成、開発、コンパイル、CLI 実行 | Node.js `^22.23.4 \|\| ^24.22.1 \|\| ^26.12.1`、pnpm 12.11.2。プロジェクトの `engines` と `packageManager` を確認 |
| バージョン管理、文書からの AI 実装 | Git、プロジェクトのファイルを読みコマンドを実行できる AI コーディング支援ツール |
| コンテナーイメージの作成 | インストール済みで起動している Podman または Docker。Windows では Linux コンテナーを使用 |
| デスクトップ用インストーラーの作成 | 対象 OS 上の Rust、対象アーキテクチャーのツールチェーン、Tauri が必要とする SDK とパッケージツール |
| Linux への自動デプロイ | ローカルの `tar`、`ssh`、`scp`。サーバーにはコンテナーエンジン、Compose、`sh`、`tar`、`sha256sum`、`awk`、`curl`、util-linux `flock`、対応するファイルシステムとディレクトリー操作権限 |
| デプロイ用パッケージの生成のみ | ローカルの `tar`、インストール済みの依存関係、完成したビルド成果物。ミドルウェアイメージの出力にはローカルのコンテナーエンジンも必要。SSH は不要 |

以下では `pnpm` と表記しますが、Windows PowerShell では `pnpm.cmd` を使ってください。エンジンの自動選択は Podman/Docker が利用可能かを確認するもので、インストールや起動は行いません。

以下の既定値は、引数を省略したときの動作です。対話入力が必要な場合も記載します。

| 共通オプション | 用途 | 既定値 | 例 |
| --- | --- | --- | --- |
| `-C, --cwd <path>` | 作業ディレクトリー | 現在のディレクトリー | `pnpm exec hai build --cwd ../my-app` |
| `-v, --verbose` | 詳細出力。内容はサブコマンドによる | false | `hai create my-app --verbose` |
| `-h, --help` | コマンドのヘルプ | false | `pnpm exec hai build --help` |
| `-V, --version` | アプリではなく CLI の版を表示 | false | `hai --version` |

### 2. アプリを作成する

CLI をインストールし、デプロイ機能を含む Web + API プロジェクトを作成します。

```sh
pnpm add -g @h-ai/cli
hai --version
hai create my-app --type fullstack --frontends web --yes
cd my-app
pnpm dev
```

既定では依存関係のインストールと Git の初期化も行います。対話形式で選びたい場合は `hai create my-app` を使ってください。デプロイツールは既定で有効です。不要な場合は `--no-deploy` を指定します。`--no-install` を使った場合は、起動前にプロジェクト内で `pnpm install` を実行します。初回インストールには registry への接続が必要です。オフラインでの準備は後述します。

| 作成オプション | 意味と値 | 既定値 | 例 |
| --- | --- | --- | --- |
| `[name]` | 小文字、数字、ハイフンのプロジェクト名 | 対話入力、初期値 my-app。--yes では my-app | `hai create orders-app` |
| `--type <type>` | fullstack：API とクライアント。api：contract + service。admin/website/h5：SvelteKit。mobile-app：Capacitor + Vite | 対話選択、初期値 admin。--yes では admin | `--type fullstack` |
| `--frontends <targets>` | fullstack の web/app/desktop をカンマ区切りで指定。miniapp は説明のみ | fullstack は web,app,desktop。それ以外では未使用 | `--frontends web,desktop` |
| `-t, --template <template>` | minimal/default/full/custom | fullstack は custom。それ以外は対話選択、--yes では default | `--template custom` |
| `-f, --features <features>` | 业务模块 / Application modules / 業務モジュール | 类型与模板预设 / Template defaults | `--template custom --features iam,db` |
| `--examples` / `--no-examples` | サンプルを含めるか | `true` | `--no-examples` |
| `--no-install` | 依存インストールを後回しにする | インストールする | `--no-install` |
| `--no-git` | Git 初期化を省略 | 初期化する | `--no-git` |
| `-p, --package-manager <pm>` | pnpm/npm/yarn | fullstack/API は pnpm。それ以外は検出または対話選択 | `--package-manager pnpm` |
| `--git-remote <url>` | リモート URL | 未設定 | `--git-remote https://git.example.com/team/my-app.git` |
| `-y, --yes` | 対話を省略して既定値を使う | false | `hai create my-app --yes` |

デスクトップ端末も必要なら `--frontends web,desktop` を指定します。既存アプリには `hai add <module>` で対応モジュールを追加できます。例えば `hai add deploy` です。fullstack の既定の実行依存はデータベース、キャッシュ、IAM、暗号化、ストレージ、監査で、AI は含みません。CUDA のインストールも不要です。

fullstack では `packages/my-app-contract` が API 契約、`packages/my-app-serv` が API 実装、`packages/my-app-shared` が共有処理、`apps/my-app-web` が Web クライアントです。環境ファイルはプロジェクトのルートに置きます。API テンプレートでは `apps/my-app-service` 内です。変更を始める前に、生成された README と AGENTS.md を読んでください。

### 3. 環境を設定して開発する

設定ファイルはモジュールの構造を記述します。例えば `_db.yml` の種類は `HAI_DB_TYPE` を参照します。アドレス、ポート、Provider、認証情報など環境ごとの違いは、統一された名前の環境変数で渡します。環境ごとに実装を複製せず、`PUBLIC_` や `VITE_` にサーバーの秘密情報を入れないでください。

| ファイル | 用途 | Git にコミット |
| --- | --- | --- |
| `.env.example` | 全設定項目の説明、例、列挙値。実行時に自動ロードされる設定ではない | する |
| `.env` | 全環境共通の公開基本設定 | する |
| `.env.dev` | 開発環境の公開設定 | する |
| `.env.test` | テスト環境の公開設定 | する |
| `.env.prod` | 本番環境の公開設定 | する |
| `.env.local` | このマシンの非公開設定、認証情報、SSH パスなど | しない |

優先順位は **既存のプロセス変数 > `.env.local` > `.env.<環境>` > `.env`** です。環境を切り替えるときは `.env.local` も確認してください。そこにある接続先は別環境を指したままかもしれません。JSON でオブジェクト全体を指定した場合は、個別の子フィールドより優先されます。利用できる変数と値は生成プロジェクトの `.env.example`、フレームワーク全体の一覧は[ルート `.env.example`](../../.env.example)を参照してください。コミットするファイルには公開設定だけを入れ、実際の認証情報は非公開ファイルかデプロイ用プロセス変数で管理します。

```sh
pnpm dev
pnpm dev:test
pnpm dev:prod
```

これらは開発サーバーが使う環境を切り替えます。ビルドはデプロイ先の環境に依存しません。ビルド済み Node サービスは `start:test` / `start:prod` で起動します。fullstack ルートの `start` は API のみです。ローカルで Web を確認する場合はクライアント側の `preview` を使い、コンテナーデプロイでは Web と API をまとめて起動します。

#### 手作業でコードを書く場合

入力と出力、権限、データの変更、受け入れ条件を決めてから、既存モジュールの公開 API を使って実装します。fullstack は通常 contract を変更し、サービス処理、クライアント呼び出しの順に進めます。SvelteKit はファイルルーティングとサーバー側ロードを継続します。fullstack とモバイル端末はページを自動検出する hash ルートを使うため、ページ追加で中央のルート表を変更する必要はなく、再読み込みでも現在のページを保持します。共通の header/footer も引き続き使います。

SvelteKit プロジェクトでは、`hai generate page dashboard` や `hai generate component UserCard` でひな型を生成できます。現在の page/api 生成器は SvelteKit のファイルルートを出力します。fullstack/API workspace の contract、procedure、hash ページは生成しないため、既存の構成に沿って実装します。業務ルールも別途実装してください。ライフサイクルを持つモジュール、ファクトリー、純粋関数を区別し、`HaiResult` は `success` を確認してから使います。公開関数、主要ロジック、テーブル、データ構造には JSDoc と利用例・データ例を付けます。

機能ごとに、プロジェクトの scripts で検証します。

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

E2E の前に Playwright が使うブラウザーと必要なサービスを用意してください。文言だけの変更などは影響に応じて検証を選び、重複するテストを増やす必要はありません。UI 変更は実際の操作とスクリーンショットで確認します。テスト用の一時プロジェクト、コンテナー、プロセス、ログ、画像、レポートは teardown/finally で成功・失敗・中断時とも自動削除します。検証成果物をコミットしたり、ユーザーが元から使っていたリソースを削除したりしないでください。

#### AI first：文書を確認してから実装し、変更も文書から反映する

CLI はアプリの `.agents/skills/` に完全な skill 一式を配置します。以下の名前は AI に渡す作業の入口で、シェルコマンドではありません。「hai-spec-review を使って……」と依頼するか、対応する `SKILL.md` を読ませてください。ショートカットの呼び出し方法は利用ツールによって異なります。

1. **まず業務を記述します。** `docs/` に要件と必要な設計を置き、目的、ロール、権限、ページ/API、フィールドと列挙値、状態変化、失敗時の表示、受け入れ条件、対象外を明確にします。小さな範囲からで構いませんが、実装者が業務ルールを推測しなくて済む内容にします。
2. **[hai-spec-review](../../packages/cli/templates/skills/hai-spec-review/SKILL.md) で文書を確認します。** 例えば「docs/requirements.md と docs/design.md が実装に十分か確認し、問題と具体的な修正文を示してください。まだコードは書かないでください」と依頼します。修正後に再確認し、承認済みの範囲とバージョンを固定します。明確な業務要件に合わせてテンプレートのロールや処理を変更できます。
3. **[hai-spec-implement](../../packages/cli/templates/skills/hai-spec-implement/SKILL.md) で実装します。** 確定した業務文書をコミットしてから、「確認済み文書を計画に分け、依存順に実装・検証してローカルでマージしてください。push や公開はしないでください」と依頼します。`docs/task-list.md`、`docs/tasks/T001-….md`、要件との対応、文書ベースラインを管理し、ビルドが通っただけで完了とはしません。
4. **各タスクで実装・テスト・レビューを行います。** [hai-app-create](../../packages/cli/templates/skills/hai-app-create/SKILL.md) は機能開発とフレームワーク再利用、[hai-app-tests](../../packages/cli/templates/skills/hai-app-tests/SKILL.md) は単体・統合・ブラウザーテスト、[hai-app-review](../../packages/cli/templates/skills/hai-app-review/SKILL.md) は安全性、戻り値の契約、コード、実操作を確認します。小さな機能追加や修正なら、この三つを直接使えます。
5. **PR の前に [hai-pr-review](../../packages/cli/templates/skills/hai-pr-review/SKILL.md) を使います。** 変更範囲、diff、検証結果、未検証項目を渡して、リスクとマージ準備状況を確認します。AI の確認は CI 通過を意味せず、コメント投稿、push、マージ、デプロイの権限も自動では与えません。

要件が変わったら、先に関係する業務文書を更新してコミットし、変更を再確認します。そのうえで「hai-spec-implement を使い、検収済み文書ベースラインから今回の文書コミットまでの差分を実装に反映し、既存タスクを再利用して統合検証してください」と依頼します。旧・新のスナップショットを固定し、関連ルール、タスク、実装、テスト、文書を更新します。全体の検収後にだけベースラインを進めます。現在の HEAD を旧ベースラインと決めつけたり、未マージのブランチを完了扱いにしたりしないでください。中断後はタスク一覧から再開できます。

`hai-app-create`、`hai-app-review`、`hai-app-tests`、`hai-pr-review` は四つとも実際に CLI から配布されるアプリ用 skills です。フレームワークのソース側にある `hai-app-create` / `hai-app-review` はリポジトリーの保守用で、名前と対象が異なります。

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

構築器はパッケージ情報、ローカルアーカイブとパッチを images/dependencies/ に準備します。依存レイヤーを再利用し、取得・インストール・本番依存の収集で同じ pnpm store と SQLite ドライバーのキャッシュを共有します。通常のソース変更で全依存を再ダウンロードしない構成です。キャッシュが空でもオンライン構築できます。Windows の node_modules は Linux のネイティブ依存を代替できません。完全オフライン構築には基底イメージ、ツールと一致する ABI・アーキテクチャ・libc のバイナリも準備します。

標準コンテナーは CPU 実行またはリモート AI サービスへの接続向けで、追加の GPU ランタイムをダウンロードしません。デプロイ先の GPU を使う場合は、イメージとコンテナーの実行設定を個別に調整してください。

アプリの版はルート package.json.version で管理します。`.hai/build/docker/<buildId>/` に形式 3 の manifest.json、選択イメージの tar と SHA-256 を出力します。partial は部分構築、hasWeb は構成を記録します。同じアプリ版でも再構築可能で、構築 ID とイメージ参照で内容を区別します。全出力に成功してからローカルの構築参照を更新します。基底・ミドルウェア・ツールは版を固定し、latest を使いません。

### 5. 成果物を対象環境へデプロイする

#### 環境と接続先を用意する

`.env.<環境>` とプロジェクトルートの `hai.json` を用意します。`build` にイメージ・ネイティブ構築、`deploy` にアプリ全体の配置設定を保存します。fullstack は packages/<プロジェクト>-serv、API workspace は apps/<プロジェクト>-service を実行依存とモジュール YAML の走査入口として使います。フロントとバックエンドは同じ設定を共有します。

`deploy` は `${変数:既定値}` と `HAI_DEPLOY_*` による階層的な上書き（JSON オブジェクト全体も可）をサポートします。優先順はプロセス > `.env.<環境>.local` > `.env.<環境>` > 旧 `.env.local` > `.env` です。他モジュールはプロセス > 環境非公開 > 旧共有非公開 > 環境公開 > 基礎の順序を維持します。この非公開層は配置 SDK 専用で、Core の通常読み込みは変更しません。構築時には配置設定や秘密値を読み込みません。

既存プロジェクトは旧構築オブジェクトを `hai.json.build`、旧配置 YAML を JSON に変換して `hai.json.deploy` に移し、元のファイルを削除します。`HAI_DEPLOY_*` は継続利用できます。既存の自前 S3 は今回の初回更新で全量配置が必要です。旧基準には終了済みの初期化サービスが残っており、新しい増分パッケージの依存稼働チェックで拒否されます。全量配置で `createBucket` 設定も更新した後は増分更新を継続できます。

直接配置では不足する SSH 設定を初回に入力し、鍵/agent とパスワードに対応します。SSH は `.env.<環境>.local` に保存し、パスワードは非表示入力、秘密鍵はパスのみです。ミドルウェア公開設定は `.env.<環境>`、秘密値は `.env.<環境>.local` に保存します。設定後は `--yes` で質問を省略でき、ミドルウェアを保持する場合は `--skip-middleware` を追加します。bundle-only は SSH を質問せず、既存接続を `deploy-target.json` に含めます。この編集は現在の配布物だけに適用されます。離線パスワードは target が参照する操作機の環境変数（既定 `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`）から読み、配布物には含めません。

配布ごとに `.hai/deploy/<環境>/bundle-.../.env.runtime` を生成します。`--env test` は既定で `NODE_ENV=test`、dev は development、prod とその他は production です。明示設定が優先されます。この生成物は次回設定の保存元ではなく、構築の最適化モードとも別です。旧パッケージは再生成してください。既存ボリュームを使う際は、走査対象サービスの `.hai/deploy/runtime/<プロジェクト>-<環境>.secrets.json` の固定認証情報を保持します。

#### 本当に必要なミドルウェアだけを設定する

実行依存と設定に基づき、既定、自分の接続、設定維持を選びます。--skip-middleware は設定と開通を省略します。SQLite、メモリーキャッシュ、ローカル保存には外部イメージがありません。完全配布物には自前ミドルウェアのイメージも自動で含めます。外部サービスは接続先への到達性が必要で、クラウド開通はオフライン処理ではありません。

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

隔離された Linux では交付ディレクトリ全体をコピーし、`sh deploy-local.sh` を実行します。スクリプトが同じ場所の tar を展開し、apply.sh が内容を検証して配置します。引数で配置先を上書きできます。各段階の失敗は非ゼロ終了し、イメージ導入・起動・HTTP 検査を別々に報告します。result-<配置ID>.json に結果を記録し、成功時だけ current を更新します。同じ配置 ID の再適用は停止しますが、同じアプリ版から生成した新しい配布物は適用できます。更新失敗時は対象コンテナーと設定を以前の状態に戻すことを試み、データボリュームと診断情報を保持します。すでに書き込まれた業務データは元に戻しません。

パッケージの `manifest.json` の `partial` と `selectedServices`、実行スクリプトに配置モードと対象を記録します。完全な構築で `--services` を省略すると全量、明示的なサービス選択または部分構築では増分です。増分にはサーバーの成功済み `current` と一致する基準が必要で、初回インストールは拒否します。

#### 完全オフラインの前に確認する

完全 tar は自前ミドルウェアのアーカイブと一致するアーキテクチャを含み、起動時にレジストリーへ接続しません。Linux に Docker/Podman、Docker Compose v2 または podman-compose 1.6.0 以降、sh、tar、sha256sum、awk、curl、util-linux flock、対応するファイルシステム、ディレクトリ・コンテナー権限が必要です。秘密設定を安全に転送し、版間でボリューム識別を保持します。外部ネットワークを切って起動、ログイン、再読込、再起動と永続化を検証します。HTTPS、証明書、DNS、外部サービスは別途用意します。

配置と復元の間は固定 `.deploy.lock` のカーネルロックを保持し、削除・置換・時間による横取りを禁止します。親が強制終了しても子はロックを保持でき、全保持プロセス終了または再起動で解放されます。強制終了時は復元 trap が動かないため、結果、`current` と実コンテナーを確認して新しいパッケージで復旧してください。[配置ガイド](../../packages/deploy/README.ja.md)を参照してください。

失敗表示はローカル管理対象プロセスの終了確認/未確認と、遠隔 script の不明/完了を分けます。SDK `getDeployCommandState(error)` は配置 ID と結果パスを返します。別接続で完全かつ ID が一致する原子的な結果を読んだ場合だけ遠隔 script と復元の完了を確認し、ローカル SSH 終了を遠隔停止とみなしません。不明状態で配置や復元を自動再実行しません。

### 6. アプリの変更を保ちながらフレームワークを更新する

アプリのディレクトリーで [hai-framework-sync](../../packages/cli/templates/skills/hai-framework-sync/SKILL.md) を使うよう依頼します。

> hai-framework を最新の公開済みバージョンに更新してください。現在の依存と対象版を確認し、差分と選択が必要な事項を説明したうえで、依存、呼び出し、設定、skills を移行してください。プロジェクト固有ルールを保持して検証まで行い、公開やデプロイはしないでください。

特定の版を指定したり、比較だけを依頼したりすることもできます。実際の registry/dist-tag、使用中の全パッケージの対象版と実行要件、途中の版を含む差分を確認し、固定バージョンと lockfile、公開 API、設定、scripts、skill の関連資料を更新します。ネットワーク障害や公開版の不足は対処が必要な事項として示し、キャッシュを「最新」とは扱いません。

`hai init` は旧プロジェクトに不足する AI 入口と skills を補いますが、既存ファイルは保持します。フレームワーク更新コマンドではなく、古いルールを上書きもしません。既存 skill は旧テンプレート、アプリ固有の変更、新テンプレートを比較して統合します。ソースの `main` と npm 公開版も同一とは限りません。

更新後はプロジェクトの typecheck、lint、build、test と影響範囲の E2E を実行し、認証、データ、主要処理を実際に確認します。配布するイメージやインストーラーを再生成し、第 5 節の手順でデプロイします。版番号の変更やビルド成功だけでは更新完了とはいえません。

## 開発とテスト

生成工程の scripts に従い `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm test`、`pnpm test:e2e` を実行します。コンテナ配布は対象環境のイメージ、スクリプト、ヘルスチェックと復元も検証します。ブラウザー検証はネイティブ検証を代替しません。

## ライセンス

Apache-2.0
