import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ai } from '@h-ai/ai'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { basicDemoUnavailable, runBasicDemo } from '../src/lib/server/basic-demos.js'

const collection = 'hai_playground_demo_knowledge'
const requests: Array<{ path: string, body: string }> = []
let fixtureDirectory: string | undefined
const gateway = createServer(async (request, response) => {
  request.setEncoding('utf8')
  let body = ''
  for await (const chunk of request)
    body += String(chunk)
  const path = request.url ?? ''
  requests.push({ path, body })
  const payload = JSON.parse(body)
  response.setHeader('content-type', 'application/json')
  if (path === '/v1/embeddings') {
    const count = Array.isArray(payload.input)
      ? payload.input.length
      : 1
    response.end(JSON.stringify({
      model: 'fixture-embedding',
      data: Array.from({ length: count }, (_, index) => ({
        index,
        embedding: [0.8, 0.6],
      })),
      usage: { prompt_tokens: count, total_tokens: count },
    }))
    return
  }
  if (path === '/v1/rerank') {
    response.end(JSON.stringify({
      id: 'rerank-fixture',
      results: [
        { index: 0, relevance_score: 0.9 },
      ],
    }))
    return
  }
  if (path !== '/v1/chat/completions') {
    response.writeHead(404).end(JSON.stringify({
      error: { message: 'Unknown fixture route' },
    }))
    return
  }
  const content = payload.response_format?.type === 'json_object'
    ? JSON.stringify({
        title: 'Fixture title',
        points: ['First point'],
      })
    : 'Use a shared database.'
  response.end(JSON.stringify({
    id: 'fixture-chat',
    object: 'chat.completion',
    created: 0,
    model: 'fixture-chat',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
  }))
})

describe('aI Playground with a local model gateway', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      gateway.once('error', reject)
      gateway.listen(0, '127.0.0.1', () => resolve())
    })
    const address = gateway.address()
    if (!address || typeof address === 'string')
      throw new Error('Fixture did not bind TCP')
    const origin = `http://127.0.0.1:${address.port}`
    fixtureDirectory = await mkdtemp(join(tmpdir(), 'hai-playground-demos-'))
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    expect((await vecdb.init({ type: 'lancedb', path: fixtureDirectory })).success).toBe(true)
    expect((await ai.init({
      llm: {
        model: 'fixture-chat',
        apiKey: 'fixture-key',
        baseUrl: `${origin}/v1`,
        models: [
          { id: 'rerank-local', model: 'fixture-rerank', baseUrl: origin },
        ],
        scenarios: { embedding: 'fixture-embedding', rerank: 'rerank-local' },
      },
      embedding: { dimensions: 2 },
      knowledge: { dimension: 2 },
      retrieval: {
        sources: [
          { id: 'playground-handbook', collection },
        ],
      },
    })).success).toBe(true)
  })

  afterAll(async () => {
    try {
      await ai.close()
      await vecdb.close()
      await reldb.close()
    }
    finally {
      await new Promise<void>(resolve => gateway.close(() => resolve()))
      if (fixtureDirectory)
        await rm(fixtureDirectory, { recursive: true, force: true })
    }
  })

  function run(id: Parameters<typeof runBasicDemo>[0], input = 'What database should production use?') {
    return runBasicDemo(id, input, AbortSignal.timeout(10_000), 'demo-browser')
  }

  it('executes LLM, structured output, summary, and reasoning through the configured model', async () => {
    await expect(run('llm')).resolves.toMatchObject({ success: true, data: 'Use a shared database.' })
    await expect(run('structured')).resolves.toMatchObject({
      success: true,
      data: {
        title: 'Fixture title',
        points: ['First point'],
      },
    })
    await expect(run('summary')).resolves.toMatchObject({
      success: true,
      data: { summary: 'Use a shared database.' },
    })
    await expect(run('reasoning')).resolves.toMatchObject({
      success: true,
      data: { answer: 'Use a shared database.', strategy: 'cot', rounds: 1 },
    })
  })

  it('uses the configured embedding and rerank endpoints', async () => {
    expect(basicDemoUnavailable()).toEqual({})
    await expect(run('embedding')).resolves.toMatchObject({
      success: true,
      data: {
        dimensions: 2,
        preview: [0.8, 0.6],
      },
    })
    await expect(run('rerank')).resolves.toMatchObject({
      success: true,
      data: {
        results: [
          { relevanceScore: 0.9, id: 'deployment' },
        ],
      },
    })
  })

  it('publishes one fixed document and uses it for retrieval, knowledge and RAG', async () => {
    await expect(run('retrieval')).resolves.toMatchObject({
      success: true,
      data: {
        items: [
          { sourceId: 'playground-handbook' },
        ],
      },
    })
    await expect(run('rag')).resolves.toMatchObject({
      success: true,
      data: {
        answer: 'Use a shared database.',
        citations: [
          { documentId: 'playground-handbook-v1' },
        ],
      },
    })
    await expect(run('knowledge')).resolves.toMatchObject({
      success: true,
      data: {
        documents: [
          { documentId: 'playground-handbook-v1' },
        ],
      },
    })
    expect(requests.filter(request => request.path === '/v1/embeddings' && request.body.includes('The Hai Playground handbook'))).toHaveLength(1)
  })
})
