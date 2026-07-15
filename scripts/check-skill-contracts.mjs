import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const SKILL_ROOTS = [
  join(ROOT, '.github', 'skills'),
  join(ROOT, 'packages', 'cli', 'templates', 'skills'),
]
const REQUIRED_CONTRACT_ITEMS = ['能力', '适用场景', '输入', '输出', '限制']

async function findSkillFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      return findSkillFiles(path)
    return entry.isFile() && entry.name === 'SKILL.md' ? [path] : []
  }))
  return nested.flat()
}

function validateSkill(path, content) {
  const failures = []
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? ''

  if (!/^name:\s*\S+/mu.test(frontmatter))
    failures.push('frontmatter 缺少 name')
  if (!/^description:\s*\S+/mu.test(frontmatter))
    failures.push('frontmatter 缺少 description')
  if (!/^## 能力契约\s*$/mu.test(content))
    failures.push('缺少“## 能力契约”章节')

  for (const item of REQUIRED_CONTRACT_ITEMS) {
    const row = new RegExp(`^\\|\\s*${item}\\s*\\|\\s*[^|\\r\\n]+\\|\\s*$`, 'mu')
    if (!row.test(content))
      failures.push(`能力契约缺少“${item}”或内容为空`)
  }

  return failures.map(message => `${relative(ROOT, path)}: ${message}`)
}

const files = (await Promise.all(SKILL_ROOTS.map(findSkillFiles))).flat()
const results = await Promise.all(files.map(async path => validateSkill(path, await readFile(path, 'utf8'))))
const failures = results.flat()

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exitCode = 1
}
else {
  console.log(`Skill contracts OK (${files.length} files)`)
}
