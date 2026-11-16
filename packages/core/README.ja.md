# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md)

`@h-ai/core` は Hai Framework の共通基盤です。アプリケーションと他のモジュールに、設定、エラー、ログ、国際化の共通機能を提供します。ツールはそのまま利用でき、Node アプリでファイル設定が必要な場合に `core.init()` を呼びます。

## クイックスタート

```bash
pnpm add @h-ai/core
```

`@h-ai/core` から `core` をインポートすると、すぐにログ出力、メッセージ取得、汎用ツールを利用できます。`ok`、`err`、型、スキーマ、エラー定数も同じ入口からインポートできます。独自の設定やフォーム検証の例を実行するには、`pnpm add zod` で Zod を追加してください。

### 初期化：`core.init`

Node では起動時に YAML の読み込みとログの設定を行います。ブラウザーではページで使うログの設定を渡します。データベースやキャッシュを起動する例は[アプリケーションの起動と終了](../../docs/usage/function/core.md#应用启动与关闭)を参照してください。

#### Node.js

`config/_core.yml` を用意します。

```yaml
name: orders
version: 0.1.0
env: development
defaultLocale: ja-JP
logging:
  level: info
  format: pretty
```

```ts
import type { CoreConfig } from '@h-ai/core'
import { core } from '@h-ai/core'

// config ディレクトリを読み込みます。検証に成功した _core.yml は core として保存されます。
core.init({ configDir: './config' })
const settings = core.config.getOrThrow<CoreConfig>('core')

// 既定の言語を設定し、起動完了をログに記録します。
core.i18n.setGlobalLocale(settings.defaultLocale)
core.logger.info('Application ready', { app: settings.name }) // app: 'orders'
```

`core.init()` はディレクトリを同期的に読み込みます。個々のファイルの読み込みや検証に失敗した場合は、ファイル名とエラーコードを記録し、残りのファイルを読み込みます。この例では必須の `core` 設定がないと、`getOrThrow()` で起動が止まります。ディレクトリの走査やログの設定時にも例外が発生することがあります。

#### ブラウザー

```ts
import { core } from '@h-ai/core'

// ページの起動時にログレベルと既定の言語を設定します。
core.init({
  logging: { level: 'warn' }
})
core.i18n.setGlobalLocale('ja-JP')

// 関連するログを追えるように、リクエスト ID を出力します。
const requestId = core.id.request()
core.logger.warn('Request needs attention', { requestId })
```

ブラウザーの `core.init()` はページのコードから渡されたログ設定を使います。ページにアプリ名が必要なら、サーバーはページデータに `{ name: settings.name }` だけを含められます。`_core.yml` 全体と秘密情報はサーバーに置きます。

ローカルの設定ファイルを読み込み、検証、監視するには Node.js が必要です。ブラウザーで呼び出した場合の戻り値は[ブラウザーの設定](../../docs/usage/function/core.md#浏览器)（中国語）を参照してください。

## 設定一覧

Node の起動時に `core.init({ configDir: './config' })` を呼び出し、`config/_core.yml` からアプリ情報とログ設定を読み込みます。[Serv](../../docs/usage/configuration/serv.md) または [Kit](../../docs/usage/configuration/kit.md) は HTTP サービスを作成するときにアクセスルールを読み込みます。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/core.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/core.md)（中国語）を参照してください。

- `core.init` / `core.config` / `core.module` — 設定の読み込み、ログ初期化、依存モジュールの起動管理
- `core.logger` / `core.context` / `core.sanitize` — ログの関連付けと診断データのサニタイズ
- `core.error` / `core.i18n` / `core.zodValidation` / `core.access` — 結果とエラーの処理、検証メッセージの翻訳、リクエストポリシーの確認
- `core.id` / `core.typeUtils` / `core.object` / `core.string` / `core.array` / `core.async` / `core.time` — 識別子の生成、汎用データと非同期処理の操作

## データ構造

モジュール独自のデータベーステーブルは作成しません。

アプリ設定、言語、ログ、リクエストコンテキストの管理範囲については[データ構造](../../docs/usage/data/core.md)（中国語）を参照してください。

## 開発とテスト

リポジトリールートで実行します（PowerShell は `pnpm.cmd`）。

```bash
pnpm --filter @h-ai/core typecheck
pnpm --filter @h-ai/core lint
pnpm --filter @h-ai/core build
pnpm --filter @h-ai/core test
```

公開宣言と例の検証は[モジュール JSDoc 規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)を参照してください。

## ライセンス

Apache-2.0
