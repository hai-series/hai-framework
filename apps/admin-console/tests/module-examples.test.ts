import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { cache } from '@h-ai/cache'
import { crypto } from '@h-ai/crypto'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { describe, expect, it } from 'vitest'
import { cacheProfileExample } from '../src/lib/examples/modules/cache'
import { encryptExample } from '../src/lib/examples/modules/crypto'
import { chunkDocumentExample } from '../src/lib/examples/modules/datapipe'
import { createUserExample } from '../src/lib/examples/modules/reldb'
import { storeFileExample } from '../src/lib/examples/modules/storage'

describe('模块页展示的独立本地示例', () => {
  it('参数化写入并读回包含引号的用户名称，随后释放数据库', async () => {
    const result = await createUserExample('Alice\'s team')
    expect(result).toMatchObject({ success: true, data: { id: 'u1', name: 'Alice\'s team' } })
    expect(reldb.isInitialized).toBe(false)
  })

  it('缓存保存真实结构化数据并释放内存实例', async () => {
    expect(await cacheProfileExample()).toMatchObject({ success: true, data: { name: 'Alice' } })
    expect(cache.isInitialized).toBe(false)
  })

  it('存储写入后可读回原始字节并关闭，临时文件由测试清理', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hai-gallery-'))
    try {
      const result = await storeFileExample(root)
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data.toString()).toBe('Example report')
      expect(storage.isInitialized).toBe(false)
    }
    finally {
      await storage.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('加密示例真实往返多语言内容并清理状态', async () => {
    expect(await encryptExample('示例 / Example / サンプル')).toMatchObject({ success: true, data: '示例 / Example / サンプル' })
    expect(crypto.isInitialized).toBe(false)
  })

  it('纯函数管道移除标签并保留正文', async () => {
    const result = await chunkDocumentExample('<p>Hello</p><p>Framework</p>')
    expect(result.success).toBe(true)
    if (result.success) {
      const text = JSON.stringify(result.data)
      expect(text).toContain('Hello')
      expect(text).toContain('Framework')
      expect(text).not.toContain('<p>')
    }
  })
})
