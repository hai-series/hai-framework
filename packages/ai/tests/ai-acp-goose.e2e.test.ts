import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { HaiResult } from '@h-ai/core'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ai } from '../src/index.js'

const exec = promisify(execFile)
const required = process.env.HAI_ACP_E2E_REQUIRED === '1'
const enabled = required || process.env.HAI_ACP_E2E_GOOSE === '1'
const apiKey = process.env.OPENROUTER_APIKEY?.trim()
const image = process.env.HAI_ACP_E2E_GOOSE_IMAGE
const model = process.env.HAI_ACP_E2E_GOOSE_MODEL ?? process.env.HAI_ACP_E2E_MODEL ?? 'qwen/qwen3.7-flash'
const evidenceRoot = resolve('test-results/acp-openrouter')

/** 真实服务验收只保存白名单，不写原生配置、请求头或工具原始参数。 */
interface GooseEvidence {
  id: string
  agent: string
  mode: string
  transport: 'http' | 'ws'
  model: string
  task: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  status: 'running' | 'passed' | 'failed'
  events: Array<{ type: string, summary: string }>
  files: Array<{ path: string, passed: boolean, summary: string }>
  reply: string
  rounds: Array<{ phase: string, stopReason: string, reply: string, expectedToken: string, fileContent: string, nativeId: string, toolCalls: number }>
  cleanup: { status: 'pending' | 'passed' | 'failed', summary: string }
  error?: string
}

/** 不直接暴露 HaiResult 的 cause；底层可能含命令或认证上下文。 */
function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.data
}

/** 不将容器命令行和 stderr 转入测试报告。 */
async function engineCommand(engine: string, args: string[], secret?: string): Promise<string> {
  try {
    return (await exec(engine, args, {
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, ...(apiKey ? { OPENROUTER_API_KEY: apiKey } : {}), ...(secret ? { GOOSE_SERVER__SECRET_KEY: secret } : {}) },
    })).stdout.trim()
  }
  catch {
    throw new Error('Goose acceptance container command failed')
  }
}

/** 明确引擎不降级；auto 使用实际就绪的 Podman 优先顺序。 */
async function readyEngine(): Promise<'podman' | 'docker'> {
  const selected = process.env.HAI_ACP_E2E_ENGINE ?? 'auto'
  if (!['auto', 'podman', 'docker'].includes(selected))
    throw new Error('HAI_ACP_E2E_ENGINE must be auto, podman or docker')
  for (const engine of ['podman', 'docker'] as const) {
    if (selected !== 'auto' && selected !== engine)
      continue
    try {
      await exec(engine, ['info'], { timeout: 15000, windowsHide: true })
      return engine
    }
    catch {
      if (selected !== 'auto')
        break
    }
  }
  throw new Error('No requested Podman/Docker engine is ready')
}

describe.sequential('goose native remote ACP acceptance', () => {
  for (const transport of ['http', 'ws'] as const) {
    it.skipIf(!enabled || ((!apiKey || !image) && !required))(`Goose / ${transport}: 真实鉴权、工程工具与声明的恢复能力`, async () => {
      const started = Date.now()
      const id = `goose-custom-service-${transport}`
      const secret = `${randomUUID()}${randomUUID()}`
      const previousSecret = process.env.HAI_ACP_GOOSE_SECRET
      const evidence: GooseEvidence = {
        id,
        agent: 'goose',
        mode: 'custom-service',
        transport,
        model,
        task: 'Connect to the real Goose native ACP server with authentication; read an undisclosed workspace token, write it to result.txt, and verify native resume only when advertised.',
        startedAt: new Date(started).toISOString(),
        status: 'running',
        events: [],
        files: [],
        reply: '',
        rounds: [],
        cleanup: { status: 'pending', summary: '' },
      }
      const redact = (text: string) => [apiKey, secret].filter((item): item is string => Boolean(item)).reduce((output, item) => output.replaceAll(item, '[REDACTED]'), text).replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/\bsk-or-[\w-]+/gi, '[REDACTED]')
      await mkdir(evidenceRoot, { recursive: true })
      const evidenceFile = join(evidenceRoot, `${id}.json`)
      await writeFile(evidenceFile, JSON.stringify(evidence, null, 2))
      let engine: 'podman' | 'docker' | undefined
      let container: string | undefined
      const volumes: string[] = []
      let failed = false
      try {
        if (!apiKey || !image)
          throw new Error('Goose acceptance requires OPENROUTER_APIKEY and HAI_ACP_E2E_GOOSE_IMAGE')
        engine = await readyEngine()
        await engineCommand(engine, ['image', 'inspect', image])
        const workspace = `hai-goose-e2e-${randomUUID()}`
        for (const name of [workspace, `${workspace}-state`]) {
          await engineCommand(engine, ['volume', 'create', name])
          volumes.push(name)
        }
        container = await engineCommand(engine, [
          'create',
          // 远程服务夹具自行负责网络策略，不继承 Podman 服务端可能不可达的回环代理。
          ...(engine === 'podman' ? ['--http-proxy=false'] : []),
          '--init',
          '--publish',
          '127.0.0.1::3284',
          '--mount',
          `type=volume,src=${workspace},dst=/workspace`,
          '--mount',
          `type=volume,src=${workspace}-state,dst=/state`,
          '--env',
          'GOOSE_SERVER__SECRET_KEY',
          '--env',
          'OPENROUTER_API_KEY',
          '--env',
          'GOOSE_PROVIDER=openrouter',
          '--env',
          `GOOSE_MODEL=${model}`,
          '--env',
          'GOOSE_DISABLE_KEYRING=1',
          '--env',
          'GOOSE_MODE=auto',
          '--env',
          'GOOSE_DISABLE_SESSION_NAMING=true',
          '--env',
          'GOOSE_MAX_TOKENS=2048',
          '--env',
          'GOOSE_MAX_TURNS=12',
          image,
        ], secret)
        if (!/^[a-f0-9]{12,64}$/.test(container)) {
          container = undefined
          throw new Error('Container create did not return a valid owned container ID')
        }
        await engineCommand(engine, ['start', container])
        const published = await engineCommand(engine, ['port', container, '3284/tcp'])
        const match = /^127\.0\.0\.1:(\d+)$/.exec(published)
        if (!match)
          throw new Error('Goose acceptance port is not restricted to loopback')
        const origin = `http://127.0.0.1:${match[1]}`
        let ready = false
        const deadline = Date.now() + 60000
        while (Date.now() < deadline) {
          const response = await fetch(`${origin}/acp`, { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
          if (response?.status === 401) {
            ready = true
            break
          }
          await response?.body?.cancel()
          await new Promise(resolve => setTimeout(resolve, 200))
        }
        if (!ready)
          throw new Error('Goose authenticated ACP server did not become ready')
        evidence.events.push({ type: 'authentication', summary: 'Real /acp endpoint returned HTTP 401 without the service secret' })
        process.env.HAI_ACP_GOOSE_SECRET = secret
        value(await ai.init({ acp: { requestTimeout: 10000, promptTimeout: 240000, cancelTimeout: 5000, maxPendingEvents: 4096 } }))
        const url = `${transport === 'http' ? origin : origin.replace('http:', 'ws:')}/acp`
        const rejected = await ai.acp.connect({ type: transport, url, headers: { 'X-Secret-Key': randomUUID() } })
        expect(rejected.success).toBe(false)
        evidence.events.push({ type: 'authentication', summary: `Wrong X-Secret-Key rejected by real ${transport.toUpperCase()} initialization` })
        value(await ai.acp.agents.register({ id: 'goose', name: 'Goose remote', mode: 'custom-service', transport, url, supportedTransports: ['http', 'ws'], headerEnv: { 'X-Secret-Key': 'HAI_ACP_GOOSE_SECRET' } }))
        const callbacks = {
          onEvent: (event: SessionNotification) => {
            if (evidence.events.length >= 10000)
              return
            const update = event.update
            const title = 'title' in update && typeof update.title === 'string' ? update.title : ''
            const status = 'status' in update && typeof update.status === 'string' ? update.status : ''
            evidence.events.push({ type: update.sessionUpdate, summary: redact([title, status].filter(Boolean).join(' ')).slice(0, 500) })
          },
          handlers: {
            'session/request_permission': ({ params }: { params: { options: Array<{ kind: string, optionId: string }> } }) => {
              const option = params.options.find(item => item.kind === 'allow_once')
              return option ? { outcome: { outcome: 'selected' as const, optionId: option.optionId } } : { outcome: { outcome: 'cancelled' as const } }
            },
          },
        }
        const initialization = value(await ai.acp.agents.check('goose', callbacks))
        const canResume = Boolean(initialization.agentCapabilities?.loadSession || initialization.agentCapabilities?.sessionCapabilities?.resume)
        evidence.events.push({ type: 'native_capabilities', summary: `Native resume/load capability: ${canResume ? 'advertised' : 'not advertised'}` })
        let session = value(await ai.acp.sessions.create({ id: 'goose-remote', agentId: 'goose', cwd: '/workspace', ...callbacks }))
        const nativeId = value(await session.info()).nativeId
        expect(nativeId).toBeTruthy()
        const phases = canResume ? ['initial', 'resumed'] as const : ['initial'] as const
        for (const phase of phases) {
          const token = `GOOSE-${randomUUID()}`
          const input = phase === 'initial' ? 'challenge.txt' : 'resume-challenge.txt'
          const output = phase === 'initial' ? 'result.txt' : 'resumed-result.txt'
          await engineCommand(engine, ['exec', container, 'node', '-e', 'require("node:fs").writeFileSync(process.argv[1],process.argv[2])', `/workspace/${input}`, token])
          if (phase === 'resumed') {
            value(await session.close())
            session = value(await ai.acp.sessions.resume('goose-remote', callbacks))
          }
          expect(value(await session.info()).nativeId).toBe(nativeId)
          const offset = evidence.events.length
          const response = value(await session.prompt([{ type: 'text', text: `Use your actual developer tools to read /workspace/${input}. It contains a unique random token not included in this prompt. Write exactly that token (optional final newline) to /workspace/${output}. Then reply with exactly the token. Do not inspect environment variables, credentials or files outside /workspace. This is an isolated acceptance fixture; writing the result is authorized. Do not simulate tool use.` }]))
          const fileContent = redact((await engineCommand(engine, ['exec', container, 'node', '-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1],"utf8"))', `/workspace/${output}`])).trim())
          const reply = redact(response.text.trim())
          const toolCalls = evidence.events.slice(offset).filter(event => event.type === 'tool_call').length
          evidence.rounds.push({ phase, stopReason: response.stopReason, reply, expectedToken: token, fileContent, nativeId: nativeId ?? '', toolCalls })
          evidence.files.push({ path: `/workspace/${output}`, passed: fileContent === token, summary: fileContent })
          evidence.reply += `${phase}: ${reply}\n`
          expect(response.stopReason).toBe('end_turn')
          expect(toolCalls).toBeGreaterThan(0)
          expect(fileContent).toBe(token)
          // 验证回复实际包含随机值；不把模型的 Markdown/说明文字当成传输失败。
          expect(reply).toContain(token)
        }
        value(await session.close())
        if (!canResume) {
          const resume = await ai.acp.sessions.resume('goose-remote', callbacks)
          expect(resume.success).toBe(false)
          if (!resume.success)
            expect(resume.error.code).toBe('hai:ai:075')
          evidence.events.push({ type: 'resume', summary: 'Native resume/load not advertised; explicit resume correctly returned ACP_UNSUPPORTED' })
        }
      }
      catch (error) {
        failed = true
        evidence.error = redact(error instanceof Error ? error.message : String(error)).slice(0, 5000)
      }
      finally {
        const cleanupErrors: string[] = []
        try {
          await ai.close()
        }
        catch {
          cleanupErrors.push('AI transport cleanup failed')
        }
        if (engine && container) {
          try {
            await engineCommand(engine, ['rm', '--force', container])
            const exists = await exec(engine, ['container', 'inspect', container], { windowsHide: true }).then(() => true, () => false)
            if (exists)
              cleanupErrors.push('Owned Goose container still exists')
          }
          catch {
            cleanupErrors.push('Owned Goose container cleanup failed')
          }
        }
        for (const volume of volumes) {
          try {
            if (engine)
              await engineCommand(engine, ['volume', 'rm', volume])
          }
          catch {
            cleanupErrors.push('Owned Goose volume cleanup failed')
          }
        }
        if (previousSecret === undefined)
          delete process.env.HAI_ACP_GOOSE_SECRET
        else
          process.env.HAI_ACP_GOOSE_SECRET = previousSecret
        evidence.cleanup = { status: cleanupErrors.length ? 'failed' : 'passed', summary: cleanupErrors.join('; ') || 'Owned native Goose service, ACP transports and temporary volumes removed' }
        if (cleanupErrors.length) {
          failed = true
          evidence.error = [evidence.error, ...cleanupErrors].filter(Boolean).join('; ')
        }
        evidence.finishedAt = new Date().toISOString()
        evidence.durationMs = Date.now() - started
        evidence.status = failed ? 'failed' : 'passed'
        await writeFile(evidenceFile, redact(JSON.stringify(evidence, null, 2)))
      }
      if (failed)
        throw new Error(evidence.error ?? 'Goose native remote acceptance failed')
    }, 660000)
  }
})
