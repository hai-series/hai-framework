# @h-ai/ai Data structures

<!-- translation: partial -->

[Chinese source](ai.md) · [Configuration](../configuration/ai.en.md) · [API reference](../function/ai.en.md)

AI uses the caller-supplied `storeProvider` or the initialized RelDB and VecDB integrations. The built-in relational store uses a string `id`, a write `version`, JSON `data`, and Unix millisecond timestamps. Feature tables optionally index `object_id`, `session_id`, `status` or `ref_id`.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_ai_chat_records`, `hai_ai_sessions`, `hai_ai_context`, `hai_ai_persona` | Chat requests and replies, session ownership and metadata, context turns/summaries, and persona prompts. Deletion markers prevent stale re-creation. |
| `hai_ai_llm_models`, `hai_ai_audio_models`, `hai_ai_image_models`, `hai_ai_mcp_servers`, `hai_ai_retrieval_sources` | Runtime resource registrations. Explicit writes by ID override startup values; deletion markers can suppress them. |
| `hai_ai_memory`, `hai_ai_memory_vector_outbox`, `hai_ai_memory_vector_namespace`, `hai_ai_memory_vector_scan` | Memory records, pending vector updates, ownership binding and scan cursor. The current relational record controls visible vector versions. |
| `hai_ai_knowledge_documents`, `hai_ai_knowledge_collections` | Document content and chunks are versioned by collection and generation. Read only the published document version. |
| `hai_ai_acp_*`, `hai_ai_a2a_*` | Workspace/session and managed request/approval state for ACP, and context/journal/messages for A2A. |
| `hai_ai_knowledge`, `hai_ai_memory` (VecDB) | Default knowledge and memory vector collections. Binding a memory namespace can change the actual collection. |

Field constraints, defaults and retention details are available in the [Chinese reference](ai.md).
