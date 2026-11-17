# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

共通の `reldb` オブジェクトで SQLite、PostgreSQL、MySQL を操作するリレーショナルデータベースモジュールです。

## クイックスタート

`pnpm add @h-ai/reldb` でインストールします。

[最小構成の導入手順](../../docs/usage/function/reldb.ja.md#quick-start)を参照してください。

## 設定一覧

生成したプロジェクトでは、データベースの種類、アドレス、接続オプションを `config/_db.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `reldb.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/reldb.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/reldb.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

接続プール、アプリテーブル、DDL の規約、トランザクション状態については[データ構造](../../docs/usage/data/reldb.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL のテストには Docker が必要です。

ソースの JSDoc は[共通規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)に従います。公開例は実際の公開入口、内部例は元のモジュールスコープで型検査します。ビルド後に `pnpm check:jsdoc --package reldb` を実行してください。例の型検査は実バックエンドの動作検証の代わりにはなりません。

## ライセンス

Apache-2.0
