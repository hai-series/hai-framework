# hai-framework 利用ガイド

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

今の作業から読み始めてください。初めて使う場合は[日本語の作成・配布手順](getting-started/workflow.ja.md)を順に進めます。分野別マニュアルと役割別ルートは中国語で、各章から共通の資料を参照できます。

## 章構成

1. [フレームワークを理解する](overview/README.md)：能力、境界、必要な環境と[六つの読書ルート](overview/reading-paths.md)。
2. [作成から最初の配布まで](getting-started/README.md)：作成、起動、開発、ビルド、更新。[日本語の完全な手順](getting-started/workflow.ja.md)。
3. [業務機能を開発する](development/README.md)：API・データ、認証・UI、AI・外部連携。
4. [分野別に設定を管理する](configuration/README.md)：用途、既定値、値による違い、完全な例と実行画像。
5. [配布と日常運用](operations/README.md)：全量・増分、復旧条件、フィードバックと原因調査。
6. [保守・安全性・受け入れ](governance/README.md)：公開契約、資料の同期、検証できた範囲。
7. [モジュールのデータ構造](data/README.md)。パッケージごとにテーブル、列、キャッシュキー、保持期間を確認できます。
8. [モジュールの機能](function/README.md)。パッケージごとに公開 API、使用例、利用上の注意を確認できます。

各パッケージの README は中国語のリファレンスを共用します。個別の設定は[設定一覧](configuration/README.md#按模块查配置)、複数パッケージの組み合わせは分野別ガイドを参照してください。公式サイトはこの Markdown と `navigation.json` を読み込みます。

最新の公開版は `pnpm view @h-ai/cli@latest version` または [npm](https://www.npmjs.com/package/@h-ai/cli?activeTab=versions) で確認してください。再現性が必要な場合は取得した版を固定し、main だけで公開済みとは判断しません。[検証説明](governance/verification.md)で実行済みと対象環境で必要な確認を分けています。
