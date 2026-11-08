import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { expect, it } from 'vitest'

it.each([
  'cache',
  'reldb',
  'storage',
  'vecdb',
  'reach',
  'payment',
])('%s skill example compiles against the public package types', (module) => {
  const reference = readFileSync(new URL(`../templates/skills/hai-${module}/reference.md`, import.meta.url), 'utf8')
  const code = [
    ...reference.matchAll(/```(?:typescript|ts)\r?\n([\s\S]*?)\r?\n```/g),
  ].map(match => match[1]).find(text => module === 'payment'
    ? text.includes('export function createPaymentHandler(')
    : text.includes('core.config.validate') && text.includes(`${module}.init(`))
  expect(code).toBeDefined()
  const filename = path.resolve(`skill-${module}.ts`)
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    types: ['node'],
  }
  const host = ts.createCompilerHost(options)
  const original = host.getSourceFile.bind(host)
  const appTypes = `import type { SessionData } from '@h-ai/kit'
declare global { namespace App { interface Locals { session?: SessionData | null; requestId: string } } }
`
  host.getSourceFile = (name, language, onError, fresh) => path.resolve(name) === filename
    ? ts.createSourceFile(name, (module === 'payment'
        ? appTypes
        : '') + (code ?? ''), language, true)
    : original(name, language, onError, fresh)
  const program = ts.createProgram([filename], options, host)
  const errors = ts.getPreEmitDiagnostics(program)
  expect(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: name => name,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  })).toBe('')
})
