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
})
