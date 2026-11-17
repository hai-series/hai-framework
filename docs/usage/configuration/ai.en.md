# @h-ai/ai Configuration

<!-- translation: partial -->

[Chinese source](ai.md) · [Data structures](../data/ai.en.md) · [API reference](../function/ai.en.md)

Load `_ai.yml` on the server. For model-only local development start with an LLM profile. For production, choose shared persistence and explicitly configure the models, retrieval sources and tool services the application uses.

```yaml schema=@h-ai/ai:AIConfigSchema
llm:
  models:
    - id: coding
      model: your-responses-model
      protocol: responses
      baseUrl: https://models.example.invalid/v1
      apiKey: ${MODEL_API_KEY}
acp:
  agents:
    - id: coder
      name: Codex
      mode: embedded
      adapter: codex
      modelIds: [coding]
  workspaces:
    - id: project
      storage: { type: directory, path: /srv/projects/demo }
      repositories:
        - id: api
          url: https://git.example.invalid/team/api.git
          mainBranch: trunk
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `llm.model`, `llm.protocol` | `gpt-4o-mini`, `chat` | Default model and protocol. Profiles in `models` can be selected for scenarios. Credentials and endpoints depend on the protocol. |
| `llm.maxTokens`, `temperature`, `timeout`, `tempModelCacheTtl` | `4096`, `0.7`, `60000`, `600000` | Token limit, sampling, request deadline and temporary model cache lifetime, with time fields in milliseconds. |
| `embedding.dimensions`, `batchSize` | No dimension default, `100` | Match the model and vector index dimensions. |
| `knowledge.collection`, `dimension`, `enableEntityExtraction` | `hai_ai_knowledge`, `1536`, `true` | Select the vector collection and ingestion pipeline. Cleaning uses Datapipe options; default chunking is markdown with size 1500 and overlap 200. |
| `memory.provider`, `allowEphemeralFallback`, `vectorNamespace` | `native`, `false`, `default` | Select memory storage and isolate vectors by namespace. Keep production state shared. |
| `audio.models`, `inheritLlmApiKey` | Optional models, `false` | Register audio profiles and select transcription/synthesis models explicitly. Use each profile's own credential by default. |
| `image.models`, `generateModel`, `maxImageBytes`, `maxImages` | Optional selection, `20 MiB`, `4` | Register image models, select an active profile and bound job inputs. |
| ACP `mode` | See backend | Choose `embedded`, `builtin-service` or `custom-service` based on the execution environment. Own workspaces and credentials on the server. |

<a id="knowledge"></a>

## Knowledge ingestion

Choose `knowledge.collection` (default `hai_ai_knowledge`) and a dimension matching the embedding model (default `1536`). Incoming text runs through `knowledge.cleanOptions` before `knowledge.chunkOptions` creates chunks. The default chunker uses Markdown sections, a size of `1500` and overlap of `200`. Adjust these settings before indexing and reindex the collection if you need to change the stored chunks. [Datapipe options](datapipe.en.md)

Still untranslated: the full model-profile, MCP and ACP option tables. Read the [Chinese source section](ai.md#configuration-fields).
