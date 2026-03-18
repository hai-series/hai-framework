import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { describe, expect, it } from 'vitest'
import { iam } from '../src/index.js'

describe('debug init', () => {
  it('should init', async () => {
    await reldb.init({ type: 'sqlite', database: ':memory:' })
    await cache.init({ type: 'memory' })

    const result = await iam.init({})
    if (!result.success) {
      console.error('INIT FAILED:', JSON.stringify(result.error, null, 2))
    }
    expect(result.success).toBe(true)

    await iam.close()
    await cache.close()
    await reldb.close()
  })
})
