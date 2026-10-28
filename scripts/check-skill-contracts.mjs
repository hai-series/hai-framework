import { access, readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isMap, parseDocument } from 'yaml'

const ROOT = process.cwd()
const SKILL_ROOTS = [
  '.agents/skills',
  'packages/cli/templates/skills',
]
const REQUIRED_CONTRACT_ITEMS = ['能力', '适用场景', '输入', '输出', '限制']

async function findMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      return findMarkdownFiles(path)
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : []
  }))
  return nested.flat()
}

/** 通过入口识别技能目录，不依赖命名前缀；桥接目录没有 SKILL.md。 */
async function findSkillDirectories(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  if (entries.some(entry => entry.isFile() && entry.name === 'SKILL.md'))
    return [directory]
  return (await Promise.all(entries.filter(entry => entry.isDirectory())
    .map(entry => findSkillDirectories(join(directory, entry.name))))).flat()
}

function validateSkill(root, path, content) {
  const failures = []
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? ''
  const document = parseDocument(frontmatter)
  if (document.errors.length > 0)
    failures.push(`frontmatter YAML 无效: ${document.errors.map(error => error.message.split('\n')[0]).join('; ')}`)
  const metadata = isMap(document.contents) ? document.contents : undefined
  const name = metadata?.get('name')
  const description = metadata?.get('description')

  if (typeof name === 'string' && name !== basename(dirname(path)))
    failures.push(`skill name 与目录名不一致: ${name} / ${basename(dirname(path))}`)

  if (typeof name !== 'string' || !/^[a-z\d]+(?:-[a-z\d]+)*$/u.test(name))
    failures.push('frontmatter name 必须是小写字母、数字及连字符组成的名称')
  if (typeof description !== 'string' || !description.trim())
    failures.push('frontmatter description 必须是非空字符串')
  if (!/^## 能力契约\s*$/mu.test(content))
    failures.push('缺少“## 能力契约”章节')

  for (const item of REQUIRED_CONTRACT_ITEMS) {
    const row = new RegExp(`^\\|\\s*${item}\\s*\\|\\s*[^|\\r\\n]+\\|\\s*$`, 'mu')
    if (!row.test(content))
      failures.push(`能力契约缺少“${item}”或内容为空`)
  }

  return failures.map(message => `${relative(root, path)}: ${message}`)
}

/** 检查 skill 内按需读取的本地资源，跳过范本代码中的示例链接。 */
async function validateReferences(root, path, content) {
  const failures = []
  let referenceCount = 0
  let fence
  const prose = content.split(/\r?\n/u).filter((line) => {
    const marker = line.trimStart().match(/^(?:`{3,}|~{3,})/u)?.[0]
    if (marker && (!fence || marker.startsWith(fence))) {
      fence = fence ? undefined : marker
      return false
    }
    return !fence
  }).join('\n')
  for (const match of prose.matchAll(/\[[^\]\r\n]*\]\(([^)\r\n]*)\)/gu)) {
    const target = match[1].trim().match(/^(?:<([^>]+)>|(\S+))/u)
    const destination = target?.[1] ?? target?.[2]
    if (!destination)
      continue
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/iu.test(destination))
      continue
    const localPath = destination.split(/[?#]/u)[0]
    if (!localPath)
      continue
    referenceCount++
    try {
      await access(resolve(dirname(path), decodeURIComponent(localPath)))
    }
    catch {
      failures.push(`${relative(root, path)}: 本地参考文件不存在: ${destination}`)
    }
  }
  return { failures, referenceCount }
}

/** 验证契约、相邻资源和入口导航；生成项目的桥接路径另由生成测试验证。 */
export async function checkSkillContracts(root = ROOT, skillRoots = SKILL_ROOTS.map(directory => join(root, directory)), guidanceFiles = []) {
  const directories = (await Promise.all(skillRoots.map(findSkillDirectories))).flat()
  const files = [...(await Promise.all(directories.map(findMarkdownFiles))).flat(), ...guidanceFiles]
  const results = await Promise.all(files.map(async (path) => {
    const content = await readFile(path, 'utf8')
    const references = await validateReferences(root, path, content)
    return {
      failures: [...(basename(path) === 'SKILL.md' ? validateSkill(root, path, content) : []), ...references.failures],
      referenceCount: references.referenceCount,
    }
  }))
  return {
    skillCount: files.filter(path => path.endsWith('SKILL.md')).length,
    referenceCount: results.reduce((total, result) => total + result.referenceCount, 0),
    failures: results.flatMap(result => result.failures),
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const guidanceFiles = [
    ...['AGENTS.md', 'CLAUDE.md', 'LLMS.txt', '.github/copilot-instructions.md'].map(file => join(ROOT, file)),
    ...(await findMarkdownFiles(join(ROOT, '.agents', 'instructions'))),
    ...(await findMarkdownFiles(join(ROOT, '.github', 'instructions'))),
  ]
  const result = await checkSkillContracts(ROOT, undefined, guidanceFiles)
  if (result.failures.length > 0) {
    process.stderr.write(`${result.failures.join('\n')}\n`)
    process.exitCode = 1
  }
  else {
    process.stdout.write(`Skill contracts OK (${result.skillCount} skills, ${result.referenceCount} local references)\n`)
  }
}
