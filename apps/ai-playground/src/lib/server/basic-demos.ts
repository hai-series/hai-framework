import type { ChatMessage } from '@h-ai/ai'
import type { HaiResult } from '@h-ai/core'
import type { BasicDemoId } from '#lib/demo-input.js'
import { randomUUID } from 'node:crypto'
import { ai, HaiAIError } from '@h-ai/ai'
import { core, err, ok } from '@h-ai/core'
import { z } from 'zod'

const demoSourceId = 'playground-handbook'
const demoCollection = 'hai_playground_demo_knowledge'
const demoDocumentId = 'playground-handbook-v1'
const handbook = 'The Hai Playground handbook recommends using a shared database in production. The deployment checklist requires checking database access, assigning a service owner, and recording a rollback plan. The support team reviews new requests on weekdays.'
const sampleDocuments = [
  { id: 'deployment', text: handbook },
  { id: 'releases', text: 'A release note describes the change and links the migration guide.' },
  { id: 'calendar', text: 'The design team reviews its mockups every Tuesday.' },
]
const structuredOutput = z.object({
  title: z.string(),
  points: z.array(z.string()),
})
let handbookPreparation: Promise<HaiResult<void>> | undefined

/** 只初始化框架提供的固定示例，用户查询不会进入公共向量集合。 */
async function prepareHandbook(): Promise<HaiResult<void>> {
  const collection = demoCollection
  const setup = await ai.knowledge.setup({ collection })
  if (!setup.success)
    return setup
  const documents = await ai.knowledge.listDocuments({ collection, limit: 1 })
  if (!documents.success)
    return documents
  if (documents.data.some(document => document.documentId === demoDocumentId))
    return ok(undefined)
  const ingested = await ai.knowledge.ingest({
    collection,
    documentId: demoDocumentId,
    content: handbook,
    title: 'Hai Playground handbook',
    enableEntityExtraction: false,
  })
  return ingested.success
    ? ok(undefined)
    : ingested
}

/** 服务端模型场景代表管理员已为向量和重排序配置兼容端点。 */
export function basicDemoUnavailable(): Partial<Record<BasicDemoId, string>> {
  const scenarios = ai.config?.llm.scenarios
  const unavailable: Partial<Record<BasicDemoId, string>> = {}
  if (!scenarios?.embedding) {
    unavailable.embedding = 'embedding'
    unavailable.retrieval = 'embedding'
    unavailable.rag = 'embedding'
    unavailable.knowledge = 'embedding'
  }
  if (!scenarios?.rerank)
    unavailable.rerank = 'rerank'
  return unavailable
}

export async function runBasicDemo(id: BasicDemoId, input: string, signal: AbortSignal, browserId: string): Promise<HaiResult<unknown>> {
  const messages: ChatMessage[] = [
    { role: 'user', content: input },
  ]
  switch (id) {
    case 'llm':
      return ai.llm.ask(input, { enablePersist: false, signal })
    case 'stream': {
      // 本地构造提供方形状的流事件，避免理解处理器时消耗模型请求。
      const processor = ai.stream.createProcessor()
      let chunks = 0
      const segments = input.match(/.{1,8}/gsu) ?? []
      for (const content of segments) {
        processor.process({
          id: 'playground-stream',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'local-fixture',
          choices: [
            {
              index: 0,
              delta: { content },
              finish_reason: null,
            },
          ],
        })
        chunks++
      }
      return ok({ chunks, text: processor.getResult().content })
    }
    case 'structured':
      return ai.llm.generateObject({
        schema: structuredOutput,
        messages,
        systemPrompt: 'Return a title and up to three short points in the same language as the input.',
        responseFormat: 'json_object',
        maxRepairs: 1,
        signal,
      })
    case 'token':
      return ok({
        textTokens: ai.token.estimateText(input),
        messageTokens: ai.token.estimateMessages(messages),
      })
    case 'summary':
      return ai.summary.summarize(messages)
    case 'compress':
      return ai.compress.tryCompress([
        { role: 'user', content: input },
        {
          role: 'assistant',
          content: 'Previous discussion about a proposed workflow. '.repeat(40),
        },
        { role: 'user', content: 'Summarize the next step.' },
      ], { strategy: 'sliding-window', maxTokens: 80, preserveLastN: 1 })
    case 'embedding': {
      const vector = await ai.embedding.embedText(input)
      return vector.success
        ? ok({
            dimensions: vector.data.length,
            preview: vector.data.slice(0, 12),
          })
        : vector
    }
    case 'rerank':
      return ai.rerank.rerank({
        query: input,
        documents: sampleDocuments,
        returnDocuments: true,
        topN: 3,
      })
    case 'retrieval':
    case 'rag':
    case 'knowledge': {
      // 并行请求共享进程内初始化，失败后允许重试。固定文档 ID 防止每次查询新增版本。
      handbookPreparation ??= prepareHandbook().then((result) => {
        if (!result.success)
          handbookPreparation = undefined
        return result
      }, () => {
        handbookPreparation = undefined
        return err(HaiAIError.RESOURCE_OPERATION_FAILED, 'Playground handbook preparation failed')
      })
      const ready = await handbookPreparation
      if (!ready.success)
        return ready
      signal.throwIfAborted()
      if (id === 'knowledge') {
        const documents = await ai.knowledge.listDocuments({ collection: demoCollection, limit: 1 })
        if (!documents.success)
          return documents
        const retrieval = await ai.knowledge.retrieve(input, { collection: demoCollection, topK: 3, enableEntityBoost: false })
        return retrieval.success
          ? ok({ documents: documents.data, matches: retrieval.data })
          : retrieval
      }
      const options = {
        sources: [demoSourceId],
        topK: 3,
      }
      return id === 'retrieval'
        ? ai.retrieval.retrieve({ query: input, ...options })
        : ai.rag.query(input, { ...options, enablePersist: false, signal })
    }
    case 'persona': {
      const personaId = randomUUID()
      const objectId = browserId
      const saved = await ai.persona.save({
        id: personaId,
        objectId,
        name: 'Playground assistant',
        systemPrompt: input,
        traits: ['Concise', 'Cite available evidence'],
      })
      if (!saved.success)
        return saved
      const composed = await ai.persona.compose(personaId, { objectId }).finally(async () => {
        const removed = await ai.persona.remove(personaId, { objectId })
        if (!removed.success)
          core.logger.warn('AI Playground persona cleanup failed', { code: removed.error.code })
      })
      return composed.success
        ? ok({ systemPrompt: composed.data, traits: saved.data.traits })
        : composed
    }
    case 'context': {
      // 读取初始上下文及预算，避免公共演示持续写入会话历史和删除墓碑。
      const manager = ai.context.createManager({
        scope: { objectId: browserId, sessionId: 'playground-context' },
        systemPrompt: input,
        compress: { maxTokens: 512 },
      })
      if (!manager.success)
        return manager
      const usage = manager.data.getTokenUsage()
      if (!usage.success)
        return usage
      const current = manager.data.getMessages()
      return current.success
        ? ok({ usage: usage.data, messages: current.data })
        : current
    }
    case 'reasoning': {
      const result = await ai.reasoning.run(input, {
        strategy: 'cot',
        systemPrompt: 'Provide a concise final answer in the same language as the input. Include a brief explanation if it is useful to the reader.',
        maxRounds: 1,
        enablePersist: false,
        signal,
      })
      // 只返回公开答案和运行信息，排除供应商内部推理与完整消息。
      return result.success
        ? ok({ answer: result.data.answer, strategy: result.data.strategy, rounds: result.data.rounds })
        : result
    }
    case 'file':
      return ai.file.parse({ content: input, filename: 'sample.html' })
  }
}
