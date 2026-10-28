import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createDeploymentPlan } from '@h-ai/deploy'

// 只创建本地浏览器项目元数据，调用只读计划 API；不构建、上传或发布。
const root = await mkdtemp(path.join(os.tmpdir(), 'hai-usage-plan-'))
assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
assert.ok(path.basename(root).startsWith('hai-usage-plan-'))
try {
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@example/browser', version: '1.0.0' }))
  await writeFile(path.join(root, 'hai.json'), JSON.stringify({ build: { images: [{ name: 'web', dockerfile: 'images/web.Dockerfile' }] } }))
  await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\nimporters:\n  .: {}\npackages: {}\nsnapshots: {}\n')
  await writeFile(path.join(root, '.env.prod'), 'HAI_CORE_ENV=production\n')
  const before = await readdir(root, { recursive: true })
  // 占位值只用于满足只读配置结构；不是有效凭据，不会发送到服务商。
  const config = { provider: { type: 'vercel', token: 'example-plan-only' } }
  const planned = await createDeploymentPlan(root, config, { environment: 'prod' })
  assert.equal(planned.success, true)
  if (!planned.success)
    throw new Error(planned.error.message, { cause: planned.error })
  const invalid = await createDeploymentPlan(root, config, { environment: 'prod', selectedServices: ['serv'] })
  assert.equal(invalid.success, false)
  assert.deepEqual(await readdir(root, { recursive: true }), before)
  process.stdout.write(`${JSON.stringify({
    projectName: planned.data.projectName,
    selected: planned.data.selected,
    containers: planned.data.containers,
    unknownServiceRejected: !invalid.success,
    projectFilesUnchanged: true,
    remoteDeploymentExecuted: false,
  }, null, 2)}\n`)
}
finally {
  await rm(root, { recursive: true, force: true })
}
