# @h-ai/cli API リファレンス

<!-- translation: partial -->

[原文（中国語）](cli.md) · [設定](../configuration/cli.ja.md) · [データ構造](../data/cli.ja.md)

<a id="quick-start"></a>

## クイックスタート

`pnpm add -g @h-ai/cli` で CLI を導入し、アプリを生成します。失敗したコマンドはゼロ以外の終了コードを返します。

```sh
pnpm view @h-ai/cli@latest version # 查询注册表，输出最新已发布版本。
pnpm add -g @h-ai/cli@latest # 将该 CLI 安装到 pnpm 的全局目录。
hai --version # 确认当前 PATH 实际调用的 CLI 版本。
hai create my-app --type fullstack --frontends web # 输入应用名、模板和前端目标，生成 my-app。
cd my-app # 进入刚生成的工程目录。
pnpm dev # 启动项目声明的开发服务，终端输出本地访问地址。
```

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

<a id="projects"></a>

### プロジェクトの作成と追加：`hai create/add/init`

新規作成ではテンプレートを選び、既存工程にはモジュールや不足設定を追加します。対象のルートで実行します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `hai create [name]` | アプリを作成 | 用 `--type` 选模板。省略名称或类型时询问，`--defaults` 采用默认值。默认安装依赖、初始化 Git 并准备部署工具 | 工程ファイルと起動案内 | `hai create orders --type admin --defaults` |
| `hai add [module]` | モジュールを追加 | 模块名省略时询问。默认安装依赖，可加 `--no-install` | 依存・設定・スキル | `hai add ai` |
| `hai init` | 不足する設定を作成 | 默认保留已有文件，`--force` 可以重建模块配置 | 不足設定と AI 入口 | `hai init` |

#### 利用例：プロジェクトの作成と追加

```sh
hai create demo-app --type website --defaults --no-install --no-git
cd demo-app
hai add ai --no-install
hai init
```

demo-app・website・ai を指定し、工程・設定・skill を得ます。この例はインストールと Git 初期化を省略し、init は既存ファイルを保ちます。

未翻訳：コマンドオプションと環境準備の詳しい例。[中国語の該当節](cli.md#api-reference)を参照してください。

<a id="command-options"></a>

#### 共通コマンドオプション

| オプション | 既定値 | 用途 |
| --- | --- | --- |
| `--yes` | 省略可 | 取得元の選択を省略。設定がなければ公式を使用。 |

`hai deploy --env prod` は `.env.prod` と対応するデプロイ環境を選択します。

[引数と手順の詳細](cli.md#projects)

<a id="scaffolding"></a>

### 業務の雛形を生成する：`hai generate`

業務名からページ・コンポーネント・HTTP・モデルを作り、複数 workspace では対象を指定します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `hai generate [type] [name]` 或 `hai g` | ソースを生成 | 类型和名称可交互选择。多 workspace 工程用 `--workspace`；默认保护已有文件 | ソース。既存ファイルは既定で保護 | `hai generate api orders --workspace orders-serv` |
| `hai g:page <name>` | ページを生成 | 页面名必填，按需设 `--workspace` | ページのソース | `hai g:page orders` |
| `hai g:component <name>` | コンポーネントを生成 | 组件名必填，按需设 `--workspace` | コンポーネントのソース | `hai g:component OrderList` |
| `hai g:api <name>` | HTTP 入口を生成 | 名称必填，按需设 `--workspace` 选择应用或服务 | 契約・ハンドラーのソース | `hai g:api orders --workspace orders-serv` |
| `hai g:model <name>` | モデルを生成 | 名称必填，按需设 `--workspace` | モデルのソース | `hai g:model order` |

#### 利用例：業務の雛形を生成する

```sh
hai generate page dashboard
hai g:page orders
hai g:component OrderList
hai g:api orders --workspace orders-serv
hai g:model order
```

名前を入力して対応するソースを生成します。権限と業務処理は別途実装し、既存ファイルには上書き防止が適用されます。

[引数と手順の詳細](cli.md#scaffolding)

<a id="builds"></a>

### コンパイルと梱包：`hai build`

対象を選び、コンパイル結果・コンテナー・ネイティブパッケージを作ります。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `hai build` | コンパイルとパッケージ化 | --target の既定は compile。image/app/desktop には各ツールが必要 | 成果物。image --json は構築情報 | `hai build --target image --json` |

#### 利用例：コンパイルと梱包

```sh
hai build --target compile
hai build --target image --json
```

最初はコンパイル結果、次はエンジンなどの前提を満たした場合にイメージと JSON 情報を出力します。ネイティブには SDK と署名の前提も必要です。

[引数と手順の詳細](cli.md#builds)

<a id="deployments"></a>

### 計画と配布：`hai deploy`

環境計画を先に読み取り確認し、接続条件で直接配置かオフライン梱包を選びます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `hai deploy [appDir]` | 計画・梱包・配備 | 目录默认由当前工程确定。需选择或传入 `--env`。制品、服务及环境文件可单独指定 | 計画 JSON・配布ファイル・配備結果 | `hai deploy --env prod --plan` |

#### 利用例：計画と配布

```sh
hai deploy --env prod --plan
```

prod を入力し計画 JSON を得ます。--plan は実際に配置しません。配布・復旧の前提は以下を参照してください。

[引数と手順の詳細](cli.md#deployments)

<a id="diagnostics"></a>

### ヘルプ・更新・診断の確認：`hai`

実行中の CLI とオプションを確認し、更新は公開済みの正確な版を使います。診断包はローカルで読みます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `hai upgrade <version>` | 指定版の更新を事前確認 | 填写已发布的精确版本，目录默认当前工程 | 依存・設定・スキルの差分報告 | `hai upgrade TARGET_VERSION` |
| `hai feedback <action> <bundle>` | オフライン診断 ZIP を読む | 操作和 ZIP 路径必填，`evidence` 可按请求、错误及时间范围过滤 | 要約・証拠ページ・ローカル URL | `hai feedback summary feedback.zip` |
| `hai --version`、`hai --help` | バージョンとヘルプを表示 | 也可用 `hai <command> --help` | バージョン・選択肢のテキスト | `hai deploy --help` |

#### 利用例：ヘルプ・更新・診断の確認

```sh
hai --version
hai --help
hai deploy --help
hai feedback summary feedback.zip
```

ヘルプと版はテキスト、summary は既存 ZIP の概要です。upgrade の例は登録済みの正確な版に置き換え、依存・設定・skill の差分を確認します。

[引数と手順の詳細](cli.md#diagnostics)
