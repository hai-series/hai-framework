import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { core } from '@h-ai/core'

/** 用实际 core 配置入口解析生成的 YAML，覆盖插值与标量还原。 */
export function loadConfigText<T = unknown>(name: string, content: string): T {
  const root = mkdtempSync(path.join(tmpdir(), 'hai-config-test-'))
  const file = path.join(root, `_${name}.yml`)
  try {
    writeFileSync(file, content)
    const result = core.config.load<T>(name, file)
    if (!result.success)
      throw new Error(result.error.message)
    return result.data
  }
  finally {
    core.config.clear(name)
    rmSync(root, { recursive: true, force: true })
  }
}
