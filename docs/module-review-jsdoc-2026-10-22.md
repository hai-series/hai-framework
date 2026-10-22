# 全模块 JSDoc 修正任务附件（2026-10-22）

对应 [主任务清单](module-review-tasks-2026-10-22.md)，基线 `320c9ddb15f938a9e40e44ca0ce17a83a70bcba9`。以下是静态定位表，不是逐项人工判定后的公开 API 清单。

标记：**J**=没有声明级 JSDoc；**E**=没有 @example（包含 J）。已有注释仍须检查中文说明、参数/返回/失败边界和示例真实性。变量/schema 的示例应体现实际使用/解析；type/interface 示例应提供合法结构值，函数应有调用与结果处理；不要为常量照抄定义充当示例。

统计排除 Paraglide 生成文件，原始扫描包括内部导出。执行 STYLE-01 后先删除无用 export，再补保留 API 注释。Svelte script 中的结构体另列；组件 props、事件、slots/snippets 与函数方法需按下列补充规则人工核验。

## 通用关闭标准

1. 所有保留的 export 函数、type/interface 和关键逻辑具备规范 JSDoc、有效示例。结构字段说明单位、默认值、可选性和约束；非公开类型也不能遗漏。
2. 示例走 package 真实入口；模块内部工厂示例标明内部上下文，不发明公开入口。正常与重要失败路径先判断 HaiResult.success；流式/显式抛错单独说明。
3. 为会话 CAS、锁 owner/租约、计费回调、队列重试、事务、版本发布与安全校验说明前置/后置条件、竞争窗口和失败恢复，不能只把代码翻译为中文。
4. 对 TS/JS/Svelte 的方法、箭头函数、组件 API、re-export 原声明进行二次核验；本附件的数字不覆盖这些完整范围。已有 @example 应编译/执行验证，不等于已合格。
5. 示例集中做类型检查，行为变化由功能测试验证；不要为纯注释格式编写镜像单元测试。

## JSDOC-01 · @h-ai/ai

- [ ] 完成主清单通用关闭标准；基线顶层导出 422，缺 JSDoc 0，缺示例 372。

### 顶层导出定位

- [packages/ai/src/a2a/ai-a2a-functions.ts](../packages/ai/src/a2a/ai-a2a-functions.ts)：`ReldbA2ATaskStore`（L166，E）；`A2ADeps`（L254，E）；`createA2AStores`（L262，E）；`A2ACreateOptions`（L270，E）；`createA2AOperations`（L282，E）；`A2ALazyProxyDeps`（L360，E）；`createA2ALazyProxy`（L384，E）。
- [packages/ai/src/a2a/ai-a2a-types.ts](../packages/ai/src/a2a/ai-a2a-types.ts)：`A2ACallerIdentity`（L51，E）；`A2AMessageRecord`（L61，E）；`A2AContextInfo`（L79，E）；`A2AAuthenticator`（L100，E）；`A2ATaskFilter`（L113，E）；`A2AOperations`（L135，E）；`A2AApiKeySecurity`（L191，E）；`A2ASecurityConfig`（L199，E）；`A2AAgentCardConfig`（L205，E）；`A2AHandleResult`（L226，E）；`A2ACallOptions`（L236，E）；`A2ACallResult`（L244，E）。
- [packages/ai/src/ai-config.ts](../packages/ai/src/ai-config.ts)：`OptionalSecretSchema`（L24，E）；`ModelScenarioSchema`（L49，E）；`ModelScenario`（L52，E）；`ApiTypeSchema`（L63，E）；`ApiType`（L66，E）；`ModelEntry`（L103，E）；`LLMConfig`（L160，E）；`ResolvedModelConfig`（L167，E）；`ResolveRequiredModelEntryOptions`（L187，E）；`resolveModelEntry`（L204，E）；`resolveModelApi`（L258，E）；`MCPServerCapabilitiesSchema`（L270，E）；`MCPServerCapabilities`（L280，E）；`MCPServerConfigSchema`（L283，E）；`MCPServerConfig`（L293，E）；`MCPConfig`（L317，E）；`EmbeddingConfig`（L344，E）；`KnowledgeConfig`（L401，E）；`MemoryConfig`（L476，E）；`TokenConfig`（L497，E）；`SummaryConfig`（L517，E）；`CompressConfig`（L543，E）；`FileConfigSchema`（L553，E）；`FileConfig`（L559，E）；`RetrievalSourceSchema`（L568，E）；`RetrievalSourceConfig`（L586，E）；`RetrievalConfig`（L612，E）；`A2ASkillConfigSchema`（L617，E）；`A2AConfig`（L675，E）；`AudioProviderSchema`（L693，E）；`AudioProviderName`（L696，E）；`AudioOperationSchema`（L699，E）；`AudioOperation`（L702，E）；`AudioOperationsSchema`（L709，E）；`AudioModelEntry`（L752，E）；`AudioConfig`（L789，E）；`ResolvedAudioModel`（L797，E）；`resolveAudioModel`（L870，E）；`ensureAudioCredential`（L925，E）；`ImageProviderSchema`（L945，E）；`ImageProviderName`（L948，E）；`ImageModelEntrySchema`（L951，E）；`ImageModelEntry`（L969，E）；`ImageConfigSchema`（L972，E）；`ImageConfig`（L980，E）；`ResolvedImageModel`（L983，E）；`resolveImageModel`（L1023，E）；`AIConfig`（L1124，E）；`AIConfigInput`（L1127，E）。
- [packages/ai/src/ai-functions.ts](../packages/ai/src/ai-functions.ts)：`AISubsystemDeps`（L58，E）；`AISubsystems`（L64，E）；`createAISubsystems`（L92，E）。
- [packages/ai/src/ai-i18n.ts](../packages/ai/src/ai-i18n.ts)：`aiM`（L21，E）。
- [packages/ai/src/ai-types.ts](../packages/ai/src/ai-types.ts)：`HaiAIError`（L174，E）；`AIInitOptions`（L184，E）。
- [packages/ai/src/audio/ai-audio-functions.ts](../packages/ai/src/audio/ai-audio-functions.ts)：`createAudioOperations`（L51，E）。
- [packages/ai/src/audio/ai-audio-serialization.ts](../packages/ai/src/audio/ai-audio-serialization.ts)：`serializePlayableAudio`（L16，E）。
- [packages/ai/src/audio/ai-audio-types.ts](../packages/ai/src/audio/ai-audio-types.ts)：`AudioFormat`（L22，E）；`AudioContent`（L30，E）；`PlayableAudio`（L42，E）；`AudioInputStream`（L56，E）；`TranscriptionTimestampGranularity`（L75，E）；`TranscriptionWord`（L78，E）；`TranscriptionSegment`（L90，E）；`TranscriptionOptions`（L111，E）；`TranscriptionRequest`（L133，E）；`TranscriptionStreamRequest`（L139，E）；`TranscriptionResult`（L145，E）；`TranscriptionEvent`（L171，E）；`AudioReference`（L184，E）；`SynthesisOptions`（L199，E）；`SynthesisRequest`（L235，E）；`SynthesisTextSegment`（L249，E）；`SynthesisStreamRequest`（L257，E）；`SynthesisResult`（L263，E）；`SynthesisEvent`（L284，E）；`AudioModelCapabilities`（L299，E）；`AudioCapabilitiesRequest`（L355，E）；`AudioOperations`（L370，E）。
- [packages/ai/src/audio/ai-audio-ws-protocol.ts](../packages/ai/src/audio/ai-audio-ws-protocol.ts)：`AUDIO_WS_PATH`（L22，E）；`AudioWsStartMessage`（L31，E）；`AudioWsTextMessage`（L61，E）；`AudioWsDoneMessage`（L70，E）；`AudioWsClientMessage`（L75，E）；`AudioFormatSchema`（L83，E）；`AudioWsStartMessageSchema`（L87，E）；`AudioWsTextMessageSchema`（L90，E）；`AudioWsDoneMessageSchema`（L93，E）；`AudioWsClientMessageSchema`（L96，E）；`AudioWsSpeechMessage`（L101，E）；`AudioWsTranscriptMessage`（L106，E）；`AudioWsSegmentStartedMessage`（L119，E）；`AudioWsSegmentDoneMessage`（L132，E）；`AudioWsErrorMessage`（L138，E）；`AudioWsEndMessage`（L147，E）；`AudioWsServerMessage`（L152，E）。
- [packages/ai/src/audio/providers/ai-audio-provider-doubao.ts](../packages/ai/src/audio/providers/ai-audio-provider-doubao.ts)：`createDoubaoAudioProvider`（L239，E）。
- [packages/ai/src/audio/providers/ai-audio-provider-indextts.ts](../packages/ai/src/audio/providers/ai-audio-provider-indextts.ts)：`createIndexTtsAudioProvider`（L57，E）。
- [packages/ai/src/audio/providers/ai-audio-provider-mimo.ts](../packages/ai/src/audio/providers/ai-audio-provider-mimo.ts)：`createMimoAudioProvider`（L63，E）。
- [packages/ai/src/audio/providers/ai-audio-provider-openai.ts](../packages/ai/src/audio/providers/ai-audio-provider-openai.ts)：`createOpenAIAudioProvider`（L51，E）。
- [packages/ai/src/audio/providers/ai-audio-provider-qwen.ts](../packages/ai/src/audio/providers/ai-audio-provider-qwen.ts)：`createQwenAudioProvider`（L60，E）。
- [packages/ai/src/audio/providers/ai-audio-provider-whisper.ts](../packages/ai/src/audio/providers/ai-audio-provider-whisper.ts)：`createWhisperAudioProvider`（L70，E）。
- [packages/ai/src/audio/providers/ai-audio-provider.ts](../packages/ai/src/audio/providers/ai-audio-provider.ts)：`ProviderTranscriptionRequest`（L35，E）；`ProviderTranscriptionStreamRequest`（L53，E）；`ProviderSynthesisRequest`（L71，E）；`ProviderSynthesisStreamRequest`（L103，E）；`SynthesisOutputMeta`（L137，E）；`AudioTranscriptionProvider`（L152，E）；`AudioSynthesisProvider`（L165，E）；`AudioProvider`（L185，E）；`streamSentences`（L207，E）；`toBase64`（L229，E）；`fromBase64`（L234，E）；`concatChunks`（L239，E）；`AudioUploadPart`（L252，E）；`toAudioUploadPart`（L269，E）；`toAudioBlob`（L284，E）；`wrapPcm16ToWav`（L293，E）；`errorMessage`（L317，E）；`audioError`（L326，E）；`audioAbortError`（L338，E）；`mapStreamError`（L354，E）；`toAudioErrorResult`（L368，E）；`combineSignal`（L375，E）；`describeHttpError`（L381，E）；`AudioWsMessage`（L389，E）；`AudioWsConnection`（L399，E）；`openAudioWebSocket`（L418，E）。
- [packages/ai/src/client/ai-audio-client.ts](../packages/ai/src/client/ai-audio-client.ts)：`AudioTicketRequest`（L44，E）；`AudioClientConfig`（L52，E）；`AudioClientOperations`（L69，E）；`createAudioClient`（L215，E）。
- [packages/ai/src/compress/ai-compress-functions.ts](../packages/ai/src/compress/ai-compress-functions.ts)：`createCompressOperations`（L166，E）。
- [packages/ai/src/compress/ai-compress-types.ts](../packages/ai/src/compress/ai-compress-types.ts)：`CompressionStrategySchema`（L18，E）；`CompressionStrategy`（L21，E）；`CompressOptions`（L28，E）；`CompressResult`（L44，E）。
- [packages/ai/src/context/ai-context-functions.ts](../packages/ai/src/context/ai-context-functions.ts)：`createContextOperations`（L67，E）。
- [packages/ai/src/context/ai-context-types.ts](../packages/ai/src/context/ai-context-types.ts)：`ContextDeps`（L32，E）；`ConsolidateOptions`（L53，E）；`ConsolidateResult`（L72，E）；`ConversationTurnStatus`（L90，E）；`ConversationTurn`（L98，E）；`CommitTurnInput`（L118，E）；`ContextManagerOptions`（L135，E）；`ContextResetOptions`（L252，E）；`ContextChatOptions`（L279，E）；`ContextChatResult`（L298，E）；`ContextStreamEvent`（L325，E）。
- [packages/ai/src/embedding/ai-embedding-functions.ts](../packages/ai/src/embedding/ai-embedding-functions.ts)：`createEmbeddingOperations`（L35，E）。
- [packages/ai/src/embedding/ai-embedding-types.ts](../packages/ai/src/embedding/ai-embedding-types.ts)：`EmbeddingRequest`（L15，E）；`EmbeddingItem`（L27，E）；`EmbeddingResponse`（L37，E）；`EmbeddingProvider`（L56，E）。
- [packages/ai/src/file/ai-file-functions.ts](../packages/ai/src/file/ai-file-functions.ts)：`createFileOperations`（L412，E）。
- [packages/ai/src/file/ai-file-types.ts](../packages/ai/src/file/ai-file-types.ts)：`FileParseMethod`（L22，E）；`OutputFormat`（L30，E）；`FileParseOptions`（L37，E）；`FileParseRequest`（L62，E）；`FileParseResult`（L79，E）。
- [packages/ai/src/image/ai-image-functions.ts](../packages/ai/src/image/ai-image-functions.ts)：`createImageOperations`（L24，E）。
- [packages/ai/src/image/ai-image-types.ts](../packages/ai/src/image/ai-image-types.ts)：`ImageSize`（L12，E）；`ReferenceImage`（L20，E）；`GenerateImageRequest`（L28，E）；`GeneratedImage`（L42，E）；`GenerateImageResult`（L54，E）；`ImageOperations`（L60，E）。
- [packages/ai/src/image/providers/ai-image-provider-google.ts](../packages/ai/src/image/providers/ai-image-provider-google.ts)：`createGoogleImageProvider`（L36，E）。
- [packages/ai/src/image/providers/ai-image-provider-openai.ts](../packages/ai/src/image/providers/ai-image-provider-openai.ts)：`createOpenAIImageProvider`（L13，E）。
- [packages/ai/src/image/providers/ai-image-provider-pollinations.ts](../packages/ai/src/image/providers/ai-image-provider-pollinations.ts)：`createPollinationsImageProvider`（L11，E）。
- [packages/ai/src/image/providers/ai-image-provider-qwen.ts](../packages/ai/src/image/providers/ai-image-provider-qwen.ts)：`createQwenImageProvider`（L15，E）。
- [packages/ai/src/image/providers/ai-image-provider-seedream.ts](../packages/ai/src/image/providers/ai-image-provider-seedream.ts)：`createSeedreamImageProvider`（L11，E）。
- [packages/ai/src/image/providers/ai-image-provider.ts](../packages/ai/src/image/providers/ai-image-provider.ts)：`ProviderGenerateImageRequest`（L17，E）；`ImageProvider`（L26，E）；`imageFromBase64`（L38，E）；`referenceImageDataUrl`（L48，E）；`referenceImageBase64`（L53，E）；`appendReferenceImages`（L58，E）；`readJson`（L67，E）；`downloadImage`（L79，E）；`readImageResponse`（L85，E）；`imageProviderFailure`（L103，E）；`imageProtocolError`（L110，E）。
- [packages/ai/src/knowledge/ai-knowledge-entity.ts](../packages/ai/src/knowledge/ai-knowledge-entity.ts)：`ExtractedEntity`（L26，E）；`DEFAULT_ENTITY_TYPES`（L40，E）；`extractEntities`（L75，E）；`extractEntitiesBatch`（L202，E）。
- [packages/ai/src/knowledge/ai-knowledge-functions.ts](../packages/ai/src/knowledge/ai-knowledge-functions.ts)：`createKnowledgeOperations`（L71，E）。
- [packages/ai/src/knowledge/ai-knowledge-types.ts](../packages/ai/src/knowledge/ai-knowledge-types.ts)：`EntityTypeSchema`（L21，E）；`EntityType`（L24，E）；`EntityDocumentRelation`（L66，E）；`KnowledgeSetupOptions`（L88，E）；`KnowledgeIngestResult`（L143，E）；`KnowledgeRetrieveOptions`（L157，E）；`KnowledgeRetrieveItem`（L173，E）；`KnowledgeRetrieveResult`（L191，E）；`KnowledgeAskOptions`（L205，E）；`KnowledgeAskResult`（L219，E）；`EntityQueryOptions`（L241，E）；`EntityDocumentResult`（L251，E）；`EntityListOptions`（L267，E）；`KnowledgeDocumentInfo`（L319，E）；`KnowledgeDocumentListOptions`（L337，E）；`KnowledgeDocumentRemoveOptions`（L349，E）；`KnowledgeIngestBatchProgress`（L359，E）；`KnowledgeIngestBatchResult`（L375，E）；`KnowledgeOperations`（L437，E）。
- [packages/ai/src/llm/ai-llm-functions.ts](../packages/ai/src/llm/ai-llm-functions.ts)：`AILLMStores`（L44，E）；`AILLMFunctions`（L52，E）；`createAILLMFunctions`（L71，E）。
- [packages/ai/src/llm/ai-llm-types.ts](../packages/ai/src/llm/ai-llm-types.ts)：`MessageRole`（L19，E）；`TextContent`（L22，E）；`ImageContent`（L25，E）；`MessageContent`（L28，E）；`SystemMessage`（L31，E）；`DeveloperMessage`（L34，E）；`UserMessage`（L41，E）；`ToolCall`（L44，E）；`AssistantMessage`（L47，E）；`ToolMessage`（L57，E）；`ChatMessage`（L60，E）；`ToolDefinition`（L65，E）；`TempModelConfig`（L78，E）；`ChatCompletionRequest`（L102，E）；`TokenUsage`（L126，E）；`ChatCompletionChoice`（L129，E）；`ChatCompletionResponse`（L132，E）；`ChatCompletionDelta`（L135，E）；`ChatCompletionChunk`（L138，E）；`StreamResult`（L143，E）；`StreamProcessor`（L159，E）；`SSEEvent`（L171，E）；`SSEDecoder`（L187，E）；`StreamOperations`（L195，E）；`ToolErrorType`（L209，E）；`ToolExecutionContext`（L227，E）；`ToolAuthorizationRequest`（L243，E）；`ToolAuthorizer`（L253，E）；`ToolExecutionOptions`（L261，E）；`DefineToolOptions`（L287，E）；`Tool`（L311，E）；`ToolRegistryOperations`（L330，E）；`ToolRegistryOptions`（L358，E）；`ToolsOperations`（L369，E）；`ChatHistoryOptions`（L381，E）；`AskOptions`（L391，E）；`ChatRecord`（L415，E）；`LLMProvider`（L447，E）；`GenerateObjectRequest`（L464，E）；`LLMOperations`（L490，E）；`AILLMFunctionsDeps`（L536，E）。
- [packages/ai/src/llm/providers/ai-llm-provider-anthropic.ts](../packages/ai/src/llm/providers/ai-llm-provider-anthropic.ts)：`createAnthropicProvider`（L222，E）。
- [packages/ai/src/llm/providers/ai-llm-provider-openai-responses.ts](../packages/ai/src/llm/providers/ai-llm-provider-openai-responses.ts)：`toResponsesInput`（L53，E）；`toResponsesTools`（L93，E）；`responsesToChatResponse`（L143，E）；`responsesEventToChunk`（L180，E）。
- [packages/ai/src/llm/providers/ai-llm-provider-openai.ts](../packages/ai/src/llm/providers/ai-llm-provider-openai.ts)：`createOpenAIProvider`（L136，E）。
- [packages/ai/src/llm/providers/ai-llm-provider-router.ts](../packages/ai/src/llm/providers/ai-llm-provider-router.ts)：`createLLMProvider`（L22，E）。
- [packages/ai/src/mcp/ai-mcp-types.ts](../packages/ai/src/mcp/ai-mcp-types.ts)：`MCPToolDefinition`（L15，E）；`MCPToolHandler`（L25，E）；`MCPContext`（L31，E）；`MCPResource`（L44，E）；`MCPResourceContent`（L56，E）；`MCPPrompt`（L68，E）；`MCPPromptArgument`（L78，E）；`MCPPromptMessage`（L88，E）；`MCPPromptContent`（L91，E）；`McpServerOptions`（L96，E）；`MCPOperations`（L110，E）。
- [packages/ai/src/memory/ai-memory-consolidation.ts](../packages/ai/src/memory/ai-memory-consolidation.ts)：`ConsolidationDeps`（L62，E）；`extractAndConsolidate`（L251，E）。
- [packages/ai/src/memory/ai-memory-extractor.ts](../packages/ai/src/memory/ai-memory-extractor.ts)：`extractMemories`（L74，E）。
- [packages/ai/src/memory/ai-memory-facade.ts](../packages/ai/src/memory/ai-memory-facade.ts)：`createMemoryOperations`（L63，E）。
- [packages/ai/src/memory/ai-memory-injection.ts](../packages/ai/src/memory/ai-memory-injection.ts)：`isMemoryAccessDenied`（L28，E）；`injectRelevantMemories`（L53，E）。
- [packages/ai/src/memory/ai-memory-types.ts](../packages/ai/src/memory/ai-memory-types.ts)：`MemoryType`（L42，E）；`MemoryEntry`（L77，E）；`MemoryExtractOptions`（L107，E）；`MemoryRecallOptions`（L136，E）；`MemoryInjectionOptions`（L165，E）；`MemoryListOptions`（L193，E）；`MemoryListPageOptions`（L207，E）；`MemoryClearOptions`（L226，E）；`MemoryUpdateInput`（L240，E）；`ScopedMemoryBinding`（L299，E）；`MemoryClearAllOptions`（L312，E）；`MemoryAdminOperations`（L322，E）；`MemoryCoreOperations`（L338，E）；`ScopedMemoryOperations`（L453，E）；`MemoryOperations`（L484，E）。
- [packages/ai/src/memory/providers/ai-memory-provider-mem0-oss.ts](../packages/ai/src/memory/providers/ai-memory-provider-mem0-oss.ts)：`Mem0OssDeps`（L41，E）；`createMem0OssMemoryOperations`（L509，E）。
- [packages/ai/src/memory/providers/ai-memory-provider-native.ts](../packages/ai/src/memory/providers/ai-memory-provider-native.ts)：`createNativeMemoryOperations`（L104，E）。
- [packages/ai/src/persona/ai-persona-functions.ts](../packages/ai/src/persona/ai-persona-functions.ts)：`createPersonaOperations`（L47，E）。
- [packages/ai/src/persona/ai-persona-types.ts](../packages/ai/src/persona/ai-persona-types.ts)：`PersonaProfile`（L50，E）；`PersonaProfileUpdate`（L74，E）；`PersonaScopeOptions`（L169，E）。
- [packages/ai/src/rag/ai-rag-functions.ts](../packages/ai/src/rag/ai-rag-functions.ts)：`createRagOperations`（L56，E）。
- [packages/ai/src/rag/ai-rag-types.ts](../packages/ai/src/rag/ai-rag-types.ts)：`RagOptions`（L18，E）；`RagContextItem`（L52，E）；`RagResult`（L68，E）；`RagStreamEvent`（L97，E）；`RagOperations`（L107，E）。
- [packages/ai/src/reasoning/ai-reasoning-functions.ts](../packages/ai/src/reasoning/ai-reasoning-functions.ts)：`createReasoningOperations`（L58，E）。
- [packages/ai/src/reasoning/ai-reasoning-types.ts](../packages/ai/src/reasoning/ai-reasoning-types.ts)：`ReasoningStrategy`（L22，E）；`ReasoningOptions`（L29，E）；`ReasoningStepType`（L80，E）；`ReasoningStep`（L85，E）；`ReasoningResult`（L105，E）；`ReasoningStreamEvent`（L128，E）。
- [packages/ai/src/rerank/ai-rerank-functions.ts](../packages/ai/src/rerank/ai-rerank-functions.ts)：`createRerankOperations`（L55，E）。
- [packages/ai/src/rerank/ai-rerank-types.ts](../packages/ai/src/rerank/ai-rerank-types.ts)：`RerankDocument`（L15，E）；`RerankRequest`（L25，E）；`RerankItem`（L41，E）；`RerankResponse`（L55，E）。
- [packages/ai/src/retrieval/ai-retrieval-functions.ts](../packages/ai/src/retrieval/ai-retrieval-functions.ts)：`createRetrievalOperations`（L37，E）。
- [packages/ai/src/retrieval/ai-retrieval-types.ts](../packages/ai/src/retrieval/ai-retrieval-types.ts)：`RetrievalSource`（L48，E）；`RetrievalRequest`（L68，E）；`RetrievalResultItem`（L86，E）；`RetrievalResult`（L104，E）；`RetrievalOperations`（L118，E）。
- [packages/ai/src/store/ai-store-key.ts](../packages/ai/src/store/ai-store-key.ts)：`sessionStoreKey`（L23，E）。
- [packages/ai/src/store/ai-store-types.ts](../packages/ai/src/store/ai-store-types.ts)：`StoreScope`（L16，E）；`WhereValue`（L63，E）；`WhereClause`（L68，E）；`StorePage`（L115，E）；`AIRelStoreOptions`（L129，E）；`AIRelStore`（L157，E）；`AIVectorStore`（L185，E）；`ObjectRef`（L203，E）；`InteractionScope`（L213，E）；`SessionInfo`（L223，E）；`KnowledgeStore`（L247，E）；`AIVectorBackend`（L330，E）。
- [packages/ai/src/store/providers/ai-store-provider-db.ts](../packages/ai/src/store/providers/ai-store-provider-db.ts)：`DbStoreProviderDeps`（L894，E）；`createDbStoreProvider`（L907，E）；`isDbStoreAvailable`（L956，E）；`getUnavailableDbDeps`（L963，E）；`createDbStoreProviderFromModules`（L977，E）。
- [packages/ai/src/store/providers/ai-store-provider-memory.ts](../packages/ai/src/store/providers/ai-store-provider-memory.ts)：`createMemoryStoreProvider`（L212，E）。
- [packages/ai/src/summary/ai-summary-functions.ts](../packages/ai/src/summary/ai-summary-functions.ts)：`createSummaryOperations`（L55，E）。
- [packages/ai/src/summary/ai-summary-types.ts](../packages/ai/src/summary/ai-summary-types.ts)：`SummaryOptions`（L17，E）；`SummaryResult`（L31，E）。
- [packages/ai/src/token/ai-token-functions.ts](../packages/ai/src/token/ai-token-functions.ts)：`estimateTextTokens`（L23，E）；`estimateMessagesTokens`（L59，E）；`createTokenOperations`（L83，E）。

### 内部结构体补充定位

- [packages/ai/src/a2a/ai-a2a-functions.ts](../packages/ai/src/a2a/ai-a2a-functions.ts)：`ValidatedRemoteUrl`（L37，J/E）。
- [packages/ai/src/ai-i18n.ts](../packages/ai/src/ai-i18n.ts)：`AiMessageKey`（L14，J/E）。
- [packages/ai/src/audio/providers/ai-audio-provider-doubao.ts](../packages/ai/src/audio/providers/ai-audio-provider-doubao.ts)：`DecodedFrame`（L156，E）。
- [packages/ai/src/audio/providers/ai-audio-provider-mimo.ts](../packages/ai/src/audio/providers/ai-audio-provider-mimo.ts)：`MimoDelta`（L45，E）；`MimoChunk`（L51，E）。
- [packages/ai/src/audio/providers/ai-audio-provider-qwen.ts](../packages/ai/src/audio/providers/ai-audio-provider-qwen.ts)：`QwenServerEvent`（L47，E）。
- [packages/ai/src/audio/providers/ai-audio-provider-whisper.ts](../packages/ai/src/audio/providers/ai-audio-provider-whisper.ts)：`WhisperWord`（L41，E）；`WhisperSegment`（L49，E）；`WhisperResponse`（L58，E）。
- [packages/ai/src/client/ai-audio-client.ts](../packages/ai/src/client/ai-audio-client.ts)：`BrowserWsMessage`（L83，E）；`BrowserWsConnection`（L90，E）。
- [packages/ai/src/compress/ai-compress-functions.ts](../packages/ai/src/compress/ai-compress-functions.ts)：`MessageProtocolUnit`（L28，J/E）。
- [packages/ai/src/context/ai-context-functions.ts](../packages/ai/src/context/ai-context-functions.ts)：`PersistedContextState`（L46，E）。
- [packages/ai/src/image/providers/ai-image-provider-google.ts](../packages/ai/src/image/providers/ai-image-provider-google.ts)：`GoogleImageResponse`（L7，J/E）。
- [packages/ai/src/image/providers/ai-image-provider-openai.ts](../packages/ai/src/image/providers/ai-image-provider-openai.ts)：`OpenAIImageResponse`（L6，J/E）。
- [packages/ai/src/image/providers/ai-image-provider-pollinations.ts](../packages/ai/src/image/providers/ai-image-provider-pollinations.ts)：`PollinationsImageResponse`（L6，J/E）。
- [packages/ai/src/image/providers/ai-image-provider-qwen.ts](../packages/ai/src/image/providers/ai-image-provider-qwen.ts)：`QwenImageResponse`（L6，J/E）。
- [packages/ai/src/image/providers/ai-image-provider-seedream.ts](../packages/ai/src/image/providers/ai-image-provider-seedream.ts)：`SeedreamImageResponse`（L6，J/E）。
- [packages/ai/src/image/providers/ai-image-provider.ts](../packages/ai/src/image/providers/ai-image-provider.ts)：`ImageUpstreamErrorDetails`（L30，J/E）。
- [packages/ai/src/llm/providers/ai-llm-provider-anthropic.ts](../packages/ai/src/llm/providers/ai-llm-provider-anthropic.ts)：`AnthropicTextBlock`（L29，J/E）；`AnthropicToolUseBlock`（L30，J/E）；`AnthropicToolResultBlock`（L31，J/E）；`AnthropicContentBlock`（L32，J/E）；`AnthropicMessage`（L34，J/E）；`AnthropicTool`（L36，J/E）；`AnthropicRequest`（L38，J/E）；`AnthropicUsage`（L49，J/E）；`AnthropicResponse`（L51，J/E）；`ResolvedAnthropic`（L60，E）。
- [packages/ai/src/llm/providers/ai-llm-provider-openai-responses.ts](../packages/ai/src/llm/providers/ai-llm-provider-openai-responses.ts)：`ResponseInput`（L23，J/E）；`ResponseInputItem`（L24，J/E）；`ResponsesResponse`（L25，J/E）；`ResponseStreamEvent`（L26，J/E）；`ResponsesTool`（L27，J/E）。
- [packages/ai/src/llm/providers/ai-llm-provider-openai.ts](../packages/ai/src/llm/providers/ai-llm-provider-openai.ts)：`ResolvedClient`（L117，E）。
- [packages/ai/src/mcp/ai-mcp-functions.ts](../packages/ai/src/mcp/ai-mcp-functions.ts)：`ToolRegistration`（L32，E）；`ResourceRegistration`（L42，E）；`PromptRegistration`（L50，E）。
- [packages/ai/src/memory/ai-memory-consolidation.ts](../packages/ai/src/memory/ai-memory-consolidation.ts)：`ConsolidationOp`（L52，E）。
- [packages/ai/src/memory/ai-memory-injection.ts](../packages/ai/src/memory/ai-memory-injection.ts)：`RecallMemories`（L20，J/E）。
- [packages/ai/src/memory/providers/ai-memory-provider-mem0-oss.ts](../packages/ai/src/memory/providers/ai-memory-provider-mem0-oss.ts)：`Mem0OssContext`（L56，J/E）；`Mem0VectorStoreResolution`（L164，E）。
- [packages/ai/src/rerank/ai-rerank-functions.ts](../packages/ai/src/rerank/ai-rerank-functions.ts)：`CohereRerankResult`（L30，E）；`CohereRerankResponse`（L39，E）。
- [packages/ai/src/store/providers/ai-store-provider-memory.ts](../packages/ai/src/store/providers/ai-store-provider-memory.ts)：`StoredValue`（L18，J/E）；`StoredVector`（L23，J/E）。

补充扫描定位 46 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-02 · @h-ai/api-client

- [ ] 完成主清单通用关闭标准；基线顶层导出 20，缺 JSDoc 0，缺示例 14。

### 顶层导出定位

- [packages/api-client/src/api-client-auth.ts](../packages/api-client/src/api-client-auth.ts)：`TokenManager`（L343，E）。
- [packages/api-client/src/api-client-i18n.ts](../packages/api-client/src/api-client-i18n.ts)：`apiClientM`（L21，E）。
- [packages/api-client/src/api-client-iam.ts](../packages/api-client/src/api-client-iam.ts)：`IamAuthLoginInput`（L7，E）；`createIamAuthActions`（L10，E）。
- [packages/api-client/src/api-client-main.ts](../packages/api-client/src/api-client-main.ts)：`DefaultApiClient`（L288，E）；`apiClient`（L295，E）。
- [packages/api-client/src/api-client-types.ts](../packages/api-client/src/api-client-types.ts)：`TokenPair`（L46，E）；`TokenStorage`（L67，E）；`AuthConfig`（L78，E）；`ApiClientConfig`（L103，E）；`ApiClientTransportConfig`（L142，E）；`ApiClientAuth`（L159，E）；`ApiClientLifecycle`（L169，E）；`ApiClient`（L194，E）。

### 内部结构体补充定位

- [packages/api-client/src/api-client-auth.ts](../packages/api-client/src/api-client-auth.ts)：`RefreshCallback`（L184，J/E）。
- [packages/api-client/src/api-client-i18n.ts](../packages/api-client/src/api-client-i18n.ts)：`ApiClientMessageKey`（L12，J/E）。

补充扫描定位 2 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-03 · @h-ai/api-contract

- [ ] 完成主清单通用关闭标准；基线顶层导出 145，缺 JSDoc 49，缺示例 141。

### 顶层导出定位

- [packages/api-contract/src/ai/ai-audio-ws-schemas.ts](../packages/api-contract/src/ai/ai-audio-ws-schemas.ts)：`AUDIO_WS_PATH`（L10，E）；`AudioFormatSchema`（L13，E）；`AudioWsStartMessageSchema`（L23，E）；`AudioWsTextMessageSchema`（L38，E）；`AudioWsDoneMessageSchema`（L45，E）；`AudioWsClientMessageSchema`（L50，E）。
- [packages/api-contract/src/ai/ai-contract.ts](../packages/api-contract/src/ai/ai-contract.ts)：`aiContract`（L28，E）；`AiContract`（L55，J/E）。
- [packages/api-contract/src/ai/ai-schemas.ts](../packages/api-contract/src/ai/ai-schemas.ts)：`AiMessageRoleSchema`（L14，E）；`AiTextContentSchema`（L17，E）；`AiImageContentSchema`（L23，E）；`AiMessageContentSchema`（L32，E）；`AiToolCallSchema`（L38，E）；`AiChatMessageSchema`（L48，E）；`AiToolParameterSchema`（L57，E）；`AiToolDefinitionSchema`（L64，E）；`AiChatCompletionInputSchema`（L78，E）；`AiTokenUsageSchema`（L94，E）；`AiAssistantMessageSchema`（L101，E）；`AiChatCompletionChoiceSchema`（L108，E）；`AiChatCompletionDataSchema`（L115，E）；`AiSendMessageInputSchema`（L125，E）；`AiSendMessageDataSchema`（L133，E）；`AiMemoryTypeSchema`（L140，E）；`AiMemoryEntrySchema`（L143，E）；`AiMemoryRecallInputSchema`（L156，E）；`AiMemoryRecallDataSchema`（L165，E）；`AiMemoryListInputSchema`（L170，E）；`AiMemoryListDataSchema`（L178，E）；`AiSessionInfoSchema`（L184，E）；`AiSessionListInputSchema`（L193，E）；`AiSessionListDataSchema`（L198，E）；`AiChatRecordSchema`（L203，E）；`AiChatHistoryInputSchema`（L222，E）；`AiChatHistoryDataSchema`（L230，E）；`AiChatCompletionInput`（L234，J/E）；`AiChatCompletionData`（L235，J/E）；`AiChatCompletionOutput`（L236，J/E）；`AiSendMessageInput`（L237，J/E）；`AiSendMessageData`（L238，J/E）；`AiSendMessageOutput`（L239，J/E）；`AiMemoryRecallInput`（L240，J/E）；`AiMemoryListInput`（L241，J/E）；`AiSessionListInput`（L242，J/E）；`AiChatHistoryInput`（L243，J/E）；`AiChatRecord`（L244，J/E）。
- [packages/api-contract/src/api-contract-main.ts](../packages/api-contract/src/api-contract-main.ts)：`apiContract`（L32，E）。
- [packages/api-contract/src/common/response-schemas.ts](../packages/api-contract/src/common/response-schemas.ts)：`IdParamSchema`（L11，E）。
- [packages/api-contract/src/common/result-schemas.ts](../packages/api-contract/src/common/result-schemas.ts)：`HaiErrorSchema`（L16，E）；`HaiVoidResultSchema`（L52，E）。
- [packages/api-contract/src/common/route.ts](../packages/api-contract/src/common/route.ts)：`route`（L12，E）；`pathOf`（L23，E）。
- [packages/api-contract/src/composition/create-api-contract.ts](../packages/api-contract/src/composition/create-api-contract.ts)：`CreateApiContractOptions`（L12，E）；`CreatedApiContract`（L15，E）。
- [packages/api-contract/src/iam/iam-contract.ts](../packages/api-contract/src/iam/iam-contract.ts)：`iamContract`（L54，E）；`IamContract`（L146，J/E）。
- [packages/api-contract/src/iam/iam-schemas.ts](../packages/api-contract/src/iam/iam-schemas.ts)：`IamUserSchema`（L14，E）；`IamTokenPairSchema`（L30，E）；`IamAgreementDisplaySchema`（L38，E）；`IamAuthResultSchema`（L49，E）；`IamCurrentUserSchema`（L58，E）；`IamLoginInputSchema`（L64，E）；`IamLdapLoginInputSchema`（L71，E）；`IamRequestPasswordResetInputSchema`（L72，J/E）；`IamConfirmPasswordResetInputSchema`（L73，J/E）；`IamPublicConfigSchema`（L76，E）；`IamOtpLoginInputSchema`（L88，E）；`IamLogoutInputSchema`（L94，E）；`IamSendOtpInputSchema`（L99，E）；`IamSendOtpDataSchema`（L104，E）；`IamRefreshTokenInputSchema`（L109，E）；`IamRefreshTokenDataSchema`（L114，E）；`IamRegisterInputSchema`（L119，E）；`IamChangePasswordInputSchema`（L129，E）；`IamUpdateCurrentUserInputSchema`（L135，E）；`IamListUsersInputSchema`（L145，E）；`IamAdminCreateUserInputSchema`（L153，E）；`IamAdminUpdateUserInputSchema`（L165，E）；`IamUserIdInputSchema`（L178，E）；`IamAdminResetPasswordInputSchema`（L183，E）；`IamRoleSchema`（L189，E）；`IamCreateRoleInputSchema`（L200，E）；`IamUpdateRoleInputSchema`（L208，E）；`IamPermissionTypeSchema`（L215，E）；`IamPermissionSchema`（L218，E）；`IamListPermissionsInputSchema`（L231，E）；`IamCreatePermissionInputSchema`（L237，E）；`IamLoginInput`（L246，J/E）；`IamLdapLoginInput`（L247，J/E）；`IamPublicConfig`（L248，J/E）；`IamOtpLoginInput`（L249，J/E）；`IamLogoutInput`（L250，J/E）；`IamSendOtpInput`（L251，J/E）；`IamAuthResultOutput`（L252，J/E）；`IamCurrentUser`（L253，J/E）；`IamCurrentUserOutput`（L254，J/E）；`IamRefreshTokenInput`（L255，J/E）；`IamRefreshTokenOutput`（L256，J/E）；`IamRegisterInput`（L257，J/E）；`IamChangePasswordInput`（L258，J/E）；`IamUpdateCurrentUserInput`（L259，J/E）；`IamListUsersInput`（L260，J/E）；`IamAdminCreateUserInput`（L261，J/E）；`IamAdminUpdateUserInput`（L262，J/E）；`IamUserIdInput`（L263，J/E）；`IamAdminResetPasswordInput`（L264，J/E）；`IamCreateRoleInput`（L265，J/E）；`IamUpdateRoleInput`（L266，J/E）；`IamListPermissionsInput`（L267，J/E）；`IamCreatePermissionInput`（L268，J/E）。
- [packages/api-contract/src/payment/payment-contract.ts](../packages/api-contract/src/payment/payment-contract.ts)：`paymentContract`（L22，E）；`PaymentContract`（L47，J/E）。
- [packages/api-contract/src/payment/payment-schemas.ts](../packages/api-contract/src/payment/payment-schemas.ts)：`PaymentProviderSchema`（L5，E）；`PaymentTradeTypeSchema`（L8，E）；`PaymentCreateOrderInputSchema`（L11，E）；`PaymentCreateOrderDataSchema`（L21，E）；`PaymentQueryOrderInputSchema`（L29，E）；`PaymentOrderSchema`（L34，E）；`PaymentRefundInputSchema`（L44，E）；`PaymentRefundDataSchema`（L53，E）；`PaymentNotifyMessageSchema`（L60，E）；`PaymentStripeNotifyDataSchema`（L66，E）；`PaymentCreateOrderInput`（L70，J/E）；`PaymentCreateOrderOutput`（L71，J/E）；`PaymentRefundInput`（L72，J/E）。
- [packages/api-contract/src/storage/storage-contract.ts](../packages/api-contract/src/storage/storage-contract.ts)：`storageContract`（L26，E）；`StorageContract`（L51，J/E）。
- [packages/api-contract/src/storage/storage-schemas.ts](../packages/api-contract/src/storage/storage-schemas.ts)：`StorageFileMetadataSchema`（L13，E）；`StoragePresignDownloadInputSchema`（L23，E）；`StoragePresignUploadInputSchema`（L29，E）；`StoragePresignedUrlSchema`（L37，E）；`StorageListFilesInputSchema`（L44，E）；`StorageListFilesDataSchema`（L52，E）；`StorageFileKeyInputSchema`（L60，E）；`StorageDeleteFilesInputSchema`（L65，E）；`StoragePresignDownloadInput`（L69，J/E）；`StoragePresignUploadInput`（L70，J/E）；`StoragePresignedUrlOutput`（L71，J/E）；`StorageListFilesInput`（L72，J/E）；`StorageFileKeyInput`（L73，J/E）；`StorageDeleteFilesInput`（L74，J/E）。

### 内部结构体补充定位

本次 AST 补充扫描未发现缺 JSDoc/示例的非导出 type/interface；仍需核验方法、结构字段及关键逻辑。

补充扫描定位 0 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-04 · @h-ai/audit

- [ ] 完成主清单通用关闭标准；基线顶层导出 16，缺 JSDoc 1，缺示例 11。

### 顶层导出定位

- [packages/audit/src/audit-config.ts](../packages/audit/src/audit-config.ts)：`AuditInitConfig`（L42，E）；`AuditInitConfigInput`（L45，E）。
- [packages/audit/src/audit-helper.ts](../packages/audit/src/audit-helper.ts)：`createHelper`（L40，E）。
- [packages/audit/src/audit-repository-log.ts](../packages/audit/src/audit-repository-log.ts)：`AuditLogRepository`（L46，E）。
- [packages/audit/src/audit-types.ts](../packages/audit/src/audit-types.ts)：`HaiAuditError`（L24，J/E）；`AuditLog`（L33，E）；`AuditLogWithUser`（L59，E）；`CreateAuditLogInput`（L70，E）；`ListAuditLogsOptions`（L92，E）；`AuditStatItem`（L110，E）；`CrudAuditInput`（L122，E）。

### 内部结构体补充定位

- [packages/audit/src/audit-i18n.ts](../packages/audit/src/audit-i18n.ts)：`AuditMessageKey`（L17，E）。
- [packages/audit/src/audit-repository-log.ts](../packages/audit/src/audit-repository-log.ts)：`AuditRepositoryConfig`（L27，J/E）。

补充扫描定位 2 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-05 · @h-ai/cache

- [ ] 完成主清单通用关闭标准；基线顶层导出 28，缺 JSDoc 1，缺示例 20。

### 顶层导出定位

- [packages/cache/src/cache-config.ts](../packages/cache/src/cache-config.ts)：`RedisClusterNodeSchema`（L13，E）；`RedisClusterNode`（L21，E）；`RedisSentinelConfigSchema`（L24，E）；`RedisSentinelConfig`（L32，E）；`MemoryConfigSchema`（L35，E）；`RedisConfigSchema`（L44，E）；`CacheConfigSchema`（L81，E）；`CacheConfig`（L87，E）；`CacheConfigInput`（L90，E）。
- [packages/cache/src/cache-i18n.ts](../packages/cache/src/cache-i18n.ts)：`cacheM`（L21，E）。
- [packages/cache/src/cache-types.ts](../packages/cache/src/cache-types.ts)：`HaiCacheError`（L28，J/E）；`CacheValue`（L37，E）；`SetOptions`（L40，E）；`ScanOptions`（L58，E）；`ZMember`（L66，E）；`LockOptions`（L334，E）；`CacheCompositeOperations`（L348，E）；`CacheProvider`（L398，E）。
- [packages/cache/src/providers/cache-provider-memory.ts](../packages/cache/src/providers/cache-provider-memory.ts)：`createMemoryProvider`（L78，E）。
- [packages/cache/src/providers/cache-provider-redis.ts](../packages/cache/src/providers/cache-provider-redis.ts)：`createRedisProvider`（L72，E）。

### 内部结构体补充定位

- [packages/cache/src/cache-i18n.ts](../packages/cache/src/cache-i18n.ts)：`CacheMessageKey`（L12，J/E）。
- [packages/cache/src/providers/cache-provider-memory.ts](../packages/cache/src/providers/cache-provider-memory.ts)：`CacheEntry`（L21，E）。

补充扫描定位 2 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-06 · @h-ai/capacitor

- [ ] 完成主清单通用关闭标准；基线顶层导出 31，缺 JSDoc 1，缺示例 18。

### 顶层导出定位

- [packages/capacitor/src/capacitor-i18n.ts](../packages/capacitor/src/capacitor-i18n.ts)：`capacitorM`（L20，E）。
- [packages/capacitor/src/capacitor-types.ts](../packages/capacitor/src/capacitor-types.ts)：`HaiCapacitorError`（L27，J/E）；`DeviceOperations`（L32，E）；`CameraOperations`（L40，E）；`PushOperations`（L46，E）；`StatusBarOperations`（L54，E）；`PreferencesOperations`（L64，E）；`CapacitorFunctions`（L76，E）；`DevicePlatform`（L103，E）；`DeviceInfo`（L106，E）；`PushNotification`（L126，E）；`PushRegistration`（L138，E）；`PushNotificationCallbacks`（L144，E）；`PhotoSource`（L154，E）；`PhotoOptions`（L157，E）；`PhotoResult`（L171，E）；`StatusBarStyle`（L181，E）；`StatusBarConfig`（L184，E）。

### 内部结构体补充定位

- [packages/capacitor/src/capacitor-i18n.ts](../packages/capacitor/src/capacitor-i18n.ts)：`CapacitorMessageKey`（L12，J/E）。
- [packages/capacitor/src/capacitor-token-storage.ts](../packages/capacitor/src/capacitor-token-storage.ts)：`SecureStoragePluginLike`（L19，J/E）。

补充扫描定位 2 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-07 · @h-ai/cli

- [ ] 完成主清单通用关闭标准；基线顶层导出 75，缺 JSDoc 7，缺示例 63。

### 顶层导出定位

- [packages/cli/src/cli-i18n.ts](../packages/cli/src/cli-i18n.ts)：`cliM`（L6，J/E）。
- [packages/cli/src/cli-types.ts](../packages/cli/src/cli-types.ts)：`FeatureId`（L9，E）；`FeatureDefinition`（L31，E）；`GlobalOptions`（L47，E）；`AppType`（L57，E）；`FrontendTarget`（L62，E）；`ModuleConfigs`（L67，E）；`FullstackModuleConfig`（L87，E）；`CoreModuleConfig`（L113，E）；`DbModuleConfig`（L123，E）；`CacheModuleConfig`（L137，E）；`IamModuleConfig`（L149，E）；`StorageModuleConfig`（L159，E）；`AiModuleConfig`（L169，E）；`CreateProjectOptions`（L179，E）；`GenerateOptions`（L211，E）；`GeneratorType`（L225，E）；`TemplateContext`（L235，E）；`GeneratorDefinition`（L253，E）；`TemplateFile`（L267，E）；`PromptDefinition`（L277，E）；`ProjectInfo`（L293，E）。
- [packages/cli/src/cli-utils.ts](../packages/cli/src/cli-utils.ts)：`writeCliMessage`（L18，E）；`writeCliError`（L23，E）；`formatPromptDescription`（L32，E）；`toCamelCase`（L39，E）；`toPascalCase`（L48，E）；`toKebabCase`（L56，E）；`toSnakeCase`（L66，E）；`createTemplateContext`（L76，E）；`renderTemplate`（L89，E）；`renderTemplateFile`（L97，E）；`writeFile`（L108，E）；`fileExists`（L116，E）；`getPackageVersion`（L129，E）；`getCliVersion`（L146，E）；`detectPackageManager`（L168，E）；`formatBytes`（L181，E）；`formatDuration`（L197，E）；`registerHelpers`（L207，E）。
- [packages/cli/src/commands/cli-add.ts](../packages/cli/src/commands/cli-add.ts)：`AddModuleOptions`（L21，E）；`addModule`（L55，E）。
- [packages/cli/src/commands/cli-config-templates.ts](../packages/cli/src/commands/cli-config-templates.ts)：`generateConfigFile`（L19，E）；`generateEnvExample`（L523，E）。
- [packages/cli/src/commands/cli-create.ts](../packages/cli/src/commands/cli-create.ts)：`createProject`（L258，E）；`detectProject`（L1427，E）。
- [packages/cli/src/commands/cli-deploy.ts](../packages/cli/src/commands/cli-deploy.ts)：`DeployCommandOptions`（L25，E）。
- [packages/cli/src/commands/cli-generate.ts](../packages/cli/src/commands/cli-generate.ts)：`generate`（L54，E）。
- [packages/cli/src/commands/cli-init.ts](../packages/cli/src/commands/cli-init.ts)：`InitOptions`（L19，E）；`initProject`（L87，E）。
- [packages/cli/src/commands/cli-skill-templates.ts](../packages/cli/src/commands/cli-skill-templates.ts)：`resolveCompatibleSkillNames`（L172，J/E）；`generateSkillFiles`（L356，E）；`generateModuleSkillFile`（L390，E）；`resolveSkillNamesForPackages`（L406，J/E）；`generateProjectAiSupport`（L419，J/E）。
- [packages/cli/src/commands/cli-template-engine.ts](../packages/cli/src/commands/cli-template-engine.ts)：`TemplateContext`（L463，E）；`ApiWorkspaceTemplateContext`（L502，J/E）；`FullstackFrontendApp`（L519，J/E）；`FullstackI18nContext`（L533，E）；`FullstackThemeContext`（L541，E）；`FullstackTemplateContext`（L546，J/E）；`buildTemplateContext`（L741，E）；`generateFromTemplates`（L965，E）。

### 内部结构体补充定位

- [packages/cli/src/commands/cli-create.ts](../packages/cli/src/commands/cli-create.ts)：`CommandFailureLike`（L1045，J/E）。
- [packages/cli/src/commands/cli-deploy-middleware.ts](../packages/cli/src/commands/cli-deploy-middleware.ts)：`DeployModule`（L11，J/E）。
- [packages/cli/src/commands/cli-init.ts](../packages/cli/src/commands/cli-init.ts)：`ValidationResult`（L46，E）。
- [packages/cli/src/commands/cli-template-engine.ts](../packages/cli/src/commands/cli-template-engine.ts)：`ImplementedFrontendTarget`（L113，J/E）；`FullstackPackageSpecifiers`（L135，J/E）；`CatalogPackageVersions`（L136，J/E）。

补充扫描定位 6 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-08 · @h-ai/core

- [ ] 完成主清单通用关闭标准；基线顶层导出 85，缺 JSDoc 21，缺示例 47。

### 顶层导出定位

- [packages/core/src/core-config.ts](../packages/core/src/core-config.ts)：`Env`（L21，J/E）；`LogLevel`（L32，J/E）；`LogFormat`（L43，J/E）；`LoggingConfig`（L95，J/E）；`IdConfig`（L117，J/E）；`CoreConfig`（L148，J/E）。
- [packages/core/src/core-types.ts](../packages/core/src/core-types.ts)：`ZodValidationMessageKey`（L22，J/E）；`ZodMessageGetter`（L40，J/E）；`ValidationFormError`（L45，J/E）；`ZodValidationFn`（L50，J/E）；`HaiResult`（L70，J/E）；`ok`（L74，J/E）；`err`（L78，J/E）；`ErrorInfoValue`（L135，E）；`ErrorInfo`（L138，E）；`HaiErrorDef`（L140，J/E）；`HaiError`（L147，J/E）；`HaiCommonError`（L192，J/E）；`HaiConfigError`（L202，J/E）；`CoreFunctions`（L481，E）。
- [packages/core/src/functions/core-function-config.browser.ts](../packages/core/src/functions/core-function-config.browser.ts)：`config`（L31，E）；`BrowserConfigFn`（L82，E）。
- [packages/core/src/functions/core-function-config.node.ts](../packages/core/src/functions/core-function-config.node.ts)：`ConfigFn`（L760，E）。
- [packages/core/src/functions/core-function-error.ts](../packages/core/src/functions/core-function-error.ts)：`error`（L98，J/E）；`ErrorFn`（L104，E）。
- [packages/core/src/functions/core-function-id.ts](../packages/core/src/functions/core-function-id.ts)：`IdFn`（L192，E）。
- [packages/core/src/i18n/core-i18n-utils.ts](../packages/core/src/i18n/core-i18n-utils.ts)：`i18n`（L100，J/E）；`I18nFn`（L110，E）。
- [packages/core/src/utils/core-util-array.ts](../packages/core/src/utils/core-util-array.ts)：`ArrayFn`（L205，E）。
- [packages/core/src/utils/core-util-async.ts](../packages/core/src/utils/core-util-async.ts)：`AsyncFn`（L218，E）。
- [packages/core/src/utils/core-util-module.ts](../packages/core/src/utils/core-util-module.ts)：`NotInitializedKit`（L22，E）；`createNotInitializedKit`（L70，J/E）；`CreateNotInitializedKitFn`（L108，E）；`ModuleFn`（L113，J/E）。
- [packages/core/src/utils/core-util-object.ts](../packages/core/src/utils/core-util-object.ts)：`ObjectFn`（L182，E）。
- [packages/core/src/utils/core-util-sanitize.ts](../packages/core/src/utils/core-util-sanitize.ts)：`DEFAULT_SENSITIVE_KEY_REGEX`（L9，E）；`DEFAULT_SENSITIVE_REPLACEMENT`（L12，E）；`SensitiveKeyMatcher`（L21，E）；`SanitizeSensitiveFieldsOptions`（L24，E）；`isSensitiveKey`（L106，E）；`sanitizeSensitiveValue`（L224，E）；`sanitizeSensitiveFields`（L240，E）；`sanitize`（L248，E）；`SanitizeFn`（L257，E）。
- [packages/core/src/utils/core-util-string.ts](../packages/core/src/utils/core-util-string.ts)：`StringFn`（L235，E）。
- [packages/core/src/utils/core-util-time.ts](../packages/core/src/utils/core-util-time.ts)：`TimeFn`（L211，E）。
- [packages/core/src/utils/core-util-type.ts](../packages/core/src/utils/core-util-type.ts)：`TypeUtilFn`（L144，E）。

### 内部结构体补充定位

- [packages/core/src/core-main.node.ts](../packages/core/src/core-main.node.ts)：`NodeCoreFunctions`（L17，J/E）；`ConfigLoadItem`（L70，E）。
- [packages/core/src/functions/core-function-config.node.ts](../packages/core/src/functions/core-function-config.node.ts)：`CacheEntry`（L24，E）；`WatchEntry`（L189，E）。
- [packages/core/src/i18n/core-i18n-utils.ts](../packages/core/src/i18n/core-i18n-utils.ts)：`CoreMessageKey`（L91，J/E）。
- [packages/core/src/utils/core-util-sanitize.ts](../packages/core/src/utils/core-util-sanitize.ts)：`CompiledSensitiveKeyMatcher`（L31，J/E）；`SanitizeSensitiveContext`（L33，J/E）。

补充扫描定位 7 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-09 · @h-ai/crypto

- [ ] 完成主清单通用关闭标准；基线顶层导出 48，缺 JSDoc 1，缺示例 44。

### 顶层导出定位

- [packages/crypto/src/crypto-password.ts](../packages/crypto/src/crypto-password.ts)：`createPasswordFunctions`（L94，E）。
- [packages/crypto/src/crypto-sm2.ts](../packages/crypto/src/crypto-sm2.ts)：`createSM2`（L38，E）。
- [packages/crypto/src/crypto-sm3.ts](../packages/crypto/src/crypto-sm3.ts)：`createSM3`（L34，E）。
- [packages/crypto/src/crypto-sm4.ts](../packages/crypto/src/crypto-sm4.ts)：`createSM4`（L44，E）。
- [packages/crypto/src/crypto-types.ts](../packages/crypto/src/crypto-types.ts)：`HaiCryptoError`（L32，J/E）；`CipherMode`（L37，E）；`KeyPair`（L40，E）；`AsymmetricEncryptOptions`（L48，E）；`SignOptions`（L56，E）；`HashOptions`（L66，E）；`SymmetricMode`（L74，E）；`SymmetricCiphertextEncoding`（L77，E）；`SymmetricEncryptOptions`（L80，E）；`SymmetricEncryptedPayload`（L90，E）；`SymmetricCbcEncryptedPayload`（L102，E）；`SymmetricDecryptInput`（L108，E）；`EncryptWithIVResult`（L111，E）；`PasswordConfig`（L116，E）；`AsymmetricOperations`（L130，E）；`HashOperations`（L195，E）；`SymmetricOperations`（L233，E）；`PasswordOperations`（L304，E）。
- [packages/crypto/src/crypto-utils.ts](../packages/crypto/src/crypto-utils.ts)：`isBase64`（L15，E）；`hexToBase64`（L27，E）；`base64ToHex`（L43，E）。
- [packages/crypto/src/transport/crypto-transport-client.ts](../packages/crypto/src/transport/crypto-transport-client.ts)：`CreateTransportClientOptions`（L27，E）；`createTransportClient`（L56，E）。
- [packages/crypto/src/transport/crypto-transport-server.ts](../packages/crypto/src/transport/crypto-transport-server.ts)：`createTransportEncryption`（L41，E）；`isValidEncryptedPayload`（L111，E）。
- [packages/crypto/src/transport/crypto-transport-types.ts](../packages/crypto/src/transport/crypto-transport-types.ts)：`TRANSPORT_PROTOCOL`（L19，E）；`KeyExchangeRequest`（L33，E）；`KeyExchangeResponse`（L40，E）；`TransportKeyPair`（L48，E）；`EncryptedPayload`（L59，E）；`TransportCryptoServiceLike`（L73，E）；`TransportKeyStore`（L97，E）；`TransportCreateServerOptions`（L114，E）；`TransportEncryptionManager`（L138，E）；`TransportClient`（L162，E）。
- [packages/crypto/src/transport/store-provider/crypto-transport-store-memory.ts](../packages/crypto/src/transport/store-provider/crypto-transport-store-memory.ts)：`createInMemoryKeyStore`（L35，E）。
- [packages/crypto/src/transport/store-provider/crypto-transport-store-redis.ts](../packages/crypto/src/transport/store-provider/crypto-transport-store-redis.ts)：`CreateRedisTransportKeyStoreOptions`（L15，E）；`createRedisTransportKeyStore`（L53，E）。
- [packages/crypto/src/transport/store-provider/crypto-transport-store-reldb.ts](../packages/crypto/src/transport/store-provider/crypto-transport-store-reldb.ts)：`CreateReldbTransportKeyStoreOptions`（L20，E）；`createReldbTransportKeyStore`（L57，E）。

### 内部结构体补充定位

- [packages/crypto/src/crypto-i18n.ts](../packages/crypto/src/crypto-i18n.ts)：`CryptoMessageKey`（L13，E）。
- [packages/crypto/src/crypto-password.ts](../packages/crypto/src/crypto-password.ts)：`PasswordDeps`（L29，E）。
- [packages/crypto/src/transport/store-provider/crypto-transport-store-reldb.ts](../packages/crypto/src/transport/store-provider/crypto-transport-store-reldb.ts)：`TransportClientKeyRow`（L14，J/E）。

补充扫描定位 3 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-10 · @h-ai/datapipe

- [ ] 完成主清单通用关闭标准；基线顶层导出 23，缺 JSDoc 0，缺示例 14。

### 顶层导出定位

- [packages/datapipe/src/datapipe-config.ts](../packages/datapipe/src/datapipe-config.ts)：`CleanOptions`（L52，E）；`CleanOptionsInput`（L55，E）；`ChunkModeSchema`（L70，E）；`ChunkMode`（L81，E）；`ChunkOptions`（L123，E）；`ChunkOptionsInput`（L126，E）。
- [packages/datapipe/src/datapipe-i18n.ts](../packages/datapipe/src/datapipe-i18n.ts)：`datapipeM`（L25，E）。
- [packages/datapipe/src/datapipe-types.ts](../packages/datapipe/src/datapipe-types.ts)：`HaiDatapipeError`（L31，E）；`TransformFn`（L65，E）；`ChunkTransformFn`（L72，E）；`PipelineStep`（L81，E）；`PipelineResult`（L92，E）；`CleanOperations`（L106，E）；`ChunkOperations`（L122，E）。

### 内部结构体补充定位

- [packages/datapipe/src/datapipe-i18n.ts](../packages/datapipe/src/datapipe-i18n.ts)：`DatapipeMessageKey`（L17，E）。

补充扫描定位 1 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-11 · @h-ai/deploy

- [ ] 完成主清单通用关闭标准；基线顶层导出 75，缺 JSDoc 1，缺示例 55。

### 顶层导出定位

- [packages/deploy/src/container/deploy-bundle.ts](../packages/deploy/src/container/deploy-bundle.ts)：`createDeploymentBundle`（L13，E）。
- [packages/deploy/src/container/deploy-command.ts](../packages/deploy/src/container/deploy-command.ts)：`CommandOptions`（L20，E）；`CommandResult`（L36，E）；`maskSecrets`（L46，E）；`runCommand`（L67，E）。
- [packages/deploy/src/container/deploy-container-compose.ts](../packages/deploy/src/container/deploy-container-compose.ts)：`SidecarPlan`（L36，E）；`RuntimeEnvPlan`（L54，E）；`planSidecars`（L284，E）；`buildRuntimeEnv`（L405，E）；`generateComposeFile`（L444，E）；`serializeEnvFile`（L557，E）。
- [packages/deploy/src/container/deploy-container-types.ts](../packages/deploy/src/container/deploy-container-types.ts)：`ContainerRuntime`（L14，E）；`ContainerDeployContext`（L17，E）；`ContainerDeployProvider`（L41，E）。
- [packages/deploy/src/container/deploy-scripts.ts](../packages/deploy/src/container/deploy-scripts.ts)：`shellArgument`（L5，E）；`createApplyScript`（L10，E）；`createUploadScripts`（L245，E）。
- [packages/deploy/src/container/deploy-ssh.ts](../packages/deploy/src/container/deploy-ssh.ts)：`SshExecutor`（L21，E）；`buildSshExecArgs`（L52，E）；`buildScpUploadArgs`（L69，E）；`createSshExecutor`（L85，E）。
- [packages/deploy/src/deploy-artifact.ts](../packages/deploy/src/deploy-artifact.ts)：`DeploymentArtifactSchema`（L8，E）；`DeploymentArtifact`（L39，E）。
- [packages/deploy/src/deploy-config.ts](../packages/deploy/src/deploy-config.ts)：`ProviderConfigSchema`（L66，E）；`SshConfig`（L72，E）；`PortExposeConfig`（L75，E）；`DockerSshProviderConfig`（L78，E）；`DeployConfigSchema`（L131，E）；`DeployConfig`（L144，E）；`DeployConfigInput`（L147，E）。
- [packages/deploy/src/deploy-credentials.ts](../packages/deploy/src/deploy-credentials.ts)：`getCredentialsPath`（L76，E）。
- [packages/deploy/src/deploy-environment.ts](../packages/deploy/src/deploy-environment.ts)：`DeploymentEnvironment`（L13，E）。
- [packages/deploy/src/deploy-functions.ts](../packages/deploy/src/deploy-functions.ts)：`resolveOutputDir`（L47，E）。
- [packages/deploy/src/deploy-internal-types.ts](../packages/deploy/src/deploy-internal-types.ts)：`DeployProvider`（L17，E）；`ServiceProvisioner`（L60，E）。
- [packages/deploy/src/deploy-middleware.ts](../packages/deploy/src/deploy-middleware.ts)：`MiddlewareField`（L10，E）；`MiddlewareBackend`（L28，E）。
- [packages/deploy/src/deploy-recovery.ts](../packages/deploy/src/deploy-recovery.ts)：`getDeployRecovery`（L20，E）；`recoveryFailure`（L26，E）。
- [packages/deploy/src/deploy-types.ts](../packages/deploy/src/deploy-types.ts)：`HaiDeployError`（L34，J/E）；`ServiceType`（L62，E）；`MiddlewareMode`（L65，E）；`DeployScanOptions`（L68，E）；`MiddlewareRequirement`（L76，E）；`ScanResult`（L100，E）；`DeployResult`（L130，E）；`ProvisionResult`（L156，E）；`DeployRecoveryInfo`（L170，E）；`DeployAppOptions`（L185，E）；`DeployCredentialOperations`（L217，E）。
- [packages/deploy/src/providers/deploy-provider-docker-ssh.ts](../packages/deploy/src/providers/deploy-provider-docker-ssh.ts)：`createDockerSshProvider`（L64，E）。
- [packages/deploy/src/provisioners/deploy-provisioner-aliyun.ts](../packages/deploy/src/provisioners/deploy-provisioner-aliyun.ts)：`createAliyunProvisioner`（L22，E）。
- [packages/deploy/src/provisioners/deploy-provisioner-r2.ts](../packages/deploy/src/provisioners/deploy-provisioner-r2.ts)：`createR2Provisioner`（L25，E）。
- [packages/deploy/src/provisioners/deploy-provisioner-resend.ts](../packages/deploy/src/provisioners/deploy-provisioner-resend.ts)：`createResendProvisioner`（L26，E）。
- [packages/deploy/src/provisioners/deploy-provisioner-upstash.ts](../packages/deploy/src/provisioners/deploy-provisioner-upstash.ts)：`createUpstashProvisioner`（L103，E）。

### 内部结构体补充定位

- [packages/deploy/src/container/deploy-container-compose.ts](../packages/deploy/src/container/deploy-container-compose.ts)：`ComposeService`（L33，E）。
- [packages/deploy/src/deploy-i18n.ts](../packages/deploy/src/deploy-i18n.ts)：`DeployMessageKey`（L15，E）。
- [packages/deploy/src/provisioners/deploy-provisioner-neon.ts](../packages/deploy/src/provisioners/deploy-provisioner-neon.ts)：`NeonProjectSummary`（L27，J/E）；`NeonProjectsResponse`（L32，J/E）；`NeonCreateProjectResponse`（L36，J/E）；`NeonConnectionUriResponse`（L41，J/E）。
- [packages/deploy/src/provisioners/deploy-provisioner-upstash.ts](../packages/deploy/src/provisioners/deploy-provisioner-upstash.ts)：`UpstashDatabase`（L23，J/E）。

补充扫描定位 7 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-12 · @h-ai/iam

- [ ] 完成主清单通用关闭标准；基线顶层导出 151，缺 JSDoc 9，缺示例 150。

### 顶层导出定位

- [packages/iam/src/authn/apikey/iam-authn-apikey-repository.ts](../packages/iam/src/authn/apikey/iam-authn-apikey-repository.ts)：`ApiKeyRepository`（L21，E）；`resetApiKeyRepoSingleton`（L141，E）；`createDbApiKeyRepository`（L151，E）。
- [packages/iam/src/authn/apikey/iam-authn-apikey-scope.ts](../packages/iam/src/authn/apikey/iam-authn-apikey-scope.ts)：`applyApiKeyScopes`（L9，E）。
- [packages/iam/src/authn/apikey/iam-authn-apikey-strategy.ts](../packages/iam/src/authn/apikey/iam-authn-apikey-strategy.ts)：`ApiKeyStrategyConfig`（L30，E）；`ApiKeyStrategyResult`（L42，E）；`createApiKeyStrategy`（L95，E）。
- [packages/iam/src/authn/apikey/iam-authn-apikey-types.ts](../packages/iam/src/authn/apikey/iam-authn-apikey-types.ts)：`ApiKey`（L17，E）；`StoredApiKey`（L41，E）；`CreateApiKeyResult`（L53，E）；`CreateApiKeyOptions`（L65，E）；`ApiKeySortField`（L77，E）；`ApiKeySortDirection`（L80，E）；`ListApiKeysOptions`（L85，E）；`ApiKeyOperations`（L101，E）。
- [packages/iam/src/authn/iam-authn-functions.ts](../packages/iam/src/authn/iam-authn-functions.ts)：`AuthnOperationsDeps`（L45，E）；`AuthnOperationsResult`（L62，E）；`createAuthnOperations`（L78，E）。
- [packages/iam/src/authn/iam-authn-types.ts](../packages/iam/src/authn/iam-authn-types.ts)：`PasswordCredentials`（L18，E）；`OtpCredentials`（L30，E）；`LdapCredentials`（L40，E）；`ApiKeyCredentials`（L50，E）；`Credentials`（L58，E）；`AuthStrategy`（L71，E）；`AuthnOperations`（L91，E）。
- [packages/iam/src/authn/iam-authn-utils.ts](../packages/iam/src/authn/iam-authn-utils.ts)：`ensureCredentialType`（L27，E）；`LoginFailurePolicy`（L43，E）；`isAccountLocked`（L56，E）；`recordLoginFailure`（L72，E）；`resetLoginFailures`（L89，E）。
- [packages/iam/src/authn/ldap/iam-authn-ldap-client.ts](../packages/iam/src/authn/ldap/iam-authn-ldap-client.ts)：`loadLdapClientFactory`（L8，E）。
- [packages/iam/src/authn/ldap/iam-authn-ldap-strategy.ts](../packages/iam/src/authn/ldap/iam-authn-ldap-strategy.ts)：`escapeLdapFilterValue`（L31，E）；`LdapClient`（L41，E）；`LdapSearchEntry`（L61，E）；`LdapClientFactory`（L71，E）；`LdapStrategyConfig`（L76，E）；`createLdapStrategy`（L110，E）。
- [packages/iam/src/authn/otp/iam-authn-otp-repository-otp.ts](../packages/iam/src/authn/otp/iam-authn-otp-repository-otp.ts)：`OtpRecord`（L20，E）；`OtpRepository`（L36，E）；`normalizeOtpIdentifier`（L68，E）；`resetOtpRepoSingleton`（L116，E）；`createCacheOtpRepository`（L127，E）。
- [packages/iam/src/authn/otp/iam-authn-otp-strategy.ts](../packages/iam/src/authn/otp/iam-authn-otp-strategy.ts)：`OtpStrategyConfig`（L37，E）；`OtpStrategyResult`（L113，E）；`createOtpStrategy`（L128，E）。
- [packages/iam/src/authn/password/iam-authn-password-strategy.ts](../packages/iam/src/authn/password/iam-authn-password-strategy.ts)：`PasswordStrategyConfig`（L25，E）；`PasswordStrategyResult`（L39，E）；`createPasswordStrategy`（L59，E）。
- [packages/iam/src/authz/iam-authz-functions.ts](../packages/iam/src/authz/iam-authz-functions.ts)：`AuthzOperationsDeps`（L41，E）；`createAuthzOperations`（L51，E）。
- [packages/iam/src/authz/iam-authz-repository-permission.ts](../packages/iam/src/authz/iam-authz-repository-permission.ts)：`PermissionRepository`（L21，E）；`resetPermissionRepoSingleton`（L119，E）；`createDbPermissionRepository`（L132，E）。
- [packages/iam/src/authz/iam-authz-repository-relation.ts](../packages/iam/src/authz/iam-authz-repository-relation.ts)：`RolePermissionRepository`（L22，E）；`UserRoleRepository`（L83，E）；`createDbRolePermissionRepository`（L152，E）；`createDbUserRoleRepository`（L421，E）。
- [packages/iam/src/authz/iam-authz-repository-role.ts](../packages/iam/src/authz/iam-authz-repository-role.ts)：`RoleRepository`（L21，E）；`resetRoleRepoSingleton`（L105，E）；`createDbRoleRepository`（L118，E）。
- [packages/iam/src/authz/iam-authz-types.ts](../packages/iam/src/authz/iam-authz-types.ts)：`PermissionType`（L20，E）；`PermissionQueryOptions`（L27，E）；`Permission`（L37，E）；`Role`（L61，E）；`RolePermission`（L81，E）；`UserRole`（L91，E）；`AuthzOperations`（L103，E）。
- [packages/iam/src/iam-agreement.ts](../packages/iam/src/iam-agreement.ts)：`buildAgreementDisplay`（L17，E）。
- [packages/iam/src/iam-config.ts](../packages/iam/src/iam-config.ts)：`AuthStrategyTypeSchema`（L23，E）；`AuthStrategyType`（L26，E）；`PasswordConfigSchema`（L31，E）；`PasswordConfig`（L49，E）；`OtpConfigSchema`（L54，E）；`OtpConfig`（L69，E）；`PasswordResetConfigSchema`（L74，E）；`PasswordResetConfig`（L88，E）；`LdapConfigSchema`（L93，E）；`LdapConfig`（L117，E）；`ApiKeyConfigSchema`（L122，E）；`ApiKeyConfig`（L132，E）；`LoginConfigSchema`（L137，E）；`LoginConfig`（L148，J/E）；`RegisterConfigSchema`（L151，E）；`RegisterConfig`（L158，J/E）；`SecurityConfigSchema`（L161，E）；`SecurityConfig`（L168，J/E）；`AgreementConfigSchema`（L171，E）；`AgreementConfig`（L186，J/E）；`AuthUiConfigSchema`（L190，J/E）；`AuthUiConfig`（L199，J/E）；`SessionConfigSchema`（L206，E）；`SessionConfig`（L218，E）；`RbacConfigSchema`（L225，E）；`RbacConfig`（L235，E）；`IamConfig`（L319，E）；`IamConfigSettingsInput`（L326，E）。
- [packages/iam/src/iam-i18n.ts](../packages/iam/src/iam-i18n.ts)：`iamM`（L28，E）。
- [packages/iam/src/iam-main.ts](../packages/iam/src/iam-main.ts)：`iam`（L87，J/E）。
- [packages/iam/src/iam-notifications.ts](../packages/iam/src/iam-notifications.ts)：`resolveIamNotifications`（L6，E）。
- [packages/iam/src/iam-public-config.ts](../packages/iam/src/iam-public-config.ts)：`IamPublicConfig`（L6，J/E）；`buildIamPublicConfig`（L21，E）。
- [packages/iam/src/iam-security.ts](../packages/iam/src/iam-security.ts)：`withIamLock`（L10，E）。
- [packages/iam/src/iam-seed.ts](../packages/iam/src/iam-seed.ts)：`seedIamData`（L89，E）。
- [packages/iam/src/iam-types.ts](../packages/iam/src/iam-types.ts)：`HaiIamError`（L87，J/E）；`IamConfigInput`（L97，E）；`IamFunctions`（L154，E）。
- [packages/iam/src/session/iam-session-functions.ts](../packages/iam/src/session/iam-session-functions.ts)：`SessionOperationsDeps`（L44，E）；`createSessionOperations`（L53，E）。
- [packages/iam/src/session/iam-session-repository-cache.ts](../packages/iam/src/session/iam-session-repository-cache.ts)：`buildTokenKey`（L33，E）；`buildUserTokensKey`（L43，E）；`SessionRepository`（L79，E）；`createCacheSessionRepository`（L157，E）。
- [packages/iam/src/session/iam-session-types.ts](../packages/iam/src/session/iam-session-types.ts)：`TokenPair`（L19，E）；`AuthResult`（L39，E）；`Session`（L57，E）；`SessionData`（L93，E）；`CreateSessionOptions`（L101，E）；`SessionOperations`（L130，E）；`SessionFieldUpdates`（L230，E）。
- [packages/iam/src/session/iam-session-utils.ts](../packages/iam/src/session/iam-session-utils.ts)：`generateToken`（L20，E）；`buildSession`（L37，E）；`getSessionTtl`（L63，E）；`applySessionPatch`（L77，E）。
- [packages/iam/src/ticket/iam-ticket-functions.ts](../packages/iam/src/ticket/iam-ticket-functions.ts)：`createTicketOperations`（L50，E）。
- [packages/iam/src/ticket/iam-ticket-types.ts](../packages/iam/src/ticket/iam-ticket-types.ts)：`TicketGrant`（L18，E）；`IssueTicketOptions`（L32，E）；`IssuedTicket`（L46，E）；`ConsumeTicketOptions`（L56，E）；`ConsumedTicket`（L64，E）；`TicketOperations`（L78，E）。
- [packages/iam/src/user/iam-user-functions.ts](../packages/iam/src/user/iam-user-functions.ts)：`UserOperationsDeps`（L63，E）；`createUserOperations`（L77，E）。
- [packages/iam/src/user/iam-user-repository-reset-token.ts](../packages/iam/src/user/iam-user-repository-reset-token.ts)：`hashResetToken`（L30，E）；`ResetTokenRepository`（L45，E）；`resetResetTokenRepoSingleton`（L120，E）；`createCacheResetTokenRepository`（L131，E）。
- [packages/iam/src/user/iam-user-repository-user.ts](../packages/iam/src/user/iam-user-repository-user.ts)：`UserRepository`（L21，E）；`resetUserRepoSingleton`（L216，E）；`createDbUserRepository`（L229，E）。
- [packages/iam/src/user/iam-user-types.ts](../packages/iam/src/user/iam-user-types.ts)：`UserSortField`（L14，E）；`UserSortDirection`（L17，E）；`ListUsersOptions`（L22，E）；`User`（L42，E）；`AgreementDisplay`（L76，E）；`StoredUser`（L94，E）；`RegisterOptions`（L112，E）；`RegisterResult`（L130，E）；`UpdateCurrentUserInput`（L144，E）；`UserOperations`（L164，E）。
- [packages/iam/src/user/iam-user-utils.ts](../packages/iam/src/user/iam-user-utils.ts)：`toUser`（L19，E）。

### 内部结构体补充定位

- [packages/iam/src/authn/iam-authn-functions.ts](../packages/iam/src/authn/iam-authn-functions.ts)：`BuildAuthnDeps`（L189，J/E）。
- [packages/iam/src/authz/iam-authz-functions.ts](../packages/iam/src/authz/iam-authz-functions.ts)：`RbacManagerConfig`（L95，E）。
- [packages/iam/src/iam-i18n.ts](../packages/iam/src/iam-i18n.ts)：`IamMessageKey`（L17，E）。
- [packages/iam/src/session/iam-session-functions.ts](../packages/iam/src/session/iam-session-functions.ts)：`SessionBuilderConfig`（L88，E）。
- [packages/iam/src/ticket/iam-ticket-functions.ts](../packages/iam/src/ticket/iam-ticket-functions.ts)：`StoredTicket`（L35，E）。
- [packages/iam/src/user/iam-user-functions.ts](../packages/iam/src/user/iam-user-functions.ts)：`UserFnContext`（L209，E）；`UserBuilderDeps`（L967，J/E）。

补充扫描定位 7 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-13 · @h-ai/kit

- [ ] 完成主清单通用关闭标准；基线顶层导出 151，缺 JSDoc 3，缺示例 91。

### 顶层导出定位

- [packages/kit/src/browser.ts](../packages/kit/src/browser.ts)：`kit`（L18，E）。
- [packages/kit/src/client/kit-client-auth.ts](../packages/kit/src/client/kit-client-auth.ts)：`createKitAuthActions`（L10，J/E）。
- [packages/kit/src/client/kit-client.ts](../packages/kit/src/client/kit-client.ts)：`ClientTransportConfig`（L23，E）；`KitClientConfig`（L35，E）；`KitClient`（L58，E）；`installBrowserTransportFetch`（L155，E）。
- [packages/kit/src/client/kit-nav-adapter.ts](../packages/kit/src/client/kit-nav-adapter.ts)：`createSvelteKitNavAdapter`（L36，E）。
- [packages/kit/src/crud/kit-crud-types.ts](../packages/kit/src/crud/kit-crud-types.ts)：`CrudFieldType`（L11，E）；`CrudFieldValidation`（L32，E）；`CrudFieldOption`（L48，E）；`CrudFieldOptions`（L54，E）；`CrudText`（L59，E）；`CrudFieldDef`（L62，E）；`CrudPaginationParams`（L108，E）；`CrudFilterParams`（L114，E）；`CrudPaginatedResult`（L120，E）；`CrudApiDef`（L130，E）；`CrudResourceDef`（L146，E）；`CrudTableColumn`（L168，E）；`CrudOperations`（L177，E）。
- [packages/kit/src/guards/kit-auth.ts](../packages/kit/src/guards/kit-auth.ts)：`AuthGuardConfig`（L15，E）；`SessionGuardConfig`（L25，E）；`sessionGuard`（L88，E）。
- [packages/kit/src/guards/kit-permission.ts](../packages/kit/src/guards/kit-permission.ts)：`PermissionGuardConfig`（L14，E）；`matchPermission`（L91，E）。
- [packages/kit/src/guards/kit-role.ts](../packages/kit/src/guards/kit-role.ts)：`RoleGuardConfig`（L14，E）。
- [packages/kit/src/hooks/kit-cookie-proxy.ts](../packages/kit/src/hooks/kit-cookie-proxy.ts)：`CookieProxyConfig`（L15，E）；`createEncryptedCookieProxy`（L45，E）。
- [packages/kit/src/kit-adapter.ts](../packages/kit/src/kit-adapter.ts)：`AdapterOptions`（L25，E）；`createAdapter`（L44，E）。
- [packages/kit/src/kit-auth-api.ts](../packages/kit/src/kit-auth-api.ts)：`authApiPublicPaths`（L19，E）；`createAuthApi`（L22，E）。
- [packages/kit/src/kit-auth.ts](../packages/kit/src/kit-auth.ts)：`configureAuth`（L33，E）；`BrowserTokenStore`（L56，E）；`getDefaultBrowserTokenStore`（L75，E）；`getAccessToken`（L103，E）；`createTokenStore`（L313，E）；`setBrowserToken`（L339，E）；`clearBrowserToken`（L346，E）。
- [packages/kit/src/kit-config.ts](../packages/kit/src/kit-config.ts)：`KitServerConfig`（L17，E）；`KitServerConfigInput`（L23，E）；`KitTransportConfig`（L26，E）；`KitConfig`（L35，E）；`KitTransportConfigInput`（L41，E）；`KitConfigInput`（L50，E）；`KitConfigSchema`（L72，E）；`resolveKitServerConfig`（L109，E）；`resolveKitTransportConfig`（L119，E）；`resolveKitConfig`（L130，E）。
- [packages/kit/src/kit-i18n.ts](../packages/kit/src/kit-i18n.ts)：`kitM`（L15，E）。
- [packages/kit/src/kit-main.ts](../packages/kit/src/kit-main.ts)：`kit`（L39，E）。
- [packages/kit/src/kit-response.ts](../packages/kit/src/kit-response.ts)：`noContent`（L72，E）；`badRequest`（L122，E）；`unauthorized`（L133，E）；`forbidden`（L144，E）；`notFound`（L155，E）；`conflict`（L166，E）；`internalError`（L198，E）；`fromError`（L257，J/E）。
- [packages/kit/src/kit-types.ts](../packages/kit/src/kit-types.ts)：`AuthOperations`（L21，E）；`AuthOperationsProvider`（L24，E）；`SessionLike`（L33，E）；`HaiRequestEvent`（L86，E）；`MiddlewareContext`（L100，E）；`GuardResult`（L135，E）；`HandleA2AOperations`（L312，E）；`TransportEncryptionOptions`（L357，E）；`FormError`（L454，E）。
- [packages/kit/src/kit-utils.ts](../packages/kit/src/kit-utils.ts)：`isResponseLike`（L17，E）；`isSvelteKitControlFlow`（L45，E）。
- [packages/kit/src/middleware/kit-logging.ts](../packages/kit/src/middleware/kit-logging.ts)：`LoggingMiddlewareConfig`（L15，E）。
- [packages/kit/src/middleware/kit-ratelimit.ts](../packages/kit/src/middleware/kit-ratelimit.ts)：`RateLimitEntry`（L17，E）；`MemoryRateLimitStore`（L68，E）。
- [packages/kit/src/modules/a2a/kit-a2a-auth.ts](../packages/kit/src/modules/a2a/kit-a2a-auth.ts)：`A2AApiKeyAuthConfig`（L12，E）；`createA2AApiKeyAuthenticator`（L32，E）。
- [packages/kit/src/modules/a2a/kit-a2a-handle.ts](../packages/kit/src/modules/a2a/kit-a2a-handle.ts)：`ResolvedA2AConfig`（L18，E）；`resolveA2AConfig`（L36，E）；`handleA2ARequest`（L104，E）。
- [packages/kit/src/modules/a2a/kit-a2a-types.ts](../packages/kit/src/modules/a2a/kit-a2a-types.ts)：`KitA2AHandlerConfig`（L11，E）。
- [packages/kit/src/modules/crypto/kit-crypto-helpers.ts](../packages/kit/src/modules/crypto/kit-crypto-helpers.ts)：`signRequest`（L68，E）。
- [packages/kit/src/modules/crypto/kit-crypto-types.ts](../packages/kit/src/modules/crypto/kit-crypto-types.ts)：`CryptoServiceLike`（L14，E）；`WebhookVerifyConfig`（L87，E）；`CryptoCsrfConfig`（L105，E）；`EncryptedCookieConfig`（L129，E）；`TransportEncryptionConfig`（L158，E）。
- [packages/kit/src/modules/crypto/kit-transport-paths.ts](../packages/kit/src/modules/crypto/kit-transport-paths.ts)：`DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH`（L11，J/E）；`isSvelteKitDataPath`（L22，E）；`shouldHandleTransportPath`（L27，E）；`shouldExcludeTransportPath`（L35，E）；`resolveTransportPath`（L50，E）；`shouldUseTransportForUrl`（L61，E）。

### 内部结构体补充定位

- [packages/kit/src/client/kit-client.ts](../packages/kit/src/client/kit-client.ts)：`BrowserTransportFetchState`（L142，J/E）。
- [packages/kit/src/guards/kit-compose.ts](../packages/kit/src/guards/kit-compose.ts)：`ConditionFn`（L112，E）。
- [packages/kit/src/kit-auth.ts](../packages/kit/src/kit-auth.ts)：`CookieReader`（L40，J/E）；`CookieWriter`（L44，J/E）。
- [packages/kit/src/kit-i18n.ts](../packages/kit/src/kit-i18n.ts)：`KitMessageKey`（L12，J/E）。
- [packages/kit/src/modules/crypto/kit-transport-middleware.ts](../packages/kit/src/modules/crypto/kit-transport-middleware.ts)：`RequestHolder`（L244，J/E）。

补充扫描定位 6 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-14 · @h-ai/payment

- [ ] 完成主清单通用关闭标准；基线顶层导出 50，缺 JSDoc 8，缺示例 47。

### 顶层导出定位

- [packages/payment/src/client/payment-client-types.ts](../packages/payment/src/client/payment-client-types.ts)：`InvokePaymentResult`（L11，E）；`InvokePaymentOptions`（L19，E）。
- [packages/payment/src/payment-config.ts](../packages/payment/src/payment-config.ts)：`WechatPayConfigSchema`（L14，E）；`AlipayConfigSchema`（L24，E）；`StripeConfigSchema`（L33，E）；`PaymentConfigSchema`（L40，E）；`PaymentConfig`（L46，J/E）；`PaymentConfigInput`（L47，J/E）；`WechatPayConfig`（L48，J/E）；`AlipayConfig`（L49，J/E）；`StripeConfig`（L50，J/E）。
- [packages/payment/src/payment-functions.ts](../packages/payment/src/payment-functions.ts)：`registerProvider`（L71，E）；`getProvider`（L81，E）；`createOrder`（L105，E）；`handleNotify`（L135，E）；`queryOrder`（L160，E）；`refund`（L176，E）；`closeOrder`（L206，E）；`clearProviders`（L228，E）。
- [packages/payment/src/payment-i18n.ts](../packages/payment/src/payment-i18n.ts)：`paymentM`（L20，E）。
- [packages/payment/src/payment-types.ts](../packages/payment/src/payment-types.ts)：`HaiPaymentError`（L30，J/E）；`TradeType`（L35，E）；`OrderStatusValue`（L38，E）；`CreateOrderInput`（L43，E）；`PaymentOrder`（L63，E）；`PaymentNotifyRequest`（L77，E）；`PaymentNotifyResult`（L85，E）；`OrderStatus`（L103，E）；`RefundInput`（L119，E）；`RefundResult`（L133，E）；`PaymentProvider`（L150，E）；`PaymentFunctions`（L173，E）。
- [packages/payment/src/providers/alipay/alipay-provider.ts](../packages/payment/src/providers/alipay/alipay-provider.ts)：`createAlipayProvider`（L54，E）。
- [packages/payment/src/providers/alipay/alipay-sign.ts](../packages/payment/src/providers/alipay/alipay-sign.ts)：`signAlipayParams`（L18，E）；`verifyAlipayNotify`（L43，E）。
- [packages/payment/src/providers/alipay/alipay-types.ts](../packages/payment/src/providers/alipay/alipay-types.ts)：`AlipayNotifyParamsSchema`（L11，E）；`AlipayNotifyParams`（L19，J/E）。
- [packages/payment/src/providers/payment-provider-http.ts](../packages/payment/src/providers/payment-provider-http.ts)：`fetchWithTimeout`（L10，J/E）。
- [packages/payment/src/providers/stripe/stripe-provider.ts](../packages/payment/src/providers/stripe/stripe-provider.ts)：`createStripeProvider`（L27，E）。
- [packages/payment/src/providers/wechat/wechat-pay-sign.ts](../packages/payment/src/providers/wechat/wechat-pay-sign.ts)：`generateNonce`（L16，E）；`getTimestamp`（L23，E）；`signRequest`（L38，E）；`signJsapi`（L62，E）；`verifyNotifySignature`（L85，E）；`decryptResource`（L107，E）。
- [packages/payment/src/providers/wechat/wechat-pay-types.ts](../packages/payment/src/providers/wechat/wechat-pay-types.ts)：`WechatOrderRequest`（L9，E）；`WechatNotifyResource`（L32，E）。

### 内部结构体补充定位

- [packages/payment/src/payment-i18n.ts](../packages/payment/src/payment-i18n.ts)：`PaymentMessageKey`（L12，J/E）。

补充扫描定位 1 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-15 · @h-ai/reach

- [ ] 完成主清单通用关闭标准；基线顶层导出 51，缺 JSDoc 1，缺示例 42。

### 顶层导出定位

- [packages/reach/src/providers/reach-provider-aliyun-sms.ts](../packages/reach/src/providers/reach-provider-aliyun-sms.ts)：`createAliyunSmsProvider`（L70，E）。
- [packages/reach/src/providers/reach-provider-api.ts](../packages/reach/src/providers/reach-provider-api.ts)：`createApiProvider`（L49，E）。
- [packages/reach/src/providers/reach-provider-console.ts](../packages/reach/src/providers/reach-provider-console.ts)：`createConsoleProvider`（L21，E）。
- [packages/reach/src/providers/reach-provider-smtp.ts](../packages/reach/src/providers/reach-provider-smtp.ts)：`createSmtpProvider`（L38，E）。
- [packages/reach/src/reach-config.ts](../packages/reach/src/reach-config.ts)：`ConsoleProviderConfigSchema`（L17，E）；`ProviderConfigSchema`（L122，E）；`ProviderConfig`（L130，E）；`ConsoleProviderConfig`（L133，E）；`SmtpProviderConfig`（L136，E）；`AliyunSmsProviderConfig`（L139，E）；`ApiProviderConfig`（L142，E）；`DndConfig`（L177，E）；`TemplateConfig`（L205，E）；`ReachConfigSchema`（L215，E）；`ReachConfig`（L225，E）；`ReachConfigInput`（L230，E）。
- [packages/reach/src/reach-i18n.ts](../packages/reach/src/reach-i18n.ts)：`reachM`（L25，E）。
- [packages/reach/src/reach-main.ts](../packages/reach/src/reach-main.ts)：`reach`（L272，E）。
- [packages/reach/src/reach-send.ts](../packages/reach/src/reach-send.ts)：`isDndBlocked`（L53，E）；`msUntilDndEnd`（L80，E）；`preprocessMessage`（L98，E）；`startDndScheduler`（L170，E）；`stopDndScheduler`（L245，E）；`resetSendState`（L255，E）；`executeSend`（L407，E）。
- [packages/reach/src/reach-types.ts](../packages/reach/src/reach-types.ts)：`HaiReachError`（L27，J/E）；`ReachChannel`（L38，E）；`SendResult`（L84，E）；`RenderedTemplate`（L122，E）；`SendOperations`（L134，E）；`ReachTemplateRegistry`（L162，E）；`ReachProvider`（L229，E）。
- [packages/reach/src/repositories/reach-repository-send-log.ts](../packages/reach/src/repositories/reach-repository-send-log.ts)：`SendLogStatus`（L19，E）；`SendLogClaimOptions`（L22，E）；`StoredSendLog`（L34，E）；`SendLogRepository`（L70，E）；`resetSendLogRepoSingleton`（L238，E）；`createSendLogRepository`（L252，E）。
- [packages/reach/src/repositories/reach-repository-template.ts](../packages/reach/src/repositories/reach-repository-template.ts)：`StoredTemplate`（L24，E）；`TemplateRepository`（L46，E）；`resetTemplateRepoSingleton`（L142，E）；`createTemplateRepository`（L156，E）。

### 内部结构体补充定位

- [packages/reach/src/reach-i18n.ts](../packages/reach/src/reach-i18n.ts)：`ReachMessageKey`（L17，E）。

补充扫描定位 1 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-16 · @h-ai/reldb

- [ ] 完成主清单通用关闭标准；基线顶层导出 84，缺 JSDoc 4，缺示例 57。

### 顶层导出定位

- [packages/reldb/src/providers/reldb-ddl-builder.ts](../packages/reldb/src/providers/reldb-ddl-builder.ts)：`ColumnSqlOptions`（L20，E）；`buildColumnSqlBase`（L38，E）；`buildDefaultCreateTableSql`（L110，E）；`buildDefaultCreateIndexSql`（L128，E）；`buildDefaultRenameTableSql`（L143，E）；`buildDefaultDropIndexSql`（L150，E）。
- [packages/reldb/src/providers/reldb-provider-base.ts](../packages/reldb/src/providers/reldb-provider-base.ts)：`ReldbOpsContext`（L37，E）；`logReldbOperation`（L76，J/E）；`createBaseDdlOps`（L130，E）；`createBaseDmlOps`（L220，E）；`createBaseTxManager`（L252，E）；`createBaseCrudManager`（L287，E）；`queryPageAsync`（L305，E）。
- [packages/reldb/src/providers/reldb-provider-mysql.ts](../packages/reldb/src/providers/reldb-provider-mysql.ts)：`createMysqlProvider`（L68，E）。
- [packages/reldb/src/providers/reldb-provider-postgres.ts](../packages/reldb/src/providers/reldb-provider-postgres.ts)：`createPostgresProvider`（L64，E）。
- [packages/reldb/src/providers/reldb-provider-sqlite.ts](../packages/reldb/src/providers/reldb-provider-sqlite.ts)：`createSqliteProvider`（L47，E）。
- [packages/reldb/src/providers/reldb-tx-assembler.ts](../packages/reldb/src/providers/reldb-tx-assembler.ts)：`TxCallbacks`（L32，E）；`createTxHandle`（L58，E）；`createTxWrap`（L157，E）。
- [packages/reldb/src/providers/sqlite/reldb-sqlite-engine.ts](../packages/reldb/src/providers/sqlite/reldb-sqlite-engine.ts)：`SqliteStatement`（L25，E）；`SqliteEngine`（L35，E）；`SqliteEngineOptions`（L53，E）；`createSyncSqliteEngine`（L68，E）；`createWorkerSqliteEngine`（L145，E）。
- [packages/reldb/src/reldb-config.ts](../packages/reldb/src/reldb-config.ts)：`ReldbTypeSchema`（L19，E）；`DbType`（L22，E）；`ReldbOperationLogConfigSchema`（L24，J/E）；`ReldbOperationLogConfig`（L31，J/E）；`PoolConfig`（L65，E）；`SslConfig`（L94，E）；`ReldbConfigSchema`（L258，E）；`ReldbConfig`（L265，E）；`SqliteConfig`（L268，E）；`PostgresqlConfig`（L271，E）；`MysqlConfig`（L274，E）；`ReldbConfigInput`（L282，E）。
- [packages/reldb/src/reldb-crud-kernel.ts](../packages/reldb/src/reldb-crud-kernel.ts)：`createCrud`（L96，E）。
- [packages/reldb/src/reldb-security.ts](../packages/reldb/src/reldb-security.ts)：`validateIdentifiers`（L57，E）。
- [packages/reldb/src/reldb-types.ts](../packages/reldb/src/reldb-types.ts)：`HaiReldbError`（L37，J/E）；`ColumnType`（L60，E）；`QueryRow`（L314，E）；`ExecuteResult`（L321，E）；`NormalizedPagination`（L333，E）；`PaginationOverrides`（L343，E）；`PaginationQueryOptions`（L355，E）；`DmlOperations`（L369，E）；`CrudQueryOptions`（L385，E）；`CrudPageOptions`（L413，E）；`ReldbCrudCountOptions`（L432，E）；`CrudConfig`（L445，E）；`ReldbCrudFieldDefinition`（L463，E）；`BaseReldbCrudRepositoryConfig`（L479，E）；`ReldbCrudRepository`（L497，E）；`CrudManager`（L513，E）；`DmlWithTxOperations`（L523，E）；`TxManager`（L550，E）；`ReldbProvider`（L663，E）。

### 内部结构体补充定位

- [packages/reldb/src/providers/reldb-provider-base.ts](../packages/reldb/src/providers/reldb-provider-base.ts)：`ReldbOperationCategory`（L51，J/E）。
- [packages/reldb/src/providers/reldb-provider-mysql.ts](../packages/reldb/src/providers/reldb-provider-mysql.ts)：`MysqlPool`（L38，E）；`MysqlConnection`（L46，E）；`MysqlResult`（L56，E）。
- [packages/reldb/src/providers/reldb-provider-postgres.ts](../packages/reldb/src/providers/reldb-provider-postgres.ts)：`PgPool`（L45，E）；`PgClient`（L52，E）。
- [packages/reldb/src/providers/sqlite/reldb-sqlite-engine.ts](../packages/reldb/src/providers/sqlite/reldb-sqlite-engine.ts)：`WorkerResponse`（L131，E）。
- [packages/reldb/src/reldb-i18n.ts](../packages/reldb/src/reldb-i18n.ts)：`ReldbMessageKey`（L17，E）。

补充扫描定位 8 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-17 · @h-ai/scheduler

- [ ] 完成主清单通用关闭标准；基线顶层导出 71，缺 JSDoc 38，缺示例 67。

### 顶层导出定位

- [packages/scheduler/src/repositories/scheduler-log-repository.ts](../packages/scheduler/src/repositories/scheduler-log-repository.ts)：`SchedulerLogRepository`（L37，J/E）。
- [packages/scheduler/src/repositories/scheduler-task-repository.ts](../packages/scheduler/src/repositories/scheduler-task-repository.ts)：`SchedulerTaskRepository`（L59，J/E）。
- [packages/scheduler/src/scheduler-cancellation.ts](../packages/scheduler/src/scheduler-cancellation.ts)：`waitWithSignal`（L2，E）。
- [packages/scheduler/src/scheduler-config.ts](../packages/scheduler/src/scheduler-config.ts)：`SchedulerConfig`（L41，E）；`SchedulerConfigInput`（L44，E）。
- [packages/scheduler/src/scheduler-cron.ts](../packages/scheduler/src/scheduler-cron.ts)：`matchesCron`（L56，E）。
- [packages/scheduler/src/scheduler-executor.ts](../packages/scheduler/src/scheduler-executor.ts)：`setLogRepository`（L24，J/E）；`saveInterruptedTaskLog`（L142，J/E）；`interruptTask`（L153，J/E）；`executeJsTask`（L180，J/E）；`executeApiTask`（L212，J/E）；`executeTask`（L334，J/E）。
- [packages/scheduler/src/scheduler-functions.ts](../packages/scheduler/src/scheduler-functions.ts)：`getTaskRegistry`（L43，J/E）；`getTask`（L47，J/E）；`hasTask`（L51，J/E）；`setTask`（L55，J/E）；`deleteTask`（L60，J/E）；`getCron`（L67，J/E）；`setCron`（L71，J/E）；`deleteCron`（L75，J/E）；`setHooks`（L81，J/E）；`clearHooks`（L85，J/E）；`getHooks`（L89，J/E）；`resetTaskState`（L95，J/E）；`loadPersistedTasks`（L139，E）；`loadConfigTasks`（L193，J/E）；`registerTask`（L202，J/E）；`unregisterTask`（L258，J/E）；`updateRegisteredTask`（L292，J/E）；`queryTaskLogs`（L374，J/E）。
- [packages/scheduler/src/scheduler-js-compiler.ts](../packages/scheduler/src/scheduler-js-compiler.ts)：`clearJsTaskHandlerCache`（L29，J/E）；`compileJsTaskHandler`（L33，J/E）。
- [packages/scheduler/src/scheduler-main.ts](../packages/scheduler/src/scheduler-main.ts)：`scheduler`（L75，J/E）。
- [packages/scheduler/src/scheduler-runner.ts](../packages/scheduler/src/scheduler-runner.ts)：`configureLock`（L54，J/E）；`setTaskRepository`（L59，J/E）；`isTaskRunning`（L63，J/E）；`isTimerRunning`（L67，J/E）；`resetRunner`（L73，J/E）；`drainRunner`（L100，J/E）；`runTask`（L165，J/E）；`startTimer`（L308，J/E）；`stopTimer`（L313，J/E）。
- [packages/scheduler/src/scheduler-types.ts](../packages/scheduler/src/scheduler-types.ts)：`HaiSchedulerError`（L32，J/E）；`TaskParams`（L37，E）；`TaskTriggerType`（L40，E）；`TaskHandlerKind`（L43，E）；`TaskRetryPolicy`（L46，E）；`TaskExecutionTargetType`（L54，E）；`ApiTaskConfig`（L59，E）；`JsTaskConfig`（L86，E）；`TaskHandlerConfig`（L96，E）；`TaskTriggerInfo`（L154，E）；`SchedulerTaskContext`（L164，E）；`JsTaskHandler`（L178，E）；`SchedulerTaskStartEvent`（L183，E）；`SchedulerTaskExecuteEvent`（L195，E）；`SchedulerTaskInterruptedEvent`（L201，E）；`SchedulerTaskFinishEvent`（L209，E）；`SchedulerTaskHooks`（L222，E）；`ExecutionStatus`（L236，E）；`TaskExecutionLog`（L241，E）；`LogQueryOptions`（L273，E）；`SchedulerLogCleanupPolicy`（L291，E）；`TaskUpdateInput`（L306，E）；`TriggerTaskInput`（L328，E）；`SchedulerInitInput`（L340，E）；`SchedulerFunctions`（L352，E）。

### 内部结构体补充定位

- [packages/scheduler/src/repositories/scheduler-log-repository.ts](../packages/scheduler/src/repositories/scheduler-log-repository.ts)：`LogRow`（L22，J/E）。
- [packages/scheduler/src/repositories/scheduler-task-repository.ts](../packages/scheduler/src/repositories/scheduler-task-repository.ts)：`TaskRow`（L43，J/E）。
- [packages/scheduler/src/scheduler-i18n.ts](../packages/scheduler/src/scheduler-i18n.ts)：`SchedulerMessageKey`（L17，E）。

补充扫描定位 3 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-18 · @h-ai/serv

- [ ] 完成主清单通用关闭标准；基线顶层导出 106，缺 JSDoc 3，缺示例 98。

### 顶层导出定位

- [packages/serv/src/adapters/serv-adapter-fetch.ts](../packages/serv/src/adapters/serv-adapter-fetch.ts)：`ServFetchHandler`（L18，E）。
- [packages/serv/src/adapters/serv-adapter-node.ts](../packages/serv/src/adapters/serv-adapter-node.ts)：`DEFAULT_SERV_HOST`（L17，E）；`DEFAULT_SERV_PORT`（L20，E）；`ServListenOptions`（L23，E）；`ServNodeServer`（L54，E）。
- [packages/serv/src/features/serv-feature-ai.ts](../packages/serv/src/features/serv-feature-ai.ts)：`AiProcedureDeps`（L31，E）；`createAiProcedures`（L36，E）。
- [packages/serv/src/features/serv-feature-audio.ts](../packages/serv/src/features/serv-feature-audio.ts)：`AudioWsDeps`（L28，E）；`registerAudioWsRoute`（L98，E）。
- [packages/serv/src/features/serv-feature-helpers.ts](../packages/serv/src/features/serv-feature-helpers.ts)：`wrapItemsResult`（L17，E）；`mapHaiResult`（L26，E）。
- [packages/serv/src/features/serv-feature-iam.ts](../packages/serv/src/features/serv-feature-iam.ts)：`IamProcedureDeps`（L27，E）；`createIamProcedures`（L32，E）。
- [packages/serv/src/features/serv-feature-storage.ts](../packages/serv/src/features/serv-feature-storage.ts)：`StorageProcedureDeps`（L73，E）；`createStorageProcedures`（L84，E）。
- [packages/serv/src/pipelines/serv-pipeline-guard.ts](../packages/serv/src/pipelines/serv-pipeline-guard.ts)：`WILDCARD_PERMISSION`（L20，E）；`WILDCARD_ROLE`（L25，E）；`ServGuardRequirements`（L27，J/E）；`applyServGuards`（L39，E）。
- [packages/serv/src/pipelines/serv-pipeline-helper.ts](../packages/serv/src/pipelines/serv-pipeline-helper.ts)：`ServErrorBodyDef`（L14，E）；`buildHaiErrorBody`（L27，E）；`mapHaiError`（L48，E）。
- [packages/serv/src/pipelines/serv-pipeline-security-headers.ts](../packages/serv/src/pipelines/serv-pipeline-security-headers.ts)：`securityHeaders`（L14，E）。
- [packages/serv/src/pipelines/serv-pipeline-types.ts](../packages/serv/src/pipelines/serv-pipeline-types.ts)：`ServMiddleware`（L20，E）；`ServMiddlewareFactory`（L28，E）；`ServProcedureOptions`（L37，E）；`ServProcedureHandler`（L47，J/E）。
- [packages/serv/src/serv-app.ts](../packages/serv/src/serv-app.ts)：`ServMiddlewareMount`（L61，E）；`ServHttpApp`（L73，E）；`CreateServAppOptions`（L95，E）；`ServAudioConfig`（L162，E）；`AudioTicketGrant`（L202，E）；`AudioTicketVerification`（L214，E）；`AuthorizedAudioRequest`（L222，E）；`audioWsServers`（L238，E）。
- [packages/serv/src/serv-client-ip.ts](../packages/serv/src/serv-client-ip.ts)：`readRemoteAddress`（L8，E）；`normalizeClientIp`（L15，E）；`isTrustedProxyEntry`（L42，E）；`createClientIpResolver`（L53，E）。
- [packages/serv/src/serv-config.ts](../packages/serv/src/serv-config.ts)：`ServServerConfig`（L24，E）；`ServServerConfigInput`（L30，E）；`ServOpenAPIHttpConfig`（L33，E）；`ServDocsHttpConfig`（L38，E）；`ServHealthHttpConfig`（L44，E）；`ServRpcHttpConfig`（L50，E）；`ServTransportRuntimeConfig`（L58，E）；`ServCorsRuntimeConfig`（L65，E）；`ServHttpConfig`（L74，E）；`ServConfig`（L85，E）；`ServCorsRuntimeConfigInput`（L93，E）；`ServTransportRuntimeConfigInput`（L96，E）；`ServHttpConfigInput`（L103，E）；`ServConfigInput`（L113，E）；`ServConfigSchema`（L183，E）；`resolveServServerConfig`（L222，E）；`resolveServHttpConfig`（L232，E）；`resolveServCorsRuntimeConfig`（L237，E）；`resolveServTransportRuntimeConfig`（L247，E）；`resolveServConfig`（L258，E）。
- [packages/serv/src/serv-context.ts](../packages/serv/src/serv-context.ts)：`ServSession`（L24，E）；`ServIam`（L41，E）；`ServContext`（L53，E）；`ServRequestMetadata`（L65，E）；`CreateServContextInput`（L70，E）；`CreateServContext`（L77，E）；`extractBearerToken`（L94，E）；`parseRequestContext`（L116，E）；`buildAuthContextFactory`（L155，E）。
- [packages/serv/src/serv-cookie-auth.ts](../packages/serv/src/serv-cookie-auth.ts)：`RefreshTokenPair`（L37，E）；`NativeRefreshTokenTransportConfig`（L53，E）；`RefreshCookieConfig`（L68，E）；`mountRefreshCookieRoutes`（L222，J/E）。
- [packages/serv/src/serv-cors.ts](../packages/serv/src/serv-cors.ts)：`ServCorsConfig`（L11，E）；`cors`（L31，E）。
- [packages/serv/src/serv-i18n.ts](../packages/serv/src/serv-i18n.ts)：`normalizeServLocale`（L28，E）。
- [packages/serv/src/serv-main.ts](../packages/serv/src/serv-main.ts)：`serv`（L51，E）。
- [packages/serv/src/serv-openapi.ts](../packages/serv/src/serv-openapi.ts)：`SCALAR_ROUTE`（L15，E）；`GenerateOpenAPISpecOptions`（L24，E）；`CreateDocsPageOptions`（L72，E）；`getScalarScript`（L89，E）；`createDocsPage`（L111，E）。
- [packages/serv/src/serv-router.ts](../packages/serv/src/serv-router.ts)：`ServRoutePath`（L35，E）；`AuthenticatedServContext`（L73，E）；`ServRouteHandler`（L99，E）；`ServRouteRegistration`（L125，E）；`ServGuardedRouteRegistration`（L156，E）；`ServRouterBuilder`（L229，E）；`ServImplementer`（L244，E）。
- [packages/serv/src/serv-runtime-security.ts](../packages/serv/src/serv-runtime-security.ts)：`ServRuntimeSecurityPolicyInput`（L10，E）；`ServRuntimeSecurityPolicy`（L17，E）；`createRuntimeSecurityPolicy`（L29，E）。
- [packages/serv/src/serv-storage-assets.ts](../packages/serv/src/serv-storage-assets.ts)：`ServStorageAssetsConfig`（L18，E）。
- [packages/serv/src/serv-transport.ts](../packages/serv/src/serv-transport.ts)：`ServTransportConfig`（L32，E）；`createTransportMiddleware`（L65，E）。
- [packages/serv/src/serv-validation.ts](../packages/serv/src/serv-validation.ts)：`ServValidationFailureBody`（L27，E）；`resolveRequestLocale`（L49，E）；`localizeZodError`（L69，E）；`validateInputOrFail`（L108，E）。

### 内部结构体补充定位

- [packages/serv/src/features/serv-feature-audio.ts](../packages/serv/src/features/serv-feature-audio.ts)：`ConnectionState`（L70，E）；`ConnectionLimits`（L82，E）。
- [packages/serv/src/features/serv-feature-storage.ts](../packages/serv/src/features/serv-feature-storage.ts)：`PresignedResponse`（L77，J/E）。
- [packages/serv/src/pipelines/serv-pipeline-require-internal-rpc.ts](../packages/serv/src/pipelines/serv-pipeline-require-internal-rpc.ts)：`GetConnInfoFn`（L24，E）。
- [packages/serv/src/serv-app.ts](../packages/serv/src/serv-app.ts)：`OrpcValidationErrorPayload`（L514，J/E）。
- [packages/serv/src/serv-cookie-auth.ts](../packages/serv/src/serv-cookie-auth.ts)：`SafeRefreshTokenPair`（L44，J/E）；`ResolvedRefreshCookieConfig`（L98，J/E）。
- [packages/serv/src/serv-i18n.ts](../packages/serv/src/serv-i18n.ts)：`ServMessageKey`（L13，J/E）。
- [packages/serv/src/serv-router.ts](../packages/serv/src/serv-router.ts)：`EmptyContext`（L30，J/E）；`StringKey`（L31，J/E）；`ServContract`（L32，J/E）；`ContractAtPath`（L58，J/E）；`RouteContract`（L67，J/E）；`RouteHandler`（L78，J/E）；`ServGuardedRouteHandler`（L105，J/E）；`NextBuilder`（L111，J/E）；`ServRouteMethod`（L189，J/E）；`ServRouterBuilderBuild`（L210，J/E）；`RuntimeProcedureHandler`（L297，J/E）；`AuthenticatedRuntimeProcedureHandler`（L304，J/E）。
- [packages/serv/src/serv-storage-assets.ts](../packages/serv/src/serv-storage-assets.ts)：`StorageAssetSource`（L13，E）。

补充扫描定位 21 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-19 · @h-ai/storage

- [ ] 完成主清单通用关闭标准；基线顶层导出 49，缺 JSDoc 5，缺示例 38。

### 顶层导出定位

- [packages/storage/src/client/storage-client.ts](../packages/storage/src/client/storage-client.ts)：`UploadProgress`（L18，E）；`ClientUploadOptions`（L32，E）；`ClientDownloadOptions`（L46，E）。
- [packages/storage/src/providers/storage-operation-log.ts](../packages/storage/src/providers/storage-operation-log.ts)：`logStorageOperation`（L41，J/E）。
- [packages/storage/src/providers/storage-provider-local.ts](../packages/storage/src/providers/storage-provider-local.ts)：`createLocalProvider`（L208，E）。
- [packages/storage/src/providers/storage-provider-s3.ts](../packages/storage/src/providers/storage-provider-s3.ts)：`createS3Provider`（L169，E）。
- [packages/storage/src/storage-checksum.ts](../packages/storage/src/storage-checksum.ts)：`checksum`（L30，J/E）。
- [packages/storage/src/storage-config.ts](../packages/storage/src/storage-config.ts)：`StorageTypeSchema`（L18，E）；`StorageType`（L21，E）；`StorageOperationLogConfigSchema`（L23，J/E）；`StorageOperationLogConfig`（L30，J/E）；`S3ConfigSchema`（L42，E）；`S3Config`（L74，E）；`LocalConfigSchema`（L81，E）；`LocalConfig`（L98，E）；`StorageConfig`（L140，E）；`StorageConfigInput`（L143，E）；`PresignOptions`（L172，E）；`PresignUploadOptions`（L193，E）。
- [packages/storage/src/storage-mime.ts](../packages/storage/src/storage-mime.ts)：`MIME_TYPES`（L14，E）；`MIME_TYPE_DEFAULT`（L67，E）。
- [packages/storage/src/storage-stream.ts](../packages/storage/src/storage-stream.ts)：`toByteStream`（L11，E）。
- [packages/storage/src/storage-types.ts](../packages/storage/src/storage-types.ts)：`HaiStorageError`（L43，J/E）；`FileMetadata`（L52，E）；`ListOptions`（L72，E）；`ListResult`（L92，E）；`UploadOptions`（L110，E）；`DownloadOptions`（L131，E）；`CopyOptions`（L146，E）；`StorageData`（L156，E）；`ChecksumAlgorithm`（L159，E）；`ChecksumOptions`（L162，E）；`ChecksumOperations`（L169，E）；`FileOperations`（L179，E）；`DirOperations`（L293，E）；`PresignOperations`（L327，E）；`StorageFunctions`（L381，E）；`StorageProvider`（L424，E）。

### 内部结构体补充定位

- [packages/storage/src/providers/storage-operation-log.ts](../packages/storage/src/providers/storage-operation-log.ts)：`StorageOperationLogger`（L3，J/E）；`StorageOperationCategory`（L9，J/E）。
- [packages/storage/src/storage-i18n.ts](../packages/storage/src/storage-i18n.ts)：`StorageMessageKey`（L14，E）。

补充扫描定位 3 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-20 · @h-ai/ui

- [ ] 完成主清单通用关闭标准；基线顶层导出 297，缺 JSDoc 63，缺示例 284。

### 顶层导出定位

- [packages/ui/src/lib/components/compounds/accordion-types.ts](../packages/ui/src/lib/components/compounds/accordion-types.ts)：`AccordionItem`（L6，E）。
- [packages/ui/src/lib/components/compounds/action-sheet-types.ts](../packages/ui/src/lib/components/compounds/action-sheet-types.ts)：`ActionSheetItem`（L6，E）。
- [packages/ui/src/lib/components/compounds/bottom-nav-types.ts](../packages/ui/src/lib/components/compounds/bottom-nav-types.ts)：`BottomNavItem`（L8，J/E）。
- [packages/ui/src/lib/components/compounds/swipe-cell-types.ts](../packages/ui/src/lib/components/compounds/swipe-cell-types.ts)：`SwipeCellAction`（L6，E）。
- [packages/ui/src/lib/components/compounds/timeline-types.ts](../packages/ui/src/lib/components/compounds/timeline-types.ts)：`TimelineItem`（L6，E）。
- [packages/ui/src/lib/components/control-size.ts](../packages/ui/src/lib/components/control-size.ts)：`getFormControlSizeClasses`（L30，E）。
- [packages/ui/src/lib/components/scenes/ai/code-preview.ts](../packages/ui/src/lib/components/scenes/ai/code-preview.ts)：`BuiltInCodePreviewOptions`（L10，J/E）；`resolvePreviewSandbox`（L26，E）；`createBuiltInCodePreview`（L30，J/E）。
- [packages/ui/src/lib/components/scenes/ai/document-download.ts](../packages/ui/src/lib/components/scenes/ai/document-download.ts)：`AiDocumentDownloadFormat`（L46，E）；`AiDocumentResolvedDownloadAction`（L48，J/E）；`AiDocumentDownloadRequest`（L57，J/E）；`resolveDocumentMarkdownContent`（L76，E）；`resolveDocumentDownloadActions`（L98，E）；`downloadAiDocument`（L125，E）。
- [packages/ui/src/lib/components/scenes/ai/document-parse.ts](../packages/ui/src/lib/components/scenes/ai/document-parse.ts)：`MarkdownDocumentParseOptions`（L24，J/E）；`MarkdownRenderResult`（L45，J/E）；`MarkdownDocumentBlock`（L54，J/E）；`MarkdownDocumentHtmlBlock`（L58，J/E）；`MarkdownDocumentMermaidBlock`（L67，J/E）；`renderMarkdownDocument`（L539，E）。
- [packages/ui/src/lib/components/scenes/ai/document-types.ts](../packages/ui/src/lib/components/scenes/ai/document-types.ts)：`MarkdownSourceKind`（L6，E）；`MarkdownOutlineItem`（L8，J/E）；`MarkdownCodeBlockItem`（L19，J/E）；`MarkdownCodeRunRequest`（L28，J/E）；`MarkdownCodeRunResult`（L41，J/E）；`MarkdownRewriteAction`（L59，J/E）；`MarkdownRewriteRequest`（L66，J/E）；`MarkdownBlockFormatKind`（L80，E）；`MarkdownBlockStyleKind`（L87，E）；`MarkdownInlineFormatKind`（L100，E）；`MarkdownTextAlignKind`（L112，E）；`MarkdownSelectionSnapshot`（L114，J/E）；`MarkdownColorFormatRequest`（L126，E）；`MarkdownLinkFormatRequest`（L137，J/E）；`MarkdownToolbarDownloadAction`（L146，J/E）；`AiDocumentEditorProps`（L163，J/E）。
- [packages/ui/src/lib/components/scenes/ai/editor-markdown-extensions.ts](../packages/ui/src/lib/components/scenes/ai/editor-markdown-extensions.ts)：`extractPlainTextFromTokens`（L47，E）；`createEditorMarkdownExtensions`（L123，E）。
- [packages/ui/src/lib/components/scenes/ai/highlight.ts](../packages/ui/src/lib/components/scenes/ai/highlight.ts)：`isLanguageSupported`（L146，E）；`highlightCode`（L160，E）。
- [packages/ui/src/lib/components/scenes/ai/markdown-parse.ts](../packages/ui/src/lib/components/scenes/ai/markdown-parse.ts)：`MarkdownParseOptions`（L24，E）。
- [packages/ui/src/lib/components/scenes/ai/mermaid-host-sync.ts](../packages/ui/src/lib/components/scenes/ai/mermaid-host-sync.ts)：`MermaidHostRenderActionInput`（L8，E）；`MermaidHostRenderAction`（L17，J/E）；`createMermaidSourceSignature`（L26，E）；`getMermaidHostRenderAction`（L33，E）；`isCurrentMermaidRenderToken`（L54，E）。
- [packages/ui/src/lib/components/scenes/ai/mermaid-render.ts](../packages/ui/src/lib/components/scenes/ai/mermaid-render.ts)：`isMermaidLanguage`（L23，E）；`renderMermaidDiagram`（L49，E）；`stripMermaidSvgStyleElements`（L60，E）。
- [packages/ui/src/lib/components/scenes/ai/safe-html.ts](../packages/ui/src/lib/components/scenes/ai/safe-html.ts)：`escapeHtml`（L80，J/E）；`sanitizeLinkHref`（L89，J/E）；`isExternalLinkHref`（L94，J/E）；`sanitizeImageSrc`（L98，J/E）；`sanitizeMarkdownHtml`（L339，E）。
- [packages/ui/src/lib/components/scenes/ai/table/table-types.ts](../packages/ui/src/lib/components/scenes/ai/table/table-types.ts)：`AiTableColumnType`（L9，E）；`AiTableColumn`（L11，J/E）；`AiTableRow`（L20，J/E）；`AiTableData`（L33，J/E）；`AiTableEditorChangeAction`（L43，E）；`AiTableEditorChangePayload`（L50，J/E）；`AiTableCopyPayload`（L69，J/E）；`AiTableDownloadPayload`（L76，J/E）；`AiTableEditorProps`（L85，J/E）。
- [packages/ui/src/lib/components/scenes/charts/chart-theme.ts](../packages/ui/src/lib/components/scenes/charts/chart-theme.ts)：`DAISYUI_CHART_THEME_COLORS`（L10，J/E）；`DAISYUI_CHART_COLORS`（L28，E）；`resolveChartColors`（L42，E）。
- [packages/ui/src/lib/components/scenes/charts/chart-types.ts](../packages/ui/src/lib/components/scenes/charts/chart-types.ts)：`ChartDataValue`（L11，E）；`ChartDataItem`（L14，E）；`ChartAccessor`（L17，E）；`ChartType`（L20，E）；`ChartSize`（L23，E）；`ChartLineVariant`（L26，E）；`ChartTooltipMode`（L29，E）；`ChartSeries`（L31，J/E）；`ChartProps`（L52，J/E）。
- [packages/ui/src/lib/components/scenes/crud/crud-controller.svelte.ts](../packages/ui/src/lib/components/scenes/crud/crud-controller.svelte.ts)：`CrudFieldType`（L22，E）；`CrudText`（L42，E）；`CrudOption`（L45，E）；`CrudFieldDef`（L51，E）；`CrudListOptions`（L95，E）；`CrudApi`（L101，E）；`CrudResource`（L115，E）；`CrudTableColumn`（L135，E）；`CrudDef`（L144，E）；`CrudData`（L157，E）；`CrudController`（L166，E）；`CrudControllerOptions`（L184，E）。
- [packages/ui/src/lib/components/scenes/crud/crud-form-validation.ts](../packages/ui/src/lib/components/scenes/crud/crud-form-validation.ts)：`getCrudValidationIssue`（L5，J/E）。
- [packages/ui/src/lib/components/scenes/crud/crud-types.ts](../packages/ui/src/lib/components/scenes/crud/crud-types.ts)：`CrudPermissions`（L15，E）；`CrudFormVariant`（L25，E）；`CrudDensity`（L28，E）；`CrudFormConfig`（L31，E）；`CrudPaginationConfig`（L49，E）；`CrudToolbarStyle`（L65，E）；`CrudPageData`（L68，E）；`CrudPageProps`（L77，E）。
- [packages/ui/src/lib/components/scenes/crud/nav-adapter.ts](../packages/ui/src/lib/components/scenes/crud/nav-adapter.ts)：`NavAdapter`（L19，E）；`createBrowserNavAdapter`（L38，E）。
- [packages/ui/src/lib/components/scenes/error/error-presets.ts](../packages/ui/src/lib/components/scenes/error/error-presets.ts)：`ErrorPreset`（L11，E）；`ErrorPresetInfo`（L14，E）；`ERROR_PRESETS`（L26，E）；`resolveErrorPreset`（L35，E）。
- [packages/ui/src/lib/components/scenes/iam/auth-error-message.ts](../packages/ui/src/lib/components/scenes/iam/auth-error-message.ts)：`authErrorMessage`（L35，J/E）。
- [packages/ui/src/lib/components/scenes/iam/password-utils.ts](../packages/ui/src/lib/components/scenes/iam/password-utils.ts)：`normalizePassword`（L15，J/E）；`arePasswordsEqual`（L22，E）；`passwordPolicyError`（L27，E）；`passwordPolicyHint`（L41，J/E）。
- [packages/ui/src/lib/components/scenes/iam/permission-context.svelte.ts](../packages/ui/src/lib/components/scenes/iam/permission-context.svelte.ts)：`matchPermission`（L48，E）；`PermissionContext`（L67，E）。
- [packages/ui/src/lib/components/scenes/types.ts](../packages/ui/src/lib/components/scenes/types.ts)：`PasswordInputProps`（L17，E）；`AgreementDisplay`（L53，E）；`LoginFormData`（L67，E）；`LoginFormProps`（L80，E）；`RegisterField`（L128，E）；`RegisterFormData`（L133，E）；`RegisterFormProps`（L145，E）；`ChangePasswordFormData`（L186，E）；`ChangePasswordFormProps`（L195，E）；`ForgotPasswordFormData`（L220，E）；`ForgotPasswordFormProps`（L228，E）；`ResetPasswordFormData`（L260，E）；`ResetPasswordFormProps`（L269，E）；`AuthLoginMethod`（L300，E）；`PasswordPolicy`（L302，E）；`AuthPanelConfig`（L311，E）；`AuthPanelActions`（L324，E）；`AuthPanelMode`（L335，E）；`AuthPanelProps`（L338，E）；`UserProfileField`（L367，E）；`UserProfileData`（L372，E）；`UserProfileSubmitData`（L384，J/E）；`UserProfileProps`（L395，E）；`UploadState`（L428，E）；`UploadFile`（L433，E）；`UploadHandlerContext`（L455，E）；`UploadHandlerResult`（L463，E）；`UploadHandler`（L475，E）；`FileUploadProps`（L480，E）；`FileItem`（L514，E）；`FileListProps`（L534，E）；`ImageUploadProps`（L564，E）；`AvatarUploadProps`（L594，E）；`EncryptedInputProps`（L622，E）；`HashDisplayProps`（L652，E）；`MarkdownRendererProps`（L678，E）；`SignatureDisplayProps`（L697，E）。
- [packages/ui/src/lib/guide-storage.ts](../packages/ui/src/lib/guide-storage.ts)：`createGuideStorage`（L5，E）。
- [packages/ui/src/lib/guide-types.ts](../packages/ui/src/lib/guide-types.ts)：`GuideText`（L4，E）；`GuideStep`（L6，J/E）；`GuideTour`（L18，J/E）；`GuideArticle`（L30，J/E）；`GuideProgress`（L41，J/E）；`GuideOptions`（L47，J/E）；`GuideController`（L59，E）。
- [packages/ui/src/lib/guide.svelte.ts](../packages/ui/src/lib/guide.svelte.ts)：`resolveGuideText`（L13，E）；`createGuide`（L83，E）。
- [packages/ui/src/lib/i18n.svelte.ts](../packages/ui/src/lib/i18n.svelte.ts)：`createLocaleStore`（L76，E）；`getGlobalLocale`（L165，J/E）。
- [packages/ui/src/lib/internal/browser-safety.ts](../packages/ui/src/lib/internal/browser-safety.ts)：`ClipboardHostWriter`（L9，E）；`registerClipboardHostWriter`（L21，E）；`readStoredValue`（L33，E）；`writeStoredValue`（L51，E）；`writeTextToClipboard`（L73，E）。
- [packages/ui/src/lib/internal/form-context.ts](../packages/ui/src/lib/internal/form-context.ts)：`FORM_LAYOUT_CONTEXT`（L5，J/E）；`FORM_FIELD_CONTEXT`（L6，J/E）；`FORM_VISIBILITY_CONTEXT`（L7，J/E）；`getFormVisibilityContext`（L13，J/E）；`FormFieldContext`（L17，J/E）；`getFormLayoutContext`（L24，J/E）；`getFormFieldContext`（L28，J/E）。
- [packages/ui/src/lib/internal/form-validation.svelte.ts](../packages/ui/src/lib/internal/form-validation.svelte.ts)：`FormValidationIssue`（L8，J/E）；`resolveFormText`（L15，J/E）；`createControlValidation`（L51，J/E）。
- [packages/ui/src/lib/internal/icon-safety.ts](../packages/ui/src/lib/internal/icon-safety.ts)：`sanitizeInlineSvg`（L25，E）。
- [packages/ui/src/lib/internal/locale.ts](../packages/ui/src/lib/internal/locale.ts)：`readUILocale`（L14，J/E）；`changeUILocale`（L19，J/E）。
- [packages/ui/src/lib/message.svelte.ts](../packages/ui/src/lib/message.svelte.ts)：`MessageItem`（L14，E）；`message`（L102，E）。
- [packages/ui/src/lib/messagebox.svelte.ts](../packages/ui/src/lib/messagebox.svelte.ts)：`MessageBoxItem`（L16，E）；`messageBox`（L164，E）。
- [packages/ui/src/lib/messages.ts](../packages/ui/src/lib/messages.ts)：`UIMessageKey`（L16，J/E）；`getUILocale`（L44，E）；`setUILocale`（L51，E）。
- [packages/ui/src/lib/theme-config.ts](../packages/ui/src/lib/theme-config.ts)：`ThemeInfo`（L14，E）；`ThemeColorPreset`（L30，E）；`ThemeGroup`（L40，E）；`THEMES`（L52，E）；`THEME_GROUPS`（L75，E）；`DARK_THEMES`（L91，E）；`SUPPORTED_THEME_IDS`（L96，E）；`DEFAULT_THEME_COLOR`（L101，E）；`DEFAULT_THEME_COLOR_CSS_VAR`（L106，E）；`THEME_COLOR_PRESETS`（L111，E）；`DEFAULT_THEME`（L124，E）；`THEME_STORAGE_KEY`（L129，E）；`getThemeInfo`（L134，E）；`isDarkTheme`（L141，E）；`normalizeThemeId`（L148，E）；`normalizeHexColor`（L162，E）；`resolveThemeTone`（L179，E）；`ThemeBootstrapLocaleConfig`（L191，E）；`ThemeBootstrapScriptOptions`（L206，E）；`createThemeBootstrapScript`（L234，E）；`getThemeInitScript`（L267，E）；`applyTheme`（L279，E）；`getCurrentTheme`（L293，E）；`getSavedTheme`（L304，E）；`DAISYUI_THEMES_CONFIG`（L318，E）。
- [packages/ui/src/lib/toast.svelte.ts](../packages/ui/src/lib/toast.svelte.ts)：`ToastItem`（L13，E）；`toast`（L98，E）。
- [packages/ui/src/lib/types.ts](../packages/ui/src/lib/types.ts)：`DataAttributeValue`（L13，E）；`DataAttributes`（L15，J/E）；`Variant`（L24，E）；`Size`（L29，E）；`Position`（L34，E）；`Alignment`（L39，E）；`ButtonProps`（L44，E）；`BareButtonProps`（L74，E）；`InputProps`（L100，E）；`BareInputProps`（L162，E）；`TextareaProps`（L234，E）；`SelectOption`（L275，E）；`SelectProps`（L287，E）；`CheckboxProps`（L321，E）；`SwitchProps`（L345，E）；`ToggleCheckboxProps`（L363，E）；`ToggleRadioProps`（L378，J/E）；`RadioProps`（L396，E）；`BadgeProps`（L418，E）；`CardProps`（L434，E）；`ModalProps`（L456，E）；`DrawerProps`（L494，E）；`TooltipProps`（L524，E）；`SpinnerProps`（L545，E）；`ProgressProps`（L557，E）；`AlertProps`（L581，E）；`ToastProps`（L599，E）；`PaginationProps`（L617，E）；`BreadcrumbItem`（L664，E）；`BreadcrumbProps`（L676，E）；`TabItem`（L688，E）；`TabsContentContext`（L705，E）；`TabsProps`（L715，E）；`AvatarProps`（L739，E）；`DropdownItem`（L761，E）；`DropdownProps`（L777，E）；`FormLabelPosition`（L802，E）；`FormColSpan`（L805，E）；`FormText`（L808，E）；`FormLayoutOptions`（L811，E）；`FormLayoutProps`（L821，E）；`FormProps`（L826，J/E）；`FormFieldProps`（L848，E）；`SkeletonProps`（L876，E）；`EmptyProps`（L896，E）；`ResultProps`（L916，E）；`ConfirmProps`（L936，E）；`TagProps`（L962，E）；`TagInputProps`（L986，E）；`StepItem`（L1008，E）；`StepsProps`（L1020，E）；`IconButtonProps`（L1040，E）；`PopoverProps`（L1068，E）；`MessageBoxAction`（L1099，E）；`MessageBoxIconType`（L1104，E）；`MessageBoxOptions`（L1109，E）；`MessageBoxInstance`（L1137，E）；`MessageOptions`（L1145，E）。
- [packages/ui/src/lib/utils/platform.svelte.ts](../packages/ui/src/lib/utils/platform.svelte.ts)：`Platform`（L9，E）；`isMobile`（L61，E）；`isNativeApp`（L69，E）。
- [packages/ui/src/lib/utils.ts](../packages/ui/src/lib/utils.ts)：`cn`（L17，E）；`ForwardedDataAttributes`（L21，J/E）；`getDataAttributes`（L26，E）；`getVariantClass`（L115，E）；`getSizeClass`（L126，E）；`getInputSizeClass`（L138，E）；`getBadgeVariantClass`（L155，E）；`getBadgeSizeClass`（L162，E）；`getAlertVariantClass`（L169，E）；`getProgressVariantClass`（L188，E）；`generateId`（L195，E）；`portal`（L208，E）。

### 内部结构体补充定位

- [packages/ui/src/lib/components/compounds/Accordion.svelte](../packages/ui/src/lib/components/compounds/Accordion.svelte)：`Props`（L20，J/E）。
- [packages/ui/src/lib/components/compounds/ActionSheet.svelte](../packages/ui/src/lib/components/compounds/ActionSheet.svelte)：`Props`（L23，J/E）。
- [packages/ui/src/lib/components/compounds/AppBar.svelte](../packages/ui/src/lib/components/compounds/AppBar.svelte)：`Props`（L15，J/E）。
- [packages/ui/src/lib/components/compounds/BottomNav.svelte](../packages/ui/src/lib/components/compounds/BottomNav.svelte)：`BottomNavMaxWidth`（L15，J/E）；`Props`（L25，J/E）。
- [packages/ui/src/lib/components/compounds/Calendar.svelte](../packages/ui/src/lib/components/compounds/Calendar.svelte)：`Props`（L28，J/E）。
- [packages/ui/src/lib/components/compounds/Combobox.svelte](../packages/ui/src/lib/components/compounds/Combobox.svelte)：`Option`（L47，E）；`Props`（L58，J/E）。
- [packages/ui/src/lib/components/compounds/DataTable.svelte](../packages/ui/src/lib/components/compounds/DataTable.svelte)：`Column`（L82，E）。
- [packages/ui/src/lib/components/compounds/DatePicker.svelte](../packages/ui/src/lib/components/compounds/DatePicker.svelte)：`Props`（L33，J/E）。
- [packages/ui/src/lib/components/compounds/InfiniteScroll.svelte](../packages/ui/src/lib/components/compounds/InfiniteScroll.svelte)：`Props`（L16，J/E）。
- [packages/ui/src/lib/components/compounds/PageHeader.svelte](../packages/ui/src/lib/components/compounds/PageHeader.svelte)：`Props`（L24，J/E）。
- [packages/ui/src/lib/components/compounds/PullRefresh.svelte](../packages/ui/src/lib/components/compounds/PullRefresh.svelte)：`Props`（L14，J/E）。
- [packages/ui/src/lib/components/compounds/SafeArea.svelte](../packages/ui/src/lib/components/compounds/SafeArea.svelte)：`Props`（L14，J/E）。
- [packages/ui/src/lib/components/compounds/SwipeCell.svelte](../packages/ui/src/lib/components/compounds/SwipeCell.svelte)：`Props`（L23，J/E）。
- [packages/ui/src/lib/components/compounds/TableToolbar.svelte](../packages/ui/src/lib/components/compounds/TableToolbar.svelte)：`FilterFieldDef`（L54，E）；`TableToolbarProps`（L78，E）。
- [packages/ui/src/lib/components/compounds/Timeline.svelte](../packages/ui/src/lib/components/compounds/Timeline.svelte)：`Props`（L18，J/E）。
- [packages/ui/src/lib/components/control-size.ts](../packages/ui/src/lib/components/control-size.ts)：`FormControlSizeClasses`（L3，J/E）。
- [packages/ui/src/lib/components/primitives/Range.svelte](../packages/ui/src/lib/components/primitives/Range.svelte)：`Props`（L16，J/E）。
- [packages/ui/src/lib/components/primitives/Rating.svelte](../packages/ui/src/lib/components/primitives/Rating.svelte)：`Props`（L16，J/E）。
- [packages/ui/src/lib/components/scenes/ai/AiDocumentDownloadMenu.svelte](../packages/ui/src/lib/components/scenes/ai/AiDocumentDownloadMenu.svelte)：`AiDocumentDownloadMenuProps`（L14，J/E）。
- [packages/ui/src/lib/components/scenes/ai/AiDocumentEditor.svelte](../packages/ui/src/lib/components/scenes/ai/AiDocumentEditor.svelte)：`SelectionToolbarPosition`（L48，J/E）；`CodePreviewState`（L59，J/E）；`MermaidRenderCacheEntry`（L68，J/E）；`SelectionFormatState`（L79，J/E）；`PreviewSelectionState`（L104，J/E）；`ColorSwatchOption`（L113，J/E）；`HoveredLinkState`（L120，J/E）；`SelectionMenuKind`（L135，J/E）。
- [packages/ui/src/lib/components/scenes/ai/document-download.ts](../packages/ui/src/lib/components/scenes/ai/document-download.ts)：`BrowserPdfRenderHost`（L395，J/E）。
- [packages/ui/src/lib/components/scenes/ai/document-parse.ts](../packages/ui/src/lib/components/scenes/ai/document-parse.ts)：`MarkdownRenderState`（L82，J/E）；`MarkdownHtmlChunkRenderResult`（L91，J/E）。
- [packages/ui/src/lib/components/scenes/ai/document-types.ts](../packages/ui/src/lib/components/scenes/ai/document-types.ts)：`BivariantCallback`（L159，E）。
- [packages/ui/src/lib/components/scenes/ai/editor-markdown-extensions.ts](../packages/ui/src/lib/components/scenes/ai/editor-markdown-extensions.ts)：`EditorSpanToken`（L22，J/E）；`EditorAlignToken`（L30，J/E）；`EditorInlineFormatToken`（L37，J/E）。
- [packages/ui/src/lib/components/scenes/ai/mermaid-render.ts](../packages/ui/src/lib/components/scenes/ai/mermaid-render.ts)：`MermaidApi`（L15，E）。
- [packages/ui/src/lib/components/scenes/ai/safe-html.ts](../packages/ui/src/lib/components/scenes/ai/safe-html.ts)：`ParsedHtmlAttributes`（L70，J/E）。
- [packages/ui/src/lib/components/scenes/ai/table/AiTableEditor.svelte](../packages/ui/src/lib/components/scenes/ai/table/AiTableEditor.svelte)：`ExtractedArrayChunk`（L31，J/E）；`AiTableRowDropPosition`（L38，J/E）；`ReorderedTableResult`（L40，J/E）。
- [packages/ui/src/lib/components/scenes/app/FeedbackModal.svelte](../packages/ui/src/lib/components/scenes/app/FeedbackModal.svelte)：`FeedbackType`（L23，J/E）；`FeedbackData`（L25，J/E）；`FeedbackLabels`（L32，E）；`Props`（L56，J/E）。
- [packages/ui/src/lib/components/scenes/app/LanguageSwitch.svelte](../packages/ui/src/lib/components/scenes/app/LanguageSwitch.svelte)：`Language`（L37，J/E）；`Props`（L43，J/E）。
- [packages/ui/src/lib/components/scenes/app/SettingsLayout.svelte](../packages/ui/src/lib/components/scenes/app/SettingsLayout.svelte)：`SettingsSection`（L27，J/E）。
- [packages/ui/src/lib/components/scenes/app/SettingsModal.svelte](../packages/ui/src/lib/components/scenes/app/SettingsModal.svelte)：`Props`（L19，J/E）。
- [packages/ui/src/lib/components/scenes/app/ThemeColorPicker.svelte](../packages/ui/src/lib/components/scenes/app/ThemeColorPicker.svelte)：`ThemeColorPreset`（L18，J/E）；`Props`（L23，J/E）。
- [packages/ui/src/lib/components/scenes/app/ThemeSelector.svelte](../packages/ui/src/lib/components/scenes/app/ThemeSelector.svelte)：`Props`（L26，J/E）。
- [packages/ui/src/lib/components/scenes/app/ThemeToggle.svelte](../packages/ui/src/lib/components/scenes/app/ThemeToggle.svelte)：`Props`（L23，J/E）。
- [packages/ui/src/lib/components/scenes/charts/renderers/LineChart.svelte](../packages/ui/src/lib/components/scenes/charts/renderers/LineChart.svelte)：`SegmentedLinePoint`（L20，J/E）；`SegmentedLineSeries`（L27，J/E）；`SegmentedLineCoordinate`（L40，J/E）；`SegmentedLineTooltipItem`（L47，J/E）；`SegmentedLineTooltip`（L56，J/E）；`Props`（L69，J/E）。
- [packages/ui/src/lib/components/scenes/crud/CrudDetailDrawer.svelte](../packages/ui/src/lib/components/scenes/crud/CrudDetailDrawer.svelte)：`FieldDef`（L19，J/E）。
- [packages/ui/src/lib/components/scenes/crud/CrudDetailPanel.svelte](../packages/ui/src/lib/components/scenes/crud/CrudDetailPanel.svelte)：`FieldDef`（L19，J/E）。
- [packages/ui/src/lib/components/scenes/crud/CrudFilterBar.svelte](../packages/ui/src/lib/components/scenes/crud/CrudFilterBar.svelte)：`FilterFieldDef`（L15，J/E）。
- [packages/ui/src/lib/components/scenes/crud/CrudPage.svelte](../packages/ui/src/lib/components/scenes/crud/CrudPage.svelte)：`FieldDef`（L37，J/E）；`CrudApi`（L42，E）；`CrudDef`（L56，E）。
- [packages/ui/src/lib/components/scenes/crypto/EncryptedInput.svelte](../packages/ui/src/lib/components/scenes/crypto/EncryptedInput.svelte)：`Props`（L18，J/E）。
- [packages/ui/src/lib/components/scenes/guide/GuideHost.svelte](../packages/ui/src/lib/components/scenes/guide/GuideHost.svelte)：`Props`（L15，J/E）。
- [packages/ui/src/lib/components/scenes/guide/HelpCenter.svelte](../packages/ui/src/lib/components/scenes/guide/HelpCenter.svelte)：`Props`（L11，J/E）。
- [packages/ui/src/lib/components/scenes/iam/PasswordInput.svelte](../packages/ui/src/lib/components/scenes/iam/PasswordInput.svelte)：`Props`（L22，J/E）。
- [packages/ui/src/lib/components/scenes/iam/PermGuard.svelte](../packages/ui/src/lib/components/scenes/iam/PermGuard.svelte)：`Props`（L25，J/E）。
- [packages/ui/src/lib/components/scenes/iam/permission-context.svelte.ts](../packages/ui/src/lib/components/scenes/iam/permission-context.svelte.ts)：`PermissionContextValue`（L61，E）。
- [packages/ui/src/lib/internal/form-context.ts](../packages/ui/src/lib/internal/form-context.ts)：`FormVisibilityContext`（L9，J/E）。
- [packages/ui/src/lib/internal/form-validation.svelte.ts](../packages/ui/src/lib/internal/form-validation.svelte.ts)：`FormControl`（L13，J/E）。

补充扫描定位 74 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。

## JSDOC-21 · @h-ai/vecdb

- [ ] 完成主清单通用关闭标准；基线顶层导出 35，缺 JSDoc 3，缺示例 26。

### 顶层导出定位

- [packages/vecdb/src/providers/vecdb-provider-base.ts](../packages/vecdb/src/providers/vecdb-provider-base.ts)：`VecdbProvider`（L35，E）；`VecdbOpsContext`（L53，E）；`CollectionDriver`（L74，E）；`VectorDriver`（L89，E）；`logVecdbOperation`（L128，J/E）；`createBaseCollectionOps`（L193，E）；`createBaseVectorOps`（L260，E）。
- [packages/vecdb/src/providers/vecdb-provider-chroma.ts](../packages/vecdb/src/providers/vecdb-provider-chroma.ts)：`createChromaProvider`（L127，E）。
- [packages/vecdb/src/providers/vecdb-provider-lancedb.ts](../packages/vecdb/src/providers/vecdb-provider-lancedb.ts)：`createLancedbProvider`（L92，E）。
- [packages/vecdb/src/providers/vecdb-provider-pgvector.ts](../packages/vecdb/src/providers/vecdb-provider-pgvector.ts)：`createPgvectorProvider`（L50，E）。
- [packages/vecdb/src/providers/vecdb-provider-qdrant.ts](../packages/vecdb/src/providers/vecdb-provider-qdrant.ts)：`createQdrantProvider`（L110，E）。
- [packages/vecdb/src/vecdb-config.ts](../packages/vecdb/src/vecdb-config.ts)：`VecdbType`（L23，E）；`DistanceMetricSchema`（L34，E）；`DistanceMetric`（L37，E）；`VecdbOperationLogConfigSchema`（L39，J/E）；`VecdbOperationLogConfig`（L46，J/E）；`LancedbConfig`（L72，E）；`PgvectorConfig`（L127，E）；`QdrantConfig`（L151，E）；`ChromaConfig`（L194，E）；`VecdbConfigSchema`（L203，E）；`VecdbConfig`（L211，E）；`VecdbConfigInput`（L219，E）。
- [packages/vecdb/src/vecdb-i18n.ts](../packages/vecdb/src/vecdb-i18n.ts)：`vecdbM`（L25，E）。
- [packages/vecdb/src/vecdb-types.ts](../packages/vecdb/src/vecdb-types.ts)：`HaiVecdbError`（L40，E）；`VecdbConnection`（L343，E）。

### 内部结构体补充定位

- [packages/vecdb/src/providers/vecdb-provider-base.ts](../packages/vecdb/src/providers/vecdb-provider-base.ts)：`VecdbOperationCategory`（L103，J/E）。
- [packages/vecdb/src/providers/vecdb-provider-chroma.ts](../packages/vecdb/src/providers/vecdb-provider-chroma.ts)：`ChromaCollection`（L36，E）；`ChromaWriteParams`（L45，J/E）；`ChromaQueryResult`（L52，J/E）；`ChromaClient`（L59，J/E）；`ChromaModule`（L68，E）。
- [packages/vecdb/src/providers/vecdb-provider-lancedb.ts](../packages/vecdb/src/providers/vecdb-provider-lancedb.ts)：`LanceConnection`（L33，E）；`LanceTable`（L41，E）；`LanceMergeInsertBuilder`（L50，E）；`LanceSearchQuery`（L57，E）；`CollectionMeta`（L80，E）。
- [packages/vecdb/src/providers/vecdb-provider-pgvector.ts](../packages/vecdb/src/providers/vecdb-provider-pgvector.ts)：`PgPool`（L26，E）；`PgModule`（L32，E）。
- [packages/vecdb/src/providers/vecdb-provider-qdrant.ts](../packages/vecdb/src/providers/vecdb-provider-qdrant.ts)：`QdrantClient`（L41，E）；`QdrantCollectionInfo`（L52，E）；`QdrantGetCollectionError`（L58，E）；`QdrantGetCollectionMethod`（L63，E）；`QdrantModule`（L69，E）。
- [packages/vecdb/src/vecdb-i18n.ts](../packages/vecdb/src/vecdb-i18n.ts)：`VecdbMessageKey`（L17，E）。

补充扫描定位 19 个内部结构声明。关键逻辑与示例验收须结合主清单该模块任务执行。
