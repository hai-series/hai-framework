import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const catalog = JSON.parse(await readFile(path.join(root, 'packages/cli/src/commands/cli-config-catalog.json'), 'utf8'))
const byName = new Map(catalog.map(entry => [entry.name, entry]))

async function yamlFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.svelte-kit', 'dist', 'build', 'target'].includes(entry.name))
      continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory())
      files.push(...await yamlFiles(file))
    else if (/\.ya?ml(?:\.hbs)?$/.test(entry.name))
      files.push(file)
  }
  return files
}

describe('environment catalog', () => {
  it('根示例优先列细项，每项都有用途和约束且不含冗余父对象', async () => {
    const example = await readFile(path.join(root, '.env.example'), 'utf8')
    const names = [...example.matchAll(/^# ([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1])
    expect(new Set(names).size).toBe(names.length)
    expect(names.every(name => byName.has(name))).toBe(true)
    expect(names).not.toContain('HAI_AI')
    expect(names).not.toContain('HAI_AI_LLM')
    expect(names).not.toContain('HAI_AI_LLM_MODELS_0')
    expect(names).toContain('HAI_AI_LLM_MODELS_0_PROTOCOL')
    expect(byName.has('VITE_HAI_E2E_KIT_TRANSPORT_MODE')).toBe(false)
    for (const entry of catalog) {
      expect(entry.description).toBeTruthy()
      expect(entry.constraint).toBeTruthy()
    }
    for (const [name, values] of [
      ['HAI_DB_TYPE', ['sqlite', 'postgresql', 'mysql']],
      ['HAI_CACHE_TYPE', ['memory', 'redis']],
      ['HAI_CORE_ENV', ['development', 'production', 'test', 'staging']],
      ['HAI_AI_LLM_PROTOCOL', ['chat', 'responses', 'anthropic']],
    ]) {
      for (const value of values)
        expect(byName.get(name)?.constraint).toContain(value)
    }
    expect(byName.get('HAI_CRYPTO_TRANSPORT')?.constraint).toContain('不接受 true')
    expect(byName.get('HAI_KIT_TRANSPORT_EXCLUDEPATHS_0')?.constraint).toContain('以 / 开头')
    expect(byName.get('HAI_SERV_HTTP_HEALTH_PATH')?.constraint).toContain('以 / 开头')
  })

  it('所有 apps 配置及 CLI 模板的显式 HAI 引用均能在总表定位', async () => {
    const files = [...await yamlFiles(path.join(root, 'apps')), ...await yamlFiles(path.join(root, 'packages/cli/templates/apps'))]
    const missing = []
    for (const file of files) {
      const content = await readFile(file, 'utf8')
      for (const match of content.matchAll(/\$\{(HAI_[A-Z0-9_]+)(?::[^}]*)?\}/g)) {
        const name = match[1].replace(/_\d+(?=_|$)/g, '_0')
        if (!byName.has(match[1]) && !byName.has(name))
          missing.push(`${path.relative(root, file)}: ${match[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('本地模型服务的 Python 环境入口也有说明及约束', () => {
    for (const name of ['HAI_MODEL_API_KEY', 'HAI_MODEL_REVISION', 'HAI_MODELSCOPE_REVISION', 'MODEL_PATH', 'DEVICE', 'COMPUTE_TYPE', 'VLLM_USE_MODELSCOPE']) {
      expect(byName.get(name)?.description, name).toBeTruthy()
      expect(byName.get(name)?.constraint, name).toBeTruthy()
    }
    expect(byName.get('DEVICE')?.constraint).toContain('cuda')
    expect(byName.get('HAI_MODEL_API_KEY')?.value).toBe('')
  })

  it('可运行示例统一提供类型检查与自动修复入口', async () => {
    for (const app of await readdir(path.join(root, 'apps'))) {
      const manifest = JSON.parse(await readFile(path.join(root, 'apps', app, 'package.json'), 'utf8'))
      expect(manifest.scripts, app).toMatchObject({ check: 'pnpm typecheck' })
      for (const key of ['typecheck', 'lint', 'lint:fix', 'build', 'test', 'test:watch'])
        expect(manifest.scripts[key], `${app}: ${key}`).toBeTruthy()
      if (manifest.scripts['dev:test']) {
        for (const key of ['dev:test', 'dev:prod', 'compile'])
          expect(manifest.scripts[key], `${app}: ${key}`).toBeTruthy()
        expect(manifest.scripts.build).toBe('hai build')
        expect(manifest.scripts['build:prod']).toBeUndefined()
      }
    }
  })
})
