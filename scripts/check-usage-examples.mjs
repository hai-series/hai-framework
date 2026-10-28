/** 校验指南标注的完整配置；凭据占位使用固定非秘密样例，不读环境、不联网。 */
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'

function placeholders(value) {
  if (typeof value === 'string' && /^\$\{[A-Z\d_]+\}$/.test(value))
    return value.slice(2, -1) === 'STRIPE_SECRET_KEY' ? 'sk_test_documentation_placeholder' : 'documentation-placeholder'
  if (Array.isArray(value))
    return value.map(placeholders)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, placeholders(item)]))
  return value
}

/** Zod 默认剥离未知字段；文档不能因“解析成功”而保留实际上被忽略的配置。 */
function verifyConsumed(input, output, location) {
  if (!input || typeof input !== 'object')
    return
  for (const [key, value] of Object.entries(input)) {
    assert.ok(output && typeof output === 'object' && Object.hasOwn(output, key), `${location}.${key}: example field was ignored`)
    verifyConsumed(value, output[key], `${location}.${key}`)
  }
}

const directory = path.resolve('docs/usage')
const results = []
let failed = false
async function markdownFiles(relative = '') {
  const files = []
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name)
    if (entry.isDirectory() && entry.name !== 'images')
      files.push(...await markdownFiles(child))
    else if (entry.isFile() && entry.name.endsWith('.md'))
      files.push(child)
  }
  return files.sort()
}
for (const file of await markdownFiles()) {
  const source = await readFile(path.join(directory, file), 'utf8')
  let index = 0
  for (const match of source.matchAll(/```(yaml|json) schema=(@h-ai\/[\w-]+):(\w+)\r?\n([\s\S]*?)\r?\n```/g)) {
    const [, format, module, name, body] = match
    const location = `${file} example ${++index}`
    try {
      const input = placeholders(format === 'json' ? JSON.parse(body) : parse(body))
      const schema = (await import(module))[name]
      const checked = schema.safeParse(input)
      assert.ok(checked.success, `${location}: ${checked.success ? '' : checked.error.issues.map(issue => `${issue.path.join('.')}: ${issue.code}`).join('; ')}`)
      verifyConsumed(input, checked.data, location)
      results.push({ location, schema: name, status: 'passed' })
    }
    catch (error) {
      failed = true
      results.push({ location, schema: name, status: 'failed', reason: error instanceof Error ? error.message : 'Validation failed' })
    }
  }
}
assert.ok(results.length > 0, 'No documented schema examples found')
process.stdout.write(`${JSON.stringify({ examples: results.length, passed: results.filter(result => result.status === 'passed').length, results }, null, 2)}\n`)
if (failed)
  process.exitCode = 1
