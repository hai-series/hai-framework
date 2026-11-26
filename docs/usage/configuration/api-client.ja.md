# @h-ai/api-client 設定

<a id="h-aiapi-client-ファイル設定"></a>

[简体中文](api-client.md) · [English](api-client.en.md)

[設定一覧](README.ja.md) · [API リファレンス](../function/api-client.ja.md) · [データ構造](../data/api-client.ja.md)

<a id="configuration-fields"></a>

## 設定の読み込み

`@h-ai/api-client` に専用の設定ファイルや環境変数の接頭辞はありません。アプリが実行時設定を読み取り、資格情報の保存先と通信方式を選び、`apiClient.init(config)` または独立したインスタンスの `client.init(config)` に渡します。読み込みの優先順位と変更の反映時期はアプリが決めます。初期化の引数、必須条件、既定値は[呼び出しオプション](../function/api-client.ja.md#call-options)を参照してください。

認証オプションとコールバックを含む実装例は、[ブラウザーのセッション更新](../function/api-client.ja.md#browser-refresh)と[同じ利用者での再ログイン](../function/api-client.ja.md#recover-session)を参照してください。

<a id="configuration-sources"></a>

## 設定の担当

| 設定 | 設定する側 | 確認事項 |
| --- | --- | --- |
| API アドレス | フロントエンドまたは実行時設定から `baseUrl` を渡します。 | ブラウザーと API が同一オリジンの場合は、`/api/v1` のようなルート相対パスを使えます。Node.js やブラウザーオリジンのないネイティブ実行環境では、HTTP(S) の絶対 URL を使います。API のパス接頭辞を含め、ユーザー情報、クエリ、フラグメントは省きます。 |
| 更新用の資格情報 | クライアントが `auth.storage` を選びます。Cookie モードでは、サーバーが HttpOnly Cookie の設定、更新、削除を行います。 | `auth` を省略すると自動認証が無効になり、`auth: {}` を渡すと既定でブラウザーの Cookie モードになります。別オリジンの場合は、サーバーが許可する具体的なオリジンと資格情報の設定、Cookie 属性を確認します。 |
| アプリケーション層の暗号化 | クライアントが初期化済みの Crypto を渡します。サーバーが秘密鍵、鍵交換ルート、暗号化ポリシーを管理します。 | クライアントの `transport` を省略するとアプリケーション層の暗号化が無効になります。有効にする場合、`baseUrl` のオリジンとクライアントの `transport.keyExchangePath` を結合した URL がサーバーの鍵交換エンドポイントと一致する必要があります。 |

Serv の API 接頭辞と通信設定はアプリの `config/_serv.yml` に記述でき、起動コードから `serv.createApp` に渡します。ブラウザーで更新用 Cookie を使う場合は、同じ呼び出しに初期化済みの `iam` と `refreshCookie` を渡します。[Serv の設定](serv.ja.md)、[ホストオプション](../function/serv.ja.md#host-options)、[Serv の認証と Cookie](../function/serv.ja.md#authentication)を参照してください。

Kit アプリでは、SvelteKit のルートが API のマウント先を決め、Kit のサーバー側認証が Cookie を処理し、`kit.createHandle` に通信の暗号化処理を組み込みます。[Kit の設定](kit.ja.md)、[Kit の認証](../function/kit.ja.md#auth)、[Kit の通信暗号化](../function/kit.ja.md#transport)を参照してください。

<a id="mobile-api-base-example"></a>

## 設定例

リポジトリ内の `mobile-app` は、ローカル開発時に `PUBLIC_API_BASE` で API サービスを選びます。サービスが `http://localhost:3000/api/v1` で動作している場合は、`apps/mobile-app/.env.local` に次の行を追加します。別のサービスを使う場合は、プロトコル、ホスト、ポート、API の接頭辞をクライアントからアクセスできるアドレスに変更します。[mobile-app の環境変数テンプレート](../../../apps/mobile-app/.env.example)を参照してください。

```dotenv
PUBLIC_API_BASE='http://localhost:3000/api/v1'
```

API サービスを起動してから `pnpm --filter mobile-app dev` を実行します。このリポジトリでのサービス起動手順は [api-service クイックスタート](../../../apps/api-service/README.md#快速开始)を参照してください。アプリは実行時に注入された `apiBase`、Vite の `PUBLIC_API_BASE` の順に参照し、どちらも空のときは `http://localhost:3000/api/v1` を使います。環境設定ファイルを編集した後は開発サーバーを再起動し、開発サイトの `/auth/login` を開き、ブラウザーのネットワークパネルで公開認証設定の取得先が `http://localhost:3000/api/v1/auth/config` であることを確認します。このアドレスはクライアントから参照できます。サーバーの資格情報はサーバー側で管理します。[mobile-app のクライアント初期化](../../../apps/mobile-app/src/lib/api.ts)を参照してください。
