import type { HaiResult } from '@h-ai/core'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { promisify } from 'node:util'
import { createRunner } from '@h-ai/runner'
import { describe, expect, it } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const execute = promisify(execFile)
const engine = (process.env.HAI_ACP_E2E_ENGINE ?? process.env.HAI_TEST_CONTAINER_ENGINE) === 'docker'
  ? 'docker'
  : 'podman'
const enabled = process.env.HAI_ACP_MANAGED_NATIVE_TEST === '1'
const cases = [
  {
    adapter: 'codex',
    image: process.env.HAI_ACP_E2E_IMAGE,
    protocol: 'responses',
    nativeResume: 'load',
  },
  {
    adapter: 'deepseek-harness',
    image: process.env.HAI_ACP_E2E_DSH_IMAGE,
    protocol: 'chat',
    nativeResume: 'resume',
  },
  {
    adapter: 'goose',
    image: process.env.HAI_ACP_E2E_GOOSE_IMAGE,
    protocol: 'chat',
    nativeResume: 'load',
  },
] as const

function value<T>(result: HaiResult<T>) {
  if (!result.success)
    throw new Error(JSON.stringify(result.error))
  return result.data
}

async function container(...args: string[]) {
  return (await execute(engine, args, { timeout: 15_000, maxBuffer: 256 * 1024 })).stdout.trim()
}

describe.skipIf(!enabled)('managed native ACP agents on an isolated network', () => {
  it.each(cases)('$adapter applies a real managed task Worker to the bound model', async ({ adapter, image, protocol, nativeResume }) => {
    expect(image, `${adapter} image is required when native managed acceptance is enabled`).toBeTruthy()
    const imageId = (await container('image', 'inspect', '--format', '{{.Id}}', image!)).replace(/^(?:sha256:)?/u, 'sha256:')
    const network = `hai-managed-native-${randomUUID()}`
    const fixture = await readFile(new URL('./fixtures/acp-managed-model.mjs', import.meta.url), 'utf8')
    const runner = createRunner()
    let modelId: string | undefined
    await container('network', 'create', '--internal', network)
    try {
      const receipt = await container(
        'run',
        '-d',
        '--pull=never',
        '--network',
        network,
        '--entrypoint',
        'node',
        imageId,
        '--input-type=module',
        '-e',
        fixture,
      )
      expect(receipt).toMatch(/^[a-f0-9]{64}$/u)
      modelId = receipt
      const address = await container('inspect', '--format', `{{ (index .NetworkSettings.Networks "${network}").IPAddress }}`, modelId)
      expect(address).toMatch(/^\d{1,3}(?:\.\d{1,3}){3}$/u)
      await container('exec', modelId, 'node', '-e', 'for(let i=0;i<50;i++){try{if((await fetch("http://127.0.0.1:19877/ready")).ok)process.exit(0)}catch{}await new Promise(r=>setTimeout(r,50))}process.exit(1)')
      value(await runner.init({
        engine,
        nodeId: `managed-native-${adapter}`,
        environments: [
          {
            id: 'native',
            image: imageId,
            networkPolicy: 'internal',
            network,
            resources: {
              cpu: 1,
              memoryMiB: 1024,
              pids: 256,
              scratchMiB: 256,
            },
          },
        ],
      }))
      value(await ai.init({
        llm: {
          models: [
            {
              id: 'fixture',
              model: 'managed-fixture-model',
              protocol,
              apiKey: 'managed-fixture-key',
              baseUrl: `http://${address}:19877/v1`,
              capabilities: {
                contextWindow: 32768,
                maxOutputTokens: 1024,
                inputModalities: ['text'],
                toolCalling: true,
                reasoning: { supported: false },
              },
            },
          ],
        },
        acp: {
          agents: [
            {
              id: 'native',
              name: adapter,
              mode: 'embedded',
              adapter,
              modelIds: ['fixture'],
              environmentIds: ['native'],
            },
          ],
        },
      }, { runner }))
      const scoped = ai.acp.scoped({ tenantId: 'native-acceptance', userId: 'operator' })
      expect(value(await scoped.agents.describe('native'))).toMatchObject({
        adapter,
        managedTransport: 'stdio',
        nativeResume,
        workerModes: ['user', 'task'],
        protocols: expect.arrayContaining([protocol]),
      })
      expect(await scoped.plan({
        agentId: 'native',
        execution: { mode: 'shared' },
        permissions: { profile: 'read-only' },
      })).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_UNSUPPORTED.code },
      })
      const startedAt = performance.now()
      const result = value(await scoped.run({
        agentId: 'native',
        prompt: 'Return hai-managed-native-ok without tools.',
        execution: { mode: 'task' },
        permissions: { profile: 'workspace', approval: 'never' },
        limits: { runTimeoutMs: 30_000 },
      }))
      expect(result).toMatchObject({
        output: {
          text: expect.stringContaining('hai-managed-native-ok'),
        },
        effectiveOptions: {
          adapter,
          resolvedMode: 'task',
          modelId: 'fixture',
          image: imageId,
        },
      })
      expect(JSON.parse(await container('exec', modelId, 'node', '-e', 'process.stdout.write(require("node:fs").readFileSync("/workspace/managed-upstream.json","utf8"))'))).toEqual({
        path: protocol === 'responses'
          ? '/v1/responses'
          : '/v1/chat/completions',
        model: 'managed-fixture-model',
      })
      if (process.env.HAI_ACP_MANAGED_NATIVE_TIMINGS === '1')
        process.stdout.write(`${adapter} scoped.run with fixture: ${Math.round(performance.now() - startedAt)} ms\n`)
    }
    finally {
      try {
        await ai.close()
        value(await runner.close())
      }
      finally {
        if (modelId)
          await container('rm', '-f', modelId)
        await container('network', 'rm', network)
      }
    }
  }, 75_000)
})
