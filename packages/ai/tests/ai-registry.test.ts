import type { HaiResult } from '@h-ai/core'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { vecdb } from '@h-ai/vecdb'
import { afterEach, describe, expect, it } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const temporary: string[] = []
function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(JSON.stringify(result.error))
  return result.data
}
function code(result: HaiResult<unknown>) {
  return result.success ? undefined : result.error.code
}
afterEach(async () => {
  await ai.close()
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true })
})
describe('configuration and database resource registries', () => {
  it('检索实际使用合并清单：配置优先、配置独有源可查询、已删除源不再查询', async () => {
    let embeddingRequests = 0
    const server = createServer(async (request, response) => {
      for await (const _chunk of request) { /* 消费完整请求后返回固定查询向量。 */ }
      embeddingRequests++
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ model: 'fixture-embedding', data: [{ index: 0, embedding: [1, 0, 0] }], usage: { prompt_tokens: 1, total_tokens: 1 } }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture address')
    const collections = ['registry_configured', 'registry_database', 'registry_deleted']
    try {
      for (const collection of collections) {
        value(await vecdb.collection.create(collection, { dimension: 3 }))
        value(await vecdb.vector.upsert(collection, [{ id: collection, vector: [1, 0, 0], content: collection }]))
      }
      const llm = { apiKey: 'fixture', baseUrl: `http://127.0.0.1:${address.port}/v1` }
      value(await ai.init({ llm }))
      value(await ai.retrieval.sources.register({ id: 'shared', name: 'Database', collection: 'registry_database' }))
      value(await ai.retrieval.sources.register({ id: 'database-only', name: 'Database', collection: 'registry_database' }))
      value(await ai.retrieval.sources.register({ id: 'deleted', name: 'Deleted', collection: 'registry_deleted' }))
      value(await ai.retrieval.sources.remove('deleted'))
      await ai.close()
      value(await ai.init({ llm, retrieval: { sources: [
        { id: 'shared', name: 'Configured', collection: 'registry_configured' },
        { id: 'config-only', name: 'Configured', collection: 'registry_configured' },
      ] } }))
      expect(value(await ai.retrieval.retrieve({ query: 'query', sources: ['config-only'] })).items).toMatchObject([{ id: 'registry_configured', sourceId: 'config-only' }])
      expect(value(await ai.retrieval.retrieve({ query: 'query', sources: ['shared'] })).items).toMatchObject([{ id: 'registry_configured', sourceId: 'shared' }])
      expect(value(await ai.retrieval.retrieve({ query: 'query', sources: ['database-only'] })).items).toMatchObject([{ id: 'registry_database', sourceId: 'database-only' }])
      const requestsBeforeDeleted = embeddingRequests
      const deleted = await ai.retrieval.retrieve({ query: 'query', sources: ['deleted'] })
      expect(deleted.success).toBe(false)
      if (!deleted.success)
        expect(deleted.error.code).toBe(HaiAIError.RETRIEVAL_SOURCE_NOT_FOUND.code)
      expect(embeddingRequests).toBe(requestsBeforeDeleted)
      expect(value(await ai.retrieval.retrieve({ query: 'query' })).items.map(item => item.sourceId).sort()).toEqual(['config-only', 'database-only', 'shared'])
    }
    finally {
      await ai.close()
      for (const collection of collections)
        await vecdb.collection.drop(collection)
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('并发版本更新只允许一个成功，返回副本不能改写配置', async () => {
    value(await ai.init({ llm: { models: [{ id: 'fixed', model: 'original' }] } }))
    const entry = value(await ai.llm.models.get('fixed'))
    entry.value.model = 'mutated'
    expect(value(await ai.llm.models.get('fixed')).value.model).toBe('original')
    value(await ai.llm.models.register({ id: 'race', model: 'initial' }))
    const version = value(await ai.llm.models.get('race')).version
    const results = await Promise.all(['a', 'b'].map(model => ai.llm.models.update({ id: 'race', model }, version)))
    expect(results.filter(result => result.success)).toHaveLength(1)
    expect(results.filter(result => code(result) === 'hai:ai:092')).toHaveLength(1)
    await ai.close()
    expect((await ai.init({ llm: { models: [{ id: 'duplicate', model: 'a' }, { id: 'duplicate', model: 'b' }] } })).success).toBe(false)
  })
  it('配置优先且只读，数据库 CAS CRUD、墓碑重建和重启持久化', async () => {
    const config = { llm: { models: [{ id: 'fixed', model: 'configured' }] } }
    value(await ai.init(config))
    expect(
      code(await ai.llm.models.update({ id: 'fixed', model: 'changed' })),
    ).toBe('hai:ai:090')
    expect(code(await ai.llm.models.remove('fixed'))).toBe('hai:ai:090')
    expect(
      code(await ai.llm.models.register({ id: 'fixed', model: 'changed' })),
    ).toBe('hai:ai:090')
    value(await ai.llm.models.register({ id: 'dynamic', model: 'stored' }))
    const first = value(await ai.llm.models.get('dynamic'))
    expect(first.source).toBe('database')
    value(
      await ai.llm.models.update(
        { ...first.value, model: 'updated' },
        first.version,
      ),
    )
    expect(code(await ai.llm.models.update(first.value, first.version))).toBe(
      'hai:ai:092',
    )
    expect(code(await ai.llm.models.remove('dynamic', first.version))).toBe(
      'hai:ai:092',
    )
    expect(
      value(await ai.llm.models.list()).map(item => item.source),
    ).toEqual(['config', 'database'])
    await ai.close()
    value(
      await ai.init({
        llm: { models: [{ id: 'dynamic', model: 'override' }] },
      }),
    )
    expect(value(await ai.llm.models.get('dynamic'))).toMatchObject({
      source: 'config',
      value: { model: 'override' },
    })
    expect(code(await ai.llm.models.remove('dynamic'))).toBe('hai:ai:090')
    await ai.close()
    value(await ai.init(config))
    expect(value(await ai.llm.models.get('dynamic')).value.model).toBe(
      'updated',
    )
    value(await ai.llm.models.remove('dynamic'))
    expect(code(await ai.llm.models.get('dynamic'))).toBe('hai:ai:091')
    value(await ai.llm.models.register({ id: 'dynamic', model: 'recreated' }))
    const captured = ai.llm.models
    await ai.close()
    expect(code(await captured.list())).toBe('hai:ai:010')
  })
  it('数据库模型在下一次真实 HTTP 调用生效，配置模型仍可使用', async () => {
    const models: string[] = []
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      models.push(body.model)
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          id: 'fixture-response',
          object: 'chat.completion',
          created: 1,
          model: body.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: body.model },
              finish_reason: 'stop',
            },
          ],
        }),
      )
    })
    await new Promise<void>(resolve =>
      server.listen(0, '127.0.0.1', resolve),
    )
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture address')
    try {
      value(
        await ai.init({
          llm: {
            apiKey: 'fixture',
            baseUrl: `http://127.0.0.1:${address.port}/v1`,
            models: [{ id: 'fixed', model: 'fixed-wire' }],
          },
        }),
      )
      value(
        await ai.llm.models.register({ id: 'dynamic', model: 'first-wire' }),
      )
      expect(value(await ai.llm.ask('one', { model: 'dynamic' }))).toBe(
        'first-wire',
      )
      value(
        await ai.llm.models.update({ id: 'dynamic', model: 'second-wire' }),
      )
      expect(value(await ai.llm.ask('two', { model: 'dynamic' }))).toBe(
        'second-wire',
      )
      expect(value(await ai.llm.ask('three', { model: 'fixed' }))).toBe(
        'fixed-wire',
      )
      expect(models).toEqual(['first-wire', 'second-wire', 'fixed-wire'])
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
  it('数据库音频和图像模型更新后，下一次真实 HTTP 请求使用新配置', async () => {
    const seen: Array<{ path: string, model: string }> = []
    const server = createServer(async (request, response) => {
      let body = ''
      for await (const chunk of request) body += chunk.toString()
      const parsed = JSON.parse(body)
      seen.push({ path: request.url!, model: parsed.model })
      if (request.url?.endsWith('/audio/speech')) {
        response.setHeader('content-type', 'audio/mpeg')
        response.end(Buffer.from([73, 68, 51, 0]))
      }
      else {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=' }], output_format: 'png' }))
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture address')
    try {
      value(await ai.init())
      const baseUrl = `http://127.0.0.1:${address.port}/v1`
      const audio = value(await ai.audio.models.register({ id: 'voice', provider: 'openai', model: 'tts-first', operations: ['synthesize'], apiKey: 'fixture', baseUrl }))
      const image = value(await ai.image.models.register({ id: 'image', provider: 'openai', model: 'image-first', apiKey: 'fixture', baseUrl }))
      value(await ai.audio.synthesize({ model: 'voice', text: 'hello' }))
      value(await ai.image.generate({ model: 'image', prompt: 'a tree' }))
      value(await ai.audio.models.update({ ...audio.value, model: 'tts-second' }, audio.version))
      value(await ai.image.models.update({ ...image.value, model: 'image-second' }, image.version))
      value(await ai.audio.synthesize({ model: 'voice', text: 'hello' }))
      value(await ai.image.generate({ model: 'image', prompt: 'a tree' }))
      expect(seen).toEqual([
        { path: '/v1/audio/speech', model: 'tts-first' },
        { path: '/v1/images/generations', model: 'image-first' },
        { path: '/v1/audio/speech', model: 'tts-second' },
        { path: '/v1/images/generations', model: 'image-second' },
      ])
      value(await ai.audio.models.remove('voice'))
      value(await ai.image.models.remove('image'))
      expect((await ai.audio.synthesize({ model: 'voice', text: 'hello' })).success).toBe(false)
      expect((await ai.image.generate({ model: 'image', prompt: 'a tree' })).success).toBe(false)
      expect(seen).toHaveLength(4)
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
  it('音频、图像、MCP、检索源均合并，配置检索源不能从旧 API 删除', async () => {
    value(
      await ai.init({
        audio: {
          models: [
            {
              id: 'audio-fixed',
              provider: 'openai',
              model: 'tts-1',
              operations: ['synthesize'],
            },
          ],
        },
        image: {
          models: [
            { id: 'image-fixed', provider: 'openai', model: 'gpt-image-1' },
          ],
        },
        mcp: {
          servers: [
            {
              id: 'mcp-fixed',
              name: 'Docs',
              transport: 'http',
              url: 'https://example.invalid/mcp',
            },
          ],
        },
        retrieval: {
          sources: [{ id: 'source-fixed', name: 'Docs', collection: 'docs' }],
        },
      }),
    )
    expect(code(await ai.audio.models.remove('audio-fixed'))).toBe(
      'hai:ai:090',
    )
    expect(code(await ai.image.models.remove('image-fixed'))).toBe(
      'hai:ai:090',
    )
    expect(code(await ai.mcp.servers.remove('mcp-fixed'))).toBe('hai:ai:090')
    expect(code(await ai.retrieval.removeSource('source-fixed'))).toBe(
      'hai:ai:090',
    )
    value(
      await ai.audio.models.register({
        id: 'audio-db',
        provider: 'openai',
        model: 'tts-1',
        operations: ['synthesize'],
      }),
    )
    expect(
      ai.audio.getCapabilities({ model: 'audio-db', operation: 'synthesize' })
        .success,
    ).toBe(true)
    value(
      await ai.image.models.register({
        id: 'image-db',
        provider: 'openai',
        model: 'gpt-image-1',
      }),
    )
    value(
      await ai.mcp.servers.register({
        id: 'mcp-db',
        name: 'DB',
        transport: 'stdio',
        command: 'node',
      }),
    )
    value(
      await ai.retrieval.sources.register({
        id: 'source-db',
        name: 'Other',
        collection: 'other',
      }),
    )
    expect(value(await ai.audio.models.list())).toHaveLength(2)
    expect(value(await ai.image.models.list())).toHaveLength(2)
    expect(value(await ai.mcp.servers.list())).toHaveLength(2)
    expect(await ai.retrieval.listSources()).toHaveLength(2)
    value(
      await ai.retrieval.sources.update({
        id: 'source-db',
        name: 'Changed',
        collection: 'other',
      }),
    )
    value(await ai.retrieval.removeSource('source-db'))
    expect(await ai.retrieval.listSources()).toHaveLength(1)
  })
  it('aCP 配置 Agent/workspace 只读，与数据库项合并后实际创建会话并使用 MCP 清单', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hai-acp-registry-'))
    temporary.push(root)
    value(
      await ai.init({
        acp: {
          agents: [
            {
              id: 'configured',
              name: 'Fixture',
              mode: 'embedded',
              command: process.execPath,
              args: [resolve('tests/fixtures/acp-agent.mjs')],
            },
          ],
          workspaces: [
            // 未使用的容器配置不能阻止本机工作区登记或准备。
            { id: 'unused-volume', storage: { type: 'volume', name: 'unused', image: 'unused:1', engine: 'docker' } },
            {
              id: 'configured',
              storage: { type: 'directory', path: join(root, 'configured') },
            },
          ],
        },
        mcp: {
          servers: [
            { id: 'tools', name: 'Tools', transport: 'stdio', command: 'node' },
          ],
        },
      }),
    )
    expect(value(await ai.acp.agents.get('configured')).source).toBe('config')
    expect(value(await ai.acp.workspaces.get('configured')).source).toBe(
      'config',
    )
    expect(code(await ai.acp.agents.remove('configured'))).toBe('hai:ai:090')
    expect(code(await ai.acp.workspaces.remove('configured'))).toBe(
      'hai:ai:090',
    )
    value(
      await ai.acp.agents.register({
        id: 'stored',
        name: 'Stored',
        mode: 'embedded',
        command: process.execPath,
      }),
    )
    value(
      await ai.acp.workspaces.register({
        id: 'stored',
        storage: { type: 'directory', path: join(root, 'stored') },
      }),
    )
    const changed = value(await ai.acp.workspaces.get('stored'))
    expect((await ai.acp.workspaces.update({ ...changed.value, storage: { type: 'directory', path: join(root, 'configured', 'nested') } }, changed.version)).success).toBe(false)
    value(await ai.acp.workspaces.update({ ...changed.value, storage: { type: 'directory', path: join(root, 'updated') } }, changed.version))
    expect(value(await ai.acp.workspaces.get('stored')).value.storage).toMatchObject({ path: join(root, 'updated') })
    expect(value(await ai.acp.agents.list())).toHaveLength(2)
    expect(value(await ai.acp.workspaces.list())).toHaveLength(3)
    const session = value(
      await ai.acp.sessions.create({
        agentId: 'configured',
        workspaceId: 'configured',
        mcpServerIds: ['tools'],
      }),
    )
    expect(
      value(await session.prompt([{ type: 'text', text: 'mcp' }])).text,
    ).toBe('Tools')
    value(await session.close())
    value(await ai.acp.agents.remove('stored'))
    value(await ai.acp.workspaces.remove('stored'))
  }, 20000)
})
