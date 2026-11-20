# @h-ai/ai Data structures

<!-- translation: partial -->

[Chinese source](ai.md) · [Configuration](../configuration/ai.en.md) · [API reference](../function/ai.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

Database and file samples show relevant fields, not complete writable records. Omitted fields are not automatically optional. Examples can represent different moments in a process.

### How SQL wraps a business record

Structure: `SQL envelope`.

AI records share id, version, data and timestamps, with business content inside data.

```json
{
  "id": "session-42",
  "version": "version-42",
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

This stores user-42’s session-42. version-42 detects intervening edits. SQLite stores the JSON as text.

### History of one model call

Structure: `hai_ai_chat_records`.

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

### The user’s conversation list

Structure: `hai_ai_sessions`.

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

### Context for the next model reply

Structure: `hai_ai_context`.

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

### A reusable AI persona

Structure: `hai_ai_persona`.

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

### Registered conversation models

Structure: `hai_ai_llm_models`.

Store connection settings and options behind a shared conversation-model ID.

```json
{
  "id": "chat-model"
}
```

chat-model is the registration ID; connection and secret fields are omitted, so this ID alone cannot connect to a provider.

### Registered speech models

Structure: `hai_ai_audio_models`.

Register speech recognition or synthesis models for selection by operation.

```json
{
  "id": "speech-model"
}
```

speech-model is an example ID. Supported operations and connection settings are omitted from this excerpt.

### Registered image models

Structure: `hai_ai_image_models`.

Register image generation or editing models for server-approved selection.

```json
{
  "id": "image-model"
}
```

image-model is a registration ID, not a generated image or stored image bytes.

### External tool services that may be connected

Structure: `hai_ai_mcp_servers`.

Register MCP endpoints whose transport and credentials are used by the server.

```json
{
  "id": "mcp-docs"
}
```

mcp-docs identifies a service. Credentials are omitted and must not be exposed with tool listings.

### Sources available for retrieval

Structure: `hai_ai_retrieval_sources`.

Register retrieval sources used to obtain external information.

```json
{
  "id": "docs-source"
}
```

docs-source identifies a source, not retrieved text. Its full record holds the actual address and options.

### Information remembered across chats

Structure: `hai_ai_memory`.

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

### Memories awaiting search-index updates

Structure: `hai_ai_memory_vector_outbox`.

Persist index-update work when text updates and vector storage may fail separately.

```json
{
  "memoryId": "memory-42",
  "updatedAt": 1794873600000,
  "attempts": 0
}
```

memory-42 awaits sync with zero attempts. The work item is cleared after completion; it is not a second copy of the memory.

### Which vector namespace owns these memories

Structure: `hai_ai_memory_vector_namespace`.

Track vector ownership and migration progress so deployments do not accidentally share incompatible indexes.

```json
{
  "updatedAt": 1794873600000,
  "namespace": "orders",
  "owner": "namespace-owner-42",
  "migrated": true
}
```

namespace orders and its owner identify the index; migrated:true means migration completed. updatedAt is a coordination timestamp.

### Where index inspection stopped

Structure: `hai_ai_memory_vector_scan`.

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

### The published version of one knowledge document

Structure: `hai_ai_knowledge_documents`.

Track publication of text, chunks and vectors so retrieval sees one complete version.

```json
{
  "collection": "hai_ai_knowledge",
  "generation": "generation-42",
  "documentId": "doc-42"
}
```

This identifies doc-42 in generation-42. current/pending are omitted; row existence alone does not mean publication completed.

### The collection containing knowledge documents

Structure: `hai_ai_knowledge_collections`.

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

### Progress of an agent task

Structure: `hai_ai_a2a_journal`.

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

### Ownership of an agent conversation

Structure: `hai_ai_a2a_contexts`.

Bind a context to a trusted subject so knowing its ID cannot expose another user’s task.

```json
{
  "owner": "user-42"
}
```

owner:user-42 records ownership, not chat content or permission for other users.

### Messages exchanged in an agent task

Structure: `hai_ai_a2a_messages`.

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

### Workspaces an agent may use

Structure: `hai_ai_acp_workspaces`.

Register host-approved workspaces and repositories instead of accepting arbitrary model-supplied host paths.

```json
{
  "id": "workspace-42"
}
```

workspace-42 is a workspace ID; project settings are omitted. It is not a session or running process.

### Agent definitions that may be started

Structure: `hai_ai_acp_agents`.

Store agent type and launch/connection settings for authorized server-side tasks.

```json
{
  "id": "agent-42"
}
```

agent-42 is a definition ID; commands are omitted. Registering it does not start an execution.

### Project and resources bound to one agent session

Structure: `hai_ai_acp_sessions`.

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

### Avoid concurrent session-resource changes

Structure: `hai_ai_acp_locks`.

Record temporary ownership while starting, recovering or releasing a session resource.

```json
{
  "owner": null
}
```

owner:null means no registered operation owner, not user authorization or proof of deletion.

### Connect an app session to its worker

Structure: `hai_ai_acp_managed_sessions`.

Store caller/worker scopes and references so later app requests find the right execution session.

```json
{
  "workerId": "worker-42",
  "mode": "shared"
}
```

worker-42 is the execution-side ID in shared mode. Full records also check both scopes; an ID alone grants no access.

### Recognize the same submission

Structure: `hai_ai_acp_managed_requests`.

Store a normalized-request digest to detect retries that reuse an ID with different input.

```json
{
  "fingerprint": "<request-digest>"
}
```

fingerprint is a digest placeholder, not prompt or response text. A mismatch must not continue as the original request.

### An operation awaiting human approval

Structure: `hai_ai_acp_managed_approvals`.

Persist pending approval and its deadline so another node can inspect or decide it.

```json
{
  "sessionId": "acp-session-42",
  "deadline": 1794873660000
}
```

The session has no decision yet. Passing deadline does not approve anything; waiting is not consent.

### A reusable granted permission

Structure: `hai_ai_acp_managed_grants`.

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

### Check original scopes during recovery

Structure: `hai_ai_acp_managed_receipts`.

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

### Coordinate memory writes

Structure: `hai_ai_memory_write_gate`.

Coordinate transactions changing this shared memory state so nodes do not overwrite one another.

```json
{
  "id": 1,
  "marker": 0
}
```

There is one id:1 row. marker:0 is an initial marker, not memory text or a processed-item count.

### Coordinate index ownership updates

Structure: `hai_ai_memory_vector_namespace_write_gate`.

Coordinate transactions changing this shared memory state so nodes do not overwrite one another.

```json
{
  "id": 1,
  "marker": 0
}
```

There is one id:1 row. marker:0 is an initial marker, not memory text or a processed-item count.

### Coordinate inspection progress

Structure: `hai_ai_memory_vector_scan_write_gate`.

Coordinate transactions changing this shared memory state so nodes do not overwrite one another.

```json
{
  "id": 1,
  "marker": 0
}
```

There is one id:1 row. marker:0 is an initial marker, not memory text or a processed-item count.

## Field, storage and cleanup reference

AI uses the caller-supplied `storeProvider` or the initialized RelDB and VecDB integrations. The built-in relational store uses a string `id`, a write `version`, JSON `data`, and Unix millisecond timestamps. Feature tables optionally index `object_id`, `session_id`, `status` or `ref_id`.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_ai_chat_records`, `hai_ai_sessions`, `hai_ai_context`, `hai_ai_persona` | Chat requests and replies, session ownership and metadata, context turns/summaries, and persona prompts. Deletion markers prevent stale re-creation. |
| `hai_ai_llm_models`, `hai_ai_audio_models`, `hai_ai_image_models`, `hai_ai_mcp_servers`, `hai_ai_retrieval_sources` | Runtime resource registrations. Explicit writes by ID override startup values; deletion markers can suppress them. |
| `hai_ai_memory`, `hai_ai_memory_vector_outbox`, `hai_ai_memory_vector_namespace`, `hai_ai_memory_vector_scan` | Memory records, pending vector updates, ownership binding and scan cursor. The current relational record controls visible vector versions. |
| `hai_ai_knowledge_documents`, `hai_ai_knowledge_collections` | Document content and chunks are versioned by collection and generation. Read only the published document version. |
| `hai_ai_acp_*`, `hai_ai_a2a_*` | Workspace/session and managed request/approval state for ACP, and context/journal/messages for A2A. |
| `hai_ai_knowledge`, `hai_ai_memory` (VecDB) | Default knowledge and memory vector collections. Binding a memory namespace can change the actual collection. |

The session record keeps the framework session ID and its current native ID. An explicit reopen updates the native ID after the new native session opens successfully.

Still untranslated: individual record fields and schema/index details for memory, knowledge, A2A and ACP. Read the [Chinese source section](ai.md#data-fields).
