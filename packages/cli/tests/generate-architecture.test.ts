/** 按实际工程与 workspace 生成路由，覆盖保护和跨文件失败回滚。 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import fse from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../src/commands/cli-create.js'
import { generate } from '../src/commands/cli-generate.js'

const roots: string[] = []
beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith('hai-generate-'))
      throw new Error('Unexpected fixture cleanup path')
    await rm(root, { recursive: true, force: true })
  }
})

/** 创建真实 CLI 工程，不安装依赖；路由运行门禁另行使用同一工程。 */
async function create(appType: 'api' | 'fullstack' | 'website') {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-generate-'))
  roots.push(root)
  await createProject({ name: 'generated', appType, frontends: ['web'], cwd: root, defaults: true, install: false, git: false, deploy: false, packageManager: 'pnpm' })
  return path.join(root, 'generated')
}

describe('architecture-aware generation', () => {
  it('真实 SvelteKit 工程创建可消费文件路由，默认拒绝冲突', async () => {
    const project = await create('website')
    await generate({ type: 'page', name: 'reports', cwd: project })
    await generate({ type: 'api', name: 'orders', cwd: project })
    expect(await readFile(path.join(project, 'src/routes/reports/+page.svelte'), 'utf8')).toContain('Reports')
    expect(await readFile(path.join(project, 'src/routes/api/orders/+server.ts'), 'utf8')).toContain('kit.handler')
    await expect(generate({ type: 'page', name: 'reports', cwd: project })).rejects.toThrow()
    await expect(generate({ type: 'api', name: 'outside', output: 'src/unused', cwd: project })).rejects.toThrow()
    expect(await fse.pathExists(path.join(project, 'src/unused'))).toBe(false)
  })

  it.each(['api', 'fullstack'] as const)('%s 根目录自动选择后端，真实 contract/procedure 入口均注册新领域', async (type) => {
    const project = await create(type)
    const parent = type === 'api' ? 'apps' : 'packages'
    const service = path.join(project, parent, 'generated-serv')
    const contract = path.join(project, parent, 'generated-contract')
    await generate({ type: 'api', name: 'purchase-orders', cwd: project })
    expect(await readFile(path.join(contract, 'src/generated-contract.ts'), 'utf8')).toContain('purchaseOrders: purchaseOrdersContract')
    expect(await readFile(path.join(contract, 'src/index.ts'), 'utf8')).toContain('export * from \'./purchase-orders-contract.js\'')
    const index = await readFile(path.join(service, 'src/server/procedures/index.ts'), 'utf8')
    expect(index).toContain('purchaseOrders: createPurchaseOrdersProcedures()')
    expect(await fse.pathExists(path.join(project, 'src/routes'))).toBe(false)
    await expect(generate({ type: 'api', name: 'purchase-orders', cwd: project })).rejects.toThrow()
    await generate({ type: 'api', name: 'purchase-orders', cwd: service, force: true })
    expect((await readFile(path.join(service, 'src/server/procedures/index.ts'), 'utf8')).match(/purchaseOrders: createPurchaseOrdersProcedures\(\)/g)).toHaveLength(1)
    await expect(generate({ type: 'api', name: 'app', cwd: service, force: true })).rejects.toThrow()
    const originalContract = await readFile(path.join(contract, 'src/generated-contract.ts'), 'utf8')
    await expect(generate({ type: 'api', name: 'generated', cwd: service, force: true })).rejects.toThrow()
    expect(await readFile(path.join(contract, 'src/generated-contract.ts'), 'utf8')).toBe(originalContract)
    await expect(generate({ type: 'page', name: 'reports', cwd: service })).rejects.toThrow()
    await expect(generate({ type: 'api', name: 'unused', output: 'src/routes', cwd: service })).rejects.toThrow()
  })

  it('fullstack 的纯 Vite workspace 拒绝虚假的文件路由，不自动转写另一个应用', async () => {
    const project = await create('fullstack')
    for (const type of ['page', 'api'] as const)
      await expect(generate({ type, name: 'fake', cwd: project, workspace: 'generated-web' })).rejects.toThrow()
    expect(await fse.pathExists(path.join(project, 'apps/generated-web/src/routes'))).toBe(false)
  })

  it('多个适用 workspace 必须显式选择，包名和相对路径均能定位', async () => {
    const project = await create('api')
    await fse.outputJson(path.join(project, 'apps/website/package.json'), { name: 'website', dependencies: { '@h-ai/core': '*', '@sveltejs/kit': '*', '@h-ai/kit': '*', 'zod': '*' } })
    await expect(generate({ type: 'api', name: 'ambiguous', cwd: project })).rejects.toThrow()
    await generate({ type: 'api', name: 'selected', cwd: project, workspace: 'apps/website' })
    expect(await fse.pathExists(path.join(project, 'apps/website/src/routes/api/selected/+server.ts'))).toBe(true)
    await generate({ type: 'page', name: 'selected', cwd: project, workspace: 'website' })
    expect(await fse.pathExists(path.join(project, 'apps/website/src/routes/selected/+page.svelte'))).toBe(true)
  })

  it('未知聚合入口不写半套路由，保留全部原始业务文件', async () => {
    const project = await create('api')
    const index = path.join(project, 'apps/generated-serv/src/server/procedures/index.ts')
    const original = (await readFile(index, 'utf8')).replace('// @hai-generator:procedures:entries', '// custom aggregation')
    await fse.writeFile(index, original)
    await expect(generate({ type: 'api', name: 'blocked', cwd: project })).rejects.toThrow()
    expect(await readFile(index, 'utf8')).toBe(original)
    expect(await fse.pathExists(path.join(project, 'apps/generated-contract/src/blocked-contract.ts'))).toBe(false)
  })

  it('路由目录的符号链接不能把生成文件写到工程外', async () => {
    const project = await create('website')
    const outside = path.join(path.dirname(project), 'outside')
    await fse.ensureDir(outside)
    await fse.ensureSymlink(outside, path.join(project, 'src/routes/linked'), 'junction')
    await expect(generate({ type: 'api', name: 'escaped', cwd: project, output: 'src/routes/linked' })).rejects.toThrow()
    expect(await fse.readdir(outside)).toEqual([])
  })

  it('svelteKit 自定义 kit.files 时明确拒绝猜测 src/routes', async () => {
    const project = await create('website')
    await fse.writeFile(path.join(project, 'svelte.config.js'), 'export default { kit: { files: { routes: \'custom/routes\' } } }')
    await expect(generate({ type: 'page', name: 'unconsumed', cwd: project })).rejects.toThrow()
    expect(await fse.pathExists(path.join(project, 'src/routes/unconsumed'))).toBe(false)
  })

  it('svelteKit API 缺少实际使用的 kit/zod 依赖时拒绝生成', async () => {
    const project = await create('website')
    await fse.writeJson(path.join(project, 'package.json'), { name: 'plain-sveltekit', dependencies: { '@sveltejs/kit': '*' } })
    await expect(generate({ type: 'api', name: 'unavailable', cwd: project })).rejects.toThrow()
    expect(await fse.pathExists(path.join(project, 'src/routes/api/unavailable'))).toBe(false)
  })

  it('批量提交中途失败会回滚新增文件和已修改的现有聚合入口', async () => {
    const project = await create('api')
    const index = path.join(project, 'apps/generated-contract/src/generated-contract.ts')
    const original = await readFile(index, 'utf8')
    const rename = fse.rename.bind(fse)
    let count = 0
    vi.spyOn(fse, 'rename').mockImplementation(async (from, to) => {
      if (++count === 4)
        throw new Error('Injected write failure')
      await rename(from, to)
    })
    await expect(generate({ type: 'api', name: 'rollback', cwd: project })).rejects.toThrow('Injected write failure')
    expect(await readFile(index, 'utf8')).toBe(original)
    expect(await fse.pathExists(path.join(project, 'apps/generated-contract/src/rollback-contract.ts'))).toBe(false)
    expect(await fse.pathExists(path.join(project, 'apps/generated-serv/src/server/procedures/rollback-procedures.ts'))).toBe(false)
  })

  it('保留原始提交错误并收集多个stage清理失败，继续清理其余stage', async () => {
    const project = await create('api')
    const unlink = fse.unlink.bind(fse)
    let attempts = 0
    vi.spyOn(fse, 'rename').mockRejectedValue(new Error('Primary commit failure'))
    vi.spyOn(fse, 'unlink').mockImplementation(async (file) => {
      if (++attempts <= 2)
        throw new Error(`Stage cleanup failure ${attempts}`)
      await unlink(file)
    })
    const error = await generate({ type: 'api', name: 'cleanup', cwd: project }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError))
      throw new Error('Expected combined generation errors')
    expect(error.errors.map((cause: unknown) => cause instanceof Error ? cause.message : String(cause))).toEqual(['Primary commit failure', 'Stage cleanup failure 1', 'Stage cleanup failure 2'])
    expect(attempts).toBe(5)
    expect(await fse.pathExists(path.join(project, 'apps/generated-contract/src/cleanup-contract.ts'))).toBe(false)
  })
})
