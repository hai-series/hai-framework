# hai-framework 利用ガイド

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

初めて使う場合は[日本語の作成・配布手順](getting-started/workflow.ja.md)に沿って、アプリを作成し、起動してビルドします。API や設定を確認したい場合は、モジュール別のリファレンスを参照してください。ドキュメントサイトでは、翻訳待ちのページに案内を表示し、中国語の本文と原文へのリンクを掲載します。

Core には日本語の[導入と設定 API](function/core.ja.md)、[設定一覧](configuration/core.ja.md)、[データ構造](data/core.ja.md)があります。

## 章構成

1. [フレームワークを理解する](overview/README.ja.md)：能力、境界、必要な環境と[目的別の読み方](overview/reading-paths.ja.md)。
2. [作成から最初の配布まで](getting-started/workflow.ja.md)：作成、起動、開発、ビルド、更新。
3. [業務機能を開発する](development/README.ja.md)：API・データ、認証・UI、AI・外部連携。
4. [分野別に設定を管理する](configuration/README.ja.md)：用途、既定値、値による違い、完全な例と実行画像。
5. [配布と日常運用](operations/README.ja.md)：全量・増分、復旧条件、フィードバックと原因調査。
6. [保守・安全性・受け入れ](governance/README.ja.md)：公開契約、資料の同期、検証できた範囲。
7. [モジュールのデータ構造](data/README.ja.md)。パッケージごとにテーブル、列、キャッシュキー、保持期間を確認できます。
8. [モジュールの機能](function/README.ja.md)。パッケージごとに公開 API、使用例、利用上の注意を確認できます。

各パッケージの README からリファレンスを参照できます。個別の設定は設定一覧、複数パッケージを組み合わせる手順は分野別ガイドにあります。GitHub Pages はこの Markdown と `navigation.json` から生成されます。

最新の公開版は `pnpm view @h-ai/cli@latest version` または [npm](https://www.npmjs.com/package/@h-ai/cli?activeTab=versions) で確認してください。再現性が必要な場合は取得した版を固定し、main だけで公開済みとは判断しません。[検証説明](governance/verification.md)で実行済みと対象環境で必要な確認を分けています。
