# @h-ai/api-contract 設定

<a id="h-aiapi-contract-ファイル設定"></a>

[简体中文](api-contract.md) · [English](api-contract.en.md)

<a id="configuration-fields"></a>

## 設定の読み込み

アプリは共有 TypeScript コードで HTTP 操作を定義し、必要なドメインを組み合わせます。このモジュール固有の YAML ファイルや環境変数はありません。アプリが機能の有効・無効を読み取って公開するドメインを選び、クライアントは対応する契約を使います。共有定義の変更後は、それを使うサーバーとクライアントを再ビルドしてデプロイします。 [ルートの定義](../function/api-contract.ja.md#declare-routes) · [ドメインの組み合わせ](../function/api-contract.ja.md#compose-domains)

## 利用側が管理する実行時設定

| 設定 | 読み込みと設定の場所 |
| --- | --- |
| Serv の API プレフィックスとドキュメントルート | Serv アプリが起動時に `http.apiPrefix` などを読み込みます。プレフィックスが `/api/v1` の場合、契約の `/iam/users/{id}` は `/api/v1/iam/users/{id}` に登録されます。 [Serv 設定](serv.ja.md) |
| Kit のルートとリクエストポリシー | SvelteKit はルートファイルをパスに対応づけます。Kit のリクエストポリシーはアプリのサーバー側で設定します。 [Kit 設定](kit.ja.md) |
| 型付きクライアントの API アドレス | アプリはプレフィックスを含むアドレスを `client.init({ baseUrl })` に渡します。ブラウザーで同一オリジンを使う場合の例は `/api/v1` です。 [API Client 設定](api-client.ja.md) |
| ログイン、登録、CAPTCHA のポリシー | IAM がサーバー設定を読み込み、公開するポリシーを生成します。 [IAM 設定](iam.ja.md) · [公開レスポンスのデータ](../data/api-contract.ja.md#public-settings) |
