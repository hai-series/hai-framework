# @h-ai/ai API reference

<!-- translation: partial -->

[Chinese source](ai.md) · [Configuration](../configuration/ai.en.md) · [Data structures](../data/ai.en.md)

<a id="quick-start"></a>

## Quick start

Initialize the configured provider before invoking AI. Start with chat or embeddings, then add tools, retrieval and durable sessions as needed. Assign the authenticated scope on the server and apply tool authorization there.

```ts
import { ai } from '@h-ai/ai'

const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
})
if (!init.success)
  throw new Error(init.error.message)

try {
  const result = await ai.llm.chat({
    messages: [
      { role: 'user', content: '你好！' }
    ],
  })
  if (!result.success)
    throw new Error(result.error.message)
  const reply = result.data.choices[0]?.message.content ?? ''
}
finally {
  await ai.close()
}
```

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `ai.llm.chat`, `chatStream`, `ask`, `askStream`, `generateObject` | Send messages or a question, optionally stream results or validate structured output. | `await ai.llm.chat(request)` |
| `ai.llm.listModels`, `getHistory`, `listSessions` | List configured models or query prior interaction records and sessions. | `await ai.llm.listModels()` |
| `ai.tools.adapt`, `createBuiltinTools`, `createMcpTools`, `createBroker` | Adapt tool definitions for a model, construct supported tools and coordinate selected execution. | `ai.tools.createBuiltinTools(options)` |
| `ai.stream.createProcessor`, `collect`, `createSSEDecoder`, `encodeSSE` | Process streaming events, collect output, or encode and decode SSE. | `ai.stream.createSSEDecoder()` |
| `ai.embedding.embed`, `embedText` | Generate vectors for documents or text using a matching embedding profile. | `await ai.embedding.embedText(text)` |
| `ai.memory`, `ai.rag`, `ai.knowledge`, `ai.context`, `ai.persona` | Persist or retrieve memory, index and search knowledge, and manage request context or personas. | `ai.knowledge` |
| `ai.audio`, `ai.image`, `ai.file` | Use configured media models or parse uploaded source files. | `ai.audio` |
| `ai.acp`, `ai.a2a`, `ai.mcp` | Integrate agent sessions, protocol builders and remote tool providers under application permissions. | `ai.acp` |

Additional options and workflow examples are available in the [Chinese reference](ai.md).
