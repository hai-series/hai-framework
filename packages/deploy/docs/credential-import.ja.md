# 旧デプロイ認証情報の導入と復旧

既存ボリュームに managed-secrets.env がない通常配布は引き続き停止します。ボリューム削除、新しいパスワード生成、旧値の切り詰め、新パッケージのランダム候補の転用は行わないでください。

対象 Linux サーバーで、配置所有者または管理者として対応 Node と同じ版の CLI/deploy を実行します。通常のオフライン配布にサーバー Node は不要です。旧デプロイ処理を終了し、業務書込を停止して、DB・オブジェクト・ボリューム・旧認証情報・current・成功済みリリースをバックアップしてください。導入はサービス停止、パスワード変更、DB移行、current更新を行いません。

旧サービスは起動したままにします。Compose のプロジェクト/サービスラベルと実マウントを確認し、旧認証情報で読み取り専用検証を行います。PostgreSQL/MySQL は SELECT 1、LDAP は bind、S3 は bucket HEAD です。S3 は同じプロジェクトとネットワークの hai-<projectName>-app Node コンテナを使い、ツール導入やクライアント設定保存をしません。アプリは書込停止の保守状態にしてください。ツール不足、誤認証、異なる所有関係では拒否します。

PostgreSQL は非ループバック接続と require_auth=scram-sha-256,md5,password（psql/libpq 16以降）で trust や未完了認証を拒否します。MySQL はアプリと root の両方で正しいパスワードの成功とランダムな誤パスワードの認証拒否を確認し、認可を迂回する設定も拒否します。[libpq の認証要件](https://www.postgresql.org/docs/16/libpq-connect.html#LIBPQ-CONNECT-REQUIRE-AUTH)を参照してください。

運用者が確認した秘密情報から、0600かつシンボリックリンクでないJSONを用意します。入力 version は1、projectName は環境接尾辞を含み、自動付与される hai- は除きます。

```json
{
  "version": 1,
  "projectName": "shop-test",
  "credentials": { "DB_PASSWORD": "保護された情報源から取得した元のパスワード" },
  "services": [{
    "service": "db", "kind": "postgresql", "container": "hai-shop-test-db",
    "volumes": ["hai-shop-test_shop-test-db-data"], "username": "hai", "database": "hai"
  }]
}
```

識別子とパスワード例は必ず実際の旧値へ置換してください。db/vecdb は同じ DB_PASSWORD、storage は STORAGE_PASSWORD、ldap は LDAP_PASSWORD を使用します。kind は postgresql/mysql/s3/ldap。S3 の accessKeyId/bucket/region の既定は hai-storage/hai/us-east-1、LDAP bindDn は cn=admin,dc=example,dc=org です。空白・引用符・バックスラッシュ・ドル記号・Unicode は保持し、空値・改行・NUL・制御文字は拒否します。指定ボリュームは検証済みサービスへマウントされている必要があります。

現在の管理対象 sidecar は hai アカウント/DB、S3 の hai-storage/桶 hai/us-east-1、LDAP の既定 bindDn を要求します。MySQL は root とアプリの同じパスワードも確認します。独自の識別情報は勝手に変更せず拒否し、外部ミドルウェアの元設定を維持するか別の識別情報移行を計画してください。

```sh
chmod 600 /private/shop-import.json
hai deploy-secrets /opt/hai/apps/shop-test --import /private/shop-import.json --runtime docker
# 値を含まない検査結果を確認してから確定します。
hai deploy-secrets /opt/hai/apps/shop-test --import /private/shop-import.json --runtime docker --apply
```

SDK は importDeploymentSecrets({ directory, inputFile, runtime, dryRun: true })、確定は dryRun:false のみです。検査はロック/状態ファイルを作りません。確定は固定デプロイ flock を共有し、非公開一時ファイルを fsync 後に0600で原子的に公開してディレクトリを同期します。ロックを置換しません。同じ入力は再実行可能で、競合・破損・リンク状態は上書きしません。error.ext.state=unknown の失敗は状態確認が必要です。応答がないことは未確定の証明ではありません。

v2 の UTF-8 十六進表現は**符号化であり暗号化ではありません**。状態とバックアップを秘密として保護してください。プロジェクト/検証済みボリュームを束縛し、dotenv・JSON・URL を正しく生成します。新規プロジェクトの従来ランダム状態は引き続き利用でき、変換を強制しません。

同じプロジェクト・配置先・ボリュームの完全パッケージを再生成し、旧DBレコード・S3オブジェクト・ハッシュを確認してから書込を再開します。完全/部分配布、別の梱包端末、停止/復旧もサーバー状態を再利用します。状態喪失時は対応する保護バックアップを優先し、なければ旧サービスに対し元の認証情報を再検証して導入します。破損/リンクは隔離して調査してください。中断した .managed-secrets-*.next は確定状態として採用されません。プロセス終了確認後に今回所有する一時ファイルだけを清掃します。失敗しても current やデータボリュームを変更しません。旧リリースへ戻す場合も同じ認証情報を使い、データ復元はバックアップ計画に従います。パスワード変更は別の管理された操作です。
