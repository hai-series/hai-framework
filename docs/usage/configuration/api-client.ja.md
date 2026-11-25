# @h-ai/api-client 設定

<a id="h-aiapi-client-ファイル設定"></a>

[中国語](api-client.md) · [English](api-client.en.md)

<a id="configuration-fields"></a>

## 設定の読み込み

このモジュールに独立した設定ファイルはありません。アプリは起動時に API のアドレス、認証方式、通信オプションを `apiClient.init(config)` に渡します。値を環境変数に置く場合はアプリが先に読み込みます。ブラウザーで更新 Cookie を使う場合、サーバー側でも `serv.createApp({ iam, refreshCookie: {} })` を有効にします。サーバー側の設定は [Serv アプリの構成](../function/serv.ja.md#host-options)を参照してください。

引数・既定値・使用例は次を参照 [呼び出し引数と接続オプション](../function/api-client.ja.md#call-options)。
