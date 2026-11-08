/** 公开声明须接受真正的 Core HaiResult，不能只接受结构相似的对象字面量。 */
import { resolve } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { typecheckVirtualFiles } from '../check-module-jsdoc.mjs'

it('typed Core HaiResult success/failure can be passed to the published Kit response API', () => {
  const file = resolve('scripts/tests/__kit_result_consumer.ts')
  const source = `
import { err, HaiCommonError, ok, type HaiResult } from '@h-ai/core'
import { kit } from '@h-ai/kit'
export function reply(result: HaiResult<{ id: string }>): Response {
  return kit.response.fromResult(result)
}
const success = ok({ id: 'article-1' })
const failure = err(HaiCommonError.NOT_FOUND, 'Article missing')
const responses: Response[] = [reply(success), kit.response.fromResult(failure)]
void responses
`
  const diagnostics = typecheckVirtualFiles(new Map([
    [file, source],
  ]))
  expect(diagnostics.map(diagnostic => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }))).toEqual([])
})
