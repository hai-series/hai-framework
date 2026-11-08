# @h-ai/cli

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) · [ホーム](../../README.ja.md)

`hai` でアプリ作成、モジュール追加、コード生成、Web/API/ネイティブ成果物の構築と配布を行います。全体の手順は[利用ガイド](../../docs/usage/README.ja.md)を参照してください。

## クイックスタート

### CLI のインストール

Node.js は `engines`（`^22.23.4 || ^24.22.1 || ^26.12.1`）、pnpm は12.11.2を使用します。PowerShellでは `pnpm.cmd` を使います。

```sh
pnpm view @h-ai/cli@latest version
pnpm add -g @h-ai/cli@latest
hai --version
hai create my-app --type fullstack --frontends web
cd my-app
pnpm dev
```

入力は工程名とテンプレート種別、出力は生成工程です。依存インストールとGit初期化は既定で有効です。`--defaults` は既定値を使い、`--no-install`、`--no-git`、`--no-deploy` はそれぞれインストール、Git、デプロイ開発依存を省略します。省略項目は対話で選択します。各コマンドの引数は `hai <command> --help` で確認してください。

## 機能

### コマンドの用途・入力・出力

CLIは端末から実行し、フレームワークサービスの初期化は不要です。出力と終了コードで判断します。TARGET_VERSIONはpnpm viewで確認した公開済みの厳密バージョンへ置き換え、文字列をそのまま渡さないでください。

| コマンド       | 用途・入力                                | 出力と例                                                                                                                           |
| -------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| create         | 工程名、type、fullstackのフロント選択     | `hai create orders --type admin --defaults` で管理アプリを生成                                                                     |
| add            | 現工程へ指定モジュールを追加              | `hai add ai` は依存・設定・skillを補完。業務ファイルは維持し、初期化・終了・ルートはアプリで接続                                   |
| init           | 設定とAI入口を補完                        | `hai init` は不足ファイルを追加。`--force` の設定再生成前に差分を確認                                                              |
| generate / g   | 種別、名前、対象workspace                 | `hai generate api orders --workspace orders-serv` はルートまたはcontract/procedureを生成。短縮形はg:page/g:component/g:api/g:model |
| build          | target、イメージ/プラットフォーム、ソース | `hai build --target image --json` は今回の成果物JSONを出力。buildはデプロイ環境を受け取らない                                      |
| deploy         | 環境、成果物、対象サービス                | `hai deploy --env prod --plan` は読取専用計画。planを外すと配布処理へ進む                                                          |
| upgrade        | 厳密な公開版と工程                        | `hai upgrade TARGET_VERSION` は依存・完全性・設定・skill差分を報告。自動インストールや上書きはしない                               |
| deploy-secrets | サーバーディレクトリと私有JSON            | `hai deploy-secrets /srv/orders --import /private/orders.json --runtime docker` は既定で事前検査、明示的な `--apply` のみ保存      |
| feedback       | action、診断ZIP、検索条件                 | `hai feedback summary feedback.zip` は要約。inspect/evidence/viewはmanifest、証跡、本機ビューア                                    |

共通 `--cwd/-C` は工程ディレクトリ、`--verbose/-v` は詳細診断です。CLI言語は `HAI_CORE_DEFAULTLOCALE` → `LC_ALL` → `LC_MESSAGES` → `LANG` から選び、生成アプリの言語とは独立します。

### テンプレート

| type                 | 生成内容と用途                                                         |
| -------------------- | ---------------------------------------------------------------------- |
| admin / website / h5 | SvelteKit管理画面、紹介サイト、モバイルWeb。websiteはCore/Kit/UIで開始 |
| api                  | contractと独立Servのpnpm workspace                                     |
| mobile-app           | 独立APIへ接続するSvelte/Vite/Capacitorクライアント                     |
| fullstack            | contract、Serv、共有UI、選択したWeb/App/Desktop。miniappは予約説明     |

必要なモジュールのみインストールし、任意設定のコメントと `.env.example` を残します。コメント解除だけでは業務接続は完了しません。AI/payment/vecdb/datapipeは必要時に追加し、本番では共有DB、Redis、共有ファイルバックエンドを使います。既定言語は中英日、fullstackは `fullstack.i18n.locales` で限定できます。

ブラウザ用テンプレートは起動前に既知の旧版を確認します。最低Chrome/Edge111、Firefox114、SafariおよびiOS/iPadOS16.4です。[ブラウザ入口](../../docs/usage/getting-started/build.md#浏览器启动检测)

### ページ・部品・API・モデル・マイグレーションの生成

```sh
hai generate page dashboard
hai generate component UserCard
hai generate api orders --workspace orders-serv
hai generate model order
hai generate migration add-orders
```

名前にパスを含めず、既存業務ファイルは既定で上書きしません。`--workspace` はパッケージ名または相対ディレクトリです。SvelteKitの `--output` はsrc/routes内、Servはこの引数を受け付けません。pageはファイルルーティング専用で、非対応の純Vite page/API組合せは拒否します。Servは `@hai-generator` 付き集約入口のみ更新します。バッチを事前検査し、書込失敗時は今回の変更を戻します。`--force` は生成ファイルのみ対象。マイグレーションはup/down関数を生成し、DB操作を実行しません。

### ビルド・静的サイト・ネイティブ成果物

```sh
hai build --target image --images "serv,web" --concurrency 1
hai build --target app --platform android --runtime auto --debug
hai build --target desktop --platform windows --arch x64
```

target既定はcompile、他はimage/app/desktopです。イメージの役割はserv/webで、app/desktopはComposeサービスではありません。同時イメージビルドは最大2件。autoは使用可能なPodman→Docker、明示選択では別エンジンへ切替えません。Androidでruntime省略時は本機ツール、iOSはmacOS/Xcodeと署名が必要です。

成果物は `.hai/build/` の独立バッチへ保存し、アーカイブ成功後のみ相対 `latest` を更新します。イメージ `--json` のstdoutは今回の結果のみで、`artifactDir` をデプロイへ渡せます。進捗/失敗はstderr。Git出所やdirtyが不明な状態をクリーンと解釈しません。[命名・署名・自動化](../../docs/usage/getting-started/build.md)

静的websiteはビルドプロセスで `HAI_BUILD_STATIC=1` と実際の `PUBLIC_BASE_PATH` を設定し `pnpm build`、buildと.nojekyllだけを公開します。動的API/actions、サーバー業務初期化、私有アセット、リンクは拒否します。未接続の問い合わせフォームは説明を表示し入力を保持します。サイトパス変更は再ビルドし、APIアドレスは別設定です。[静的・子パス設定](../../docs/usage/configuration/delivery.md)

### デプロイ・オフライン配布・復旧

```sh
hai deploy --env prod --plan
hai deploy --env prod --plan --inspect-remote
hai deploy --env prod --build --bundle-only
hai deploy --env prod --build --services "serv,web"
```

planは検査と報告のみ。inspect-remoteはSSHで基準状態を読み取り、not-inspectedは検証成功を意味しません。bundle-onlyは対象へ接続せず、アーカイブ、対象情報、転送/本機スクリプト、説明を生成します。内部APPLY.txtは手動適用手順です。初回と構成変更は完全パッケージ、部分更新は一致するサーバー成功基準が必要です。

根 `package.json.name` と環境接尾辞が工程IDです。サーバー認証情報、バックエンド台帳、データボリュームを一緒に保護します。失敗時に前サービスを復旧しても、データ変更、マイグレーション、通知、決済は取り消されません。SSH結果unknownは遠端事実を読取確認してから再試行します。[配布と復旧](../deploy/README.ja.md)

HTTPSは通常PEMファイルまたはLet's Encrypt。証明書/鍵は各1MiB以内でリンクを拒否します。ACMEにはDNS、メール、規約同意、公開80番が必要。証明書状態はサーバーに保存し、有効化/無効化や構成変更は全量配布します。[HTTPS設定](../../docs/usage/configuration/delivery.md#可选https证书)

### 診断・公開版検査・認証情報取込

```sh
hai feedback evidence feedback.zip --request-id request-42 --page 1 --page-size 20
hai feedback view feedback.zip
hai upgrade TARGET_VERSION
```

ZIPは通常単一リンクファイル、最大64MiBです。viewはランダムパスでloopbackのみ待受け、フレームワーク内蔵ビューアを使い同梱置換スクリプトを実行しません。検索結果だけでは証跡完全性を証明しません。

upgradeは実際の消費パッケージ、CLI/deploy、catalog/lock/導入状態、skillカスタマイズを比較し、マイグレーションを実行しません。deploy-secretsはLinuxサーバー側Nodeと、最大64KiBの私有通常単一リンクJSONを必要とします。取込はDBデータの復元や成功リリース基準の作成ではありません。[認証情報の条件](../deploy/docs/credential-import.ja.md)

### AI指引とアプリ体験

生成アプリはAGENTS.mdと `.agents/skills/` を共有入口にし、Claude/Copilot/OpenCodeから参照します。モジュール追加は対応skill参照を補完し、独自ファイルを維持します。契約は導入版の公開型で確認します。[テンプレート構成](templates/README.md)

Fullstackにはユーザー/役割、監査、フィードバック、プロフィール、テーマ、言語UIがあります。初期パスワードは私有環境/Secretで配布し、CLIは値を表示しません。不足アカウントを作成し、既存ユーザーはリセットしません。ネイティブ表示名はCore、成果物名は工程IDを使用します。

## 設定

`hai.json.build.images` は役割/context/Dockerfile/ポート、build.sources/build.proxyはダウンロード、deployは対象を選びます。ソースはofficial/cn/custom、代理はinherit/system/custom/none。コマンド引数は今回のみ上書きします。[設定手順](../../docs/usage/configuration/delivery.md)

HAI優先度はプロセス > 環境私有 > 共通私有 > 環境公開 > 基本env > YAML。同一出所は親JSONの後に細項を適用し、高優先の親は低優先の細項を除去します。認証/SSH設定は私有、ビルドは配布秘密を読みません。通常の後端設定は再起動、構成・プロキシ・HTTPS・公開パスは配布/再ビルドです。[実行設定](../../docs/usage/configuration/runtime.md)

contextは信頼でき安定していることが前提です。依存ソース/キャッシュは通常単一リンク、祖先はsymlink/junction不可。追跡ファイルは16MiB、アーカイブは64KiB単位で比較/コピーします。未変更mtimeを維持し、更新は原子的に置換。診断はパス/原因/コードのみで清単内容を表示しません。

pnpm工程には該当deepmerge/DaisyUI補丁ファイルとpatchedDependencies登録を保持します。npmパッケージを導入しても、この倉庫の補丁設定は自動継承しません。[補丁](../../patches/)

## エラー処理

失敗は安全な理由、パス/段階と非ゼロ終了で報告します。インストール失敗は生成ファイルを残し、ビルド失敗は成功latestを進めません。秘密を引数/ログに入れず、計画・事前検査・取込結果を配布成功と扱いません。設定、権限、前提を修正して失敗段階を再試行し、結果不明時は先に事実を確認します。

## 開発とテスト

倉庫根で現在のソースを使います。

```sh
pnpm --filter @h-ai/cli typecheck
pnpm --filter @h-ai/cli lint
pnpm --filter @h-ai/cli build
node packages/cli/dist/index.js create ../my-app
pnpm --filter @h-ai/cli test
pnpm check:skills
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

脚手架ゲートは実際に導入、コンパイル、生成アプリのテストとブラウザ操作を行い、配布ゲートはPodman/Dockerが必要です。`--generate` と `--i18n` はルートと言語の定向検査。隔離fixtureは本番データや外部Provider検証の代わりではありません。WindowsネイティブゲートはRust/MSVCと明示的なHAI_CLI_NATIVE_BUILD=1、実機操作は別途検証します。

## ライセンス

Apache-2.0
