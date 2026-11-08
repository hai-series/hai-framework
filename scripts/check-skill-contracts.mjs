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
    return entry.isFile() && entry.name.endsWith('.md')
      ? [path]
      : []
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
  const metadata = isMap(document.contents)
    ? document.contents
    : undefined
  const name = metadata?.get('name')
  const description = metadata?.get('description')

  if (typeof name === 'string' && name !== basename(dirname(path)))
    failures.push(`skill name 与目录名不一致: ${name} / ${basename(dirname(path))}`)

  if (typeof name !== 'string' || !/^[a-z\d]+(?:-[a-z\d]+)*$/u.test(name))
    failures.push('frontmatter name 必须是小写字母、数字及连字符组成的名称')
  if (typeof name === 'string' && name.length >= 64)
    failures.push('frontmatter name 必须少于 64 个字符')
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
async function validateReferences(root, path, content, resolveLocal = target => resolve(dirname(path), target)) {
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
  const destinations = [
    ...[
      ...prose.matchAll(/\[[^\]\r\n]*\]\(([^)\r\n]*)\)/gu),
    ].map(match => match[1]),
    ...[
      ...prose.matchAll(/^\s*\[[^\]\r\n]+\]:\s*(\S+)/gmu),
    ].map(match => match[1]),
    ...[
      ...prose.matchAll(/^@(\S+)\s*$/gmu),
    ].map(match => match[1]),
  ]
  if (basename(path) === 'opencode.json') {
    try {
      const config = JSON.parse(content)
      if (!Array.isArray(config.instructions) || config.instructions.some(value => typeof value !== 'string'))
        failures.push(`${relative(root, path)}: instructions 必须为文件路径字符串数组`)
      else
        destinations.push(...config.instructions)
    }
    catch {
      failures.push(`${relative(root, path)}: OpenCode JSON 无效`)
    }
  }
  for (const rawDestination of destinations) {
    const target = rawDestination.trim().match(/^(?:<([^>]+)>|(\S+))/u)
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
      await access(resolveLocal(decodeURIComponent(localPath)))
    }
    catch {
      failures.push(`${relative(root, path)}: 本地参考文件不存在: ${destination}`)
    }
  }
  return { failures, referenceCount }
}

/** 桥接文件按实际生成后的目的地解析，不能误以模板源目录为项目根。 */
export async function checkTemplateEntrypoints(root = ROOT) {
  const templates = join(root, 'packages', 'cli', 'templates', 'skills')
  const profiles = (await readdir(join(templates, 'bridges'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
  const results = await Promise.all(['generic', ...profiles].map(async (profile) => {
    let agents = join(templates, 'AGENTS.md')
    if (profile !== 'generic') {
      const candidates = ['AGENTS.md.hbs', 'AGENTS.md'].map(file => join(templates, 'bridges', profile, file))
      for (const candidate of candidates) {
        try {
          await access(candidate)
          agents = candidate
          break
        }
        catch {
          // 与生成器一致，profile 缺省时回退通用入口。
        }
      }
    }
    const entries = new Map([
      ['AGENTS.md', agents],
      [
        'CLAUDE.md',
        join(templates, 'CLAUDE.md'),
      ],
      [
        'opencode.json',
        join(templates, 'opencode.json'),
      ],
      [
        join('.github', 'copilot-instructions.md'),
        join(templates, 'copilot-instructions.md'),
      ],
    ])
    return Promise.all([...entries].map(async ([destination, source]) => {
      const content = await readFile(source, 'utf8')
      return validateReferences(root, source, content, (target) => {
        const generated = resolve(root, '__generated__')
        const relativeTarget = relative(generated, resolve(generated, dirname(destination), target))
        if (entries.has(relativeTarget))
          return entries.get(relativeTarget)
        const normalized = relativeTarget.replaceAll('\\', '/')
        if (normalized.startsWith('.agents/skills/'))
          return join(templates, normalized.slice('.agents/skills/'.length))
        throw new Error(`Unshipped entrypoint resource: ${target}`)
      })
    }))
  }))
  return {
    failures: results.flat().flatMap(result => result.failures),
    referenceCount: results.flat().reduce((total, result) => total + result.referenceCount, 0),
  }
}

/** 验证契约、相邻资源和入口导航；生成项目的桥接路径另由生成测试验证。 */
export async function checkSkillContracts(root = ROOT, skillRoots = SKILL_ROOTS.map(directory => join(root, directory)), guidanceFiles = []) {
  const directories = (await Promise.all(skillRoots.map(findSkillDirectories))).flat()
  const files = [
    ...(await Promise.all(directories.map(findMarkdownFiles))).flat(),
    ...guidanceFiles,
  ]
  const results = await Promise.all(files.map(async (path) => {
    const content = await readFile(path, 'utf8')
    const references = await validateReferences(root, path, content)
    return {
      failures: [
        ...(basename(path) === 'SKILL.md'
          ? validateSkill(root, path, content)
          : []),
        ...references.failures,
      ],
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
    ...[
      'AGENTS.md',
      'CLAUDE.md',
      'LLMS.txt',
      'opencode.json',
      '.github/copilot-instructions.md',
    ].map(file => join(ROOT, file)),
    ...(await findMarkdownFiles(join(ROOT, '.agents', 'instructions'))),
    ...(await findMarkdownFiles(join(ROOT, '.github', 'instructions'))),
  ]
  const result = await checkSkillContracts(ROOT, undefined, guidanceFiles)
  const templates = await checkTemplateEntrypoints(ROOT)
  result.failures.push(...templates.failures)
  result.referenceCount += templates.referenceCount
  if (result.failures.length > 0) {
    process.stderr.write(`${result.failures.join('\n')}\n`)
    process.exitCode = 1
  }
  else {
    process.stdout.write(`Skill contracts OK (${result.skillCount} skills, ${result.referenceCount} local references)\n`)
  }
}
