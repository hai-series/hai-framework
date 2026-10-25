/** README 结构门禁：许可证只能出现一次、位于最后，功能内容不能追加到许可证正文。 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export function readmeIssues(content) {
  const headings = []
  const lines = content.split(/\r?\n/)
  let fence
  for (const [index, line] of lines.entries()) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker) {
      if (!fence)
        fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = undefined
      continue
    }
    if (!fence && /^#{1,6}\s/.test(line))
      headings.push({ title: line.trim(), index })
  }
  const issues = []
  const licenses = headings.filter(({ title }) => /^#{1,6}\s+(?:📄\s*)?(?:许可证|License|ライセンス)\s*$/i.test(title))
  if (licenses.length > 1)
    issues.push('Duplicate license section')
  if (licenses.length) {
    const license = licenses[0]
    if (headings.at(-1) !== license)
      issues.push('License must be the final section')
    const body = lines.slice(license.index + 1).join('\n').trim()
    // 仓库统一 Apache-2.0；模板末尾可以关闭外层条件，但不能混入功能正文。
    const declaration = body.replace(/\{\{\/(?:if|unless|each|with)\}\}/g, '').trim()
    if (!/^(?:Apache(?: License 2\.0|-2\.0)|\[Apache-2\.0\]\([^)]+\))$/.test(declaration))
      issues.push('Move feature content out of the license section')
  }
  const seen = new Set()
  const sections = headings.filter(({ title }) => title.startsWith('## '))
  const development = sections.findIndex(({ title }) => /^##\s+(?:二次开发|开发测试|Development(?: and testing)?|開発(?:とテスト)?)$/i.test(title))
  if (development >= 0 && sections.slice(development + 1).some(heading => !licenses.includes(heading)))
    issues.push('Place feature sections before development/testing')
  for (const { title } of sections) {
    if (seen.has(title))
      issues.push(`Duplicate section: ${title}`)
    seen.add(title)
  }
  return issues
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split(/\r?\n/))]
    .filter(path => /(?:^|\/)README(?:\.[\w-]+)?\.md(?:\.hbs)?$/i.test(path))
  const failures = paths.flatMap(path => readmeIssues(readFileSync(path, 'utf8')).map(issue => `${path}: ${issue}`))
  process.stdout.write(failures.length ? `${failures.join('\n')}\n` : `README structure valid: ${paths.length} files\n`)
  process.exitCode = failures.length ? 1 : 0
}
