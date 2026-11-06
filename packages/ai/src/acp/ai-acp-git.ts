import type { z } from 'zod'
import type { ACPPublishSchema, ACPWorkspaceSchema } from './ai-acp-config.js'
import type { ACPRuntime } from './ai-acp-runtime.js'
import type { ACPGitReport } from './ai-acp-types.js'
import { win32 } from 'node:path'
import process from 'node:process'
import { ACPFailure } from './ai-acp-errors.js'

/**
 * Git 只访问登记的工程；不扫描、重置或强制推送用户仓库。
 * @param workspace - 工程列表及每个工程的明确主分支。
 * @param runtime - 已打开且由调用方负责关闭的工作区环境。
 * @returns 内部 Git 操作；异常由外层 ACP HaiResult 边界转换。
 * @example
 * ```ts
 * // 模块内部上下文。
 * async function prepare(workspace: z.infer<typeof ACPWorkspaceSchema>, runtime: ACPRuntime) { return createGitOperations(workspace, runtime).prepare() }
 * ```
 */
export function createGitOperations(
  workspace: z.infer<typeof ACPWorkspaceSchema>,
  runtime: ACPRuntime,
) {
  const git = (cwd: string, args: string[], env?: Record<string, string>) =>
    runtime.run('git', ['-C', cwd, ...args], undefined, {
      GIT_TERMINAL_PROMPT: '0',
      ...env,
    })
  const source = (id: string) => runtime.path(`main/${id}`)
  async function ready() {
    if (!workspace.repositories.length)
      return
    try {
      await runtime.run('git', ['--version'])
    }
    catch {
      throw new ACPFailure('gitMissing')
    }
  }
  async function clean(path: string) {
    if (await git(path, ['status', '--porcelain', '--untracked-files=normal']))
      throw new ACPFailure('conflict')
  }
  /** 普通 clone/worktree 不保证子模块或 LFS 内容完整，明确拒绝而非返回虚假的就绪。 */
  async function supportedContent(path: string) {
    const index = await git(path, ['ls-files', '--stage', '-z'])
    if (index.split('\0').some(entry => entry.startsWith('160000 ')))
      throw new ACPFailure('unsupported')
    const attributes = await git(path, ['ls-files', '-z', '--', '.gitattributes', ':(glob)**/.gitattributes'])
    for (const file of attributes.split('\0').filter(Boolean)) {
      const content = await git(path, ['show', `HEAD:${file}`])
      if (content.split('\n').some(line => !line.trimStart().startsWith('#') && /\bfilter=lfs\b/.test(line)))
        throw new ACPFailure('unsupported')
    }
  }
  async function checked(
    repo: z.infer<typeof ACPWorkspaceSchema>['repositories'][number],
    path = source(repo.id),
    branch = repo.mainBranch,
  ) {
    await runtime.file('directory', path)
    if ((await git(path, ['branch', '--show-current'])) !== branch)
      throw new ACPFailure('conflict')
    if ((await git(path, ['remote', 'get-url', repo.remote])) !== repo.url)
      throw new ACPFailure('conflict')
  }
  async function reports(
    operation: (
      repo: z.infer<typeof ACPWorkspaceSchema>['repositories'][number],
      report: ACPGitReport,
    ) => Promise<void>,
  ) {
    await ready()
    const output: ACPGitReport[] = []
    for (const repo of workspace.repositories) {
      const report: ACPGitReport = {
        repositoryId: repo.id,
        success: false,
        phase: 'check',
      }
      try {
        await operation(repo, report)
        report.success = true
        report.phase = 'done'
      }
      catch (error) {
        report.error = error instanceof ACPFailure ? error.kind : 'failed'
      }
      output.push(report)
    }
    if (output.some(item => !item.success))
      throw new ACPFailure('partial', { reports: output })
    return output
  }
  return {
    /**
     * 准备工程主目录，只克隆缺失仓库，不覆盖已有内容。
     * @returns main 的绝对路径；失败保留已创建文件。
     * @example
     * ```ts
     * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
     * const main = await git.prepare()
     * ```
     */
    async prepare() {
      await ready()
      await runtime.file('mkdir', 'main/files')
      for (const repo of workspace.repositories) {
        await git(runtime.root, [
          'check-ref-format',
          '--branch',
          repo.mainBranch,
        ])
        if ((await runtime.file('exists', `main/${repo.id}`)) === 'false') {
          await git(runtime.root, [
            'clone',
            '--origin',
            repo.remote,
            '--branch',
            repo.mainBranch,
            '--',
            repo.url,
            source(repo.id),
          ])
        }
        await checked(repo)
        await supportedContent(source(repo.id))
      }
      return runtime.path('main')
    },
    /**
     * 在调用方独占的会话目录创建各工程工作树并复制普通文件。
     * @param sessionId - 已校验且已独占会话目录的框架会话 ID。
     * @param branch - 所有工程使用的同名新分支。
     * @returns 完成后返回；中途失败保留已建立的工作树。
     * @example
     * ```ts
     * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
     * await git.createWorktree('task-1', 'acp/task-1')
     * ```
     */
    async createWorktree(sessionId: string, branch: string) {
      await ready()
      // 已创建的 worktree 不回滚删除：保留现场，失败的 session 可由管理员检查。
      for (const repo of workspace.repositories) {
        await checked(repo)
        await supportedContent(source(repo.id))
        await git(source(repo.id), ['check-ref-format', '--branch', branch])
        await git(source(repo.id), [
          'worktree',
          'add',
          '-b',
          branch,
          runtime.path(`sessions/${sessionId}/${repo.id}`),
          `refs/heads/${repo.mainBranch}`,
        ])
      }
      await runtime.file('copy', 'main/files', `sessions/${sessionId}/files`)
    },
    /**
     * 预检所有登记的会话工作树，确认回收状态已持久化后逐个执行 Git 移除。
     * @param sessionId - 持久记录所拥有的会话目录 ID。
     * @param branch - 创建时登记的会话分支。
     * @param begin - 写入开始回收的持久状态；写入失败时不删除工作树。
     * @returns 回收完成；失败保留其他工作树供重试。
     * @example
     * ```ts
     * // 模块内部上下文：git 为工厂已创建的句柄，回调由持有会话锁的调用方提供。
     * await git.reclaimWorktree('task-1', 'acp/task-1', async () => {})
     * ```
     */
    async reclaimWorktree(sessionId: string, branch: string, begin: () => Promise<void>) {
      await ready()
      const paths: Array<{ main: string, worktree: string }> = []
      for (const repo of workspace.repositories) {
        await checked(repo)
        const main = source(repo.id)
        const worktree = runtime.path(`sessions/${sessionId}/${repo.id}`)
        const exists = (await runtime.file('exists', worktree)) === 'true'
        const registrations = await git(main, ['worktree', 'list', '--porcelain', '-z'])
        const registration = registrations.split('\0\0').map(entry => entry.split('\0')).find(([entry]) => {
          if (!entry?.startsWith('worktree '))
            return false
          const registeredPath = entry.slice('worktree '.length)
          return !runtime.resource && process.platform === 'win32'
            ? win32.relative(registeredPath, worktree) === ''
            : registeredPath === worktree
        })
        if (!registration && !exists)
          continue
        if (!registration?.includes(`branch refs/heads/${branch}`)
          || registration.some(entry => entry === 'locked' || entry.startsWith('locked '))) {
          throw new ACPFailure('conflict')
        }
        if (exists)
          await clean(worktree)
        paths.push({ main, worktree })
      }
      await begin()
      for (const { main, worktree } of paths)
        await git(main, ['worktree', 'remove', '--', worktree])
    },
    /**
     * 更新各工程主分支，只允许快进合并。
     * @returns 每个工程的更新报告；部分失败抛出携带 reports 的异常。
     * @example
     * ```ts
     * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
     * const reports = await git.updateMain()
     * ```
     */
    updateMain: () =>
      reports(async (repo, report) => {
        const path = source(repo.id)
        await checked(repo)
        await clean(path)
        report.phase = 'fetch'
        await git(path, [
          'fetch',
          '--',
          repo.remote,
          `refs/heads/${repo.mainBranch}`,
        ])
        report.phase = 'merge'
        await git(path, ['merge', '--ff-only', 'FETCH_HEAD'])
        report.commit = await git(path, ['rev-parse', 'HEAD'])
      }),
    /**
     * 逐仓提交会话修改并发布，禁止强推。
     * @param sessionId - 已登记的独立会话 ID。
     * @param branch - 会话工作树分支名。
     * @param request - 经过 schema 校验的模式、提交说明及作者。
     * @returns 各仓发布报告；部分失败保留已提交和已推送的结果。
     * @example
     * ```ts
     * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
     * const reports = await git.publish('task-1', 'acp/task-1', { mode: 'push-branch', message: '完成任务', author: { name: 'Developer', email: 'dev@example.com' } })
     * ```
     */
    publish: (
      sessionId: string,
      branch: string,
      request: z.infer<typeof ACPPublishSchema>,
    ) =>
      reports(async (repo, report) => {
        const session = runtime.path(`sessions/${sessionId}/${repo.id}`)
        const main = source(repo.id)
        const author = {
          GIT_AUTHOR_NAME: request.author.name,
          GIT_AUTHOR_EMAIL: request.author.email,
          GIT_COMMITTER_NAME: request.author.name,
          GIT_COMMITTER_EMAIL: request.author.email,
        }
        await checked(repo, session, branch)
        if (request.mode === 'merge-main') {
          await checked(repo)
          await clean(main)
        }
        report.phase = 'commit'
        if (await git(session, ['status', '--porcelain'])) {
          await git(session, ['add', '--all'])
          await git(session, ['commit', '-m', request.message], author)
        }
        report.commit = await git(session, ['rev-parse', 'HEAD'])
        let target = session
        let targetBranch = branch
        if (request.mode === 'merge-main') {
          report.phase = 'fetch'
          await git(main, [
            'fetch',
            '--',
            repo.remote,
            `refs/heads/${repo.mainBranch}`,
          ])
          report.phase = 'merge'
          // 上次已合并但 push 失败时，允许落后远端的本地祖先；不重复创建 merge commit。
          const remoteHead = await git(main, ['rev-parse', 'FETCH_HEAD'])
          const localHead = await git(main, ['rev-parse', 'HEAD'])
          const base = await git(main, ['merge-base', 'HEAD', 'FETCH_HEAD'])
          if (base === localHead)
            await git(main, ['merge', '--ff-only', 'FETCH_HEAD'])
          else if (base !== remoteHead)
            throw new ACPFailure('conflict')
          await git(main, ['merge', '--no-edit', '--', branch], author)
          target = main
          targetBranch = repo.mainBranch
        }
        report.phase = 'push'
        await git(target, [
          'push',
          '--',
          repo.remote,
          `HEAD:refs/heads/${targetBranch}`,
        ])
        report.commit = await git(target, ['rev-parse', 'HEAD'])
      }),
  }
}
