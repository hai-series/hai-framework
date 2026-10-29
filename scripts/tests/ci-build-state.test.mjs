import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

it('共享构建包包含应用契约、静态目录和构建元数据，不夹带工作区私有源文件', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hai-ci-state-'))
  try {
    const outputs = [
      'packages/core/dist/index.js',
      'apps/api-service-contract/dist/index.js',
      'apps/framework-website/build/index.html',
      'apps/framework-website/build/.nojekyll',
      'apps/framework-website/.svelte-kit/output/server/index.js',
      '.turbo/cache/task.tar.zst',
    ]
    for (const file of [...outputs, '.env.local', 'apps/framework-website/.env.local', 'packages/core/src/private.ts']) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      writeFileSync(path.join(root, file), file)
    }
    mkdirSync(path.join(root, 'out'))
    const workflow = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'))
    const command = workflow.jobs.build.steps.find(step => step.name === 'Pack build state').run
    const gitPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true }).trim()
    const bash = process.platform === 'win32' ? path.resolve(gitPath, '../../../usr/bin/bash.exe') : 'bash'
    if (process.platform === 'win32')
      expect(existsSync(bash)).toBe(true)
    execFileSync(bash, ['--noprofile', '--norc', '-c', command], { cwd: root, env: { ...process.env, RUNNER_TEMP: 'out', BASH_ENV: '', ENV: '' }, windowsHide: true, timeout: 10000 })
    const members = execFileSync('tar', ['-tf', path.join(root, 'out/build-state.tgz')], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)
    for (const file of outputs)
      expect(members).toContain(file)
    expect(members.some(file => file.includes('.env.local') || file.includes('/src/'))).toBe(false)
  }
  finally {
    if (path.dirname(root) === path.resolve(tmpdir()) && path.basename(root).startsWith('hai-ci-state-'))
      rmSync(root, { recursive: true, force: true })
  }
})
