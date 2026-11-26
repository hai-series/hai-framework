# @h-ai/ai Data Structures

[简体中文](ai.md) · [日本語](ai.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/ai.en.md) · [API reference](../function/ai.en.md)

When a user reopens a conversation, AI uses the user and session IDs to load its metadata and history, then assembles the context for the next reply. Relational storage keeps those records across restarts. The configured vector backend stores memory and knowledge indexes.

<a id="data-fields"></a>

## Database

The built-in RelDB store can create up to 30 tables. It creates the three A2A tables only with A2A configured. Choosing Mem0 omits the built-in memory tables. You can also supply your own store via `ai.init(config, { storeProvider })`. An in-memory store loses its records when the process stops.

| Table | Purpose |
| --- | --- |
| [`hai_ai_chat_records`](#table-hai-ai-chat-records) | Look up model requests, replies and usage. |
| [`hai_ai_sessions`](#table-hai-ai-sessions) | List a user's conversations. |
| [`hai_ai_context`](#table-hai-ai-context) | Restore context for the next model reply. |
| [`hai_ai_persona`](#table-hai-ai-persona) | Read selectable personas and prompts. |
| [`hai_ai_llm_models`](#table-hai-ai-llm-models) | Register chat models at runtime. |
| [`hai_ai_audio_models`](#table-hai-ai-audio-models) | Register audio models at runtime. |
| [`hai_ai_image_models`](#table-hai-ai-image-models) | Register image models at runtime. |
| [`hai_ai_mcp_servers`](#table-hai-ai-mcp-servers) | Look up registered external tool servers. |
| [`hai_ai_retrieval_sources`](#table-hai-ai-retrieval-sources) | Look up sources available for retrieval. |
| [`hai_ai_memory`](#table-hai-ai-memory) | Keep information that should survive across conversations. |
| [`hai_ai_memory_vector_outbox`](#table-hai-ai-memory-vector-outbox) | Find memory vectors that need updates or cleanup. |
| [`hai_ai_memory_vector_namespace`](#table-hai-ai-memory-vector-namespace) | Record ownership of the app's dedicated memory vector collection. |
| [`hai_ai_memory_vector_scan`](#table-hai-ai-memory-vector-scan) | Resume the last vector index scan. |
| [`hai_ai_knowledge_documents`](#table-hai-ai-knowledge-documents) | Find the published version of a knowledge document. |
| [`hai_ai_knowledge_collections`](#table-hai-ai-knowledge-collections) | Look up a knowledge collection's dimensions, generation and visibility. |
| [`hai_ai_a2a_journal`](#table-hai-ai-a2a-journal) | Recover agent task progress, events and message receipts. |
| [`hai_ai_a2a_contexts`](#table-hai-ai-a2a-contexts) | Check who owns an agent conversation. |
| [`hai_ai_a2a_messages`](#table-hai-ai-a2a-messages) | Read messages submitted as part of a task. |
| [`hai_ai_acp_workspaces`](#table-hai-ai-acp-workspaces) | Find projects and repositories available to agents. |
| [`hai_ai_acp_agents`](#table-hai-ai-acp-agents) | Find agents that can start and how they connect. |
| [`hai_ai_acp_sessions`](#table-hai-ai-acp-sessions) | Find session project, native ID and runtime resources. |
| [`hai_ai_acp_locks`](#table-hai-ai-acp-locks) | Coordinate changes to the same session resources. |
| [`hai_ai_acp_managed_sessions`](#table-hai-ai-acp-managed-sessions) | Link the application session to its worker. |
| [`hai_ai_acp_managed_requests`](#table-hai-ai-acp-managed-requests) | Recognize repeated submissions. |
| [`hai_ai_acp_managed_approvals`](#table-hai-ai-acp-managed-approvals) | Find operations awaiting approval. |
| [`hai_ai_acp_managed_grants`](#table-hai-ai-acp-managed-grants) | Look up reusable permissions and their deadlines. |
| [`hai_ai_acp_managed_receipts`](#table-hai-ai-acp-managed-receipts) | Check the original caller and worker scopes during recovery. |
| [`hai_ai_memory_write_gate`](#table-hai-ai-memory-write-gate) | Coordinate memory writes across nodes. |
| [`hai_ai_memory_vector_namespace_write_gate`](#table-hai-ai-memory-vector-namespace-write-gate) | Coordinate registration of vector collection ownership. |
| [`hai_ai_memory_vector_scan_write_gate`](#table-hai-ai-memory-vector-scan-write-gate) | Coordinate updates to the vector scan cursor. |

<a id="example-data"></a>

### Record ID, version and content in the database

AI records share `id`, `version`, `data` and timestamps, with business content inside `data`. This excerpt shows a session record; creation and update times are Unix milliseconds.

```json
{
  "id": "session-42",
  "version": "6fdb3344-5197-490b-a36d-2d43ce7cc3ba",
  "data": {
    "sessionId": "session-42",
    "objectId": "user-42",
    "title": "Shipping question",
    "createdAt": 1794873600000,
    "updatedAt": 1794873600000
  },
  "object_id": "user-42",
  "created_at": 1794873600000,
  "updated_at": 1794873600000
}
```

This stores `user-42`’s `session-42`. Its `version` lets an update detect intervening changes.

<a id="table-hai-ai-chat-records"></a>

### `hai_ai_chat_records`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `chat-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `request` holds model input. `response` holds the reply, tool calls and usage. | [Business data example](#history-of-one-model-call) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |
| `object_id` | `TEXT` | Yes | — | Owning subject. Indexed for subject lookup. | `user-42` |
| `session_id` | `TEXT` | Yes | — | Session identifier. Indexed on its own and with the subject. | `session-42` |

<a id="history-of-one-model-call"></a>

#### Example · History of one model call

Keep a model request and response for history, usage and diagnosis, separately from active context.

```json
{
  "id": "chat-42",
  "objectId": "user-42",
  "sessionId": "session-42",
  "createdAt": 1794873600000,
  "duration": 25
}
```

chat-42 belongs to user-42/session-42 and took 25 ms. Request/response contents are omitted for privacy.

<a id="table-hai-ai-sessions"></a>

### `hai_ai_sessions`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `<session-key>` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `sessionId` and `objectId` link a session to its owner. `title` and `metadata` supply display details. `deleted` prevents a stale write from restoring a deleted session. | [Business data example](#the-users-conversation-list) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |
| `object_id` | `TEXT` | Yes | — | Owning subject. Indexed for subject lookup. | `user-42` |

<a id="the-users-conversation-list"></a>

#### Example · The user’s conversation list

Store ownership, title and dates so users can reopen previous conversations.

```json
{
  "sessionId": "session-42",
  "objectId": "user-42",
  "title": "Shipping question",
  "createdAt": 1794873600000,
  "updatedAt": 1794873600000
}
```

session-42 belongs to user-42 and is titled Shipping question. This directory entry is not the full transcript.

<a id="table-hai-ai-context"></a>

### `hai_ai_context`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `<session-key>` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `scope` marks ownership. `messages`, `summaries` and `turns` hold the conversation and start empty. `epoch` identifies the reset generation. `active` can track a turn in progress or awaiting a save. | [Business data example](#context-for-the-next-model-reply) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |
| `object_id` | `TEXT` | Yes | — | Owning subject. Indexed for subject lookup. | `user-42` |
| `session_id` | `TEXT` | Yes | — | Session identifier. Indexed on its own and with the subject. | `session-42` |

<a id="context-for-the-next-model-reply"></a>

#### Example · Context for the next model reply

Keep active messages, summaries and turns for continuation across nodes and protection against stale writes after reset.

```json
{
  "messages": [],
  "summaries": [],
  "turns": [],
  "epoch": "epoch-42",
  "updatedAt": 1794873600000
}
```

Empty arrays mean no saved context yet. epoch-42 identifies the current conversation generation, not a message count.

<a id="table-hai-ai-persona"></a>

### `hai_ai_persona`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `persona-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `name`, `systemPrompt` and `traits` store the name, system prompt and style. `metadata` can hold extra details. | [Business data example](#a-reusable-ai-persona) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |
| `object_id` | `TEXT` | Yes | — | Owning subject. Indexed for subject lookup. | `user-42` |

<a id="a-reusable-ai-persona"></a>

#### Example · A reusable AI persona

Store a subject’s persona instructions for authorized reuse in conversations.

```json
{
  "id": "persona-42",
  "objectId": "user-42",
  "name": "Support",
  "systemPrompt": "Explain the shipping policy.",
  "createdAt": 1794873600000,
  "updatedAt": 1794873600000
}
```

persona-42 belongs to user-42, is named Support and asks for shipping-policy explanations. Saving it does not call a model.

<a id="table-hai-ai-llm-models"></a>

### `hai_ai_llm_models`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `chat-model` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `id` identifies the model. Other fields hold protocol, model name and connection settings. | [Business data example](#registered-conversation-models) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="registered-conversation-models"></a>

#### Example · Registered conversation models

Store connection settings and options behind a shared conversation-model ID.

```json
{
  "id": "chat-model"
}
```

chat-model is the registration ID; connection and secret fields are omitted, so this ID alone cannot connect to a provider.

<a id="table-hai-ai-audio-models"></a>

### `hai_ai_audio_models`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `audio-model` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | Transcription or synthesis model definition, with ID and connection settings. | [Business data example](#registered-speech-models) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="registered-speech-models"></a>

#### Example · Registered speech models

Register speech recognition or synthesis models for selection by operation.

```json
{
  "id": "speech-model"
}
```

speech-model is an example ID. Supported operations and connection settings are omitted from this excerpt.

<a id="table-hai-ai-image-models"></a>

### `hai_ai_image_models`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `image-model` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | Image model ID, service connection and defaults. | [Business data example](#registered-image-models) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="registered-image-models"></a>

#### Example · Registered image models

Register image generation or editing models for server-approved selection.

```json
{
  "id": "image-model"
}
```

image-model is a registration ID, not a generated image or stored image bytes.

<a id="table-hai-ai-mcp-servers"></a>

### `hai_ai_mcp_servers`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `tools-server` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | Transport, address and call settings for an external MCP server. | [Business data example](#external-tool-services-that-may-be-connected) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="external-tool-services-that-may-be-connected"></a>

#### Example · External tool services that may be connected

Register MCP endpoints whose transport and credentials are used by the server.

```json
{
  "id": "mcp-docs"
}
```

mcp-docs identifies a service. Credentials are omitted and must not be exposed with tool listings.

<a id="table-hai-ai-retrieval-sources"></a>

### `hai_ai_retrieval_sources`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `support-source` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | Retrieval source ID, type and connection settings. | [Business data example](#sources-available-for-retrieval) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

If an ID exists in startup configuration and in the database, the startup definition wins. The `__deleted` flag removes a runtime registration. Credentials stay server-side.

<a id="sources-available-for-retrieval"></a>

#### Example · Sources available for retrieval

Register retrieval sources used to obtain external information.

```json
{
  "id": "docs-source"
}
```

docs-source identifies a source, not retrieved text. Its full record holds the actual address and options.

<a id="table-hai-ai-memory"></a>

### `hai_ai_memory`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `memory-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `content`, `type` and `importance` describe the memory. The record can also hold scope, access counts, vector and vector version. | [Business data example](#information-remembered-across-chats) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |
| `object_id` | `TEXT` | Yes | — | Owning subject. Indexed for subject lookup. | `user-42` |

Memory search uses the vector referenced by the current relational record. PostgreSQL indexes memory scope with JSONB GIN. MySQL indexes a nullable generated `VARCHAR(512)` column, `memory_vector_key`, based on `data.vectorId`. Records with a vector but no revision ID use the memory key `id`.

<a id="information-remembered-across-chats"></a>

#### Example · Information remembered across chats

Store permitted facts or preferences for later conversations with the same subject.

```json
{
  "id": "memory-42",
  "objectId": "user-42",
  "content": "Prefers concise answers",
  "importance": 0.7,
  "createdAt": 1794873600000,
  "lastAccessedAt": 1794873600000,
  "accessCount": 0
}
```

memory-42 says user-42 prefers concise answers, with importance 0.7 and no accesses yet. It is not a full transcript.

<a id="table-hai-ai-memory-vector-outbox"></a>

### `hai_ai_memory_vector_outbox`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `memory-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `memoryId`, `updatedAt` and `attempts` track the work. Optional `token`, `retireUntil` and `cooldown` cover claims, postponement and throttling. | [Business data example](#memories-awaiting-search-index-updates) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

Background workers page by the `(updated_at, id)` index.

<a id="memories-awaiting-search-index-updates"></a>

#### Example · Memories awaiting search-index updates

Persist index-update work when text updates and vector storage may fail separately.

```json
{
  "memoryId": "memory-42",
  "updatedAt": 1794873600000,
  "attempts": 0
}
```

memory-42 awaits sync with zero attempts. The work item is cleared after completion; it is not a second copy of the memory.

<a id="table-hai-ai-memory-vector-namespace"></a>

### `hai_ai_memory_vector_namespace`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `namespace` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `namespace` and `owner` identify the app's dedicated vector collection. | [Business data example](#which-vector-namespace-owns-these-memories) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="which-vector-namespace-owns-these-memories"></a>

#### Example · Which vector namespace owns these memories

A relational database holds one collection binding that all instances of the app reuse.

```json
{
  "namespace": "orders",
  "owner": "688b8ef73cac470fbea1e0bfcbf0eed0"
}
```

This record identifies the collection `hai_m_orders_688b8ef73cac470fbea1e0bfcbf0eed0`. Another app with the same namespace and a separate relational database receives a different `owner`.

<a id="table-hai-ai-memory-vector-scan"></a>

### `hai_ai_memory_vector_scan`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `scan` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | Holds the collection, cursor and claim state. `updatedAt` marks the next claim time or the current claim's deadline. | [Business data example](#where-index-inspection-stopped) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="where-index-inspection-stopped"></a>

#### Example · Where index inspection stopped

Save progress for bounded index inspection instead of rescanning from the beginning on every node.

```json
{
  "updatedAt": 1794873600000,
  "collection": "hai_ai_memory",
  "cursor": "memory-42",
  "leased": true
}
```

collection and cursor locate the next page. With leased:true, updatedAt is the worker’s claim deadline, not a memory edit time.

<a id="table-hai-ai-knowledge-documents"></a>

### `hai_ai_knowledge_documents`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `<document-key>` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `current` holds published text, chunks and entities. `pending` holds a version awaiting publication. `garbage` tracks versions to remove from the external index. | [Business data example](#the-published-version-of-one-knowledge-document) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |
| `object_id` | `TEXT` | Yes | — | Knowledge collection. Indexed for collection lookup. | `hai_ai_knowledge` |
| `session_id` | `TEXT` | Yes | — | Collection generation. Indexed with the collection name. | `generation-42` |

<a id="the-published-version-of-one-knowledge-document"></a>

#### Example · The published version of one knowledge document

Track publication of text, chunks and vectors so retrieval sees one complete version.

```json
{
  "collection": "hai_ai_knowledge",
  "generation": "generation-42",
  "documentId": "doc-42"
}
```

This identifies doc-42 in generation-42. current/pending are omitted; row existence alone does not mean publication completed.

<a id="table-hai-ai-knowledge-collections"></a>

### `hai_ai_knowledge_collections`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `hai_ai_knowledge` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `collection` and `dimension` record the name and dimensions. `generation` and `deleted` determine visibility. | [Business data example](#the-collection-containing-knowledge-documents) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="the-collection-containing-knowledge-documents"></a>

#### Example · The collection containing knowledge documents

Keep dimensions and generation so rebuilding or deleting separates stale writes and results.

```json
{
  "collection": "hai_ai_knowledge",
  "dimension": 3,
  "generation": "generation-42",
  "deleted": false
}
```

hai_ai_knowledge is live at generation-42 with dimension 3. A new generation invalidates older results even under the same name.

<a id="table-hai-ai-a2a-journal"></a>

### `hai_ai_a2a_journal`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `task-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `owner`, `executionId`, `leasedUntil` and `deadline` track who can run and until when. Task data, events, receipts, message and result capture progress. | [Business data example](#progress-of-an-agent-task) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |
| `object_id` | `TEXT` | Yes | — | Owning subject. Indexed for subject lookup. | `user-42` |
| `ref_id` | `TEXT` | Yes | — | Related context ID. Indexed for task lookup. | `context-42` |

A2A uses the shared storage clock for deadlines and checks the record version when saving events. Completed message receipts have no automatic expiry.

The executor reads the current key ID, scopes, and effective permissions through `ai.a2a.getCallerIdentity(context)`. These fields live in the SDK request context, while tasks and messages are associated with the verified caller ID. [A2A executor authorization](../function/ai.en.md#a2a-http-example)

<a id="progress-of-an-agent-task"></a>

#### Example · Progress of an agent task

Keep task state, delivered events and receipts for recovery without blindly repeating external actions.

```json
{
  "owner": "user-42",
  "executionId": "execution-42",
  "leasedUntil": 1794873630000,
  "deadline": 1794873660000,
  "events": [],
  "finished": false
}
```

execution-42 is unfinished; leasedUntil limits ownership and deadline limits total time. No events are shown yet.

<a id="table-hai-ai-a2a-contexts"></a>

### `hai_ai_a2a_contexts`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `context-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `owner` is the trusted principal for this context. | [Business data example](#ownership-of-an-agent-conversation) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="ownership-of-an-agent-conversation"></a>

#### Example · Ownership of an agent conversation

Bind a context to a trusted subject so knowing its ID cannot expose another user’s task.

```json
{
  "owner": "user-42"
}
```

owner:user-42 records ownership, not chat content or permission for other users.

<a id="table-hai-ai-a2a-messages"></a>

### `hai_ai_a2a_messages`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `message-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | Message ID, task, optional context, sender role, parts and creation time. | [Business data example](#messages-exchanged-in-an-agent-task) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |
| `object_id` | `TEXT` | Yes | — | Owning subject. Indexed for subject lookup. | `user-42` |
| `status` | `TEXT` | Yes | — | Status of the related task. Indexed for filtering. | `completed` |

<a id="messages-exchanged-in-an-agent-task"></a>

#### Example · Messages exchanged in an agent task

Store user or agent messages linked to their task for processing and inspection.

```json
{
  "id": "message-42",
  "taskId": "task-42",
  "role": "user",
  "parts": [
    {
      "kind": "text",
      "text": "Shipping policy?"
    }
  ],
  "createdAt": 1794873600000
}
```

message-42 is a user message for task-42 asking about shipping policy. createdAt is its write time.

<a id="table-hai-ai-acp-workspaces"></a>

### `hai_ai_acp_workspaces`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `project` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | Workspace definition, including storage location and available repositories. | [Business data example](#workspaces-an-agent-may-use) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="workspaces-an-agent-may-use"></a>

#### Example · Workspaces an agent may use

Register host-approved workspaces and repositories instead of accepting arbitrary model-supplied host paths.

```json
{
  "id": "workspace-42"
}
```

workspace-42 is a workspace ID; project settings are omitted. It is not a session or running process.

<a id="table-hai-ai-acp-agents"></a>

### `hai_ai_acp_agents`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `coder` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | Agent definition, including mode, adapter, models and allowed environments. | [Business data example](#agent-definitions-that-may-be-started) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="agent-definitions-that-may-be-started"></a>

#### Example · Agent definitions that may be started

Store agent type and launch/connection settings for authorized server-side tasks.

```json
{
  "id": "agent-42"
}
```

agent-42 is a definition ID; commands are omitted. Registering it does not start an execution.

<a id="table-hai-ai-acp-sessions"></a>

### `hai_ai_acp_sessions`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `session-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | Agent, workspace, repository, branch, model, MCP bindings and current container. A successful explicit reopen updates `nativeId`. | [Business data example](#project-and-resources-bound-to-one-agent-session) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="project-and-resources-bound-to-one-agent-session"></a>

#### Example · Project and resources bound to one agent session

Bind an agent session to its workspace and resources for reconnecting to the same environment.

```json
{
  "id": "acp-session-42",
  "agentId": "agent-42",
  "workspaceId": "workspace-42",
  "cwd": "/workspace/orders"
}
```

acp-session-42 uses agent-42 in workspace-42 at /workspace/orders. The path is inside the managed environment, not a public file URL.

<a id="table-hai-ai-acp-locks"></a>

### `hai_ai_acp_locks`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `session-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `owner` identifies the current resource operation's owner and can be null. | [Business data example](#avoid-concurrent-session-resource-changes) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

<a id="avoid-concurrent-session-resource-changes"></a>

#### Example · Avoid concurrent session-resource changes

Record temporary ownership while starting, recovering or releasing a session resource.

```json
{
  "owner": null
}
```

owner:null means no registered operation owner, not user authorization or proof of deletion.

<a id="table-hai-ai-acp-managed-sessions"></a>

### `hai_ai_acp_managed_sessions`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `session-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `scope`, `workerScope` and `workerId` bind the caller and worker. `request`, `mode` and optional history or flags describe execution. | [Business data example](#connect-an-app-session-to-its-worker) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

Background workers page by the `(updated_at, id)` index.

<a id="connect-an-app-session-to-its-worker"></a>

#### Example · Connect an app session to its worker

Store caller/worker scopes and references so later app requests find the right execution session.

```json
{
  "workerId": "worker-42",
  "mode": "shared"
}
```

worker-42 is the execution-side ID in shared mode. Full records also check both scopes; an ID alone grants no access.

<a id="table-hai-ai-acp-managed-requests"></a>

### `hai_ai_acp_managed_requests`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `<request-key>` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `fingerprint` checks that a reused request ID identifies the same request. | [Business data example](#recognize-the-same-submission) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

Background workers page by the `(updated_at, id)` index.

<a id="recognize-the-same-submission"></a>

#### Example · Recognize the same submission

Store a normalized-request digest to detect retries that reuse an ID with different input.

```json
{
  "fingerprint": "<request-digest>"
}
```

fingerprint is a digest placeholder, not prompt or response text. A mismatch must not continue as the original request.

<a id="table-hai-ai-acp-managed-approvals"></a>

### `hai_ai_acp_managed_approvals`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `approval-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `scope` and `sessionId` identify ownership. `deadline` is the approval deadline and `decision` holds the result. | [Business data example](#an-operation-awaiting-human-approval) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

Background workers page by the `(updated_at, id)` index.

<a id="an-operation-awaiting-human-approval"></a>

#### Example · An operation awaiting human approval

Persist pending approval and its deadline so another node can inspect or decide it.

```json
{
  "sessionId": "acp-session-42",
  "deadline": 1794873660000
}
```

The session has no decision yet. Passing deadline does not approve anything; waiting is not consent.

<a id="table-hai-ai-acp-managed-grants"></a>

### `hai_ai_acp_managed_grants`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `grant-42` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `id`, `scopeKey` and `summary` identify the grant. Optional `sessionId` limits it to a session. `expires` and `revoked` control validity. | [Business data example](#a-reusable-granted-permission) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

Background workers page by the `(updated_at, id)` index.

<a id="a-reusable-granted-permission"></a>

#### Example · A reusable granted permission

Persist a scoped permission after an ongoing approval, checking subject, session and expiry on use.

```json
{
  "id": "grant-42",
  "scopeKey": "scope-42",
  "summary": "Read project files",
  "expires": 1794873660000
}
```

grant-42 covers the described project-file read until expires. It is not permanent permission for arbitrary paths or commands.

<a id="table-hai-ai-acp-managed-receipts"></a>

### `hai_ai_acp_managed_receipts`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key of this record. | `<execution-key>` |
| `version` | `VARCHAR(36)` | No | — | Version assigned to this write. Compare it to detect intervening writes. | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | No | — | `scope` and `workerScope` retain the original caller and worker scopes. | [Business data example](#check-original-scopes-during-recovery) |
| `created_at` | `BIGINT` | No | — | Creation time in Unix milliseconds. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time in Unix milliseconds. | `1794873600000` |

Background workers page by the `(updated_at, id)` index.

<a id="check-original-scopes-during-recovery"></a>

#### Example · Check original scopes during recovery

Keep caller and worker scope evidence so recovery still checks the original caller.

```json
{
  "scope": {
    "tenantId": "team-1",
    "userId": "user-42"
  },
  "workerScope": {
    "tenantId": "team-1",
    "userId": "user-42"
  }
}
```

Both scopes are user-42 in team-1. Knowing the execution ID does not let another subject read its result.

<a id="table-hai-ai-memory-write-gate"></a>

### `hai_ai_memory_write_gate`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | No | — | Fixed primary key for the row inserted at initialization. | `1` |
| `marker` | `INTEGER` | No | — | Initially `0`. Writes toggle `0` and `1` to lock the row. | `0` |

<a id="coordinate-memory-writes"></a>

#### Example · Coordinate memory writes

Nodes lock this row within the transaction before committing memory writes.

```json
{
  "id": 1,
  "marker": 0
}
```

There is one id:1 row. marker:0 is an initial marker, not memory text or a processed-item count.

<a id="table-hai-ai-memory-vector-namespace-write-gate"></a>

### `hai_ai_memory_vector_namespace_write_gate`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | No | — | Fixed primary key for the row inserted at initialization. | `1` |
| `marker` | `INTEGER` | No | — | Initially `0`. Writes toggle `0` and `1` to lock the row. | `0` |

<a id="coordinate-index-ownership-updates"></a>

#### Example · Coordinate index ownership updates

During first startup, instances lock this row so they reuse the same collection binding.

```json
{
  "id": 1,
  "marker": 0
}
```

There is one id:1 row. marker:0 is an initial marker, not memory text or a processed-item count.

<a id="table-hai-ai-memory-vector-scan-write-gate"></a>

### `hai_ai_memory_vector_scan_write_gate`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | No | — | Fixed primary key for the row inserted at initialization. | `1` |
| `marker` | `INTEGER` | No | — | Initially `0`. Writes toggle `0` and `1` to lock the row. | `0` |

<a id="coordinate-inspection-progress"></a>

#### Example · Coordinate inspection progress

Nodes lock this row when committing updates to the scan cursor.

```json
{
  "id": 1,
  "marker": 0
}
```

There is one id:1 row. marker:0 is an initial marker, not memory text or a processed-item count.

## Vector collections

Knowledge vectors use the `hai_ai_knowledge` [VecDB](vecdb.en.md) collection by default. Search reads only published document versions. Built-in memory defaults to `hai_ai_memory` or the collection assigned to a bound namespace. Mem0 manages its own vectors. [Runner](runner.en.md) owns ACP execution and event tables.

AI creates no Redis keys. It rebuilds process-local model connections, tool connections and execution objects after restart. [IAM](iam.en.md) owns tickets for browser connections to live audio.
