/** 实际 CLI 交付目录的引用闭包，不以模板源目录可达代替生成后可达。 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { generateProjectAiSupport, generateSkillFiles } from '../../packages/cli/src/commands/cli-skill-templates.ts'
import { checkSkillContracts } from '../check-skill-contracts.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it.each([
  'admin',
  'website',
  'h5',
  'api',
  'mobile-app',
  'fullstack',
  'generic',
])('%s 实际交付全部 skill 与工具入口的本地引用闭合', async (profile) => {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-skill-closure-'))
  roots.push(root)
  if (profile === 'generic') {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'generic-fixture', private: true }))
    await generateProjectAiSupport(root, [])
  }
  else {
    await generateSkillFiles(root, [], profile, 'fixture')
  }
  const result = await checkSkillContracts(root, [
    path.join(root, '.agents/skills'),
  ], [
    'AGENTS.md',
    'CLAUDE.md',
    'opencode.json',
    '.github/copilot-instructions.md',
  ].map(file => path.join(root, file)))
  expect(result.skillCount).toBeGreaterThan(0)
  expect(result.failures).toEqual([])
}, 30_000)
