# プロジェクト作成からアプリの公開まで

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

このガイドでは、hai-framework を使ったアプリの作成、開発、ビルド、配布、フレームワーク更新までを説明します。例では `my-app` という名前の fullstack プロジェクトを使い、Web と API を一緒に公開します。テンプレートによる違いは、各手順で補足します。

コマンドは、このリポジトリーの CLI とテンプレートに対応しています。公開済みの CLI を使う場合は、まず `hai --version`、`hai build --help`、`hai deploy --help` で確認してください。未公開の機能は旧バージョンには含まれません。モジュールの使い方は[ルート README](../../README.ja.md)と各パッケージの README、フレームワーク自体の開発規約は [AGENTS.md](../../AGENTS.md) を参照してください。

## 1. 開発環境を用意する

| 作業 | 必要なもの |
| --- | --- |
| 作成、開発、コンパイル、CLI 実行 | Node.js `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`、pnpm 12.11.2。プロジェクトの `engines` と `packageManager` を確認 |
| バージョン管理、文書からの AI 実装 | Git、プロジェクトのファイルを読みコマンドを実行できる AI コーディング支援ツール |
| コンテナーイメージの作成 | インストール済みで起動している Podman または Docker。Windows では Linux コンテナーを使用 |
| デスクトップ用インストーラーの作成 | 対象 OS 上の Rust、対象アーキテクチャーのツールチェーン、Tauri が必要とする SDK とパッケージツール |
| Linux への自動デプロイ | ローカルの `tar`、`ssh`、`scp`。サーバーにはコンテナーエンジン、Compose、`sh`、`tar`、`sha256sum` とディレクトリー操作権限 |
| デプロイ用パッケージの生成のみ | ローカルの `tar`、インストール済みの依存関係、完成したビルド成果物。SSH やローカルのコンテナーエンジンは不要 |

以下では `pnpm` と表記しますが、Windows PowerShell では `pnpm.cmd` を使ってください。エンジンの自動選択は Podman/Docker が利用可能かを確認するもので、インストールや起動は行いません。

以下の既定値は、引数を省略したときの動作です。対話入力が必要な場合も記載します。

| 共通オプション | 用途 | 既定値 | 例 |
| --- | --- | --- | --- |
| `-C, --cwd <path>` | 作業ディレクトリー | 現在のディレクトリー | `pnpm exec hai build --cwd ../my-app` |
| `-v, --verbose` | 詳細出力。内容はサブコマンドによる | false | `hai create my-app --verbose` |
| `-h, --help` | コマンドのヘルプ | false | `pnpm exec hai build --help` |
| `-V, --version` | アプリではなく CLI の版を表示 | false | `hai --version` |

## 2. アプリを作成する

CLI をインストールし、デプロイ機能を含む Web + API プロジェクトを作成します。

```sh
pnpm add -g @h-ai/cli
hai --version
hai create my-app --type fullstack --frontends web --features deploy --yes
cd my-app
pnpm dev
```

既定では依存関係のインストールと Git の初期化も行います。対話形式で選びたい場合は `hai create my-app` を使ってください。fullstack のデプロイ機能は `--features deploy` で明示的に追加します。`--no-install` を使った場合は、起動前にプロジェクト内で `pnpm install` を実行します。初回インストールには registry への接続が必要です。オフラインでの準備は後述します。

| 作成オプション | 意味と値 | 既定値 | 例 |
| --- | --- | --- | --- |
| `[name]` | 小文字、数字、ハイフンのプロジェクト名 | 対話入力、初期値 my-app。--yes では my-app | `hai create orders-app` |
| `--type <type>` | fullstack：API とクライアント。api：contract + service。admin/website/h5：SvelteKit。mobile-app：Capacitor + Vite | 対話選択、初期値 admin。--yes では admin | `--type fullstack` |
| `--frontends <targets>` | fullstack の web/app/desktop をカンマ区切りで指定。miniapp は説明のみ | fullstack は web,app,desktop。それ以外では未使用 | `--frontends web,desktop` |
| `-t, --template <template>` | minimal/default/full/custom | fullstack は custom。それ以外は対話選択、--yes では default | `--template custom` |
| `-f, --features <features>` | fullstack 以外の個別選択は custom を使用。[CLI 一覧](../../packages/cli/README.ja.md)を参照。fullstack は追加の deploy を有効化 | 種類とテンプレートのプリセット。fullstack の deploy は無効 | `--template custom --features iam,db,deploy`。fullstack は `--features deploy` |
| `--examples` / `--no-examples` | サンプルを含めるか | `true` | `--no-examples` |
| `--no-install` | 依存インストールを後回しにする | インストールする | `--no-install` |
| `--no-git` | Git 初期化を省略 | 初期化する | `--no-git` |
| `-p, --package-manager <pm>` | pnpm/npm/yarn | fullstack/API は pnpm。それ以外は検出または対話選択 | `--package-manager pnpm` |
| `--git-remote <url>` | リモート URL | 未設定 | `--git-remote https://git.example.com/team/my-app.git` |
| `-y, --yes` | 対話を省略して既定値を使う | false | `hai create my-app --yes` |

デスクトップ端末も必要なら `--frontends web,desktop` を指定します。既存アプリには `hai add <module>` で対応モジュールを追加できます。例えば `hai add deploy` です。fullstack の既定の実行依存はデータベース、キャッシュ、IAM、暗号化、ストレージ、監査で、AI は含みません。CUDA のインストールも不要です。

fullstack では `packages/my-app-contract` が API 契約、`packages/my-app-serv` が API 実装、`packages/my-app-shared` が共有処理、`apps/my-app-web` が Web クライアントです。環境ファイルはプロジェクトのルートに置きます。API テンプレートでは `apps/my-app-service` 内です。変更を始める前に、生成された README と AGENTS.md を読んでください。

## 3. 環境を設定して開発する

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

### 手作業でコードを書く場合

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

### AI first：文書を確認してから実装し、変更も文書から反映する

CLI はアプリの `.agents/skills/` に完全な skill 一式を配置します。以下の名前は AI に渡す作業の入口で、シェルコマンドではありません。「hai-spec-review を使って……」と依頼するか、対応する `SKILL.md` を読ませてください。ショートカットの呼び出し方法は利用ツールによって異なります。

1. **まず業務を記述します。** `docs/` に要件と必要な設計を置き、目的、ロール、権限、ページ/API、フィールドと列挙値、状態変化、失敗時の表示、受け入れ条件、対象外を明確にします。小さな範囲からで構いませんが、実装者が業務ルールを推測しなくて済む内容にします。
2. **[hai-spec-review](../../packages/cli/templates/skills/hai-spec-review/SKILL.md) で文書を確認します。** 例えば「docs/requirements.md と docs/design.md が実装に十分か確認し、問題と具体的な修正文を示してください。まだコードは書かないでください」と依頼します。修正後に再確認し、承認済みの範囲とバージョンを固定します。明確な業務要件に合わせてテンプレートのロールや処理を変更できます。
3. **[hai-spec-implement](../../packages/cli/templates/skills/hai-spec-implement/SKILL.md) で実装します。** 確定した業務文書をコミットしてから、「確認済み文書を計画に分け、依存順に実装・検証してローカルでマージしてください。push や公開はしないでください」と依頼します。`docs/task-list.md`、`docs/tasks/T001-….md`、要件との対応、文書ベースラインを管理し、ビルドが通っただけで完了とはしません。
4. **各タスクで実装・テスト・レビューを行います。** [hai-app-create](../../packages/cli/templates/skills/hai-app-create/SKILL.md) は機能開発とフレームワーク再利用、[hai-app-tests](../../packages/cli/templates/skills/hai-app-tests/SKILL.md) は単体・統合・ブラウザーテスト、[hai-app-review](../../packages/cli/templates/skills/hai-app-review/SKILL.md) は安全性、戻り値の契約、コード、実操作を確認します。小さな機能追加や修正なら、この三つを直接使えます。
5. **PR の前に [hai-pr-review](../../packages/cli/templates/skills/hai-pr-review/SKILL.md) を使います。** 変更範囲、diff、検証結果、未検証項目を渡して、リスクとマージ準備状況を確認します。AI の確認は CI 通過を意味せず、コメント投稿、push、マージ、デプロイの権限も自動では与えません。

要件が変わったら、先に関係する業務文書を更新してコミットし、変更を再確認します。そのうえで「hai-spec-implement を使い、検収済み文書ベースラインから今回の文書コミットまでの差分を実装に反映し、既存タスクを再利用して統合検証してください」と依頼します。旧・新のスナップショットを固定し、関連ルール、タスク、実装、テスト、文書を更新します。全体の検収後にだけベースラインを進めます。現在の HEAD を旧ベースラインと決めつけたり、未マージのブランチを完了扱いにしたりしないでください。中断後はタスク一覧から再開できます。

`hai-app-create`、`hai-app-review`、`hai-app-tests`、`hai-pr-review` は四つとも実際に CLI から配布されるアプリ用 skills です。フレームワークのソース側にある `hai-create-app` / `hai-review-app` はリポジトリーの保守用で、名前と対象が異なります。

## 4. ソースをコンパイルし、配布物を作る

**ビルドは一度行い、環境はデプロイ時に選びます。** 生成プロジェクトの `pnpm build` は既定でソースをコンパイルします。イメージやデスクトップ用インストーラーは `--target` で選びます。デプロイ環境の上書き設定や実行時の秘密情報はビルドに取り込まず、`build:prod` やビルド用 `--env prod` は使いません。

--target は一度に一つの値を指定します。三つを続けて指定する形式ではありません。

| 対象 | 実行内容 | 出力と用途 |
| --- | --- | --- |
| compile | compile スクリプトで TypeScript、Svelte、共有 contract をコンパイル | dist/build など。確認、プレビュー、直接起動向け。イメージ tar、デプロイ tar、インストーラーは作らない |
| docker | Podman/Docker が Dockerfile に従ってコンパイルし、images のイメージを作成・保存 | API/任意の Web イメージ tar とマニフェスト。後で deploy に渡す。サーバーには接続しない |
| desktop | Tauri がフロントエンド、Rust、OS 用インストーラーを作成 | Windows NSIS exe、Linux deb/AppImage、macOS app/dmg。Compose 作成や API 公開は行わない |

イメージとデスクトップのビルドには必要なコンパイルが含まれます。先に compile を実行する必要はありません。イメージ tar はイメージだけですが、後で作るデプロイ tar は環境別 Compose、実行設定、起動スクリプトも含みます。

```sh
pnpm build
pnpm build --target compile
pnpm build --target docker
pnpm build --target docker --runtime podman --no-http-proxy
pnpm build --target docker --runtime docker
pnpm build --target desktop --platform windows --arch x64
```

`compile` は実際のコンパイラーを呼ぶ内部スクリプトです。これや Dockerfile、Tauri の `beforeBuildCommand` から同じイメージ/ネイティブビルドを再帰的に呼ばないでください。出力先は構成によって異なり、Vite は `dist`、SvelteKit は `build`、contract/service は各 workspace のビルド先です。

### build のオプション

| build オプション | 意味と値 | 既定値 | 例 |
| --- | --- | --- | --- |
| `--target <target>` | compile/docker/desktop。上表を参照 | compile | `pnpm build --target docker` |
| `--runtime <runtime>` | イメージ専用。auto/podman/docker | auto。利用可能な Podman、次に Docker | `--target docker --runtime docker` |
| `--network <network>` | イメージ専用。Podman は private/pasta/none/host、Docker は default/none/host。その他はエンジンが検証。pasta は rootless Podman 専用 | エンジンの既定値 | `--target docker --runtime podman --network pasta` |
| `--platform <platform>` | デスクトップ専用。windows/linux/macos。ホストと一致させる | 現在の OS | `--target desktop --platform windows` |
| `--arch <arch>` | デスクトップ専用。x64/arm64。対応 Rust target/SDK が必要 | ホストのアーキテクチャー | `--target desktop --arch x64` |
| `--sqlite-prebuild-mirror <url>` | イメージ専用。対応 Dockerfile の SQLite バイナリー取得先。HTTP(S)、認証情報/クエリー/フラグメント不可 | 上流の取得先を使用 | `--target docker --sqlite-prebuild-mirror http://mirror.internal/better-sqlite3` |
| `--no-http-proxy` | イメージ専用。Podman でホストのプロキシを継承しない。Docker エンジン向けの指定ではない | Podman は継承する | `--target docker --runtime podman --no-http-proxy` |

これらは hai build の引数です。共通引数は第 1 節、ヘルプは `pnpm exec hai build --help` を参照してください。対象に合わない引数はエラーになります。イメージのアーキテクチャーはエンジンと Dockerfile で決まり、デスクトップの --arch は Docker のクロスビルド指定ではありません。

Podman は既定でホストの `HTTP_PROXY`、`HTTPS_PROXY`、`FTP_PROXY`、`NO_PROXY` と小文字の同名変数をビルド引数で渡します。Windows/macOS のリモートエンジンにも対応します。Windows Podman の `http://host.containers.internal:10808` など、コンテナーから到達できるアドレスを使い、ホストの `127.0.0.1` をそのまま使わないでください。`--no-http-proxy` で転送を無効にし、Dockerfile の ENV にプロキシを保存しないでください。

WSL/Podman の構成によっては build と run でネットワークや名前解決が異なります。ビルド中の到達性を確認し、rootless Podman では必要に応じて `--network pasta` とそのネットワークから到達できるプロキシを指定してください。変更はビルドだけに適用され、配布サービスのネットワークには影響しません。

### hai.build.json でパッケージの構成を指定する

アプリのルートに配置し、ビルド構成を記述します。環境名、サーバー、秘密情報は入れません。Web とデスクトップを含む fullstack の例です。Web のみなら `desktop` を省いてください。

```json
{
  "images": [
    { "name": "app", "context": ".", "dockerfile": "Dockerfile", "target": "runtime", "containerPort": 3000 },
    { "name": "web", "context": ".", "dockerfile": "Dockerfile", "target": "web", "containerPort": 8080 }
  ],
  "desktop": ["apps/my-app-desktop"]
}
```

| 項目 | 意味と制約 | 既定値 | 例 |
| --- | --- | --- | --- |
| `images` | docker で必須。app 一つ、任意で web 一つ | 未設定。ビルド前に必要 | `[{"name":"app","target":"runtime"}]` |
| `images[].name` | app/web の役割。Web があれば API と同時に公開 | 必須、既定値なし | `"web"` |
| `images[].context` | ルートからの相対ビルドコンテキスト | `"."` | `"../.."` |
| `images[].dockerfile` | context からの相対 Dockerfile パス | `"Dockerfile"` | `"apps/api-service/Dockerfile"` |
| `images[].target` | Dockerfile の実在するステージ名。CLI の三種類の target とは別 | 最終ステージ。テンプレートは runtime/web を明示 | `"runtime"` / `"web"` |
| `images[].containerPort` | サービスと一致する内部ポート、整数 1–65535 | API はデプロイ設定のポート（既定 3000）、Web は 8080 | `3000` / `8080` |
| `desktop` | desktop で必須。ルートからの相対 Tauri ディレクトリー、順番にビルド | 未設定。ビルド前に必要 | `["apps/my-app-desktop"]` |

images[].target は「Dockerfile のどの段階を作るか」、CLI の --target は「どのビルド方式を使うか」です。fullstack の Dockerfile では次のように使います。

| ステージ | 内容と用途 | 既定の選択 | 設定例 |
| --- | --- | --- | --- |
| runtime | API と本番依存関係。app の配布イメージ | app が使用 | `{"name":"app","target":"runtime","containerPort":3000}` |
| web | Nginx と Web 静的ファイル。Web 生成時だけ存在 | web が使用。Web がある場合の最終段階でもある | `{"name":"web","target":"web","containerPort":8080}` |
| build、service-build、service | コンパイラー、依存整理、runtime が継承する中間段階 | 通常は配布用に選ばない | 中間段階を調べる場合だけ `"target":"build"` |

他のテンプレートには runtime-base などもあります。独自 Dockerfile は独自のステージ名を使えますが、存在しない名前はエンジンが拒否します。fullstack の app で target を省くと、Web がある場合は最終段階 web を API として扱ってしまうため、省略しないでください。

リポジトリー内の `apps/*` では、monorepo のルートを使うために `context: "../.."`、`dockerfile: "apps/<name>/Dockerfile"` とする場合があります。独立して生成したプロジェクトは通常 `.` です。Dockerfile のステージを変えたら `target` も合わせてください。

版は build を実行するアプリルートの package.json.version から取得します。例は 1.2.3 で、プレリリース/ビルド情報に対応し、最大 80 文字です。fullstack はルートだけを変更し、サービス/デスクトップを個別に変更する必要はありません。出力は `.hai/build/docker/1.2.3-<時刻>-<乱数>/manifest.json`、app-1.2.3.tar、任意の web-1.2.3.tar です。マニフェストの version: 2 は形式の版で、appVersion: "1.2.3" がアプリの版です。buildId、イメージ参照、ポート、SHA-256 も記録します。タグは版と一意のビルド番号を含み、同じ版の再ビルドも区別します。全出力後に latest を更新します。ディレクトリー全体を運び、マニフェストの手動変更は避けてください。

デスクトップも同じルートの版を Tauri に渡します。Windows のインストーラー exe（例 my-app_1.2.3_x64-setup.exe）、Linux の deb/AppImage、macOS の dmg は名前に版を含みます。macOS app はアプリ名を保持し、版をメタデータに持ちます。出力は各プロジェクトの `src-tauri/target/<Rust target>/release/bundle/` です。Linux/macOS は対応ホストで --platform linux/macos を使用します。OS ごとに runner を用意し、異なる OS へのクロスコンパイルは前提にしません。Capacitor のコマンドと SDK は生成 README を参照してください。desktop は APK/IPA を作りません。

fullstack の `tauri.conf.json` は `"version": "../../../package.json"` でアプリルートの版を参照します。[Tauri が対応するバージョンファイルのパス](https://v2.tauri.app/reference/config/#version)であり、`apps/<プロジェクト>-desktop/src-tauri/` から三階層上を指します。

静的クライアントの API アドレスは公開用の実行時設定から取得します。ネイティブ端末では起動前に `PUBLIC_API_BASE` を設定できます。公開変数に認証情報を入れず、環境変更のためだけにイメージを作り直す必要はありません。

## 5. 成果物を対象環境へデプロイする

`hai deploy` は CLI の入口で、内部では `@h-ai/deploy` を使い、完成した成果物だけを扱います。以下は生成アプリのルートで実行します。pnpm 自体の同名コマンドと混同しないよう、プロジェクトスクリプトは `pnpm run deploy` と明示します。

```sh
pnpm build --target docker
pnpm run deploy --env test
pnpm run deploy --env prod --skip-middleware
```

pnpm run deploy はルート package.json に生成されたスクリプトを実行します。fullstack は `hai deploy packages/my-app-serv` です。このサービスディレクトリーはバックエンド設定と実行依存を読む入口であり、**API だけをデプロイする意味ではありません**。上位のルートにあるマニフェストから app と web を取り、同時に公開するので、Web の別デプロイは不要です。

API テンプレートは contract と API だけで Web を持たず、`hai deploy apps/my-app-service` で app のみを公開します。パスはテンプレート構成の違いで、日常はどちらもルートで pnpm run deploy を実行します。単一パッケージは hai deploy です。fullstack の入口を明示する場合は次のとおりです。

```sh
pnpm exec hai deploy packages/my-app-serv --env prod --env-dir .
```

### 環境と接続先を用意する

最初に環境を選び、`.env.test` / `.env.prod` などの対象ファイルを確認します。なければ `.env.example` を参考に作成してから再実行してください。本番設定を推測して続行することはありません。`--env-dir` は、コマンドの作業ディレクトリーを基準に環境ファイルの場所を指定します。

サービスの `config/_deploy.yml` に Provider と公開ポートを設定します。

```yaml
provider:
  type: docker-ssh
  expose:
    hostPort: 18080
container:
  s3Engine: ${HAI_DEPLOY_CONTAINER_S3ENGINE:rustfs}
```

container.s3Engine は任意で、全プロジェクトに追加する必要はありません。HAI_STORAGE_TYPE=s3 はプロトコルの指定であり、作成する S3 サーバーの種類は決まりません。既定設定で Compose に S3 サービスを新設するときだけ、RustFS/MinIO のイメージ、起動方法、バケット初期化を選びます。ローカル保存、既存 S3 へのカスタム接続、ミドルウェアのスキップでは新設しません。

| S3 設定 | 意味と値 | 既定値 | 例 |
| --- | --- | --- | --- |
| container.s3Engine | 自動作成する実装 rustfs/minio | container 自体を省いても rustfs | 上記 YAML の環境変数参照 |
| HAI_DEPLOY_CONTAINER_S3ENGINE | 選択した環境ファイルに保存する共通変数 | 未設定時は schema/YAML の rustfs | .env.prod に `HAI_DEPLOY_CONTAINER_S3ENGINE=minio` |

対話で選ぶと変数を保存し、不足する YAML 参照も補うため、手で追加しなくても構いません。

初回の自動デプロイでは、Linux アドレス、SSH ユーザー/ポート、秘密鍵と known_hosts のパス、リモートディレクトリー、エンジン、公開ポートを入力します。`.env.local` に保存され、次回から再利用できます。秘密鍵はパスだけを保存します。オブジェクト全体を先に設定することもできます。

```dotenv
HAI_DEPLOY_PROVIDER='{"type":"docker-ssh","ssh":{"host":"10.0.0.20","username":"deploy","port":22,"identityFile":"C:/Users/me/.ssh/hai_deploy"},"remote":{"baseDir":"/opt/hai/apps","runtime":"docker"},"expose":{"hostPort":18080,"containerPort":3000}}'
```

例のアドレスとパスは置き換えてください。SSH ホストの指紋を確認し、非対話認証とコンテナー/ディレクトリー操作権限を用意します。接続問題をホスト検証の無効化で回避しないでください。`HAI_DEPLOY_PROVIDER` 全体が YAML の provider を上書きするため、接続先変更時には本機設定も確認します。詳細は [deploy モジュール](../../packages/deploy/README.ja.md)と[環境・ミドルウェア設定](../../packages/cli/templates/skills/hai-deploy/middleware.md)を参照してください。

### 本当に必要なミドルウェアだけを設定する

`pnpm-lock.yaml` にある対象アプリの実行依存をたどり、dev/peer だけから来る不要な要求を除外します。そのうえで設定と照合し、データベース、キャッシュ、S3、ベクトル DB、LDAP、メールなどを識別します。`HAI_DB_TYPE=postgresql` なら、現在の既定値が PostgreSQL であることと用途を表示します。

項目ごとに既定設定かカスタム接続を選び、対象環境に完全な設定があれば「変更しない」も選べます。既定設定は Compose サービスを追加するか、対応クラウドの Provisioner を使います。カスタム接続は必要な値を一つずつ入力し、「変更しない」はその項目をスキップします。公開設定と秘密情報は環境ファイルと `.env.local` に分けて保存し、パスワードはコミットしません。

接続設定が完成している場合は、対話でスキップするか `--skip-middleware` を指定します。接続の書き換えやリソース作成は行いません。イメージがあるだけでは接続可能なサービスにはならないため、カスタム接続では起動済みサービス、アカウント、DB/バケット、コンテナーからの到達性も用意してください。

### deploy のオプション

| deploy オプション | 用途 | 既定値 | 例 |
| --- | --- | --- | --- |
| `[appDir]` | バックエンド設定と実行依存の入口。生成スクリプトは指定済み | hai 直接実行時は現在位置 | `pnpm exec hai deploy packages/my-app-serv` |
| `--env <environment>` | test/prod、または対応ファイルがある独自名 | 固定値なし。対話入力、非対話なら必須 | `--env prod` |
| `--env-dir <path>` | 環境ファイルの場所 | 自動検出。fullstack はルート、API は service | `--env-dir .` |
| `-y, --yes` | 完全な既存設定またはバックエンド既定値を使う。必要ファイル/接続先は検証する | false | `--env prod --yes` |
| `--project-name <name>` | アプリ名の上書き。後に環境名を付加し、ディレクトリー/ボリューム識別に使用 | サービスパッケージ名、なければディレクトリー名 | `--project-name orders` |
| `--skip-middleware` | 全ミドルウェアの設定/作成を省略。SDK は skipMiddleware | false | `--skip-middleware` |
| `--artifact-dir <path>` | マニフェスト先または latest を含む親 | 最寄りのビルド入口/lockfile ルートの .hai/build/docker | `--artifact-dir .hai/build/docker/1.2.3-<ビルド番号>` |
| `--bundle-only` | docker-ssh の tar だけを作り SSH 接続しない | false、オンライン配布 | `--bundle-only` |
| `--output <path>` | 出力先。-版.tar を自動付加し、同じ接尾辞は重複させない | サービス内 .hai/deploy/環境/bundle-プロジェクト-配布ID-版.tar | `--output release-prod.tar` → release-prod-1.2.3.tar |

成果物がなければ停止し、暗黙のビルドは行いません。自動化では接続先を設定し、実際の buildId に置き換えて `pnpm run deploy --env prod --yes --skip-middleware --artifact-dir .hai/build/docker/<buildId>` とします。クラウドでは有料リソースが作られる場合があるため、許可されたアカウントと範囲で実行してください。

### マシン同士が接続できる場合：自動デプロイ

ローカルで Compose、実行時設定、起動スクリプトを生成し、app/web イメージと一つの tar にまとめて SSH で送ります。Linux 側では展開、イメージ読み込み、Compose 起動、API/Web の健全性確認を行います。ソース送信やリモートビルドは行いません。ローカルのデプロイ機にコンテナーエンジンも不要です。

fullstack の公開ポートは Web と同一オリジン API プロキシを提供します。API の秘密変数は Web に渡しません。ログイン、再読み込み、主要操作、再起動後のデータを確認してください。外部の HTTPS、DNS、証明書、必要な CORS は実際の入口に合わせて設定します。deploy は TLS を自動設定しません。

### マシン同士が接続できない場合：パッケージを手で運ぶ

```sh
pnpm run deploy --env prod --bundle-only --output release-prod.tar
```

版が 1.2.3 なら release-prod-1.2.3.tar を生成します。結果は packaged で、サーバーはまだ起動していません。docker-compose-1.2.3.yml、manifest.json、.env.runtime、任意の web.conf、images/、SHA256SUMS、start-prod.sh、README.txt が入ります。Compose にも x-hai-version とアプリの版ラベルが入り、更新後もプロジェクト名/ボリューム名は安定しているため既存データを継続します。秘密設定を含むのでアクセスを制限し、Git に入れず Linux に運んでください。

```sh
mkdir -p release && chmod 700 release
tar -xf release-prod-1.2.3.tar -C release
cd release
HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME=docker sh start-prod.sh
```

Podman を使う場合は値を `podman` にし、実行可能な Compose コマンドを用意します。スクリプトはファイルを検証し、API/Web イメージを読み込み、全イメージ参照を確認し、環境識別子を設定して起動します。ミドルウェアイメージがなければ停止し、外部から取得しません。**ミドルウェアイメージは自動同梱されない**ため、README に記載された名前とタグで事前に導入してください。

スクリプトは版付き Compose を自動選択します。手動の確認でも `docker compose -f docker-compose-1.2.3.yml --env-file .env.runtime ps` と指定し、ログを見る場合は ps を logs に変えます。

同じプロジェクト・環境への再デプロイでは永続ボリュームを再利用します。更新前にデータをバックアップし、新しい成果物から同環境のパッケージを作って同じ手順を実行します。旧マニフェストとイメージを残しておけば旧版を再デプロイできますが、DB マイグレーションはイメージの巻き戻しでは戻りません。データ復旧は別に計画してください。

### 完全オフラインにする前の確認

- Windows デプロイ機には対応 Node/pnpm、完全なプロジェクト、インストール済み CLI/SDK、tar、完全な `.hai/build/docker/<buildId>` を用意します。自動接続のみ ssh/scp も必要です。オフラインデプロイだけならローカル Docker、CUDA、Linux コンパイラーは不要です。
- 先に Linux サーバーと CPU が一致するイメージを作ります。ビルドもオフラインで行うなら、Linux コンテナーエンジン、全ベースイメージ、Corepack/pnpm、Linux 依存キャッシュ、ドライバー版・Node ABI・CPU・libc が一致する SQLite バイナリーが必要です。Windows の node_modules では代用できません。
- Linux には Docker/Podman、Compose、sh/tar/sha256sum、ミドルウェアイメージの正確なタグ、ストレージ、権限を用意します。PostgreSQL、Redis、RustFS イメージが既にあっても名前/タグを照合します。外部サービスはコンテナーから到達できるアドレスを使い、コンテナー内の localhost をホストと混同しないでください。
- `.env.prod`、本機の秘密設定、ポート、証明書、データディレクトリーを準備し、実際に外部接続を切ってパッケージ作成・移動・起動・ログイン・再読み込み・永続化を確認します。

Vercel は別の公開経路です。ネットワーク、プラットフォーム認証、対応アダプターで生成した Build Output API v3 `.vercel/output` が必要です。deploy は prebuilt 成果物と実行時変数を送信し、通常の Node 出力の変換やプラットフォームでの再ビルドは行いません。`--bundle-only` は Vercel 用ではありません。

## 6. アプリの変更を保ちながらフレームワークを更新する

アプリのディレクトリーで [hai-framework-sync](../../packages/cli/templates/skills/hai-framework-sync/SKILL.md) を使うよう依頼します。

> hai-framework を最新の公開済みバージョンに更新してください。現在の依存と対象版を確認し、差分と選択が必要な事項を説明したうえで、依存、呼び出し、設定、skills を移行してください。プロジェクト固有ルールを保持して検証まで行い、公開やデプロイはしないでください。

特定の版を指定したり、比較だけを依頼したりすることもできます。実際の registry/dist-tag、使用中の全パッケージの対象版と実行要件、途中の版を含む差分を確認し、固定バージョンと lockfile、公開 API、設定、scripts、skill の関連資料を更新します。ネットワーク障害や公開版の不足は対処が必要な事項として示し、キャッシュを「最新」とは扱いません。

`hai init` は旧プロジェクトに不足する AI 入口と skills を補いますが、既存ファイルは保持します。フレームワーク更新コマンドではなく、古いルールを上書きもしません。既存 skill は旧テンプレート、アプリ固有の変更、新テンプレートを比較して統合します。ソースの `main` と npm 公開版も同一とは限りません。

更新後はプロジェクトの typecheck、lint、build、test と影響範囲の E2E を実行し、認証、データ、主要処理を実際に確認します。配布するイメージやインストーラーを再生成し、第 5 節の手順でデプロイします。版番号の変更やビルド成功だけでは更新完了とはいえません。
