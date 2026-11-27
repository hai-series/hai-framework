import type { ToolSelection } from '@h-ai/tools/server'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { HaiToolsError } from '@h-ai/tools'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toolHost } from '#lib/server/tool-host.js'

const scope = { tenantId: 'agent', userId: 'alice' }
let selection: ToolSelection | undefined
let environments: { web?: string, video?: string }
let browserProxy: string | undefined
let artifacts: boolean

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await runner.init({ nodeId: 'agent-tool-selection', executor: false })).success).toBe(true)
  selection = undefined
  environments = { web: 'capture', video: 'render' }
  browserProxy = 'http://172.20.0.1:8080'
  artifacts = true
  vi.spyOn(core.config, 'get').mockImplementation(() => ({
    workbench: {
      selection,
      environments,
      browserProxy,
      artifacts,
    },
  }))
})

afterEach(async () => {
  toolHost.close()
  await runner.close()
  await reldb.close()
  vi.restoreAllMocks()
})

it.each<{
  scenario: string
  selection: ToolSelection | undefined
  website: boolean
  dependencies: string[]
}>([
  {
    scenario: 'default groups',
    selection: undefined,
    website: true,
    dependencies: ['web_capture', 'video_render'],
  },
  {
    scenario: 'video without web',
    selection: {
      groups: ['video'],
    },
    website: false,
    dependencies: ['video_render'],
  },
  {
    scenario: 'website tool alone',
    selection: {
      tools: ['website_video'],
    },
    website: false,
    dependencies: [],
  },
  {
    scenario: 'both dependency groups',
    selection: {
      groups: ['web', 'video'],
    },
    website: true,
    dependencies: ['web_capture', 'video_render'],
  },
  {
    scenario: 'group and explicit dependency union',
    selection: {
      groups: ['video'],
      tools: ['web_capture'],
    },
    website: true,
    dependencies: ['web_capture', 'video_render'],
  },
  {
    scenario: 'explicit tools only',
    selection: {
      tools: ['website_video', 'web_capture', 'video_render'],
    },
    website: true,
    dependencies: ['web_capture', 'video_render'],
  },
  {
    scenario: 'excluded capture overrides explicit tools',
    selection: {
      groups: ['web', 'video'],
      tools: ['web_capture'],
      exclude: ['web_capture'],
    },
    website: false,
    dependencies: ['video_render'],
  },
  {
    scenario: 'excluded render overrides group',
    selection: {
      groups: ['web', 'video'],
      exclude: ['video_render'],
    },
    website: false,
    dependencies: ['web_capture'],
  },
  {
    scenario: 'excluded website preserves dependencies',
    selection: {
      groups: ['web', 'video'],
      exclude: ['website_video'],
    },
    website: false,
    dependencies: ['web_capture', 'video_render'],
  },
  {
    scenario: 'empty selection',
    selection: {},
    website: false,
    dependencies: [],
  },
])('advertises only runnable website videos with $scenario', async (entry) => {
  selection = entry.selection
  expect(toolHost.start().success).toBe(true)
  // 使用真实服务目录与工厂；目录不调用模型、容器或用户授权。
  const catalog = await toolHost.service().catalog({ scope })
  expect(catalog.success).toBe(true)
  if (!catalog.success)
    throw new Error(catalog.error.message)
  const names = catalog.data.tools.map(tool => tool.name)
  expect(names.includes('website_video')).toBe(entry.website)
  expect(names.filter(name => ['web_capture', 'video_render'].includes(name)).sort()).toEqual(entry.dependencies.toSorted())
})

it.each(['web', 'video', 'proxy'] as const)('omits website videos when the %s prerequisite is missing', async (missing) => {
  selection = {
    groups: ['web', 'video'],
  }
  if (missing === 'proxy')
    browserProxy = undefined
  else delete environments[missing]
  expect(toolHost.start().success).toBe(true)
  const catalog = await toolHost.service().catalog({ scope })
  expect(catalog.success).toBe(true)
  if (catalog.success)
    expect(catalog.data.tools.some(tool => tool.name === 'website_video')).toBe(false)
})

it('omits artifact tools, container jobs and their video workflow when artifacts are disabled', async () => {
  expect(toolHost.start().success).toBe(true)
  expect((await toolHost.catalog(scope)).map(tool => tool.name)).toEqual(expect.arrayContaining([
    'artifact_create',
    'web_capture',
    'video_render',
    'website_video',
  ]))
  artifacts = false
  expect(await toolHost.catalog(scope)).toEqual([])
})

it('rechecks global dependency exclusions after service creation and rejects the parent before execution', async () => {
  selection = {
    groups: ['web', 'video'],
  }
  expect(toolHost.start().success).toBe(true)
  expect((await toolHost.catalog(scope)).some(tool => tool.name === 'website_video')).toBe(true)
  selection = {
    groups: ['web', 'video'],
    exclude: ['video_render'],
  }
  expect((await toolHost.catalog(scope)).some(tool => tool.name === 'website_video')).toBe(false)
  const submitted = await toolHost.service().submit({
    name: 'website_video',
    input: { url: 'https://example.com/' },
    idempotencyKey: 'disabled-video-dependency',
  }, { scope })
  expect(submitted.success).toBe(false)
  if (!submitted.success)
    expect(submitted.error.code).toBe(HaiToolsError.FORBIDDEN.code)
})
