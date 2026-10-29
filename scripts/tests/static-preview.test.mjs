import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'

it('静态预览缺少构建时立即提示准备步骤，不启动只返回404的服务', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hai-static-preview-'))
  try {
    const source = readFileSync(new URL('../../apps/framework-website/scripts/serve-pages.mjs', import.meta.url), 'utf8')
    // 使用系统分配端口，仅隔离本轮夹具，不改变被测启动校验。
    writeFileSync(path.join(root, 'preview.mjs'), source.replace('server.listen(4297,', 'server.listen(0,'))
    const result = spawnSync(process.execPath, ['preview.mjs'], { cwd: root, env: { ...process.env, NODE_OPTIONS: '' }, windowsHide: true, encoding: 'utf8', timeout: 2000 })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('pnpm build')
  }
  finally {
    if (path.dirname(root) === path.resolve(tmpdir()) && path.basename(root).startsWith('hai-static-preview-'))
      rmSync(root, { recursive: true, force: true })
  }
})
