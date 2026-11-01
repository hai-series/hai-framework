import { readdirSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

it('the scaffold runner discovers each explicitly enabled generation and external middleware e2e', () => {
  const root = new URL('../../packages/cli/tests/', import.meta.url)
  const runner = readFileSync(new URL('run-scaffold-gates.mjs', root), 'utf8')
  for (const name of readdirSync(root).filter(name => name.endsWith('.e2e.test.ts'))) {
    const source = readFileSync(new URL(name, root), 'utf8')
    if (/HAI_CLI_RUN_(?:GENERATE|EXTERNAL_MIDDLEWARE)_GATES/.test(source))
      expect(runner, name).toContain(`tests/${name}`)
  }
  expect(runner).toContain('HAI_CLI_RUN_EXTERNAL_MIDDLEWARE_GATES: \'1\'')
  expect(runner).not.toContain('shell: true')
})

it('real Storage browser tests are enabled in CI and their switch changes the Turbo cache identity', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci-stage.yml', import.meta.url), 'utf8')
  const turbo = parse(readFileSync(new URL('../../turbo.json', import.meta.url), 'utf8'))
  expect(workflow).toContain('HAI_STORAGE_RUN_BROWSER_GATES:')
  expect(turbo.tasks.test.env).toContain('HAI_STORAGE_RUN_BROWSER_GATES')
})
