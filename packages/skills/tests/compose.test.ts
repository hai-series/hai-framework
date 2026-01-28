/**
 * =============================================================================
 * @hai/skills - 技能组合测试
 * =============================================================================
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { defineSkill } from '../src/skill.js'
import {
  createPipeline,
  parallel,
  conditional,
  withRetry,
} from '../src/compose.js'

// 测试用技能
const parseSkill = defineSkill({
  name: 'parse',
  description: 'Parse input',
  schema: z.object({
    text: z.string(),
  }),
  handler: ({ text }) => ({ parsed: text.toUpperCase() }),
})

const transformSkill = defineSkill({
  name: 'transform',
  description: 'Transform data',
  schema: z.object({
    parsed: z.string(),
  }),
  handler: ({ parsed }) => ({ transformed: `[${parsed}]` }),
})

const formatSkill = defineSkill({
  name: 'format',
  description: 'Format output',
  schema: z.object({
    transformed: z.string(),
  }),
  handler: ({ transformed }) => `Result: ${transformed}`,
})

const addOneSkill = defineSkill({
  name: 'add_one',
  description: 'Add one',
  schema: z.object({ value: z.number() }),
  handler: ({ value }) => ({ value: value + 1 }),
})

const multiplyTwoSkill = defineSkill({
  name: 'multiply_two',
  description: 'Multiply by two',
  schema: z.object({ value: z.number() }),
  handler: ({ value }) => ({ value: value * 2 }),
})

const failingSkill = defineSkill({
  name: 'failing',
  description: 'Always fails',
  schema: z.object({}),
  handler: () => {
    throw new Error('Intentional failure')
  },
})

describe('SkillPipeline', () => {
  describe('use', () => {
    it('应该添加步骤', () => {
      const pipeline = createPipeline('test')
        .use(parseSkill)
        .use(transformSkill)
      
      expect(pipeline.length).toBe(2)
    })
  })
  
  describe('execute', () => {
    it('应该顺序执行技能', async () => {
      const pipeline = createPipeline('text-pipeline')
        .use(parseSkill)
        .use(transformSkill, {
          mapInput: (prev: any) => ({ parsed: prev.parsed }),
        })
        .use(formatSkill, {
          mapInput: (prev: any) => ({ transformed: prev.transformed }),
        })
      
      const result = await pipeline.execute({ text: 'hello' })
      
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.output).toBe('Result: [HELLO]')
        expect(result.value.steps.length).toBe(3)
        expect(result.value.totalDuration).toBeGreaterThan(0)
      }
    })
    
    it('应该在步骤失败时停止', async () => {
      const pipeline = createPipeline('failing-pipeline')
        .use(parseSkill)
        .use(failingSkill, {
          mapInput: () => ({}),
        })
        .use(formatSkill)
      
      const result = await pipeline.execute({ text: 'hello' })
      
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('EXECUTION_FAILED')
      }
    })
    
    it('应该支持 continueOnError', async () => {
      const pipeline = createPipeline('continue-pipeline')
        .use(parseSkill)
        .use(failingSkill, {
          mapInput: () => ({}),
          continueOnError: true,
        })
        .use(formatSkill, {
          mapInput: (prev: any) => ({ transformed: prev?.parsed ?? 'fallback' }),
        })
      
      const result = await pipeline.execute({ text: 'hello' })
      
      expect(result.ok).toBe(true)
    })
    
    it('应该支持条件执行', async () => {
      let transformCalled = false
      
      const conditionalTransform = defineSkill({
        name: 'conditional_transform',
        description: 'Conditional transform',
        schema: z.object({ parsed: z.string() }),
        handler: ({ parsed }) => {
          transformCalled = true
          return { transformed: `[${parsed}]` }
        },
      })
      
      const pipeline = createPipeline('conditional-pipeline')
        .use(parseSkill)
        .use(conditionalTransform, {
          mapInput: (prev: any) => ({ parsed: prev.parsed }),
          condition: (prev: any) => prev.parsed.length > 10, // 不满足条件
        })
      
      await pipeline.execute({ text: 'hello' })
      
      expect(transformCalled).toBe(false)
    })
  })
})

describe('parallel', () => {
  it('应该并行执行多个技能', async () => {
    const result = await parallel(
      {
        skills: [addOneSkill, multiplyTwoSkill],
        aggregate: (results: any[]) => results.map(r => r.value),
      },
      { value: 5 },
    )
    
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.data).toEqual([6, 10])
    }
  })
  
  it('应该支持输入映射', async () => {
    const result = await parallel(
      {
        skills: [addOneSkill, addOneSkill],
        mapInputs: () => [{ value: 1 }, { value: 2 }],
        aggregate: (results: any[]) => results.map(r => r.value),
      },
      { value: 0 },
    )
    
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.data).toEqual([2, 3])
    }
  })
  
  it('应该在任一技能失败时返回错误', async () => {
    const result = await parallel(
      {
        skills: [addOneSkill, failingSkill as any],
      },
      { value: 1 },
    )
    
    expect(result.ok).toBe(false)
  })
})

describe('conditional', () => {
  const evenSkill = defineSkill({
    name: 'even',
    description: 'Handle even',
    schema: z.object({ value: z.number() }),
    handler: () => 'even',
  })
  
  const oddSkill = defineSkill({
    name: 'odd',
    description: 'Handle odd',
    schema: z.object({ value: z.number() }),
    handler: () => 'odd',
  })
  
  it('应该在条件为真时执行 onTrue', async () => {
    const result = await conditional(
      {
        condition: ({ value }) => value % 2 === 0,
        onTrue: evenSkill,
        onFalse: oddSkill,
      },
      { value: 4 },
    )
    
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.data).toBe('even')
    }
  })
  
  it('应该在条件为假时执行 onFalse', async () => {
    const result = await conditional(
      {
        condition: ({ value }) => value % 2 === 0,
        onTrue: evenSkill,
        onFalse: oddSkill,
      },
      { value: 3 },
    )
    
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.data).toBe('odd')
    }
  })
  
  it('应该在无 onFalse 且条件为假时返回 undefined', async () => {
    const result = await conditional(
      {
        condition: ({ value }) => value % 2 === 0,
        onTrue: evenSkill,
      },
      { value: 3 },
    )
    
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.data).toBeUndefined()
    }
  })
  
  it('应该支持异步条件', async () => {
    const result = await conditional(
      {
        condition: async ({ value }) => {
          await new Promise(resolve => setTimeout(resolve, 10))
          return value > 0
        },
        onTrue: evenSkill,
      },
      { value: 1 },
    )
    
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.data).toBe('even')
    }
  })
})

describe('withRetry', () => {
  it('应该在成功时返回结果', async () => {
    const result = await withRetry(
      addOneSkill,
      { value: 1 },
      undefined,
      { maxAttempts: 3 },
    )
    
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.data).toEqual({ value: 2 })
    }
  })
  
  it('应该在失败后重试', async () => {
    let attempts = 0
    
    const flakeySkill = defineSkill({
      name: 'flakey',
      description: 'Fails first, then succeeds',
      schema: z.object({}),
      handler: () => {
        attempts++
        if (attempts < 2) {
          throw new Error('Temporary failure')
        }
        return 'success'
      },
    })
    
    const result = await withRetry(
      flakeySkill,
      {},
      undefined,
      { maxAttempts: 3, delay: 10 },
    )
    
    expect(result.ok).toBe(true)
    expect(attempts).toBe(2)
  })
  
  it('应该在达到最大重试次数后失败', async () => {
    const result = await withRetry(
      failingSkill,
      {},
      undefined,
      { maxAttempts: 2, delay: 10 },
    )
    
    expect(result.ok).toBe(false)
  })
  
  it('应该支持自定义重试条件', async () => {
    let attempts = 0
    
    const customFailSkill = defineSkill({
      name: 'custom_fail',
      description: 'Fails with specific error',
      schema: z.object({}),
      handler: () => {
        attempts++
        throw new Error('Not retryable')
      },
    })
    
    const result = await withRetry(
      customFailSkill,
      {},
      undefined,
      {
        maxAttempts: 3,
        delay: 10,
        shouldRetry: (error) => !error.message.includes('Not retryable'),
      },
    )
    
    expect(result.ok).toBe(false)
    expect(attempts).toBe(1) // 不重试
  })
})
