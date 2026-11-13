import type { HaiResult } from '@h-ai/core'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ai } from '../src/index.js'

const exec = promisify(execFile)
const engine = process.env.HAI_ACP_E2E_ENGINE === 'docker'
  ? 'docker'
  : 'podman'
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
    it.skipIf(!agent.image)(`${agent.adapter}: 原生握手、仓库规则和技能发现`, async () => {
      const volume = `hai-native-e2e-${randomUUID()}`
      const run = async (args: string[]) => (await exec(engine, args, { timeout: 180000, maxBuffer: 8 * 1024 * 1024 })).stdout.trim()
      await run(['volume', 'create', volume])
      try {
        value(await ai.init({
          llm: {
            models: [
              {
                id: 'coding',
                model: 'fixture-model',
                protocol: agent.protocol,
                apiKey: 'fixture-key',
                baseUrl: 'http://127.0.0.1:19876/v1',
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
          acp: { requestTimeout: 120000, promptTimeout: 60000 },
        }))
        const seed = `
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const git = (...args) => execFileSync('git', args);
const project = '/workspace/seed';
git('init', '-b', 'trunk', project);
fs.mkdirSync(project + '/.agents/skills/preview-check', { recursive: true });
fs.writeFileSync(project + '/AGENTS.md', '# Project rules\\n\\nUse hai-repo-instructions-v2.\\n');
fs.writeFileSync(project + '/.agents/skills/preview-check/SKILL.md', '---\\nname: preview-check\\ndescription: Run the hai-repo-skill-v2 verification.\\n---\\nRead the preview.\\n');
git('-C', project, 'add', '.');
git('-C', project, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'seed');
git('clone', '--bare', project, '/workspace/remote.git');
`
        await run([
          'run',
          '--rm',
          '--mount',
          `type=volume,src=${volume},dst=/workspace`,
          '--entrypoint',
          'node',
          agent.image!,
          '-e',
          seed,
        ])
        value(await ai.acp.workspaces.register({
          id: 'native',
          storage: {
            type: 'volume',
            name: volume,
            image: agent.image!,
            engine,
          },
          repositories: [
            { id: 'web', url: '/workspace/remote.git', mainBranch: 'trunk' },
          ],
        }))
        value(await ai.acp.agents.register({
          id: 'native',
          name: 'Native E2E',
          adapter: agent.adapter,
          mode: 'builtin-service',
          image: agent.image!,
          engine,
          modelIds: ['coding'],
        }))
        value(await ai.acp.agents.initialize('native'))
        const session = value(await ai.acp.sessions.create({
          agentId: 'native',
          workspaceId: 'native',
          repositoryId: 'web',
          newWorktree: true,
        }))
        const container = value(await session.info()).resource!.container
        const fixture = await readFile(resolve('tests/fixtures/acp-model.mjs'), 'utf8')
        await run([
          'exec',
          '-d',
          container,
          'node',
          '--input-type=module',
          '-e',
          fixture,
        ])
        await run([
          'exec',
          container,
          'node',
          '-e',
          '(async()=>{for(let i=0;i<100;i++){try{if((await fetch(\'http://127.0.0.1:19876/ready\')).ok)return}catch{}await new Promise(r=>setTimeout(r,50))}process.exit(1)})()',
        ])
        const response = value(await session.prompt([
          { type: 'text', text: 'Say native-agent-ok. Do not use tools.' },
        ]))
        expect(response.stopReason).toBe('end_turn')
        expect(response.text).toContain('native-agent-ok')
        const request = JSON.parse(await run([
          'exec',
          container,
          'node',
          '-e',
          'process.stdout.write(require(\'node:fs\').readFileSync(\'/workspace/upstream.json\',\'utf8\'))',
        ]))
        expect(request.model).toBe('fixture-model')
        expect(request.authorization).toBe('Bearer fixture-key')
        expect(request.repoInstructions).toBe(true)
        expect(request.repoSkill).toBe(true)
        expect(request.url).toContain(agent.protocol === 'responses'
          ? '/responses'
          : '/chat/completions')
        value(await session.close())
      }
      finally {
        await ai.close()
        const ids = (await run([
          'ps',
          '-aq',
          '--filter',
          `volume=${volume}`,
        ])).split(/\s+/).filter(Boolean)
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

describe('installed native ACP agents with a loopback model', () => {
  for (const { adapter, command } of [
    { adapter: 'goose', command: process.env.HAI_ACP_E2E_GOOSE_COMMAND },
    { adapter: 'deepseek-harness', command: process.env.HAI_ACP_E2E_DSH_COMMAND },
  ]) {
    it.skipIf(!command)(`${adapter} creates, prompts, closes and restores a session`, async () => {
      const workspace = await mkdtemp(join(tmpdir(), 'hai-native-acp-'))
      const modelRequests: Array<{ path: string | undefined, authorization: string | undefined, body: string }> = []
      const server = createServer(async (request, response) => {
        const body = Buffer.concat(await Array.fromAsync(request, chunk => Buffer.from(chunk))).toString()
        if (request.method === 'GET' && request.url?.endsWith('/models')) {
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify({
            object: 'list',
            data: [
              {
                id: 'fixture-model',
                object: 'model',
                created: 1,
                owned_by: 'fixture',
              },
            ],
          }))
          return
        }
        modelRequests.push({ path: request.url, authorization: request.headers.authorization, body })
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        const header = {
          id: 'fixture',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture-model',
        }
        for (const item of [
          {
            ...header,
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: 'native-agent-ok' },
                finish_reason: null,
              },
            ],
          },
          {
            ...header,
            choices: [
              { index: 0, delta: {}, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
          },
        ])
          response.write(`data: ${JSON.stringify(item)}\n\n`)
        response.end('data: [DONE]\n\n')
      })
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(0, '127.0.0.1', resolve)
        })
        const address = server.address()
        if (!address || typeof address === 'string')
          throw new Error('Native fixture did not bind to a TCP port')
        value(await ai.init({
          llm: {
            models: [
              {
                id: 'fixture',
                model: 'fixture-model',
                protocol: 'chat',
                apiKey: 'fixture-key',
                baseUrl: `http://127.0.0.1:${address.port}/proxy/v1`,
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
          acp: { requestTimeout: 15000, promptTimeout: 15000 },
        }))
        value(await ai.acp.workspaces.register({
          id: 'project',
          storage: { type: 'directory', path: workspace },
          repositories: [],
        }))
        const dshArgs: unknown = JSON.parse(process.env.HAI_ACP_E2E_DSH_ARGS ?? '[]')
        if (!Array.isArray(dshArgs) || !dshArgs.every(item => typeof item === 'string'))
          throw new Error('HAI_ACP_E2E_DSH_ARGS must be a JSON string array')
        value(await ai.acp.agents.register({
          id: 'native',
          name: adapter,
          adapter,
          mode: 'embedded',
          command,
          ...(adapter === 'deepseek-harness'
            ? { args: dshArgs }
            : {}),
          modelIds: ['fixture'],
        }))
        const handshake = value(await ai.acp.agents.check('native', { workspaceId: 'project' }))
        expect(handshake.agentCapabilities?.sessionCapabilities?.close).toBeDefined()
        if (adapter === 'goose')
          expect(handshake.agentCapabilities?.loadSession).toBe(true)
        else
          expect(handshake.agentCapabilities?.sessionCapabilities?.resume).toBeDefined()

        const created = value(await ai.acp.sessions.create({ id: 'native-test', agentId: 'native', workspaceId: 'project' }))
        const firstPrompt = 'Return the first native fixture response.'
        const first = value(await created.prompt([
          { type: 'text', text: firstPrompt },
        ]))
        expect(first.text).toContain('native-agent-ok')
        expect(first.stopReason).toBe('end_turn')
        const original = value(await created.info()).nativeId
        value(await created.close())
        const restored = value(await ai.acp.sessions.resume('native-test'))
        expect(value(await restored.info()).nativeId).toBe(original)
        const secondPrompt = 'Return the second native fixture response.'
        const second = value(await restored.prompt([
          { type: 'text', text: secondPrompt },
        ]))
        expect(second.text).toContain('native-agent-ok')
        expect(second.stopReason).toBe('end_turn')
        value(await restored.close())
        for (const prompt of [firstPrompt, secondPrompt]) {
          expect(modelRequests.find(item => item.body.includes(prompt))).toMatchObject({
            path: '/proxy/v1/chat/completions',
            authorization: 'Bearer fixture-key',
          })
        }
      }
      finally {
        try {
          await ai.close()
        }
        finally {
          server.closeAllConnections()
          await new Promise<void>(resolve => server.close(() => resolve()))
          await rm(workspace, { recursive: true, force: true })
        }
      }
    }, 90000)
  }
})
