# 目的別の読み方

[章の概要](README.ja.md) · [ガイドのトップ](../README.ja.md)

今回完了させたい作業に合った手順を選んでください。

<a id="first-app"></a>

## 初めてアプリを動かす

[環境を準備](environment.ja.md) し、[プロジェクトを作成して起動](../getting-started/create.ja.md) したら、[動作を確認しやすい設定を一つ変更](../getting-started/develop.ja.md) します。テストアカウントでログインし、成功する操作と失敗する操作を試します。[画面と操作のガイド](../development/ui.md) で、結果の表示や失敗時に入力が残るかを確認してください。配布するときは [ビルド](../getting-started/build.md) と [デプロイ](../operations/deployment.md) に進みます。

<a id="developer"></a>

## 一つの機能を最後まで実装する

[フロントエンド・バックエンド・API 認可](../development/frontend-backend.md) を起点に、[機能別の開発ガイド](../development/README.ja.md) から対象を選びます。必要に応じて [データ](../development/data.md)、[認証](../development/authentication.md)、[AI](../development/ai.md) を追加します。値は [設定リファレンス](../configuration/README.ja.md) で調べ、変更に合った単体テスト、統合テスト、ブラウザテストを [検証ガイド](../governance/verification.md) から選びます。権限による拒否と再試行も確認します。

<a id="configuration-owner"></a>

## 環境ごとの設定を管理する

[設定の読み込みと上書き](../configuration/runtime.md) で、値を読み取るコードと利用するコードを確認します。[共有データ](../configuration/data.md)、[認証の設定](../configuration/identity.md)、対象の HTTP・AI・運用設定を調べ、変更を稼働中のアプリで確認します。非公開の上書き、管理対象の認証情報、バックアップは [デプロイ設定](../configuration/delivery.md#环境和秘密的来源) を確認してください。

<a id="operator"></a>

## リリースして復旧できるようにする

[成果物をビルド](../getting-started/build.md) し、バージョン、ビルド ID、アーキテクチャ、チェックサムを記録します。[デプロイ設定](../configuration/delivery.md) で対象環境、バックアップ、前回成功したリリース、作業時間帯を確認します。[計画とデプロイ](../operations/deployment.md) を実行してユーザー操作を試します。失敗時はリモートの状態を調べてから [復旧とロールバック](../configuration/delivery.md#失败恢复与发布后回滚) に進みます。[障害調査](../operations/feedback.md) で受付番号をログや業務データと照合します。

<a id="maintainer"></a>

## 公開 API を保守する

[保守手順](../governance/framework-maintenance.md) から、影響を受けるエクスポート、呼び出し元、テンプレート、設定を探します。API リファレンスを実装と照合します。[セキュリティと復旧](../governance/security-review.md) を確認し、[検証ガイド](../governance/verification.md) に沿ってテストします。リファレンスとスクリーンショットを更新し、リリース後にレジストリのバージョンを確認します。

<a id="reviewer"></a>

## セキュリティと失敗時の復旧を調べる

[セキュリティレビュー](../governance/security-review.md) でユーザー、リクエスト、信頼境界、認証情報、外部システムへの影響を特定します。サーバーの [認証](../configuration/identity.md) と [通信](../configuration/http.md) のチェックをたどり、[データ](../configuration/data.md)、[ジョブ](../configuration/operations.md)、[復旧](../configuration/delivery.md) を確認します。[検証ガイド](../governance/verification.md) に沿って、再現できたことと対象環境での確認が必要なことを記録します。
