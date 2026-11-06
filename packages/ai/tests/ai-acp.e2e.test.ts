import type { HaiResult } from '@h-ai/core'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ai } from '../src/index.js'

const exec = promisify(execFile)
const fixture = resolve('tests/fixtures/acp-agent.mjs')
let temporary: string
function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(JSON.stringify(result.error))
  return result.data
}
async function git(cwd: string, args: string[]) {
  return (await exec('git', ['-C', cwd, ...args])).stdout.trim()
}
async function seed(name: string, branch: string) {
  const remote = join(temporary, `${name}.git`)
  const source = join(temporary, `${name}-seed`)
  await exec('git', ['init', '--bare', remote])
  await exec('git', ['init', '-b', branch, source])
  await git(source, ['config', 'user.name', 'ACP test'])
  await git(source, ['config', 'user.email', 'test@example.invalid'])
  await writeFile(join(source, 'hello.txt'), 'base')
  await git(source, ['add', '.'])
  await git(source, ['commit', '-m', 'base'])
  await git(source, ['remote', 'add', 'origin', remote])
  await git(source, ['push', 'origin', branch])
  return { remote, source }
}
beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'hai-acp-e2e-'))
  value(
    await ai.init({
      acp: { promptTimeout: 1000, cancelTimeout: 100, requestTimeout: 5000 },
    }),
  )
  value(
    await ai.acp.agents.register({
      id: 'fixture',
      name: 'Fixture',
      mode: 'embedded',
      command: process.execPath,
      args: [fixture],
    }),
  )
})
afterEach(async () => {
  await ai.close()
  await rm(temporary, { recursive: true, force: true })
})
async function workspace(
  repositories: Array<{ id: string, url: string, mainBranch: string }> = [],
) {
  value(
    await ai.acp.workspaces.register({
      id: 'project',
      storage: { type: 'directory', path: join(temporary, 'workspace') },
      repositories,
    }),
  )
  value(await ai.acp.workspaces.prepare('project'))
}
const prompt = (text: string) => [{ type: 'text' as const, text }]
const author = { name: 'ACP test', email: 'test@example.invalid' }
describe('aCP managed session E2E', () => {
  it.each([false, true])('从已登记仓库启动和恢复，独立工作树=%s', async (newWorktree) => {
    const api = await seed('api', 'trunk')
    const web = await seed('web', 'trunk')
    await mkdir(join(web.source, '.agents', 'skills', 'sample'), { recursive: true })
    await writeFile(join(web.source, 'AGENTS.md'), 'web instructions')
    await writeFile(join(web.source, '.agents', 'skills', 'sample', 'SKILL.md'), 'web skill v2')
    await git(web.source, ['add', '.'])
    await git(web.source, ['commit', '-m', 'instructions and skill'])
    await git(web.source, ['push', 'origin', 'trunk'])
    await workspace([{ id: 'api', url: api.remote, mainBranch: 'trunk' }, { id: 'web', url: web.remote, mainBranch: 'trunk' }])

    const options = { id: 'selected', agentId: 'fixture', workspaceId: 'project', newWorktree }
    for (const repositoryId of ['missing', '../web']) {
      expect((await ai.acp.sessions.create({ ...options, repositoryId })).success).toBe(false)
    }
    expect(value(await ai.acp.sessions.list())).toEqual([])
    const session = value(await ai.acp.sessions.create({ ...options, repositoryId: 'web' }))
    const info = value(await session.info())
    expect(info.repositoryId).toBe('web')
    const directory = newWorktree ? join('sessions', 'selected') : 'main'
    expect(info.cwd).toBe(await realpath(join(temporary, 'workspace', directory, 'web')))
    const expected = { cwd: info.cwd, processCwd: info.cwd, instructions: 'web instructions', skill: 'web skill v2' }
    expect(JSON.parse(value(await session.prompt(prompt('inspect-repo'))).text)).toEqual(expected)
    value(await session.close())
    const resumed = value(await ai.acp.sessions.resume(session.id))
    expect(JSON.parse(value(await resumed.prompt(prompt('inspect-repo'))).text)).toEqual(expected)
  }, 20000)

  it.each(['signal', 'api'] as const)('cooperative cancellation via %s 保留不可恢复 Agent 的同一会话和进程', async (method) => {
    await ai.close()
    value(await ai.init({ acp: { promptTimeout: 5000, cancelTimeout: 1000 } }))
    await workspace()
    value(await ai.acp.agents.register({ id: 'no-resume', name: 'No resume', mode: 'embedded', command: process.execPath, args: [fixture, '--no-resume'] }))
    const checked = value(await ai.acp.agents.check('no-resume', { workspaceId: 'project' }))
    expect(checked.agentCapabilities?.loadSession).toBe(false)
    expect(checked.agentCapabilities?.sessionCapabilities?.resume).toBeUndefined()
    let accepted: () => void = () => {}
    const ready = new Promise<void>((done) => {
      accepted = done
    })
    const session = value(await ai.acp.sessions.create({
      agentId: 'no-resume',
      workspaceId: 'project',
      onEvent(event) {
        if (event.update.sessionUpdate === 'agent_message_chunk' && event.update.content.type === 'text' && event.update.content.text === 'waiting')
          accepted()
      },
    }))
    const nativeId = value(await session.info()).nativeId
    const pid = value(await session.prompt(prompt('pid'))).text
    const controller = new AbortController()
    const waiting = session.prompt(prompt('wait'), controller.signal)
    await ready
    if (method === 'signal')
      controller.abort()
    else
      value(await session.cancel())
    const cancelled = await waiting
    expect(cancelled.success).toBe(false)
    if (!cancelled.success)
      expect(cancelled.error.code).toBe('hai:ai:076')
    expect(value(await session.prompt(prompt('continue'))).text).toBe('continue')
    expect(value(await session.prompt(prompt('pid'))).text).toBe(pid)
    expect(value(await session.info()).nativeId).toBe(nativeId)
    const occupied = await ai.acp.sessions.create({ agentId: 'no-resume', workspaceId: 'project' })
    expect(occupied.success).toBe(false)
    if (!occupied.success)
      expect(occupied.error.code).toBe('hai:ai:074')
    value(await session.close())
  }, 20000)

  it('uncooperative cancellation 到期限仍关闭连接，并保留目录占用至 close', async () => {
    await workspace()
    let accepted: () => void = () => {}
    const ready = new Promise<void>((done) => {
      accepted = done
    })
    const session = value(await ai.acp.sessions.create({
      agentId: 'fixture',
      workspaceId: 'project',
      onEvent(event) {
        if (event.update.sessionUpdate === 'agent_message_chunk' && event.update.content.type === 'text' && event.update.content.text === 'hanging')
          accepted()
      },
    }))
    const controller = new AbortController()
    const waiting = session.prompt(prompt('hang'), controller.signal)
    await ready
    controller.abort()
    const cancelled = await waiting
    expect(cancelled.success).toBe(false)
    if (!cancelled.success)
      expect(cancelled.error.code).toBe('hai:ai:076')
    const next = await session.prompt(prompt('continue'))
    expect(next.success).toBe(false)
    if (!next.success)
      expect(next.error.code).toBe('hai:ai:081')
    const occupied = await ai.acp.sessions.create({ agentId: 'fixture', workspaceId: 'project' })
    expect(occupied.success).toBe(false)
    if (!occupied.success)
      expect(occupied.error.code).toBe('hai:ai:074')
    value(await session.close())
    value(await ai.acp.sessions.create({ agentId: 'fixture', workspaceId: 'project' }))
  }, 20000)

  it.skipIf(process.platform === 'win32')('进程清理失败保留连接，显式重试可以再次清理', async () => {
    const connection = value(await ai.acp.connect({ type: 'stdio', command: process.execPath, args: [fixture], env: { HOME: temporary } }))
    const kill = vi.spyOn(process, 'kill').mockImplementationOnce(() => {
      throw Object.assign(new Error('Controlled kill failure'), { code: 'EACCES' })
    })
    try {
      const closed = await connection.close()
      expect(closed.success).toBe(false)
      if (!closed.success)
        expect(closed.error.code).toBe('hai:ai:084')
    }
    finally {
      kill.mockRestore()
    }
    value(await connection.close())
  })

  it('同一原生连接并发建会话只发送一次 session/new', async () => {
    const counter = join(temporary, 'native-count.txt')
    const source = `import fs from 'node:fs'; let count = 0; const output = process.stdout.write.bind(process.stdout); process.stdout.write = (chunk) => { const message = JSON.parse(chunk); if (message.result?.sessionId) fs.writeFileSync(${JSON.stringify(counter)}, String(++count)); return output(chunk) };\n${await readFile(fixture, 'utf8')}`
    const connection = value(await ai.acp.connect({ type: 'stdio', command: process.execPath, args: ['--input-type=module', '-e', source], env: { HOME: temporary } }))
    const created = await Promise.all([connection.createSession(temporary), connection.createSession(temporary)])
    expect(created.filter(result => result.success)).toHaveLength(1)
    const failed = created.find(result => !result.success)
    expect(failed?.success).toBe(false)
    if (failed && !failed.success)
      expect(failed.error.code).toBe('hai:ai:074')
    expect(await readFile(counter, 'utf8')).toBe('1')
    value(await connection.close())
  })

  it('禁用智能体不遗留无法移除的 opening 会话', async () => {
    await workspace()
    value(await ai.acp.agents.register({ id: 'disabled', name: 'Disabled', mode: 'embedded', command: process.execPath, args: [fixture], enabled: false }))
    const created = await ai.acp.sessions.create({ id: 'disabled-session', agentId: 'disabled', workspaceId: 'project' })
    expect(created.success).toBe(false)
    if (!created.success)
      expect(created.error.code).toBe('hai:ai:075')
    expect(value(await ai.acp.sessions.list())).toEqual([])
    value(await ai.acp.agents.remove('disabled'))
    value(await ai.acp.workspaces.remove('project'))
  })

  it('重新初始化的持续清理失败仍返回 HaiResult，并保留旧资源供重试', async () => {
    const previous = ai.acp
    const llm = ai.llm
    const failure = new Error('Controlled ACP cleanup failure')
    const cleanup = vi.spyOn(previous, 'close').mockRejectedValue(failure)
    try {
      const initialized = await ai.init()
      expect(initialized.success).toBe(false)
      if (!initialized.success)
        expect(initialized.error.code).toBe('hai:ai:011')
      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(ai.acp).toBe(previous)
      expect(ai.llm).toBe(llm)
      expect(ai.isInitialized).toBe(true)
    }
    finally {
      cleanup.mockRestore()
    }
    await ai.close()
    expect(ai.isInitialized).toBe(false)
  })

  it.skipIf(process.platform === 'win32')('恢复时拒绝原生配置文件的悬空符号链接', async () => {
    await ai.close()
    let statePath = ''
    value(await ai.init({}, {
      acpAdapters: {
        configuration: {
          configure(input) {
            statePath = input.statePath
            return { command: process.execPath, args: [fixture], env: {}, files: { 'native.json': '{"ok":true}' } }
          },
        },
      },
    }))
    value(await ai.acp.agents.register({ id: 'configured', name: 'Configured', mode: 'embedded', adapter: 'configuration' }))
    await workspace()
    const session = value(await ai.acp.sessions.create({ id: 'linked', agentId: 'configured', workspaceId: 'project' }))
    value(await session.close())
    const target = join(temporary, 'escaped-native.json')
    const link = join(statePath, 'native.json')
    await unlink(link)
    await symlink(target, link)
    const resumed = await ai.acp.sessions.resume('linked')
    expect(resumed.success).toBe(false)
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(value(await ai.acp.sessions.get('linked')).id).toBe('linked')
    value(await ai.acp.sessions.remove('linked'))
    // teardown 不跟随链接；删除本次创建的链接，不删除目标文件。
    await unlink(link)
  }, 20000)

  it.each(['submodule', 'lfs'])('prepare 遇到 %s 不把不完整内容报告为就绪', async (kind) => {
    const repo = await seed('unsupported', 'trunk')
    if (kind === 'submodule') {
      const commit = await git(repo.source, ['rev-parse', 'HEAD'])
      await git(repo.source, ['update-index', '--add', '--cacheinfo', `160000,${commit},vendor`])
    }
    else {
      await writeFile(join(repo.source, '.gitattributes'), '*.bin filter=lfs diff=lfs merge=lfs -text\n')
      await git(repo.source, ['add', '.gitattributes'])
    }
    await git(repo.source, ['commit', '-m', 'unsupported content'])
    await git(repo.source, ['push', 'origin', 'trunk'])
    value(await ai.acp.workspaces.register({ id: 'project', storage: { type: 'directory', path: join(temporary, 'workspace') }, repositories: [{ id: 'code', url: repo.remote, mainBranch: 'trunk' }] }))
    const prepared = await ai.acp.workspaces.prepare('project')
    expect(prepared.success).toBe(false)
    if (!prepared.success)
      expect(prepared.error.code).toBe('hai:ai:075')
  }, 20000)

  it('会话绑定与工作区删除并发时不会留下悬空引用', async () => {
    await workspace()
    const [created, removed] = await Promise.all([
      ai.acp.sessions.create({ id: 'race', agentId: 'fixture', workspaceId: 'project' }),
      ai.acp.workspaces.remove('project'),
    ])
    expect(created.success && removed.success).toBe(false)
    if (created.success) {
      expect((await ai.acp.workspaces.get('project')).success).toBe(true)
      value(await created.data.close())
      value(await ai.acp.sessions.remove('race'))
    }
    else {
      expect(value(await ai.acp.sessions.list())).toHaveLength(0)
    }
  }, 20000)
  it('真实 stdio：早期事件、文件、结构化输出、流和恢复', async () => {
    await workspace()
    value(
      await ai.acp.workspaces.importFiles('project', [
        { path: 'spec.txt', content: 'requirement' },
      ]),
    )
    const events: string[] = []
    const session = value(
      await ai.acp.sessions.create({
        id: 'one',
        agentId: 'fixture',
        workspaceId: 'project',
        onEvent: event => events.push(event.update.sessionUpdate),
      }),
    )
    expect(events).toContain('agent_message_chunk')
    expect(
      value(
        await session.promptStructured(
          prompt('json'),
          z.object({ answer: z.number() }),
        ),
      ).answer,
    ).toBe(42)
    expect(
      (
        await session.promptStructured(
          prompt('bad-json'),
          z.object({ answer: z.number() }),
        )
      ).success,
    ).toBe(false)
    value(await session.prompt(prompt('write')))
    expect(
      await readFile(join(temporary, 'workspace/main/files/agent.txt'), 'utf8'),
    ).toBe('agent output')
    const chunks = []
    for await (const event of session.stream(prompt('streamed')))
      chunks.push(event)
    expect(chunks).toHaveLength(1)
    value(await session.close())
    expect((await session.prompt(prompt('closed'))).success).toBe(false)
    const resumed = value(await ai.acp.sessions.resume('one'))
    expect(value(await resumed.prompt(prompt('resumed'))).text).toBe('resumed')
  })
  it('共享目录互斥、上传不覆盖、不支持的输入明确失败', async () => {
    await workspace()
    value(
      await ai.acp.workspaces.importFiles('project', [
        { path: 'spec.txt', content: 'one' },
      ]),
    )
    expect(
      (
        await ai.acp.workspaces.importFiles('project', [
          { path: 'spec.txt', content: 'two' },
        ])
      ).success,
    ).toBe(false)
    expect(
      (
        await ai.acp.workspaces.importFiles('project', [
          { path: '../escape', content: 'two' },
        ])
      ).success,
    ).toBe(false)
    const first = value(
      await ai.acp.sessions.create({
        id: 'first',
        agentId: 'fixture',
        workspaceId: 'project',
      }),
    )
    expect(
      (
        await ai.acp.sessions.create({
          id: 'second',
          agentId: 'fixture',
          workspaceId: 'project',
        })
      ).success,
    ).toBe(false)
    expect((await ai.acp.workspaces.prepare('project')).success).toBe(false)
    expect(
      (await first.publish({ mode: 'push-branch', message: 'unsafe', author }))
        .success,
    ).toBe(false)
    expect(
      (
        await first.prompt([
          { type: 'image', mimeType: 'image/png', data: 'AA==' },
        ])
      ).success,
    ).toBe(false)
    value(await first.close())
    value(
      await ai.acp.sessions.create({
        id: 'third',
        agentId: 'fixture',
        workspaceId: 'project',
      }),
    )
  })
  it('取消、超时、关闭实际进程后可恢复目录使用', async () => {
    await workspace()
    const session = value(
      await ai.acp.sessions.create({
        agentId: 'fixture',
        workspaceId: 'project',
      }),
    )
    const controller = new AbortController()
    const waiting = session.prompt(prompt('wait'), controller.signal)
    controller.abort()
    const cancelled = await waiting
    expect(cancelled.success).toBe(false)
    if (!cancelled.success)
      expect(cancelled.error.code).toBe('hai:ai:076')
    value(await session.close())
    const next = value(
      await ai.acp.sessions.create({
        agentId: 'fixture',
        workspaceId: 'project',
      }),
    )
    const result = await next.prompt(prompt('hang'))
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('hai:ai:077')
    const afterTimeout = await next.prompt(prompt('continue'))
    expect(afterTimeout.success).toBe(false)
    if (!afterTimeout.success)
      expect(afterTimeout.error.code).toBe('hai:ai:081')
    value(await next.close())
  }, 20000)
  it('多工程不同主分支、worktree 隔离、双模式发布与重试', async () => {
    const api = await seed('api', 'trunk')
    const web = await seed('web', 'develop')
    await workspace([
      { id: 'api', url: api.remote, mainBranch: 'trunk' },
      { id: 'web', url: web.remote, mainBranch: 'develop' },
    ])
    value(
      await ai.acp.workspaces.importFiles('project', [
        { path: 'spec.txt', content: 'spec' },
      ]),
    )
    const one = value(
      await ai.acp.sessions.create({
        id: 'one',
        agentId: 'fixture',
        workspaceId: 'project',
        newWorktree: true,
        branch: 'task/one',
      }),
    )
    const two = value(
      await ai.acp.sessions.create({
        id: 'two',
        agentId: 'fixture',
        workspaceId: 'project',
        newWorktree: true,
      }),
    )
    expect(
      await readFile(
        join(temporary, 'workspace/sessions/one/files/spec.txt'),
        'utf8',
      ),
    ).toBe('spec')
    for (const id of ['api', 'web']) {
      await writeFile(
        join(temporary, `workspace/sessions/one/${id}/hello.txt`),
        'one',
      )
    }
    expect(
      await readFile(
        join(temporary, 'workspace/sessions/two/api/hello.txt'),
        'utf8',
      ),
    ).toBe('base')
    expect(
      value(
        await one.publish({ mode: 'push-branch', message: 'one', author }),
      ).every(report => report.success),
    ).toBe(true)
    expect(await git(api.remote, ['show', 'task/one:hello.txt'])).toBe('one')
    expect(await git(api.remote, ['show', 'trunk:hello.txt'])).toBe('base')
    value(
      await one.publish({ mode: 'merge-main', message: 'merge one', author }),
    )
    value(await one.publish({ mode: 'merge-main', message: 'retry', author }))
    expect(await git(api.remote, ['show', 'trunk:hello.txt'])).toBe('one')
    expect(await git(web.remote, ['show', 'develop:hello.txt'])).toBe('one')
    value(await two.close())
  }, 30000)
  it('更新主分支不改 session；脏目录报告部分失败', async () => {
    const api = await seed('api', 'trunk')
    await workspace([{ id: 'api', url: api.remote, mainBranch: 'trunk' }])
    const session = value(
      await ai.acp.sessions.create({
        id: 'one',
        agentId: 'fixture',
        workspaceId: 'project',
        newWorktree: true,
      }),
    )
    await writeFile(join(api.source, 'hello.txt'), 'remote')
    await git(api.source, ['commit', '-am', 'remote'])
    await git(api.source, ['push', 'origin', 'trunk'])
    value(await session.updateMain())
    expect(
      await readFile(join(temporary, 'workspace/main/api/hello.txt'), 'utf8'),
    ).toBe('remote')
    expect(
      await readFile(
        join(temporary, 'workspace/sessions/one/api/hello.txt'),
        'utf8',
      ),
    ).toBe('base')
    await writeFile(join(temporary, 'workspace/main/api/dirty.txt'), 'keep')
    const result = await session.updateMain()
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('hai:ai:080')
    expect(
      await readFile(join(temporary, 'workspace/main/api/dirty.txt'), 'utf8'),
    ).toBe('keep')
  }, 20000)
  it('推送部分失败保留结果，修复后重试不重复提交', async () => {
    const api = await seed('api', 'trunk')
    const web = await seed('web', 'main')
    await workspace([
      { id: 'api', url: api.remote, mainBranch: 'trunk' },
      { id: 'web', url: web.remote, mainBranch: 'main' },
    ])
    const session = value(
      await ai.acp.sessions.create({
        id: 'partial',
        agentId: 'fixture',
        workspaceId: 'project',
        newWorktree: true,
        branch: 'task/partial',
      }),
    )
    for (const id of ['api', 'web']) {
      await writeFile(
        join(temporary, `workspace/sessions/partial/${id}/hello.txt`),
        'partial',
      )
    }
    await git(join(temporary, 'workspace/main/web'), [
      'remote',
      'set-url',
      '--push',
      'origin',
      join(temporary, 'unavailable.git'),
    ])
    const result = await session.publish({
      mode: 'push-branch',
      message: 'partial',
      author,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('hai:ai:080')
      expect(result.error.cause).toMatchObject({
        reports: [
          { repositoryId: 'api', success: true },
          { repositoryId: 'web', success: false, phase: 'push' },
        ],
      })
    }
    const commit = await git(api.remote, ['rev-parse', 'task/partial'])
    await git(join(temporary, 'workspace/main/web'), [
      'remote',
      'set-url',
      '--push',
      'origin',
      web.remote,
    ])
    value(
      await session.publish({ mode: 'push-branch', message: 'retry', author }),
    )
    expect(await git(api.remote, ['rev-parse', 'task/partial'])).toBe(commit)
    expect(await git(web.remote, ['show', 'task/partial:hello.txt'])).toBe(
      'partial',
    )
  }, 30000)

  it('输出超限、单轮互斥和流提前退出不会成功冒充完整结果', async () => {
    await workspace()
    await ai.close()
    value(
      await ai.init({
        acp: { maxPendingEvents: 4, maxContentBytes: 2000, cancelTimeout: 100 },
      }),
    )
    const session = value(
      await ai.acp.sessions.create({
        id: 'bounded',
        agentId: 'fixture',
        workspaceId: 'project',
      }),
    )
    const waiting = session.prompt(prompt('wait'))
    const busy = await session.prompt(prompt('another'))
    expect(busy.success).toBe(false)
    if (!busy.success)
      expect(busy.error.code).toBe('hai:ai:074')
    value(await session.cancel())
    expect((await waiting).success).toBe(false)
    value(await session.close())
    const resumed = value(await ai.acp.sessions.resume('bounded'))
    const overflow = await resumed.prompt(prompt('overflow'))
    expect(overflow.success).toBe(false)
    if (!overflow.success)
      expect(overflow.error.code).toBe('hai:ai:078')
    value(await resumed.close())
  }, 20000)

  it('git 不存在返回专用错误，纯文件 workspace 不需要 Git', async () => {
    const previous = process.env.PATH
    try {
      process.env.PATH = ''
      await workspace()
      value(
        await ai.acp.workspaces.register({
          id: 'git',
          storage: { type: 'directory', path: join(temporary, 'git') },
          repositories: [{ id: 'code', url: 'unused', mainBranch: 'main' }],
        }),
      )
      const result = await ai.acp.workspaces.prepare('git')
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe('hai:ai:070')
    }
    finally {
      process.env.PATH = previous
    }
  })
})
