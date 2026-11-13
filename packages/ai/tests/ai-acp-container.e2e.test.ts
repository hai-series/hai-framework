import type { HaiResult } from '@h-ai/core'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { ai } from '../src/index.js'

const exec = promisify(execFile)
const image = process.env.HAI_ACP_E2E_IMAGE
const preference = process.env.HAI_ACP_E2E_ENGINE ?? 'auto'
function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(JSON.stringify(result.error))
  return result.data
}
async function readyEngine() {
  for (const engine of preference === 'auto'
    ? ['podman', 'docker']
    : [preference]) {
    try {
      await exec(engine, ['info'], { timeout: 15000 })
      return engine
    }
    catch {
      if (preference !== 'auto')
        throw new Error('Requested container engine unavailable')
    }
  }
  throw new Error('No container engine available')
}
describe.skipIf(!image)('aCP container volume E2E', () => {
  it('实际容器：运行环境、volume 文件、Git worktree、恢复和发布', async () => {
    const engine = await readyEngine()
    const volume = `hai-acp-e2e-${randomUUID()}`
    const run = async (args: string[]) =>
      (
        await exec(engine, args, {
          timeout: 120000,
          maxBuffer: 8 * 1024 * 1024,
        })
      ).stdout.trim()
    await run(['volume', 'create', volume])
    try {
      const versions = await run([
        'run',
        '--rm',
        '--entrypoint',
        'node',
        image!,
        '-e',
        'const {spawnSync}=require("node:child_process");for(const command of ["git","node","bwrap","codex","codex-acp"]){const r=spawnSync(command,["--version"],{encoding:"utf8"});if(r.status!==0)process.exit(1);process.stdout.write(r.stdout)};for(const command of ["python3","libreoffice","chromium","java","rustc","go"]){if(spawnSync(command,["--version"]).error?.code!=="ENOENT")process.exit(2)}',
      ])
      expect(versions).toContain('git version')
      expect(versions).toContain('bubblewrap')
      expect(versions).toContain('0.165.0')
      const fixture = await readFile(
        resolve('tests/fixtures/acp-agent.mjs'),
        'utf8',
      )
      value(
        await ai.init({
          acp: { requestTimeout: 30000, promptTimeout: 30000 },
        }),
      )
      vi.stubEnv('ACP_FIXTURE_AGENT', 'agent-only-fixture')
      vi.stubEnv('ACP_FIXTURE_GIT_HEADER', 'Authorization: Bearer git-only-fixture')
      vi.stubEnv('ACP_FIXTURE_GIT_KEY', 'http.extraHeader')
      vi.stubEnv('ACP_FIXTURE_GIT_COUNT', '1')
      value(
        await ai.acp.workspaces.register({
          id: 'container',
          storage: {
            type: 'volume',
            name: volume,
            image: image!,
            engine: preference as 'auto' | 'podman' | 'docker',
          },
          repositories: [
            { id: 'api', url: '/workspace/remote.git', mainBranch: 'trunk' },
          ],
          gitEnvironmentRefs: { GIT_CONFIG_COUNT: 'ACP_FIXTURE_GIT_COUNT', GIT_CONFIG_KEY_0: 'ACP_FIXTURE_GIT_KEY', GIT_CONFIG_VALUE_0: 'ACP_FIXTURE_GIT_HEADER' },
        }),
      )
      const seed = `const f=require('node:fs'),c=require('node:child_process');function git(...args){const r=c.spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr)};git('init','--bare','/workspace/remote.git');git('init','-b','trunk','/workspace/seed');git('-C','/workspace/seed','config','user.name','ACP');git('-C','/workspace/seed','config','user.email','acp@example.invalid');f.writeFileSync('/workspace/seed/a.txt','base');git('-C','/workspace/seed','add','.');git('-C','/workspace/seed','commit','-m','base');git('-C','/workspace/seed','remote','add','origin','/workspace/remote.git');git('-C','/workspace/seed','push','origin','trunk');`
      await run([
        'run',
        '--rm',
        '--mount',
        `type=volume,src=${volume},dst=/workspace`,
        '--entrypoint',
        'node',
        image!,
        '-e',
        seed,
      ])
      value(await ai.acp.workspaces.prepare('container'))
      value(
        await ai.acp.workspaces.importFiles('container', [
          { path: 'acp-agent.mjs', content: fixture },
          { path: 'notes.txt', content: 'retained' },
        ]),
      )
      value(
        await ai.acp.agents.register({
          id: 'container-agent',
          name: 'Container fixture',
          mode: 'builtin-service',
          image: image!,
          engine: preference as 'auto' | 'podman' | 'docker',
          command: 'node',
          args: ['/workspace/main/files/acp-agent.mjs'],
          environmentRefs: { ACP_TEST_AGENT_VALUE: 'ACP_FIXTURE_AGENT' },
        }),
      )
      const session = value(
        await ai.acp.sessions.create({
          id: 'isolated',
          agentId: 'container-agent',
          workspaceId: 'container',
          repositoryId: 'api',
          newWorktree: true,
          branch: 'task/isolated',
        }),
      )
      const info = value(await session.info())
      expect(JSON.parse(value(await session.prompt([
        { type: 'text', text: 'credential-boundary' },
      ])).text)).toEqual({ agent: true, git: false })
      const resource = info.resource!
      const storage = info.workspace?.storage
      expect(storage).toEqual({
        type: 'volume',
        engine,
        name: volume,
        mountPath: '/workspace',
      })
      if (storage?.type !== 'volume')
        throw new Error('Expected volume handoff')
      const preview = await run([
        'run',
        '-d',
        '--mount',
        `type=volume,src=${storage.name},dst=${storage.mountPath},ro`,
        '--workdir',
        info.cwd,
        '--entrypoint',
        'node',
        image!,
        '-e',
        'require("node:http").createServer((_,res)=>require("node:fs").createReadStream("a.txt").pipe(res)).listen(19978,"127.0.0.1")',
      ])
      const previewContent = () => run([
        'exec',
        preview,
        'node',
        '-e',
        '(async()=>{for(let i=0;i<100;i++){try{const r=await fetch("http://127.0.0.1:19978");process.stdout.write(await r.text());return}catch{}await new Promise(r=>setTimeout(r,50))}process.exit(1)})()',
      ])
      expect(await previewContent()).toBe('base')
      // Podman 远程服务可能自行注入代理；宿主回环代理在容器中不可达，且不属于显式授权环境。
      expect(await run([
        'exec',
        resource.container,
        'node',
        '-e',
        'process.stdout.write(String(["HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","http_proxy","https_proxy","all_proxy"].every(key=>!process.env[key])))',
      ])).toBe('true')
      const mounts = JSON.parse(await run(['inspect', resource.container]))[0]
        .Mounts as Array<{ Destination: string }>
      expect(mounts.some(item => item.Destination === '/workspace')).toBe(
        true,
      )
      expect(
        mounts.some(
          item =>
            item.Destination.includes('docker.sock')
            || item.Destination.includes('podman.sock'),
        ),
      ).toBe(false)
      await run([
        'exec',
        resource.container,
        'node',
        '-e',
        'require("node:fs").writeFileSync(process.argv[1],"changed")',
        `${info.cwd}/a.txt`,
      ])
      expect(await previewContent()).toBe('changed')
      value(await session.close())
      expect(await previewContent()).toBe('changed')
      const resumed = value(await ai.acp.sessions.resume('isolated'))
      expect(
        value(await resumed.prompt([
          { type: 'text', text: 'alive' },
        ])).text,
      ).toBe('alive')
      value(
        await resumed.publish({
          mode: 'merge-main',
          message: 'container change',
          author: { name: 'ACP', email: 'acp@example.invalid' },
        }),
      )
      const content = await run([
        'run',
        '--rm',
        '--mount',
        `type=volume,src=${volume},dst=/workspace`,
        '--entrypoint',
        'git',
        image!,
        '-C',
        '/workspace/remote.git',
        'show',
        'trunk:a.txt',
      ])
      expect(content).toBe('changed')
      value(await resumed.close())
      await run(['rm', '-f', preview])
      value(await ai.acp.sessions.reclaimWorktree(resumed.id))
      expect(value(await resumed.info()).worktreeStatus).toBe('reclaimed')
      const copied = await run([
        'run',
        '--rm',
        '--mount',
        `type=volume,src=${volume},dst=/workspace`,
        '--entrypoint',
        'node',
        image!,
        '-e',
        'process.stdout.write(require("node:fs").readFileSync(process.argv[1],"utf8"))',
        `${info.workspace?.path}/files/notes.txt`,
      ])
      expect(copied).toBe('retained')
      // 关闭隐式继承不影响应用明确授予 Agent 的代理配置；仅使用不可联网的测试地址。
      vi.stubEnv('HAI_ACP_TEST_PROXY', 'http://proxy.example.invalid:8123')
      value(await ai.acp.agents.register({
        id: 'explicit-proxy',
        name: 'Explicit proxy fixture',
        mode: 'builtin-service',
        image: image!,
        engine: preference as 'auto' | 'podman' | 'docker',
        command: 'node',
        args: ['/workspace/main/files/acp-agent.mjs'],
        environmentRefs: { HTTP_PROXY: 'HAI_ACP_TEST_PROXY' },
      }))
      const configured = value(await ai.acp.sessions.create({ agentId: 'explicit-proxy', workspaceId: 'container' }))
      expect(value(await configured.prompt([
        { type: 'text', text: 'proxy' },
      ])).text).toBe('http://proxy.example.invalid:8123')
      value(await configured.close())
    }
    finally {
      await ai.close()
      vi.unstubAllEnvs()
      const ids = (await run([
        'ps',
        '-aq',
        '--filter',
        `volume=${volume}`,
      ]))
        .split(/\s+/)
        .filter(Boolean)
      if (ids.length)
        await run(['rm', '-f', ...ids])
      for (const name of [volume, `${volume}-state`]) {
        const exists = await exec(engine, ['volume', 'inspect', name]).then(
          () => true,
          () => false,
        )
        if (exists)
          await run(['volume', 'rm', name])
      }
    }
  }, 180000)
})
