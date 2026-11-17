# @h-ai/cli API リファレンス

<!-- translation: partial -->

[原文（中国語）](cli.md) · [設定](../configuration/cli.ja.md) · [データ構造](../data/cli.ja.md)

<a id="quick-start"></a>

`pnpm add -g @h-ai/cli` で CLI を導入し、アプリを生成します。失敗したコマンドはゼロ以外の終了コードを返します。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `hai create`, `hai add`, `hai init` | アプリ作成、機能追加、設定・AI 入口ファイルの補完。 | `hai create orders --type admin --defaults` |
| `hai generate` (`g`), `g:page`, `g:component`, `g:api`, `g:model` | 名前付きファイルを生成。必要に応じて `--workspace` を指定。既存ファイルは既定で保護。 | `hai g:api orders --workspace orders-serv` |
| `hai build` | 既定ではコンパイル。イメージ・モバイル・デスクトップ成果物も指定可能。イメージには機械可読の出力がある。 | `hai build --target image --json` |
| `hai deploy` | 対象環境を選び、計画・梱包・デプロイを行い結果を返す。 | `hai deploy --env prod --plan` |
| `hai upgrade` | 公開済みの具体的なバージョンに対する移行差分を確認。 | `hai upgrade TARGET_VERSION` |
| `hai feedback` | ローカルの診断バンドルを調べ、証跡を絞り込む。 | `hai feedback summary feedback.zip` |
| `hai --version`, `hai --help` | CLI のバージョンまたは使い方を表示。 | `hai deploy --help` |

追加の設定項目や利用例は[中国語リファレンス](cli.md)に掲載しています。
