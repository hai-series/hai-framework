import type { DemoId } from '#lib/demo-input.js'
import * as m from '#lib/paraglide/messages.js'

export type PanelGuideId = 'setup-panel' | 'chat-panel' | 'memory-panel' | 'image-panel' | 'tts-panel' | 'asr-panel' | 'mic-panel'
type GuideId = DemoId | PanelGuideId

interface ApiExample {
  api: string
  code: string
}

const examples: Record<GuideId, ApiExample> = {
  'setup-panel': {
    api: 'ai.init · ai.close',
    code: `import { ai } from '@h-ai/ai'
import type { AIConfigInput, AIInitOptions } from '@h-ai/ai'

async function startAi(config: AIConfigInput, options?: AIInitOptions) {
  const initialized = await ai.init(config, options)
  if (!initialized.success) return initialized
  return { close: () => ai.close() }
}`,
  },
  'llm': {
    api: 'ai.llm.ask',
    code: `import { ai } from '@h-ai/ai'

const answer = await ai.llm.ask('What does the deployment checklist cover?', {
  enablePersist: false,
})
if (answer.success) process.stdout.write(answer.data + '\\n')`,
  },
  'stream': {
    api: 'ai.stream.createProcessor',
    code: `import { ai } from '@h-ai/ai'

const processor = ai.stream.createProcessor()
processor.process({
  id: 'sample', object: 'chat.completion.chunk', created: 0, model: 'fixture',
  choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
})
const text = processor.getResult().content`,
  },
  'structured': {
    api: 'ai.llm.generateObject',
    code: `import { ai } from '@h-ai/ai'
import { z } from 'zod'

const result = await ai.llm.generateObject({
  schema: z.object({ title: z.string(), points: z.array(z.string()) }),
  messages: [{ role: 'user', content: 'Plan a small release.' }],
  systemPrompt: 'Return a title and up to three points.',
  maxRepairs: 1,
  responseFormat: 'json_object',
})`,
  },
  'reasoning': {
    api: 'ai.reasoning.run',
    code: `import { ai } from '@h-ai/ai'

const result = await ai.reasoning.run('Which service needs a rollback plan?', {
  strategy: 'cot', maxRounds: 1, enablePersist: false,
})`,
  },
  'file': {
    api: 'ai.file.parse',
    code: `import { ai } from '@h-ai/ai'

const result = await ai.file.parse({
  content: '<h1>Playground</h1><p>Hai framework</p>',
  filename: 'sample.html',
})`,
  },
  'embedding': {
    api: 'ai.embedding.embedText',
    code: `import { ai } from '@h-ai/ai'

const result = await ai.embedding.embedText('Release checklist')
const preview = result.success
  ? { dimensions: result.data.length, preview: result.data.slice(0, 12) }
  : result`,
  },
  'rerank': {
    api: 'ai.rerank.rerank',
    code: `import { ai } from '@h-ai/ai'

const result = await ai.rerank.rerank({
  query: 'How do we deploy?',
  documents: [
    { id: 'deploy', text: 'Check database access before deployment.' },
    { id: 'calendar', text: 'Design reviews are on Tuesdays.' },
  ],
  topN: 2,
  returnDocuments: true,
})`,
  },
  'retrieval': {
    api: 'ai.retrieval.retrieve',
    code: `import { ai } from '@h-ai/ai'

const result = await ai.retrieval.retrieve({
  query: 'How do we deploy?',
  sources: ['playground-handbook'],
  topK: 3,
})`,
  },
  'rag': {
    api: 'ai.rag.query',
    code: `import { ai } from '@h-ai/ai'

const result = await ai.rag.query('How do we deploy?', {
  sources: ['playground-handbook'],
  topK: 3,
  enablePersist: false,
})`,
  },
  'knowledge': {
    api: 'ai.knowledge.setup · ai.knowledge.ingest · ai.knowledge.retrieve',
    code: `import { ai } from '@h-ai/ai'

async function indexSample() {
  const collection = 'hai_playground_demo_knowledge'
  const ready = await ai.knowledge.setup({ collection })
  if (!ready.success) return ready
  const indexed = await ai.knowledge.ingest({
    collection, documentId: 'example-v1', title: 'Release checklist',
    content: 'Check database access and record a rollback plan.',
    enableEntityExtraction: false,
  })
  if (!indexed.success) return indexed
  return ai.knowledge.retrieve('rollback', { collection, topK: 3 })
}`,
  },
  'persona': {
    api: 'ai.persona.save · ai.persona.compose · ai.persona.remove',
    code: `import { ai } from '@h-ai/ai'

async function describePersona(objectId: string) {
  const id = crypto.randomUUID()
  const saved = await ai.persona.save({
    id, objectId, name: 'Assistant',
    systemPrompt: 'Help with release preparation.',
    traits: ['Concise', 'Cite evidence'],
  })
  if (!saved.success) return saved
  try {
    return await ai.persona.compose(id, { objectId })
  }
  finally {
    await ai.persona.remove(id, { objectId })
  }
}`,
  },
  'context': {
    api: 'ai.context.createManager · getTokenUsage · getMessages',
    code: `import { ai } from '@h-ai/ai'

function inspectContext(objectId: string) {
  const manager = ai.context.createManager({
    scope: { objectId, sessionId: 'release' },
    systemPrompt: 'Help with the release.',
    compress: { maxTokens: 512 },
  })
  if (!manager.success) return manager
  return {
    usage: manager.data.getTokenUsage(),
    messages: manager.data.getMessages(),
  }
}`,
  },
  'token': {
    api: 'ai.token.estimateText · ai.token.estimateMessages',
    code: `import { ai } from '@h-ai/ai'

const content = 'Plan a release.'
const textTokens = ai.token.estimateText(content)
const messageTokens = ai.token.estimateMessages([{ role: 'user', content }])`,
  },
  'summary': {
    api: 'ai.summary.summarize',
    code: `import { ai } from '@h-ai/ai'

const result = await ai.summary.summarize([
  { role: 'user', content: 'We need a rollback plan and a release owner.' },
  { role: 'assistant', content: 'I recorded those two actions.' },
])`,
  },
  'compress': {
    api: 'ai.compress.tryCompress',
    code: `import { ai } from '@h-ai/ai'

const result = await ai.compress.tryCompress([
  { role: 'assistant', content: 'Previous discussion. '.repeat(100) },
  { role: 'user', content: 'What is the next step?' },
], { strategy: 'sliding-window', maxTokens: 80, preserveLastN: 1 })`,
  },
  'tools': {
    api: 'ai.tools.define · ai.tools.createRegistry · execute',
    code: `import { ai } from '@h-ai/ai'
import { z } from 'zod'

async function countWords() {
  const registry = ai.tools.createRegistry()
  const registered = registry.register(ai.tools.define({
    name: 'count_words',
    description: 'Count words separated by whitespace',
    parameters: z.object({ text: z.string().min(1).max(4000) }),
    handler: ({ text }) => ({ words: text.trim().split(/\\s+/u).length }),
  }))
  if (!registered.success) return registered
  return registry.execute({
    id: 'sample-call', type: 'function',
    function: { name: 'count_words', arguments: '{"text":"two words"}' },
  })
}`,
  },
  'mcp': {
    api: 'ai.mcp.callTool · ai.mcp.readResource · ai.mcp.getPrompt',
    code: `import { ai } from '@h-ai/ai'

const [tool, resource, prompt] = await Promise.all([
  ai.mcp.callTool('playground_echo', { text: 'Hello' }),
  ai.mcp.readResource('playground://handbook'),
  ai.mcp.getPrompt('playground_explain', { topic: 'releases' }),
])`,
  },
  'mcp-remote': {
    api: 'ai.mcp.services.invoke',
    code: `import { ai } from '@h-ai/ai'
import type { MCPServiceAuthorization } from '@h-ai/ai'

function searchManual(access: MCPServiceAuthorization) {
  return ai.mcp.services.invoke({
    serviceId: 'playground-manuals', tool: 'search_manual',
    arguments: { query: 'release checklist' },
  }, access)
}`,
  },
  'mcp-job': {
    api: 'ai.mcp.services.invoke',
    code: `import { ai } from '@h-ai/ai'
import type { MCPServiceAuthorization } from '@h-ai/ai'

function extractDocument(access: MCPServiceAuthorization) {
  return ai.mcp.services.invoke({
    serviceId: 'playground-documents', tool: 'documents.extract',
    arguments: { fileId: 'playground-handbook.txt' },
  }, access)
}`,
  },
  'a2a': {
    api: 'ai.a2a.getAgentCard · ai.a2a.handleRequest',
    code: `import { ai } from '@h-ai/ai'

function sendToEcho(agentId: string) {
  const card = ai.a2a.getAgentCard()
  if (!card.success) return card
  const id = crypto.randomUUID()
  return ai.a2a.handleRequest({
    jsonrpc: '2.0', id, method: 'SendMessage',
    params: { message: {
      role: 'ROLE_USER', messageId: id, parts: [{ text: 'Hello' }],
    } },
  }, { agentId })
}`,
  },
  'acp': {
    api: 'ai.acp.scoped · plan · run',
    code: `import { ai } from '@h-ai/ai'
import type { ACPPlatformRequest } from '@h-ai/ai'

async function askAgent(tenantId: string, userId: string) {
  const agent = ai.acp.scoped({ tenantId, userId })
  const options: ACPPlatformRequest = {
    agentId: 'playground-acp',
    execution: { mode: 'task' },
    permissions: { profile: 'read-only', approval: 'never' },
  }
  const plan = await agent.plan(options)
  if (!plan.success) return plan
  return agent.run({ ...options, prompt: 'List three release checks.' })
}`,
  },
  'audio-capabilities': {
    api: 'ai.audio.getCapabilities',
    code: `import { ai } from '@h-ai/ai'

const transcription = ai.audio.getCapabilities({ operation: 'transcribe' })
const synthesis = ai.audio.getCapabilities({ operation: 'synthesize' })`,
  },
  'tts-stream': {
    api: 'ai.audio.synthesizeStream',
    code: `import { ai } from '@h-ai/ai'

let chunks = 0
let bytes = 0
for await (const event of ai.audio.synthesizeStream({
  text: { id: 'intro', text: 'Hello from Hai' },
  format: 'wav',
})) {
  if (event.type === 'audio') {
    chunks += 1
    bytes += event.data.byteLength
  }
}`,
  },
  'chat-panel': {
    api: 'ai.llm.chatStream · ai.memory.scoped',
    code: `import { ai } from '@h-ai/ai'
import type { ChatMessage } from '@h-ai/ai'

async function chat(objectId: string, sessionId: string, messages: ChatMessage[]) {
  const memory = ai.memory.scoped({ objectId, scope: { topicId: 'release' } })
  const enriched = await memory.injectMemories(messages, {
    topK: 6, maxTokens: 1200, position: 'system',
  })
  if (!enriched.success) return enriched
  return ai.llm.chatStream({
    messages: enriched.data, objectId, sessionId,
    enablePersist: false, max_tokens: 1200,
  })
}`,
  },
  'memory-panel': {
    api: 'ai.memory.scoped · add · recall · remove',
    code: `import { ai } from '@h-ai/ai'

async function tryMemory(objectId: string) {
  const memory = ai.memory.scoped({ objectId, scope: { topicId: 'release' } })
  const saved = await memory.add({
    content: 'Prefer concise release notes.', type: 'preference', importance: 0.8,
  })
  if (!saved.success) return saved
  const matches = await memory.recall('release note preferences', { topK: 20 })
  const removed = await memory.remove(saved.data.id)
  return { matches, removed }
}`,
  },
  'image-panel': {
    api: 'ai.image.generate',
    code: `import { ai } from '@h-ai/ai'
import type { ReferenceImage } from '@h-ai/ai'

function draw(referenceImages?: ReferenceImage[]) {
  return ai.image.generate({
    prompt: 'A blue paper boat in a quiet harbor',
    size: { width: 1024, height: 1024 },
    referenceImages,
  })
}`,
  },
  'tts-panel': {
    api: 'ai.audio.synthesize',
    code: `import { ai } from '@h-ai/ai'

const result = await ai.audio.synthesize({
  text: 'Hello from Hai',
  voice: 'mimo_default',
  instruction: 'Read slowly and clearly.',
  format: 'wav',
})`,
  },
  'asr-panel': {
    api: 'ai.audio.transcribe · ai.audio.transcribeStream',
    code: `import { ai } from '@h-ai/ai'

async function transcribeFile(data: Uint8Array, format: 'wav' | 'mp3') {
  const request = { audio: { data, format }, language: 'en' }
  return ai.audio.transcribe(request)
}

function streamFile(data: Uint8Array, format: 'wav' | 'mp3', signal: AbortSignal) {
  return ai.audio.transcribeStream({ audio: { data, format }, language: 'en', signal })
}`,
  },
  'mic-panel': {
    api: 'ai.audio.transcribe',
    code: `import { ai } from '@h-ai/ai'

async function transcribeSnapshot(snapshot: Uint8Array) {
  const result = await ai.audio.transcribe({ audio: { data: snapshot, format: 'wav' } })
  if (!result.success) return result
  return result.data.text
}`,
  },
}

const explanations = {
  'setup-panel': { params: m.guide_setup_panel_params, output: m.guide_setup_panel_output, config: m.guide_setup_panel_config },
  'llm': { params: m.guide_llm_params, output: m.guide_llm_output, config: m.guide_llm_config },
  'stream': { params: m.guide_stream_params, output: m.guide_stream_output, config: m.guide_stream_config },
  'structured': { params: m.guide_structured_params, output: m.guide_structured_output, config: m.guide_structured_config },
  'reasoning': { params: m.guide_reasoning_params, output: m.guide_reasoning_output, config: m.guide_reasoning_config },
  'file': { params: m.guide_file_params, output: m.guide_file_output, config: m.guide_file_config },
  'embedding': { params: m.guide_embedding_params, output: m.guide_embedding_output, config: m.guide_embedding_config },
  'rerank': { params: m.guide_rerank_params, output: m.guide_rerank_output, config: m.guide_rerank_config },
  'retrieval': { params: m.guide_retrieval_params, output: m.guide_retrieval_output, config: m.guide_retrieval_config },
  'rag': { params: m.guide_rag_params, output: m.guide_rag_output, config: m.guide_rag_config },
  'knowledge': { params: m.guide_knowledge_params, output: m.guide_knowledge_output, config: m.guide_knowledge_config },
  'persona': { params: m.guide_persona_params, output: m.guide_persona_output, config: m.guide_persona_config },
  'context': { params: m.guide_context_params, output: m.guide_context_output, config: m.guide_context_config },
  'token': { params: m.guide_token_params, output: m.guide_token_output, config: m.guide_token_config },
  'summary': { params: m.guide_summary_params, output: m.guide_summary_output, config: m.guide_summary_config },
  'compress': { params: m.guide_compress_params, output: m.guide_compress_output, config: m.guide_compress_config },
  'tools': { params: m.guide_tools_params, output: m.guide_tools_output, config: m.guide_tools_config },
  'mcp': { params: m.guide_mcp_params, output: m.guide_mcp_output, config: m.guide_mcp_config },
  'mcp-remote': { params: m.guide_mcp_remote_params, output: m.guide_mcp_remote_output, config: m.guide_mcp_remote_config },
  'mcp-job': { params: m.guide_mcp_job_params, output: m.guide_mcp_job_output, config: m.guide_mcp_job_config },
  'a2a': { params: m.guide_a2a_params, output: m.guide_a2a_output, config: m.guide_a2a_config },
  'acp': { params: m.guide_acp_params, output: m.guide_acp_output, config: m.guide_acp_config },
  'audio-capabilities': { params: m.guide_audio_capabilities_params, output: m.guide_audio_capabilities_output, config: m.guide_audio_capabilities_config },
  'tts-stream': { params: m.guide_tts_stream_params, output: m.guide_tts_stream_output, config: m.guide_tts_stream_config },
  'chat-panel': { params: m.guide_chat_panel_params, output: m.guide_chat_panel_output, config: m.guide_chat_panel_config },
  'memory-panel': { params: m.guide_memory_panel_params, output: m.guide_memory_panel_output, config: m.guide_memory_panel_config },
  'image-panel': { params: m.guide_image_panel_params, output: m.guide_image_panel_output, config: m.guide_image_panel_config },
  'tts-panel': { params: m.guide_tts_panel_params, output: m.guide_tts_panel_output, config: m.guide_tts_panel_config },
  'asr-panel': { params: m.guide_asr_panel_params, output: m.guide_asr_panel_output, config: m.guide_asr_panel_config },
  'mic-panel': { params: m.guide_mic_panel_params, output: m.guide_mic_panel_output, config: m.guide_mic_panel_config },
}

export function labApiExample(id: GuideId) {
  return {
    ...examples[id],
    ...explanations[id],
  }
}
