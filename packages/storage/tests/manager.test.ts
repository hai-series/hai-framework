/**
 * =============================================================================
 * @hai/storage - 管理器测试
 * =============================================================================
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  createMemoryStorage,
  createStorageManager,
  getStorage,
  initStorage,
  resetStorage,
} from '../src/manager.js'
import { MemoryStorageDriver } from '../src/memory.js'

describe('StorageManager', () => {
  describe('创建管理器', () => {
    it('应该创建内存存储管理器', () => {
      const storage = createMemoryStorage()
      
      expect(storage).toBeDefined()
      expect(storage.name).toBe('manager')
      expect(storage.getDriver()).toBeInstanceOf(MemoryStorageDriver)
    })
    
    it('应该创建指定驱动的管理器', () => {
      const storage = createStorageManager({
        driver: 'memory',
        options: { maxSize: 1024 },
      })
      
      expect(storage.getConfig().driver).toBe('memory')
    })
    
    it('应该抛出未知驱动错误', () => {
      expect(() => createStorageManager({
        driver: 'unknown' as any,
        options: {},
      })).toThrow('Unknown storage driver')
    })
  })
  
  describe('驱动切换', () => {
    it('应该切换存储驱动', () => {
      const storage = createMemoryStorage(100)
      
      expect(storage.getConfig().options).toEqual({ maxSize: 100 })
      
      storage.switchDriver({
        driver: 'memory',
        options: { maxSize: 200 },
      })
      
      expect(storage.getConfig().options).toEqual({ maxSize: 200 })
    })
  })
  
  describe('委托操作', () => {
    let storage: ReturnType<typeof createMemoryStorage>
    
    beforeEach(() => {
      storage = createMemoryStorage()
    })
    
    it('应该委托 exists 操作', async () => {
      await storage.write('test.txt', 'content', { overwrite: true })
      
      const result = await storage.exists('test.txt')
      
      expect(result.isOk() && result.value).toBe(true)
    })
    
    it('应该委托 read/write 操作', async () => {
      await storage.write('data.txt', 'test data', { overwrite: true })
      
      const readResult = await storage.readText('data.txt')
      
      expect(readResult.isOk() && readResult.value).toBe('test data')
    })
    
    it('应该委托 JSON 操作', async () => {
      const data = { key: 'value' }
      
      await storage.writeJson('config.json', data, { overwrite: true })
      
      const readResult = await storage.readJson('config.json')
      
      expect(readResult.isOk() && readResult.value).toEqual(data)
    })
    
    it('应该委托目录操作', async () => {
      await storage.createDirectory('my-folder')
      await storage.write('my-folder/file.txt', 'content', { overwrite: true })
      
      const listResult = await storage.list('my-folder')
      
      expect(listResult.isOk()).toBe(true)
      if (listResult.isOk()) {
        expect(listResult.value.files.length).toBe(1)
      }
    })
    
    it('应该返回不支持签名 URL 错误', async () => {
      const result = await storage.getSignedUrl('test.txt', { expiresIn: 3600 })
      
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('not supported')
      }
    })
  })
  
  describe('单例管理', () => {
    afterEach(() => {
      resetStorage()
    })
    
    it('应该初始化默认存储', () => {
      initStorage({
        driver: 'memory',
        options: {},
      })
      
      const storage = getStorage()
      
      expect(storage).toBeDefined()
    })
    
    it('应该在未初始化时抛出错误', () => {
      expect(() => getStorage()).toThrow('Storage not initialized')
    })
    
    it('应该重置默认存储', () => {
      initStorage({
        driver: 'memory',
        options: {},
      })
      
      resetStorage()
      
      expect(() => getStorage()).toThrow('Storage not initialized')
    })
  })
})
