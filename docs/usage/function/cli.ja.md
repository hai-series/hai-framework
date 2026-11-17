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

## API 一覧

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `hai create`, `hai add`, `hai init` | アプリ作成、機能追加、設定・AI 入口ファイルの補完。 | `hai create orders --type admin --defaults` |
| `hai generate` (`g`), `g:page`, `g:component`, `g:api`, `g:model` | 名前付きファイルを生成。必要に応じて `--workspace` を指定。既存ファイルは既定で保護。 | `hai g:api orders --workspace orders-serv` |
| `hai build` | 既定ではコンパイル。イメージ・モバイル・デスクトップ成果物も指定可能。イメージには機械可読の出力がある。 | `hai build --target image --json` |
| `hai deploy` | 対象環境を選び、計画・梱包・デプロイを行い結果を返す。 | `hai deploy --env prod --plan` |
| `hai upgrade` | 公開済みの具体的なバージョンに対する移行差分を確認。 | `hai upgrade TARGET_VERSION` |
| `hai feedback` | ローカルの診断バンドルを調べ、証跡を絞り込む。 | `hai feedback summary feedback.zip` |
| `hai --version`, `hai --help` | CLI のバージョンまたは使い方を表示。 | `hai deploy --help` |

未翻訳：コマンドオプションと環境準備の詳しい例。[中国語の該当節](cli.md#api-reference)を参照してください。

<a id="command-options"></a>

## コマンドによる上書き

| オプション | 既定値 | 用途 |
| --- | --- | --- |
| `--yes` | 省略可 | 取得元の選択を省略。設定がなければ公式を使用。 |

`hai deploy --env prod` は `.env.prod` と対応するデプロイ環境を選択します。
