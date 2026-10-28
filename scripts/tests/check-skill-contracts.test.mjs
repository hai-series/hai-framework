import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkSkillContracts } from '../check-skill-contracts.mjs'

const roots = []
const contract = `---
name: hai-sample
description: Exercise a local skill resource.
---

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 验证资源 |
| 适用场景 | 本地引用验证 |
| 输入 | 资源路径 |
| 输出 | 验证结果 |
| 限制 | 不检查远程资源 |
`

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function createSkill() {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-skill-contracts-'))
  roots.push(root)
  const skillsRoot = path.join(root, 'skills')
  const skillPath = path.join(skillsRoot, 'hai-sample')
  await mkdir(skillPath, { recursive: true })
  return { root, skillsRoot, skillPath }
}

describe('skill reference delivery contract', () => {
  it.each([
    ['invalid YAML', contract.replace('name: hai-sample', 'An instruction accidentally inserted here.\nname: hai-sample')],
    ['duplicate keys', contract.replace('name: hai-sample', 'name: hai-other\nname: hai-sample')],
    ['non-string description', contract.replace('description: Exercise a local skill resource.', 'description: [not, a, description]')],
    ['invalid name', contract.replace('name: hai-sample', 'name: HAI_SAMPLE')],
  ])('rejects %s frontmatter that skill loaders cannot consume', async (_, content) => {
    const { root, skillsRoot, skillPath } = await createSkill()
    await writeFile(path.join(skillPath, 'SKILL.md'), content)
    expect((await checkSkillContracts(root, [skillsRoot])).failures.length).toBeGreaterThan(0)
  })

  it('accepts a folded multiline YAML description', async () => {
    const { root, skillsRoot, skillPath } = await createSkill()
    await writeFile(path.join(skillPath, 'SKILL.md'), contract.replace('description: Exercise a local skill resource.', 'description: >\n  Exercise a local\n  skill resource.'))
    expect((await checkSkillContracts(root, [skillsRoot])).failures).toEqual([])
  })

  it('rejects a skill whose declared name differs from its discoverable directory', async () => {
    const { root, skillsRoot, skillPath } = await createSkill()
    await writeFile(path.join(skillPath, 'SKILL.md'), contract.replace('name: hai-sample', 'name: hai-other'))
    const result = await checkSkillContracts(root, [skillsRoot])
    expect(result.failures).toContain('skills\\hai-sample\\SKILL.md: skill name 与目录名不一致: hai-other / hai-sample'.replaceAll('\\', path.sep))
  })

  it('discovers shared repository skills and CLI templates without a Copilot skills directory', async () => {
    const { root } = await createSkill()
    for (const directory of ['.agents/skills', 'packages/cli/templates/skills']) {
      const skillPath = path.join(root, directory, 'hai-sample')
      await mkdir(skillPath, { recursive: true })
      await writeFile(path.join(skillPath, 'SKILL.md'), contract)
    }

    const result = await checkSkillContracts(root)
    expect(result.failures).toEqual([])
    expect(result.skillCount).toBe(2)
  })

  it('checks reachable nested resources while ignoring remote, anchor and code example links', async () => {
    const { root, skillsRoot, skillPath } = await createSkill()
    await mkdir(path.join(skillPath, 'references'))
    await writeFile(path.join(skillPath, 'SKILL.md'), `${contract}
[Guide](references/guide.md#usage)
[Remote](https://example.com/missing.md)
[Section](#usage)
\`\`\`markdown
[Example](missing-example.md)
\`\`\`
`)
    await writeFile(path.join(skillPath, 'references', 'guide.md'), '[Entry](../SKILL.md)\n')

    const result = await checkSkillContracts(root, [skillsRoot])
    expect(result.failures).toEqual([])
    expect(result.skillCount).toBe(1)
    expect(result.referenceCount).toBe(2)
  })

  it('rejects missing references discovered only after loading a supporting guide', async () => {
    const { root, skillsRoot, skillPath } = await createSkill()
    await writeFile(path.join(skillPath, 'SKILL.md'), `${contract}\n[Guide](guide.md)\n`)
    await writeFile(path.join(skillPath, 'guide.md'), '[Required resource](missing.md)\n')

    const result = await checkSkillContracts(root, [skillsRoot])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('guide.md: 本地参考文件不存在: missing.md')
  })

  it('checks task navigation and tool bridges alongside skill references', async () => {
    const { root, skillsRoot, skillPath } = await createSkill()
    await writeFile(path.join(skillPath, 'SKILL.md'), contract)
    const agentsPath = path.join(root, 'AGENTS.md')
    const bridgePath = path.join(root, 'copilot-instructions.md')
    await writeFile(agentsPath, '[Workflow](.agents/instructions/workspace.md)\n')
    await writeFile(bridgePath, '[Shared rules](AGENTS.md)\n')

    const result = await checkSkillContracts(root, [skillsRoot], [agentsPath, bridgePath])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('AGENTS.md: 本地参考文件不存在: .agents/instructions/workspace.md')
    expect(result.referenceCount).toBe(2)
  })
})
