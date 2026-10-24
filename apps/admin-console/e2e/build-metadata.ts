/** 从真实构建产物读取标识；不执行编译后的应用代码。 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

interface BuildMetadata { appVersion: string, buildId: string, commit: string }
interface MetadataFile { path: string, sha256: string, metadata: BuildMetadata }

export interface AdminBuildFacts {
  client: BuildMetadata
  server: BuildMetadata
  files: MetadataFile[]
}

/** 同一次 SSR 构建的两个产物必须有相同身份，且归属于本次源码。 */
export function readAdminBuildFacts(appDir = fileURLToPath(new URL('../', import.meta.url)), expectedCommit?: string): AdminBuildFacts {
  const manifest: { version: string } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'))
  const commit = expectedCommit ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appDir, encoding: 'utf8', windowsHide: true }).trim()
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit))
    throw new Error('The actual source commit is required for admin acceptance')
  const files: MetadataFile[] = []
  function readGroup(directory: string): BuildMetadata {
    const matches: MetadataFile[] = []
    function walk(current: string): void {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const filename = join(current, entry.name)
        if (entry.isSymbolicLink())
          throw new Error('Build acceptance refuses symbolic links')
        if (entry.isDirectory()) {
          walk(filename)
          continue
        }
        if (!entry.isFile() || !filename.endsWith('.js'))
          continue
        const bytes = readFileSync(filename)
        const source = bytes.toString('utf8')
        if (!source.includes('appVersion') || !source.includes('buildId') || !source.includes('commit'))
          continue
        const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
        function visit(node: ts.Node): void {
          if (ts.isObjectLiteralExpression(node)) {
            const values: Partial<BuildMetadata> = {}
            for (const property of node.properties) {
              if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.initializer))
                continue
              const name = ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name) ? property.name.text : ''
              if (name === 'appVersion' || name === 'buildId' || name === 'commit')
                values[name] = property.initializer.text
            }
            if (typeof values.appVersion === 'string' && typeof values.buildId === 'string' && typeof values.commit === 'string') {
              if (values.appVersion !== manifest.version || values.commit !== commit || !values.buildId.trim())
                throw new Error(`Built metadata does not match this source: ${relative(appDir, filename)}`)
              matches.push({ path: relative(appDir, filename), sha256: createHash('sha256').update(bytes).digest('hex'), metadata: { appVersion: values.appVersion, buildId: values.buildId, commit: values.commit } })
            }
          }
          ts.forEachChild(node, visit)
        }
        visit(parsed)
      }
    }
    walk(directory)
    if (!matches.length || new Set(matches.map(item => JSON.stringify(item.metadata))).size !== 1)
      throw new Error('A single build identity is required in each compiled admin output')
    files.push(...matches)
    return matches[0]!.metadata
  }
  const output = join(appDir, '.svelte-kit/output')
  const client = readGroup(join(output, 'client'))
  const server = readGroup(join(output, 'server'))
  if (client.buildId !== server.buildId)
    throw new Error('Client and server build IDs differ in the same admin build')
  return { client, server, files }
}
