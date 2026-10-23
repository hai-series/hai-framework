import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { testGroups } from '../run-tests.mjs'

it('应用和包均只执行一次；所有类型的容器依赖进入串行组，无测试入口的工作区不参与', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hai-test-plan-'))
  try {
    const manifests = [
      ['packages/unit', { name: 'unit', scripts: { test: 'vitest run' } }],
      ['apps/web', { name: 'web', scripts: { test: 'vitest run' } }],
      ...['dependencies', 'devDependencies', 'optionalDependencies'].map((dependency, index) => [
        `packages/container-${index}`,
        { name: `container-${index}`, scripts: { test: 'vitest run' }, [dependency]: { testcontainers: '*' } },
      ]),
      ['apps/contract', { name: 'contract' }],
    ]
    for (const [path, manifest] of manifests) {
      mkdirSync(join(directory, path), { recursive: true })
      writeFileSync(join(directory, path, 'package.json'), JSON.stringify(manifest))
    }
    expect(testGroups(directory)).toEqual([
      { names: ['unit', 'web'], concurrency: 4 },
      { names: ['container-0', 'container-1', 'container-2'], concurrency: 1 },
    ])
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
