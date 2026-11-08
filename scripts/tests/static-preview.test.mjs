import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'

it('静态预览缺少构建时立即提示准备步骤，不启动只返回404的服务', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hai-static-preview-'))
  try {
    const source = readFileSync(new URL('../../apps/framework-website/scripts/serve-pages.mjs', import.meta.url), 'utf8')
    // 使用系统分配端口，仅隔离本轮夹具，不改变被测启动校验。
    writeFileSync(path.join(root, 'preview.mjs'), source.replace('server.listen(4297,', 'server.listen(0,'))
    const result = spawnSync(process.execPath, ['preview.mjs'], {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: '' },
      windowsHide: true,
      encoding: 'utf8',
      timeout: 2000,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('pnpm build')
  }
  finally {
    if (path.dirname(root) === path.resolve(tmpdir()) && path.basename(root).startsWith('hai-static-preview-'))
      rmSync(root, { recursive: true, force: true })
  }
})

it('畸形路径返回400且预览继续服务，链接目录不能暴露构建树外内容', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hai-static-preview-'))
  let child
  let closed
  try {
    mkdirSync(path.join(root, 'build'))
    mkdirSync(path.join(root, 'outside'))
    writeFileSync(path.join(root, 'build', 'index.html'), '<h1>owned preview</h1>')
    writeFileSync(path.join(root, 'outside', 'secret.txt'), 'must-not-serve')
    symlinkSync(path.join(root, 'outside'), path.join(root, 'build', 'linked'), 'junction')
    linkSync(path.join(root, 'outside', 'secret.txt'), path.join(root, 'build', 'linked-secret.txt'))
    const source = readFileSync(new URL('../../apps/framework-website/scripts/serve-pages.mjs', import.meta.url), 'utf8')
    writeFileSync(path.join(root, 'preview.mjs'), source.replace('server.listen(4297, \'127.0.0.1\')', 'server.listen(0, \'127.0.0.1\', () => process.stdout.write(String(server.address().port) + \'\\n\'))'))
    child = spawn(process.execPath, ['preview.mjs'], {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: '' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    closed = once(child, 'close')
    const [ready] = await once(child.stdout, 'data')
    const port = Number(ready.toString().trim())
    const request = url => new Promise((resolve, reject) => {
      get({ host: '127.0.0.1', port, path: url }, (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', chunk => body += chunk)
        response.on('end', () => resolve({ status: response.statusCode, body }))
      }).on('error', reject)
    })
    expect(await request('/hai-framework/%')).toEqual({ status: 400, body: '' })
    expect(await request('/hai-framework/')).toEqual({ status: 200, body: '<h1>owned preview</h1>' })
    expect(await request('/hai-framework/linked/secret.txt')).toEqual({ status: 404, body: '' })
    expect(await request('/hai-framework/linked-secret.txt')).toEqual({ status: 404, body: '' })
    expect(await request('/hai-framework/')).toEqual({ status: 200, body: '<h1>owned preview</h1>' })
  }
  finally {
    child?.kill()
    if (closed)
      await closed
    if (path.dirname(root) === path.resolve(tmpdir()) && path.basename(root).startsWith('hai-static-preview-'))
      rmSync(root, { recursive: true, force: true })
  }
})
