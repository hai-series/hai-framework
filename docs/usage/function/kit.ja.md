# @h-ai/kit API リファレンス

<!-- translation: partial -->

[原文（中国語）](kit.md) · [設定](../configuration/kit.ja.md) · [データ構造](../data/kit.ja.md)

<a id="quick-start"></a>

Kit は SvelteKit のフック、ルートハンドラー、ブラウザークライアントで使います。サーバーコードはルートを保護し、入力を検証し、業務結果を HTTP レスポンスに変換します。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `kit.createHandle`, `kit.sequence`, `kit.handler` | フックの作成、順番のある合成、またはルートハンドラーのラップ。 | `kit.sequence(first, second)` |
| `kit.guard.check`, `require`, `requireSensitive` | 認可を確認し、通常または機密操作のアクセスを制御。 | `kit.guard.require(event, permission)` |
| `kit.response.ok`, `created`, `noContent`, `error`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `validationError`, `internalError`, `redirect`, `fromResult`, `fromError` | HTTP レスポンスを作成、または業務結果・エラーをステータスと本体へ変換。 | `kit.response.fromResult(result)` |
| `kit.validate.body`, `query`, `params`, `IdParamSchema`, `PaginationQuerySchema` | スキーマでリクエストを検証し、型付きの入力を返す。 | `await kit.validate.body(request, schema)` |
| `kit.client.create`, `createAuthActions`, `installBrowserTransport`, `installBrowserTransportFetch` | 型付きクライアントを作成し、認証または暗号化 Fetch を組み込む。 | `kit.client.create(contract)` |
| `kit.auth.publicPaths` | 認証ガードで使う公開認証パスを取得。 | `kit.auth.publicPaths` |

追加の設定項目や利用例は[中国語リファレンス](kit.md)に掲載しています。
