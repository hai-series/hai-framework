# @h-ai/vecdb API リファレンス

[原文（中国語）](vecdb.md) · [設定](../configuration/vecdb.ja.md) · [データ構造](../data/vecdb.ja.md)

<a id="quick-start"></a>

ベクトルバックエンドを初期化し、名前と次元を指定してコレクションを作成し、ベクトルの書き込みと検索を行います。カーソルを使う走査では同じ保存先とコレクションを指定します。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `vecdb.init(config)`, `close()`, `isInitialized`, `config`, `rawConnection` | 接続先の初期化・終了、状態、設定、接続の確認。 | `await vecdb.init(config)` |
| `vecdb.collection.create(name, options)`, `drop`, `exists`, `info`, `list` | 名前と次元で作成・削除・確認。距離尺度の既定値は cosine。 | `await vecdb.collection.create('docs', { dimension: 3 })` |
| `vecdb.vector.insert`, `upsert`, `delete` | 文書を新規・更新保存、または ID で削除。 | `await vecdb.vector.delete('docs', ['a'])` |
| `vecdb.vector.search(collection, vector, options?)`, `count`, `scan` | 近い文書の検索、件数取得、カーソル付き走査。 | `await vecdb.vector.search('docs', [1, 0, 0])` |
