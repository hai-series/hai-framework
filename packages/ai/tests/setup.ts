/**
 * AI 模块测试全局 setup
 *
 * 使用 @h-ai/reldb（SQLite 内存模式）和 @h-ai/vecdb（LanceDB 本地临时目录）
 * 的嵌入式版本作为真实后端，无需 mock。
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'
import { afterAll, afterEach, beforeAll } from 'vitest'

let vecdbTempDir: string

beforeAll(async () => {
  // 初始化 reldb（SQLite 内存模式）
  if (!reldb.isInitialized) {
    const r = await reldb.init({ type: 'sqlite', database: ':memory:' })
    if (!r.success)
      throw new Error(`reldb init failed: ${r.error.message}`)
  }

  // 初始化 vecdb（LanceDB 本地临时目录）
  if (!vecdb.isInitialized) {
    vecdbTempDir = mkdtempSync(join(tmpdir(), 'ai-test-vecdb-'))
    const r = await vecdb.init({ type: 'lancedb', path: vecdbTempDir })
    if (!r.success)
      throw new Error(`vecdb init failed: ${r.error.message}`)
  }
})

afterAll(async () => {
  await vecdb.close()
  await reldb.close()
  // 清理 LanceDB 临时目录
  if (vecdbTempDir) {
    try {
      rmSync(vecdbTempDir, { recursive: true, force: true })
    }
    catch { /* 忽略清理失败 */ }
  }
})

// 每个测试后清理 AI 模块创建的表数据，保证测试隔离
const aiTables = ['ai_chat_records', 'ai_sessions', 'ai_memory', 'ai_context']
afterEach(async () => {
  if (!reldb.isInitialized)
    return
  for (const table of aiTables) {
    try {
      await reldb.sql.execute(`DELETE FROM ${table}`)
    }
    catch { /* 表可能尚未创建 */ }
  }
})
