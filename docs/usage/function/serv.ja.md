# @h-ai/serv API リファレンス

<!-- translation: partial -->

[原文（中国語）](serv.md) · [設定](../configuration/serv.ja.md) · [データ構造](../data/serv.ja.md)

<a id="quick-start"></a>

Serv は型付き HTTP 契約を独立した Node サーバーに配置します。待ち受けを始める前に、認証、通信暗号化、信頼できるリクエスト情報の取得を設定します。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `serv.implement(contract)`, `createApp(options)` | 契約に処理を対応付けて HTTP アプリを作成。 | `serv.implement(contract)` |
| `serv.listen(app, options?)`, `toFetch(app)` | Node で待ち受けるか Fetch ハンドラーに変換。 | `serv.toFetch(app)` |
| `serv.parseRequestContext(input)`, `buildAuthContextFactory(verifyToken)` | 信頼済みリクエスト情報を解析し、指定した検証関数で認証情報を作成。 | `serv.buildAuthContextFactory(verifyToken)` |
| `serv.cors(config?)`, `createRuntimeSecurityPolicy(input)`, `storageAssets(config)` | オリジン処理、リクエスト規則、静的ファイル配信を設定。 | `serv.cors()` |
| `serv.generateSpec(contract, options?)` | 契約から OpenAPI 仕様を生成。 | `serv.generateSpec(contract)` |
| `serv.validateInputOrFail(schema, input, locale?)`, `resolveRequestLocale(headers)`, `m(key, options?)` | リクエストの言語を選択し、入力検証と翻訳済みメッセージの整形を行う。 | `serv.resolveRequestLocale(request.headers)` |

追加の設定項目や利用例は[中国語リファレンス](serv.md)に掲載しています。
