/** 原使用无库配置的单测也执行真实共享状态协议；此处只负责隔离数据库生命周期。 */
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach } from 'vitest'
import { scheduler } from '../../src/index.js'

beforeEach(async () => {
  const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
  if (!initialized.success)
    throw new Error(initialized.error.message)
})

afterEach(async () => {
  try {
    await scheduler.close()
  }
  finally {
    await reldb.close()
  }
})
