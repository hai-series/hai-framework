/**
 * =============================================================================
 * @hai/storage - 内存驱动测试
 * =============================================================================
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { createMemoryStorageDriver } from '../src/memory.js'

describe('MemoryStorageDriver', () => {
  let driver: ReturnType<typeof createMemoryStorageDriver>
  
  beforeEach(() => {
    driver = createMemoryStorageDriver()
  })
  
  describe('基础操作', () => {
    it('应该创建驱动实例', () => {
      expect(driver).toBeDefined()
      expect(driver.name).toBe('memory')
    })
    
    it('应该写入和读取文件', async () => {
      const content = 'Hello, World!'
      
      const writeResult = await driver.write('test.txt', content, { overwrite: true })
      expect(writeResult.isOk()).toBe(true)
      
      const readResult = await driver.readText('test.txt')
      expect(readResult.isOk()).toBe(true)
      if (readResult.isOk()) {
        expect(readResult.value).toBe(content)
      }
    })
    
    it('应该检查文件是否存在', async () => {
      const existsBefore = await driver.exists('test.txt')
      expect(existsBefore.isOk() && existsBefore.value).toBe(false)
      
      await driver.write('test.txt', 'content', { overwrite: true })
      
      const existsAfter = await driver.exists('test.txt')
      expect(existsAfter.isOk() && existsAfter.value).toBe(true)
    })
    
    it('应该获取文件元数据', async () => {
      const content = 'Test content'
      await driver.write('meta.txt', content, { overwrite: true })
      
      const metaResult = await driver.getMetadata('meta.txt')
      
      expect(metaResult.isOk()).toBe(true)
      if (metaResult.isOk()) {
        expect(metaResult.value.name).toBe('meta.txt')
        expect(metaResult.value.size).toBe(new TextEncoder().encode(content).length)
        expect(metaResult.value.mimeType).toBe('text/plain')
      }
    })
    
    it('应该删除文件', async () => {
      await driver.write('to-delete.txt', 'content', { overwrite: true })
      
      const deleteResult = await driver.delete('to-delete.txt')
      expect(deleteResult.isOk()).toBe(true)
      
      const existsResult = await driver.exists('to-delete.txt')
      expect(existsResult.isOk() && existsResult.value).toBe(false)
    })
  })
  
  describe('JSON 操作', () => {
    it('应该写入和读取 JSON', async () => {
      const data = { name: 'test', value: 123 }
      
      const writeResult = await driver.writeJson('data.json', data, { overwrite: true })
      expect(writeResult.isOk()).toBe(true)
      
      const readResult = await driver.readJson('data.json')
      expect(readResult.isOk()).toBe(true)
      if (readResult.isOk()) {
        expect(readResult.value).toEqual(data)
      }
    })
    
    it('应该处理无效 JSON', async () => {
      await driver.write('invalid.json', 'not json', { overwrite: true })
      
      const readResult = await driver.readJson('invalid.json')
      
      expect(readResult.isErr()).toBe(true)
    })
  })
  
  describe('复制和移动', () => {
    it('应该复制文件', async () => {
      await driver.write('source.txt', 'source content', { overwrite: true })
      
      const copyResult = await driver.copy('source.txt', 'copy.txt')
      expect(copyResult.isOk()).toBe(true)
      
      const sourceContent = await driver.readText('source.txt')
      const copyContent = await driver.readText('copy.txt')
      
      expect(sourceContent.isOk() && sourceContent.value).toBe('source content')
      expect(copyContent.isOk() && copyContent.value).toBe('source content')
    })
    
    it('应该移动文件', async () => {
      await driver.write('original.txt', 'original content', { overwrite: true })
      
      const moveResult = await driver.move('original.txt', 'moved.txt')
      expect(moveResult.isOk()).toBe(true)
      
      const originalExists = await driver.exists('original.txt')
      const movedContent = await driver.readText('moved.txt')
      
      expect(originalExists.isOk() && originalExists.value).toBe(false)
      expect(movedContent.isOk() && movedContent.value).toBe('original content')
    })
  })
  
  describe('目录操作', () => {
    it('应该创建和删除目录', async () => {
      const createResult = await driver.createDirectory('my-dir')
      expect(createResult.isOk()).toBe(true)
      
      const deleteResult = await driver.deleteDirectory('my-dir')
      expect(deleteResult.isOk()).toBe(true)
    })
    
    it('应该列出目录内容', async () => {
      await driver.write('dir/file1.txt', 'content1', { overwrite: true })
      await driver.write('dir/file2.txt', 'content2', { overwrite: true })
      await driver.createDirectory('dir/subdir')
      
      const listResult = await driver.list('dir')
      
      expect(listResult.isOk()).toBe(true)
      if (listResult.isOk()) {
        expect(listResult.value.files.length).toBe(2)
        expect(listResult.value.directories.length).toBe(1)
      }
    })
    
    it('应该递归删除目录', async () => {
      await driver.write('parent/child/file.txt', 'content', { overwrite: true })
      
      const deleteResult = await driver.deleteDirectory('parent', true)
      expect(deleteResult.isOk()).toBe(true)
      
      const fileExists = await driver.exists('parent/child/file.txt')
      expect(fileExists.isOk() && fileExists.value).toBe(false)
    })
  })
  
  describe('配额管理', () => {
    it('应该拒绝超过配额的写入', async () => {
      const smallDriver = createMemoryStorageDriver({ maxSize: 100 })
      
      const writeResult = await smallDriver.write('large.txt', 'x'.repeat(200), { overwrite: true })
      
      expect(writeResult.isErr()).toBe(true)
      if (writeResult.isErr()) {
        expect(writeResult.error.type).toBe('QUOTA_EXCEEDED')
      }
    })
    
    it('应该追踪已用空间', async () => {
      const content = 'test content'
      const contentSize = new TextEncoder().encode(content).length
      
      await driver.write('file.txt', content, { overwrite: true })
      
      expect(driver.usedSize).toBe(contentSize)
      
      await driver.delete('file.txt')
      
      expect(driver.usedSize).toBe(0)
    })
  })
  
  describe('错误处理', () => {
    it('应该返回文件不存在错误', async () => {
      const readResult = await driver.read('nonexistent.txt')
      
      expect(readResult.isErr()).toBe(true)
      if (readResult.isErr()) {
        expect(readResult.error.type).toBe('NOT_FOUND')
      }
    })
    
    it('应该返回文件已存在错误', async () => {
      await driver.write('exists.txt', 'content', { overwrite: true })
      
      const writeResult = await driver.write('exists.txt', 'new content')
      
      expect(writeResult.isErr()).toBe(true)
      if (writeResult.isErr()) {
        expect(writeResult.error.type).toBe('ALREADY_EXISTS')
      }
    })
  })
  
  describe('追加操作', () => {
    it('应该追加内容到文件', async () => {
      await driver.write('append.txt', 'Hello', { overwrite: true })
      await driver.append('append.txt', ', World!')
      
      const content = await driver.readText('append.txt')
      
      expect(content.isOk()).toBe(true)
      if (content.isOk()) {
        expect(content.value).toBe('Hello, World!')
      }
    })
    
    it('应该在文件不存在时创建', async () => {
      await driver.append('new.txt', 'New content')
      
      const content = await driver.readText('new.txt')
      
      expect(content.isOk()).toBe(true)
      if (content.isOk()) {
        expect(content.value).toBe('New content')
      }
    })
  })
  
  describe('清空操作', () => {
    it('应该清空所有存储', async () => {
      await driver.write('file1.txt', 'content1', { overwrite: true })
      await driver.write('file2.txt', 'content2', { overwrite: true })
      
      expect(driver.fileCount).toBe(2)
      
      driver.clear()
      
      expect(driver.fileCount).toBe(0)
      expect(driver.usedSize).toBe(0)
    })
  })
})
