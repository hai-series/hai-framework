import type { HaiResult } from '@h-ai/core'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ai } from '../src/index.js'

const exec = promisify(execFile)
const engine = process.env.HAI_ACP_E2E_ENGINE === 'docker' ? 'docker' : 'podman'
function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(JSON.stringify(result.error))
  return result.data
}
const cases = [
  { adapter: 'codex', image: process.env.HAI_ACP_E2E_IMAGE, protocol: 'responses' as const },
  { adapter: 'deepseek-harness', image: process.env.HAI_ACP_E2E_DSH_IMAGE, protocol: 'chat' as const },
]
describe('native ACP agents with fixture model upstream', () => {
  for (const agent of cases) {
    it.skipIf(!agent.image)(`${agent.adapter}: 原生配置、握手、模型请求和输出`, async () => {
      const volume = `hai-native-e2e-${randomUUID()}`
      const run = async (args: string[]) => (await exec(engine, args, { timeout: 180000, maxBuffer: 8 * 1024 * 1024 })).stdout.trim()
      await run(['volume', 'create', volume])
      try {
        value(await ai.init({
          llm: { models: [{ id: 'coding', model: 'fixture-model', protocol: agent.protocol, apiKey: 'fixture-key', baseUrl: 'http://127.0.0.1:19876/v1', capabilities: { contextWindow: 32768, maxOutputTokens: 1024, inputModalities: ['text'], toolCalling: true, reasoning: { supported: false } } }] },
          acp: { requestTimeout: 120000, promptTimeout: 60000 },
        }))
        value(await ai.acp.workspaces.register({ id: 'native', storage: { type: 'volume', name: volume, image: agent.image!, engine } }))
        value(await ai.acp.agents.register({ id: 'native', name: 'Native E2E', adapter: agent.adapter, mode: 'builtin-service', image: agent.image!, engine, modelIds: ['coding'] }))
        value(await ai.acp.agents.initialize('native'))
        const session = value(await ai.acp.sessions.create({ agentId: 'native', workspaceId: 'native' }))
        const container = value(await session.info()).resource!.container
        const fixture = await readFile(resolve('tests/fixtures/acp-model.mjs'), 'utf8')
        await run(['exec', '-d', container, 'node', '--input-type=module', '-e', fixture])
        await run(['exec', container, 'node', '-e', '(async()=>{for(let i=0;i<100;i++){try{if((await fetch(\'http://127.0.0.1:19876/ready\')).ok)return}catch{}await new Promise(r=>setTimeout(r,50))}process.exit(1)})()'])
        const response = value(await session.prompt([{ type: 'text', text: 'Say native-agent-ok. Do not use tools.' }]))
        expect(response.stopReason).toBe('end_turn')
        expect(response.text).toContain('native-agent-ok')
        const request = JSON.parse(await run(['exec', container, 'node', '-e', 'process.stdout.write(require(\'node:fs\').readFileSync(\'/workspace/upstream.json\',\'utf8\'))']))
        expect(request.model).toBe('fixture-model')
        expect(request.authorization).toBe('Bearer fixture-key')
        expect(request.url).toContain(agent.protocol === 'responses' ? '/responses' : '/chat/completions')
        value(await session.close())
      }
      finally {
        await ai.close()
        const ids = (await run(['ps', '-aq', '--filter', `volume=${volume}`])).split(/\s+/).filter(Boolean)
        if (ids.length)
          await run(['rm', '-f', ...ids])
        for (const name of [volume, `${volume}-state`]) {
          if (await exec(engine, ['volume', 'inspect', name]).then(() => true, () => false))
            await run(['volume', 'rm', name])
        }
      }
    }, 240000)
  }
})
