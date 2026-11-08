import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { HaiResult } from '@h-ai/core'
import type { ACPSessionInfo } from '../src/index.js'
import { execFile } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ai, ModelCapabilitiesSchema } from '../src/index.js'

const exec = promisify(execFile)
const required = process.env.HAI_ACP_E2E_REQUIRED === '1'
const enabled = required || process.env.HAI_ACP_E2E_OPENROUTER === '1'
const apiKey = process.env.OPENROUTER_APIKEY?.trim()
const evidenceRoot = resolve('test-results/acp-openrouter')
const cases = [
  {
    adapter: 'codex',
    mode: 'embedded',
    protocol: 'responses',
    commandPrefix: 'CODEX',
  },
  {
    adapter: 'codex',
    mode: 'builtin-service',
    protocol: 'responses',
    commandPrefix: 'CODEX',
  },
  {
    adapter: 'deepseek-harness',
    mode: 'embedded',
    protocol: 'chat',
    commandPrefix: 'DSH',
  },
  {
    adapter: 'deepseek-harness',
    mode: 'builtin-service',
    protocol: 'chat',
    commandPrefix: 'DSH',
  },
] as const

/** 仅持久化验收所需白名单信息，不保存原生配置、环境变量或完整工具输入。 */
interface Evidence {
  id: string
  agent: string
  mode: string
  model: string
  task: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  status: 'running' | 'passed' | 'failed'
  stage: string
  events: Array<{ type: string, summary: string }>
  files: Array<{ path: string, passed: boolean, summary: string }>
  reply: string
  rounds: Array<{ phase: string, stopReason: string, reply: string, expectedToken: string, fileContent: string, nativeId: string, toolCalls: number, writeReply: string, writeStopReason: string, writeToolCalls: number, readbackToolCalls: number }>
  cleanup: { status: 'pending' | 'passed' | 'failed', summary: string }
  error?: string
}

/** 二次防护：已知密钥及常见凭据形式在断言/持久化前统一脱敏。 */
function redact(text: string): string {
  let result = apiKey
    ? text.replaceAll(apiKey, '[REDACTED]')
    : text
  result = result.replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
  result = result.replace(/\bsk-or-[\w-]+/gi, '[REDACTED]')
  return result
}

/** HaiResult 失败不输出底层配置或 cause，保留定位所需错误码和文案。 */
function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(redact(`${result.error.code}: ${result.error.message}`))
  return result.data
}

/** 不让容器客户端 stderr 或整条命令行泄漏进证据和测试输出。 */
async function engineCommand(engine: string, args: string[]): Promise<string> {
  try {
    return (await exec(engine, args, { timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true })).stdout.trim()
  }
  catch {
    throw new Error('ACP acceptance container command failed')
  }
}

/** 与框架一致，仅探测已安装且实际就绪的引擎，auto 优先 Podman。 */
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

/** 绝不通过 shell 启动 npm .cmd；Windows 使用显式入口或全局安装的 Node bin。 */
async function embeddedLaunch(prefix: 'CODEX' | 'DSH'): Promise<{ command: string, args: string[] }> {
  const command = process.env[`HAI_ACP_E2E_${prefix}_COMMAND`]
  const encodedArgs = process.env[`HAI_ACP_E2E_${prefix}_ARGS`]
  let args: string[] = []
  if (encodedArgs) {
    const parsed: unknown = JSON.parse(encodedArgs)
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string'))
      throw new Error(`HAI_ACP_E2E_${prefix}_ARGS must be a JSON string array`)
    args = parsed
  }
  if (command) {
    if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command))
      throw new Error(`Use node.exe plus the native JS entry in HAI_ACP_E2E_${prefix}_COMMAND/ARGS`)
    return { command, args }
  }
  if (encodedArgs)
    throw new Error(`HAI_ACP_E2E_${prefix}_ARGS requires an explicit COMMAND`)
  if (process.platform !== 'win32') {
    return {
      command: prefix === 'CODEX'
        ? 'codex-acp'
        : 'dsh',
      args: [],
    }
  }
  const packageName = prefix === 'CODEX'
    ? '@agentclientprotocol/codex-acp'
    : '@deepseek-ai/dsh'
  const packageRoot = join(process.env.APPDATA ?? '', 'npm/node_modules', packageName)
  try {
    const manifest: unknown = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    if (!manifest || typeof manifest !== 'object' || !('bin' in manifest))
      throw new Error('Native bin missing')
    const bin = manifest.bin
    const entry = typeof bin === 'string'
      ? bin
      : bin && typeof bin === 'object'
        ? Object.values(bin)[0]
        : undefined
    if (typeof entry !== 'string')
      throw new TypeError('Native bin missing')
    const path = resolve(packageRoot, entry)
    if (['.js', '.mjs', '.cjs'].includes(extname(path))) {
      return {
        command: process.execPath,
        args: [path],
      }
    }
    if (extname(path) === '.exe')
      return { command: path, args: [] }
  }
  catch {
    // 非默认 npm prefix 或原生二进制布局由调用方显式提供，不猜测可执行文件。
  }
  throw new Error(`Configure HAI_ACP_E2E_${prefix}_COMMAND/ARGS for the installed native program`)
}

/** 事件仅保留类型、工具标题/状态与有限回复摘要，不落盘 rawInput/rawOutput。 */
function eventSummary(event: SessionNotification): { type: string, summary: string } {
  const update = event.update
  if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
    return {
      type: update.sessionUpdate,
      summary: redact(update.content.text).slice(0, 1000),
    }
  }
  const title = 'title' in update && typeof update.title === 'string'
    ? update.title
    : ''
  const status = 'status' in update && typeof update.status === 'string'
    ? update.status
    : ''
  return {
    type: update.sessionUpdate,
    summary: redact([title, status].filter(Boolean).join(' ')).slice(0, 500),
  }
}

/** 读取由真实 Agent 写出的文件；容器场景在该会话实际拥有的容器内读取。 */
async function sessionFile(info: ACPSessionInfo, name: string, engine?: string): Promise<string> {
  if (!engine)
    return readFile(join(info.cwd, 'files', name), 'utf8')
  if (!info.resource?.container)
    throw new Error('Native container session has no owned container')
  return engineCommand(engine, [
    'exec',
    info.resource.container,
    'node',
    '-e',
    'process.stdout.write(require("node:fs").readFileSync(process.argv[1],"utf8"))',
    `${info.cwd}/files/${name}`,
  ])
}

/** 容器删除仅接受本次私有 volume 查询得到的完整容器 ID。 */
function ownedContainerIds(text: string): string[] {
  const ids = text.split(/\s+/).filter(Boolean)
  if (ids.some(container => !/^[a-f0-9]{12,64}$/.test(container)))
    throw new Error('Unexpected container ID')
  return ids
}

/** 验证绝对路径后仅回收本次 mkdtemp 创建的私有目录。 */
async function removeDirectory(directory: string): Promise<void> {
  if (dirname(directory) !== resolve(tmpdir()) || !directory.startsWith(join(tmpdir(), 'hai-acp-openrouter-')))
    throw new Error('Unexpected acceptance directory')
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  })
}

describe('openRouter real native ACP acceptance', { concurrent: false }, () => {
  for (const agent of cases) {
    it.skipIf(!enabled || (!apiKey && !required))(`${agent.adapter} / ${agent.mode}: 真实模型、工程工具与恢复`, async () => {
      const started = Date.now()
      const id = `${agent.adapter}-${agent.mode}`
      const model = process.env.HAI_ACP_E2E_MODEL ?? ''
      const evidence: Evidence = {
        id,
        agent: agent.adapter,
        mode: agent.mode,
        model,
        task: 'Copy a synthetic inventory note to a result file. Independently request tool-based readback of the result. Close and resume, then repeat both steps with an updated note.',
        startedAt: new Date(started).toISOString(),
        status: 'running',
        stage: 'config',
        events: [],
        files: [],
        rounds: [],
        reply: '',
        cleanup: { status: 'pending', summary: '' },
      }
      await mkdir(evidenceRoot, { recursive: true })
      const evidenceFile = join(evidenceRoot, `${id}.json`)
      await writeFile(evidenceFile, redact(JSON.stringify(evidence, null, 2)))
      let directory: string | undefined
      let engine: 'podman' | 'docker' | undefined
      let volume: string | undefined
      let volumeCreated = false
      let failed = false
      try {
        if (!apiKey || !model || !process.env.HAI_ACP_E2E_CAPABILITIES)
          throw new Error('Real ACP acceptance requires OPENROUTER_APIKEY, HAI_ACP_E2E_MODEL and HAI_ACP_E2E_CAPABILITIES')
        const metadata: unknown = JSON.parse(process.env.HAI_ACP_E2E_CAPABILITIES)
        const capabilities = ModelCapabilitiesSchema.parse(metadata)
        if (!capabilities.contextWindow || !capabilities.maxOutputTokens || !capabilities.inputModalities?.includes('text') || capabilities.toolCalling !== true || !capabilities.reasoning)
          throw new Error('Real ACP acceptance requires verified capacity, text input, tool calling and reasoning metadata')
        const baseUrl = process.env.HAI_ACP_E2E_BASEURL ?? 'https://openrouter.ai/api/v1'
        const parsedUrl = new URL(baseUrl)
        if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password)
          throw new Error('Real ACP upstream must use HTTPS without URL credentials')
        evidence.stage = 'init'
        value(await ai.init({
          llm: {
            models: [
              {
                id: 'coding',
                model,
                protocol: agent.protocol,
                apiKey,
                baseUrl,
                maxTokens: 1024,
                capabilities,
              },
            ],
          },
          acp: {
            requestTimeout: 120000,
            promptTimeout: 240000,
            cancelTimeout: 5000,
            maxPendingEvents: 4096,
          },
        }))
        if (agent.mode === 'embedded') {
          evidence.stage = 'embedded-launch'
          directory = await mkdtemp(join(tmpdir(), 'hai-acp-openrouter-'))
          const launch = await embeddedLaunch(agent.commandPrefix)
          evidence.stage = 'register-workspace'
          value(await ai.acp.workspaces.register({
            id: 'project',
            storage: { type: 'directory', path: directory },
          }))
          evidence.stage = 'register-agent'
          value(await ai.acp.agents.register({
            id: 'coder',
            name: id,
            mode: 'embedded',
            adapter: agent.adapter,
            modelIds: ['coding'],
            ...launch,
          }))
        }
        else {
          evidence.stage = 'container-engine'
          engine = await readyEngine()
          const image = agent.adapter === 'codex'
            ? process.env.HAI_ACP_E2E_IMAGE
            : process.env.HAI_ACP_E2E_DSH_IMAGE
          if (!image)
            throw new Error('Real container acceptance requires HAI_ACP_E2E_IMAGE and HAI_ACP_E2E_DSH_IMAGE')
          // 只使用已有镜像，不在付费验收中隐式安装或升级工具。
          await engineCommand(engine, ['image', 'inspect', image])
          volume = `hai-openrouter-e2e-${randomUUID()}`
          await engineCommand(engine, ['volume', 'create', volume])
          volumeCreated = true
          evidence.stage = 'register-workspace'
          value(await ai.acp.workspaces.register({
            id: 'project',
            storage: {
              type: 'volume',
              name: volume,
              image,
              engine,
            },
          }))
          evidence.stage = 'register-agent'
          value(await ai.acp.agents.register({
            id: 'coder',
            name: id,
            mode: 'builtin-service',
            adapter: agent.adapter,
            image,
            engine,
            modelIds: ['coding'],
          }))
        }
        evidence.stage = 'prepare'
        value(await ai.acp.workspaces.prepare('project'))
        // 使用普通业务文本，避免把形似访问凭据的标记交给真实模型复述。
        const item = randomInt(10000, 100000)
        const firstNote = `Inventory item ${item} is a blue clipboard on the front desk.`
        evidence.stage = 'import-initial'
        value(await ai.acp.workspaces.importFiles('project', [
          { path: 'challenge.txt', content: firstNote },
        ]))
        const options = {
          onEvent: (event: SessionNotification) => {
            if (evidence.events.length < 10000)
              evidence.events.push(eventSummary(event))
          },
          handlers: {
            'session/request_permission': ({ params }: { params: { options: Array<{ kind: string, optionId: string }> } }) => {
              const option = params.options.find(item => item.kind === 'allow_once')
              return option
                ? {
                    outcome: { outcome: 'selected' as const, optionId: option.optionId },
                  }
                : {
                    outcome: { outcome: 'cancelled' as const },
                  }
            },
          },
        }
        evidence.stage = 'create'
        let session = value(await ai.acp.sessions.create({
          id: 'real-tool-session',
          agentId: 'coder',
          workspaceId: 'project',
          ...options,
        }))
        evidence.stage = 'info-initial'
        const originalNativeId = value(await session.info()).nativeId
        expect(originalNativeId).toBeTruthy()
        for (const phase of ['initial', 'resumed'] as const) {
          const note = phase === 'initial'
            ? firstNote
            : `Inventory item ${item} is now a green folder on the second shelf.`
          const input = phase === 'initial'
            ? 'challenge.txt'
            : 'resume-challenge.txt'
          const output = phase === 'initial'
            ? 'result.txt'
            : 'resumed-result.txt'
          if (phase === 'resumed') {
            evidence.stage = 'close-before-resume'
            value(await session.close())
            evidence.stage = 'import-resumed'
            value(await ai.acp.workspaces.importFiles('project', [
              { path: input, content: note },
            ]))
            evidence.stage = 'resume'
            session = value(await ai.acp.sessions.resume('real-tool-session', options))
          }
          evidence.stage = `info-${phase}`
          const info = value(await session.info())
          expect(info.nativeId).toBe(originalNativeId)
          const eventOffset = evidence.events.length
          evidence.stage = `prompt-${phase}`
          const written = value(await session.prompt([
            { type: 'text', text: `In workspace ${JSON.stringify(info.cwd)}, use an actual workspace tool to copy files/${input} byte for byte to files/${output}. The input is a synthetic inventory note whose wording is only in the file. Use a file-copy operation such as cp files/${input} files/${output} on Linux or Copy-Item on PowerShell, so the bytes come directly from the source file. Verify the two files match using a workspace tool, then briefly confirm completion. Limit the operation to these two files in the temporary workspace.` },
          ]))
          evidence.stage = `verify-write-${phase}`
          const fileContent = redact((await sessionFile(info, output, engine)).trim())
          const writeReply = redact(written.text.trim())
          const writeToolCalls = evidence.events.slice(eventOffset).filter(event => event.type === 'tool_call').length
          evidence.files.push({ path: `files/${output}`, passed: fileContent === note, summary: fileContent })
          expect(written.stopReason).toBe('end_turn')
          expect(writeToolCalls).toBeGreaterThan(0)
          expect(writeReply.length).toBeGreaterThan(0)
          expect(fileContent).toBe(note)
          // 每轮固定执行独立读回，不依据上一条回复是否复述标记来重试任务。
          const readbackOffset = evidence.events.length
          evidence.stage = `readback-${phase}`
          const response = value(await session.prompt([
            { type: 'text', text: `Use an actual workspace tool to read files/${output} from disk. Include the complete inventory note exactly as it appears in the file in your final response. Limit this operation to reading that file.` },
          ]))
          evidence.stage = `verify-readback-${phase}`
          const reply = redact(response.text.trim())
          const readbackToolCalls = evidence.events.slice(readbackOffset).filter(event => event.type === 'tool_call').length
          const toolCalls = evidence.events.slice(eventOffset).filter(event => event.type === 'tool_call').length
          evidence.rounds.push({
            phase,
            stopReason: response.stopReason,
            reply,
            expectedToken: note,
            fileContent,
            nativeId: info.nativeId ?? '',
            toolCalls,
            writeReply,
            writeStopReason: written.stopReason,
            writeToolCalls,
            readbackToolCalls,
          })
          evidence.reply += `${phase} write: ${writeReply}\n${phase} readback: ${reply}\n`
          expect(response.stopReason).toBe('end_turn')
          expect(readbackToolCalls).toBeGreaterThan(0)
          // ACP 文本可包含原生 commentary，回复仍须包含从文件读出的完整内容。
          expect(reply).toContain(note)
        }
        evidence.stage = 'close'
        value(await session.close())
      }
      catch (error) {
        failed = true
        evidence.error = redact(`${evidence.stage}: ${error instanceof Error
          ? error.message
          : String(error)}`).slice(0, 5000)
      }
      finally {
        const cleanupErrors: string[] = []
        try {
          await ai.close()
        }
        catch {
          cleanupErrors.push('AI close failed; owned resource cleanup requires inspection')
        }
        if (engine && volume && volumeCreated) {
          try {
            const ids = ownedContainerIds(await engineCommand(engine, [
              'ps',
              '-aq',
              '--filter',
              `volume=${volume}`,
            ]))
            if (ids.length)
              await engineCommand(engine, ['rm', '-f', ...ids])
            for (const name of [volume, `${volume}-state`]) {
              const exists = await exec(engine, ['volume', 'inspect', name], { windowsHide: true }).then(() => true, () => false)
              if (exists)
                await engineCommand(engine, ['volume', 'rm', name])
            }
          }
          catch {
            cleanupErrors.push('Owned acceptance container/volume cleanup failed')
          }
        }
        if (directory) {
          try {
            await removeDirectory(directory)
          }
          catch {
            cleanupErrors.push('Owned acceptance directory cleanup failed')
          }
        }
        evidence.cleanup = {
          status: cleanupErrors.length ? 'failed' : 'passed',
          summary: cleanupErrors.join('; ') || 'Owned sessions, processes, containers, volumes and temporary files closed or removed',
        }
        if (cleanupErrors.length) {
          if (!failed)
            evidence.stage = 'cleanup'
          failed = true
          evidence.error = [evidence.error, ...cleanupErrors].filter(Boolean).join('; ')
        }
        if (!failed)
          evidence.stage = 'complete'
        evidence.finishedAt = new Date().toISOString()
        evidence.durationMs = Date.now() - started
        evidence.status = failed ? 'failed' : 'passed'
        await writeFile(evidenceFile, redact(JSON.stringify(evidence, null, 2)))
      }
      if (failed)
        throw new Error(evidence.error ?? 'Real ACP acceptance failed')
    }, 660000)
  }
})
