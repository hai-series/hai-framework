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
```

[最小構成の導入手順](../../docs/usage/function/cli.ja.md#quick-start)を参照してください。

## 設定一覧

実行時のオプションは CLI で指定します。ビルドと配布の設定はプロジェクトの `hai.json` に保存します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/cli.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/cli.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

生成プロジェクト、設定、ビルドキャッシュ、配布記録については[データ構造](../../docs/usage/data/cli.ja.md)を参照してください。

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
