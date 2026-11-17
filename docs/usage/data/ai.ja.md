# @h-ai/ai データ構造

<!-- translation: partial -->

[原文（中国語）](ai.md) · [設定](../configuration/ai.ja.md) · [API リファレンス](../function/ai.ja.md)

AI は呼び出し側の `storeProvider` または初期化済みの RelDB と VecDB を使います。標準の関係ストアは文字列 `id`、書き込み `version`、JSON の `data`、Unix ミリ秒の時刻を使用します。機能に応じて `object_id`、`session_id`、`status`、`ref_id` に索引があります。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_ai_chat_records`, `hai_ai_sessions`, `hai_ai_context`, `hai_ai_persona` | チャットの要求と応答、セッションの所有者と属性、発言と要約、ペルソナのプロンプト。削除マーカーで古いデータからの再作成を防ぐ。 |
| `hai_ai_llm_models`, `hai_ai_audio_models`, `hai_ai_image_models`, `hai_ai_mcp_servers`, `hai_ai_retrieval_sources` | 実行時のリソース登録。同じ ID の保存設定が起動時の値を上書きし、削除マーカーで無効化可能。 |
| `hai_ai_memory`, `hai_ai_memory_vector_outbox`, `hai_ai_memory_vector_namespace`, `hai_ai_memory_vector_scan` | メモリー、ベクトル更新待ち、所有者の紐付けと走査カーソル。表示対象のベクトル版は現在の関係レコードで決まる。 |
| `hai_ai_knowledge_documents`, `hai_ai_knowledge_collections` | コレクションと世代ごとに本文とチャンクを管理。公開済みの版を読む。 |
| `hai_ai_acp_*`, `hai_ai_a2a_*` | ACP の作業領域・セッション・管理リクエスト・承認状態と、A2A のコンテキスト・ジャーナル・メッセージ。 |
| `hai_ai_knowledge`, `hai_ai_memory` (VecDB) | ナレッジとメモリーの既定ベクトルコレクション。メモリーの名前空間を割り当てると実際の保存先が変わる。 |

フィールド制約・既定値・保存期間の詳細は[中国語リファレンス](ai.md)に掲載しています。
