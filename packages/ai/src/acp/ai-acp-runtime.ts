import type { z } from 'zod'
import type { ACPWorkspaceSchema } from './ai-acp-config.js'
import type { ACPTransport } from './ai-acp-types.js'
import { mkdir, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { ACPFailure } from './ai-acp-errors.js'
import { engineEnvironment, execute } from './ai-acp-process.js'

// 同一段文件操作代码在宿主和容器执行，拒绝链接、路径逃逸及覆盖已有文件。
const fileProgram = String.raw`
const fs = require('node:fs/promises'); const path = require('node:path');
(async () => {
 const [root, op, name, content] = process.argv.slice(1);
 const base = await fs.realpath(root);
 const target = path.resolve(base, name || '.');
 const rel = path.relative(base, target);
 if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('scope');
 let cursor = base;
 for (const part of rel.split(path.sep).filter(Boolean)) {
   cursor = path.join(cursor, part);
   try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw Error('link'); }
   catch (e) { if (e.code !== 'ENOENT') throw e; }
 }
 if (op === 'mkdir') await fs.mkdir(target, { recursive: true });
 else if (op === 'mkdir-exclusive') await fs.mkdir(target);
 else if (op === 'directory') { if (!(await fs.stat(target)).isDirectory()) throw Error('directory'); }
 else if (op === 'exists') process.stdout.write(String(await fs.stat(target).then(() => true, e => { if(e.code === 'ENOENT') return false; throw e; })));
 else if (op === 'write') { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, Buffer.from(content, 'base64'), { flag: 'wx', mode: 0o600 }); }
 else if (op === 'read') process.stdout.write((await fs.readFile(target)).toString('base64'));
 else if (op === 'copy') {
   const destination = path.resolve(base, content);
   const destRel = path.relative(base, destination);
   if(destRel.startsWith('..') || path.isAbsolute(destRel)) throw Error('scope');
   let destCursor = base;
   for (const part of destRel.split(path.sep).filter(Boolean)) {
     destCursor = path.join(destCursor, part);
     try { if ((await fs.lstat(destCursor)).isSymbolicLink()) throw Error('link'); }
     catch(e) { if(e.code !== 'ENOENT') throw e; }
   }
   async function copy(src, dst) {
     try { if ((await fs.lstat(dst)).isSymbolicLink()) throw Error('link'); }
     catch(e) { if(e.code !== 'ENOENT') throw e; }
     const stat = await fs.lstat(src); if(stat.isSymbolicLink()) throw Error('link');
     if(stat.isDirectory()) { await fs.mkdir(dst, { recursive: true }); for(const item of await fs.readdir(src)) await copy(path.join(src,item),path.join(dst,item)); }
     else if(stat.isFile()) await fs.copyFile(src,dst,require('node:fs').constants.COPYFILE_EXCL);
     else throw Error('special file');
   }
   await copy(target,destination);
 }
 else throw Error('operation');
})().catch(() => { process.exitCode = 1 });`

/**
 * 显式引擎不降级；auto 只选择实际可用的引擎。
 * @param preference - auto 优先就绪的 Podman，再尝试 Docker。
 * @returns 实际可用的容器引擎；均不可用时抛出 ACPFailure。
 * @example
 * ```ts
 * // 模块内部上下文。
 * async function readyEngine() { return selectEngine('auto') }
 * ```
 */
export async function selectEngine(preference: 'auto' | 'podman' | 'docker') {
  for (const engine of preference === 'auto'
    ? (['podman', 'docker'] as const)
    : [preference]) {
    try {
      await execute(engine, ['info'], undefined, undefined, 15000)
      return engine
    }
    catch {
      if (preference !== 'auto')
        throw new ACPFailure('runtime', { engine })
    }
  }
  throw new ACPFailure('runtime')
}

/**
 * 目录和 volume 共享执行接口；容器内的 Git 元数据始终使用 /workspace。
 * @param workspace - 已解析并通过存储冲突检查的工作区定义。
 * @returns 工作区执行环境；调用方负责 close，文件和 volume 不随 close 删除。
 * @example
 * ```ts
 * // 模块内部上下文。
 * async function inspectWorkspace(workspace: z.infer<typeof ACPWorkspaceSchema>) { const runtime = await openRuntime(workspace); try { return runtime.root } finally { await runtime.close() } }
 * ```
 */
export async function openRuntime(
  workspace: z.infer<typeof ACPWorkspaceSchema>,
) {
  const environment: Record<string, string> = {}
  for (const [target, source] of Object.entries(workspace.environmentRefs)) {
    if (!process.env[source])
      throw new ACPFailure('invalid', { environment: source })
    environment[target] = process.env[source]!
  }
  let root: string
  let container: string | undefined
  let engine: 'podman' | 'docker' | undefined
  let closed = false
  if (workspace.storage.type === 'directory') {
    await mkdir(workspace.storage.path, { recursive: true })
    root = await realpath(resolve(workspace.storage.path))
  }
  else {
    engine = await selectEngine(workspace.storage.engine)
    root = '/workspace'
    container = await execute(engine, [
      'create',
      // 远程 Podman 会从服务端继承代理，绕过最小环境白名单；只允许显式 environmentRefs 注入。
      ...(engine === 'podman' ? ['--http-proxy=false'] : []),
      '--init',
      '--mount',
      `type=volume,src=${workspace.storage.name},dst=/workspace`,
      '--mount',
      `type=volume,src=${workspace.storage.name}-state,dst=/state`,
      '--workdir',
      root,
      '--entrypoint',
      'node',
      workspace.storage.image,
      '-e',
      'setInterval(() => {}, 2147483647)',
    ])
    if (!/^[a-f0-9]{12,64}$/.test(container))
      throw new ACPFailure('runtime')
    try {
      await execute(engine, ['start', container])
    }
    catch (error) {
      await execute(engine, ['rm', '-f', container])
      throw error
    }
  }
  const ensure = () => {
    if (closed)
      throw new ACPFailure('closed')
  }
  const path = (relative: string) =>
    workspace.storage.type === 'volume'
      ? `${root}/${relative}`
      : resolve(root, relative)
  function transport(
    command: string,
    args: string[],
    cwd: string,
    env: Record<string, string> = {},
    inheritWorkspaceEnvironment = true,
  ): ACPTransport {
    ensure()
    const values = inheritWorkspaceEnvironment ? { ...environment, ...env } : env
    return engine && container
      ? {
          type: 'stdio',
          command: engine,
          args: [
            'exec',
            '-i',
            '--workdir',
            cwd,
            ...Object.keys(values).flatMap(key => [
              '--env',
              Object.hasOwn(engineEnvironment(), key)
                ? `${key}=${values[key]}`
                : key,
            ]),
            container,
            command,
            ...args,
          ],
          env: { ...values, ...engineEnvironment() },
        }
      : { type: 'stdio', command, args, cwd, env: values }
  }
  async function run(
    command: string,
    args: string[],
    cwd = root,
    env?: Record<string, string>,
    inheritWorkspaceEnvironment = true,
  ) {
    const launch = transport(command, args, cwd, env, inheritWorkspaceEnvironment)
    if (launch.type !== 'stdio')
      throw new ACPFailure('runtime')
    return execute(launch.command, launch.args ?? [], launch.cwd, launch.env)
  }
  return {
    root,
    path,
    transport,
    run,
    resource: container ? { engine, container } : undefined,
    /**
     * 在运行端创建并回收私有临时目录，目录位于工作区挂载之外。
     * @param action - 在临时目录存在时执行的操作。
     * @returns 操作结果；成功或失败都清理当前调用拥有的目录。
     * @example
     * ```ts
     * // 模块内部上下文：runtime 为已打开的执行环境。
     * await runtime.withTemporaryDirectory(directory => runtime.run('git', ['-C', directory, 'init', '--bare']))
     * ```
     */
    async withTemporaryDirectory<T>(action: (directory: string) => Promise<T>): Promise<T> {
      const node = engine ? 'node' : process.execPath
      const directory = await run(node, ['-e', 'const fs=require("node:fs");const {tmpdir}=require("node:os");const {join}=require("node:path");process.stdout.write(fs.mkdtempSync(join(fs.realpathSync(tmpdir()), "hai-acp-git-")))'], root, undefined, false)
      try {
        return await action(directory)
      }
      finally {
        await run(node, ['-e', 'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })', directory], root, undefined, false)
      }
    },
    /**
     * 计算受管理的会话状态目录。
     * @param sessionId - 已校验的会话 ID。
     * @returns 状态目录绝对路径；不创建目录。
     * @example
     * ```ts
     * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
     * const state = runtime.state('task-1')
     * ```
     */
    state: (sessionId: string) =>
      workspace.storage.type === 'volume'
        ? `/state/${sessionId}`
        : path(`.state/${sessionId}`),
    /**
     * 执行受工作区约束的文件操作，拒绝链接和路径逃逸。
     * @param op - mkdir/mkdir-exclusive/directory/exists/write/read/copy 操作。
     * @param name - 工作区内相对路径或已校验的内部绝对路径。
     * @param content - write 时为 Base64，copy 时为目标路径，其余为空。
     * @returns 文本结果：exists 为 true/false，read 为 Base64，其余为空。
     * @example
     * ```ts
     * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
     * await runtime.file('mkdir', 'main/files')
     * ```
     */
    async file(
      op: 'mkdir' | 'mkdir-exclusive' | 'directory' | 'exists' | 'write' | 'read' | 'copy',
      name: string,
      content = '',
    ) {
      return run(
        workspace.storage.type === 'volume' ? 'node' : process.execPath,
        ['-e', fileProgram, root, op, name, content],
      )
    },
    /**
     * 向已创建的独立状态目录写入配置，拒绝符号链接。
     * @param sessionId - 已校验的会话 ID。
     * @param name - 无目录分隔符的配置文件名。
     * @param content - 原生配置文本，可能含凭据，不应记录日志。
     * @returns 完成写入的 Promise。
     * @example
     * ```ts
     * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
     * await runtime.writeState('task-1', 'config.json', '{}')
     * ```
     */
    async writeState(sessionId: string, name: string, content: string) {
      if (!/^[\w-]+\.[a-z0-9]+$/i.test(name))
        throw new ACPFailure('invalid')
      const directory
        = workspace.storage.type === 'volume'
          ? `/state/${sessionId}`
          : path(`.state/${sessionId}`)
      await run(
        workspace.storage.type === 'volume' ? 'node' : process.execPath,
        [
          '-e',
          'const f=require("node:fs"),p=require("node:path");const d=process.argv[1];let c=p.parse(d).root;for(const part of d.slice(c.length).split(p.sep).filter(Boolean)){c=p.join(c,part);if(f.lstatSync(c).isSymbolicLink())process.exit(1)}const t=p.join(d,process.argv[2]);try{if(f.lstatSync(t).isSymbolicLink())process.exit(1)}catch(e){if(e.code!=="ENOENT")throw e}f.writeFileSync(t,process.argv[3],{mode:384})',
          directory,
          name,
          content,
        ],
      )
    },
    /**
     * 创建私有状态目录，拒绝祖先目录中的符号链接。
     * @param sessionId - 已校验的会话 ID。
     * @returns 已创建的状态目录绝对路径。
     * @example
     * ```ts
     * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
     * const directory = await runtime.stateDirectory('task-1')
     * ```
     */
    async stateDirectory(sessionId: string) {
      const target
        = workspace.storage.type === 'volume'
          ? `/state/${sessionId}`
          : path(`.state/${sessionId}`)
      await run(
        workspace.storage.type === 'volume' ? 'node' : process.execPath,
        [
          '-e',
          'const f=require("node:fs"),p=require("node:path"),d=process.argv[1];let c=p.parse(d).root;for(const part of d.slice(c.length).split(p.sep).filter(Boolean)){c=p.join(c,part);try{if(f.lstatSync(c).isSymbolicLink())process.exit(1)}catch(e){if(e.code!=="ENOENT")throw e;f.mkdirSync(c,{mode:448})}}',
          target,
        ],
      )
      return target
    },
    /**
     * 关闭本次拥有的容器；目录和 volume 保留。
     * @returns 清理完成的 Promise；失败抛错，不能视为资源已释放。
     * @example
     * ```ts
     * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
     * await runtime.close()
     * ```
     */
    async close() {
      if (closed)
        return
      if (engine && container) {
        try {
          await execute(engine, ['rm', '--force', container])
        }
        catch {
          throw new ACPFailure('cleanup', { engine, container })
        }
      }
      closed = true
    },
  }
}
/**
 * 工作区运行环境内部接口。
 * @example
 * ```ts
 * // 模块内部上下文。
 * function rootPath(runtime: ACPRuntime) { return runtime.root }
 * ```
 */
export type ACPRuntime = Awaited<ReturnType<typeof openRuntime>>
