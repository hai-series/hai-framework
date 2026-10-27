/** 实际环境目录生成器必须区分文档注释与可执行/生成模板中的变量引用。 */
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

const repository = fileURLToPath(new URL('../../', import.meta.url))

it('真实catalog排除JS/TS的JSDoc，保留运行入口、字符串生成代码及YAML/模板可选字段', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-env-doc-'))
  if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith('hai-env-doc-'))
    throw new Error('Unexpected fixture path')
  try {
    // Schema 仍由真实包入口加载；只复制生成器读取的源码说明，不模拟另一套配置实现。
    for (const name of ['core', 'reldb', 'cache', 'storage', 'iam', 'ai', 'vecdb', 'reach', 'payment', 'audit', 'scheduler', 'deploy', 'serv', 'kit', 'datapipe', 'crypto', 'feedback']) {
      const directory = path.join(repository, 'packages', name, 'src')
      for (const file of await readdir(directory, { recursive: true })) {
        if (!/(?:config|types)\.ts$/.test(file) || file.endsWith('.d.ts'))
          continue
        const destination = path.join(root, 'packages', name, 'src', file)
        await mkdir(path.dirname(destination), { recursive: true })
        await copyFile(path.join(directory, file), destination)
      }
    }
    await mkdir(path.join(root, 'packages/cli/src/commands'), { recursive: true })
    await mkdir(path.join(root, 'apps/fixture'), { recursive: true })
    await mkdir(path.join(root, 'scripts'), { recursive: true })
    const code = [
      '/** 示例变量不是运行配置：process.env.HAI_DOC02_DOCUMENTATION */',
      'export const actual = process.env.HAI_DOC02_RUNTIME',
      'export function read() {',
      '  /** 内部示例：process.env.HAI_DOC02_NESTED */',
      '  const actual = process.env["HAI_DOC02_BRACKET"]',
      '  return actual',
      '}',
      'const literal = "/** process.env.HAI_DOC02_STRING */"',
      'const template = `/** process.env.HAI_DOC02_GENERATED_DOC */\\nexport const read = process.env.HAI_DOC02_GENERATED_RUNTIME`',
      // eslint-disable-next-line no-template-curly-in-string -- 保留待解析 TS 模板的真实插值，不能在本测试先求值。
      'const interpolated = `prefix ${actual} /** process.env.HAI_DOC02_TEMPLATE_TAIL */`',
      'const pattern = /[/*]{2}/',
      '/** EOF 示例：process.env.HAI_DOC02_EOF */',
    ].join('\n')
    expect(ts.createSourceFile('fixture.ts', code, ts.ScriptTarget.Latest, true).parseDiagnostics).toEqual([])
    for (const extension of ['ts', 'js', 'mjs']) await writeFile(path.join(root, `apps/fixture/source.${extension}`), code)
    await writeFile(path.join(root, 'apps/fixture/Widget.svelte'), '<script lang="ts">\n/** process.env.HAI_DOC02_SVELTE_DOC */\nconst port = process.env.HAI_DOC02_SVELTE_RUNTIME\n</script>\n<div>{port}</div>')
    await writeFile(path.join(root, 'apps/fixture/source.ts.hbs'), '/** process.env.HAI_DOC02_TEMPLATE_DOC */\nexport const x = process.env.HAI_DOC02_HBS_RUNTIME')
    // eslint-disable-next-line no-template-curly-in-string -- YAML 环境引用必须按原文交给真实生成器。
    await writeFile(path.join(root, 'apps/fixture/optional.yml'), '# token: ${HAI_DOC02_YAML_OPTIONAL:}\n')
    await writeFile(path.join(root, 'apps/fixture/Runtime.ts'), '/** process.env.HAI_CORE_NAME is a documentation example only. */\nexport const port = process.env.PORT\n')
    await writeFile(path.join(root, 'apps/fixture/.env.example'), '# Public fixture environment\n')
    // eslint-disable-next-line no-template-curly-in-string -- 项目 JSON 的部署占位符由生成器解析。
    await writeFile(path.join(root, 'apps/fixture/hai.json'), JSON.stringify({ build: { images: [] }, deploy: { provider: { remote: { baseDir: '${HAI_DOC02_PROJECT_ROOT:/srv/fixture}' }, expose: { hostPort: '${HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT:18123}' } } } }))
    const result = spawnSync(process.execPath, [path.join(repository, 'scripts/generate-env-catalog.mjs')], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000 })
    expect(result.status, result.stdout + result.stderr).toBe(0)
    const catalog = JSON.parse(await readFile(path.join(root, 'packages/cli/src/commands/cli-config-catalog.json'), 'utf8'))
    for (const module of ['kit', 'serv']) {
      const transport = catalog.find(entry => entry.path === `${module}.transport.maxPlaintextBytes`)
      expect(transport?.description).toContain('auto')
      expect(transport?.value).toBe('auto')
    }
    const variables = new Set(catalog.map(entry => entry.name))
    expect(variables.has('HAI_DOC02_PROJECT_ROOT')).toBe(true)
    for (const suffix of ['DOCUMENTATION', 'NESTED', 'EOF', 'SVELTE_DOC']) expect(variables.has(`HAI_DOC02_${suffix}`), suffix).toBe(false)
    for (const suffix of ['RUNTIME', 'BRACKET', 'STRING', 'GENERATED_DOC', 'GENERATED_RUNTIME', 'TEMPLATE_TAIL', 'SVELTE_RUNTIME', 'TEMPLATE_DOC', 'HBS_RUNTIME', 'YAML_OPTIONAL']) expect(variables.has(`HAI_DOC02_${suffix}`), suffix).toBe(true)
    const appResult = spawnSync(process.execPath, [path.join(repository, 'scripts/generate-app-env.mjs')], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000 })
    expect(appResult.status, appResult.stdout + appResult.stderr).toBe(0)
    const application = await readFile(path.join(root, 'apps/fixture/.env.example'), 'utf8')
    expect(application).toContain('PORT=')
    expect(application).not.toContain('HAI_CORE_NAME=')
    expect(application).toContain('HAI_DOC02_PROJECT_ROOT=\'/srv/fixture\'')
    expect(application).toContain('HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT=\'18123\'')
    expect(application).toContain('HAI_DEPLOY_CONTAINER_S3ENGINE=')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
