/**
 * =============================================================================
 * @hai/skills - 技能组合
 * =============================================================================
 * 提供技能组合和工作流功能
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok, generateId, createLogger } from '@hai/core'
import type { Skill, SkillContext, SkillError, SkillResult } from './skill.js'

const logger = createLogger({ name: 'skill-compose' })

/**
 * 管道步骤
 */
export interface PipelineStep<TInput = unknown, TOutput = unknown> {
  /** 步骤名称 */
  name: string
  /** 技能 */
  skill: Skill<TInput, TOutput>
  /** 输入转换器 */
  mapInput?: (prevOutput: unknown, context: SkillContext) => TInput
  /** 输出转换器 */
  mapOutput?: (output: TOutput, context: SkillContext) => unknown
  /** 条件执行 */
  condition?: (prevOutput: unknown, context: SkillContext) => boolean
  /** 失败时是否继续 */
  continueOnError?: boolean
}

/**
 * 管道执行结果
 */
export interface PipelineResult {
  /** 最终输出 */
  output: unknown
  /** 各步骤结果 */
  steps: Array<{
    name: string
    success: boolean
    output?: unknown
    error?: SkillError
    duration: number
  }>
  /** 总耗时 */
  totalDuration: number
}

/**
 * 技能管道
 * 按顺序执行多个技能
 */
export class SkillPipeline {
  private steps: PipelineStep[] = []
  private name: string
  
  constructor(name: string) {
    this.name = name
  }
  
  /**
   * 添加步骤
   * 
   * @param step - 管道步骤
   */
  addStep<TInput, TOutput>(step: PipelineStep<TInput, TOutput>): this {
    this.steps.push(step as PipelineStep)
    return this
  }
  
  /**
   * 使用技能（简化 API）
   * 
   * @param skill - 技能
   * @param options - 选项
   */
  use<TInput, TOutput>(
    skill: Skill<TInput, TOutput>,
    options: Partial<Omit<PipelineStep<TInput, TOutput>, 'skill'>> = {},
  ): this {
    return this.addStep({
      name: options.name ?? skill.name,
      skill,
      ...options,
    })
  }
  
  /**
   * 执行管道
   * 
   * @param input - 初始输入
   * @param context - 执行上下文
   */
  async execute(
    input: unknown,
    context?: Partial<SkillContext>,
  ): Promise<Result<PipelineResult, SkillError>> {
    const ctx: SkillContext = {
      requestId: generateId(),
      ...context,
    }
    
    const stepResults: PipelineResult['steps'] = []
    let currentOutput = input
    const startTime = performance.now()
    
    logger.info({ pipelineName: this.name, requestId: ctx.requestId }, 'Pipeline started')
    
    for (const step of this.steps) {
      // 检查条件
      if (step.condition && !step.condition(currentOutput, ctx)) {
        logger.debug(
          { pipelineName: this.name, stepName: step.name },
          'Step skipped due to condition',
        )
        continue
      }
      
      // 转换输入
      const stepInput = step.mapInput
        ? step.mapInput(currentOutput, ctx)
        : currentOutput
      
      const stepStartTime = performance.now()
      
      // 执行技能
      const result = await step.skill.execute(stepInput, ctx)
      const stepDuration = performance.now() - stepStartTime
      
      if (!result.ok) {
        stepResults.push({
          name: step.name,
          success: false,
          error: result.error,
          duration: stepDuration,
        })
        
        if (!step.continueOnError) {
          logger.error(
            { pipelineName: this.name, stepName: step.name, error: result.error },
            'Pipeline failed at step',
          )
          
          return err({
            type: 'EXECUTION_FAILED',
            message: `Pipeline failed at step '${step.name}': ${result.error.message}`,
            skillName: step.skill.name,
            details: { stepResults },
          })
        }
        
        logger.warn(
          { pipelineName: this.name, stepName: step.name },
          'Step failed but continuing',
        )
        continue
      }
      
      // 转换输出
      currentOutput = step.mapOutput
        ? step.mapOutput(result.value.data, ctx)
        : result.value.data
      
      stepResults.push({
        name: step.name,
        success: true,
        output: currentOutput,
        duration: stepDuration,
      })
    }
    
    const totalDuration = performance.now() - startTime
    
    logger.info(
      { pipelineName: this.name, requestId: ctx.requestId, totalDuration },
      'Pipeline completed',
    )
    
    return ok({
      output: currentOutput,
      steps: stepResults,
      totalDuration,
    })
  }
  
  /**
   * 获取步骤数量
   */
  get length(): number {
    return this.steps.length
  }
}

/**
 * 创建技能管道
 * 
 * @param name - 管道名称
 */
export function createPipeline(name: string): SkillPipeline {
  return new SkillPipeline(name)
}

/**
 * 并行执行配置
 */
export interface ParallelConfig<TInput = unknown> {
  /** 技能列表 */
  skills: Skill<TInput>[]
  /** 输入映射 */
  mapInputs?: (input: TInput) => TInput[]
  /** 结果聚合 */
  aggregate?: (results: unknown[]) => unknown
}

/**
 * 并行执行多个技能
 * 
 * @param config - 并行配置
 * @param input - 输入数据
 * @param context - 执行上下文
 */
export async function parallel<TInput>(
  config: ParallelConfig<TInput>,
  input: TInput,
  context?: Partial<SkillContext>,
): Promise<Result<SkillResult<unknown>, SkillError>> {
  const { skills, mapInputs, aggregate } = config
  
  const startTime = performance.now()
  
  // 映射输入
  const inputs = mapInputs ? mapInputs(input) : skills.map(() => input)
  
  // 并行执行
  const results = await Promise.all(
    skills.map((skill, index) => skill.execute(inputs[index], context)),
  )
  
  // 检查错误
  for (const result of results) {
    if (!result.ok) {
      return result as Result<SkillResult<unknown>, SkillError>
    }
  }
  
  // 聚合结果
  const outputs = results.map(r => (r as { ok: true, value: SkillResult }).value.data)
  const finalOutput = aggregate ? aggregate(outputs) : outputs
  
  return ok({
    data: finalOutput,
    duration: performance.now() - startTime,
  })
}

/**
 * 条件执行配置
 */
export interface ConditionalConfig<TInput = unknown, TOutput = unknown> {
  /** 条件函数 */
  condition: (input: TInput, context: SkillContext) => boolean | Promise<boolean>
  /** 条件为真时执行 */
  onTrue: Skill<TInput, TOutput>
  /** 条件为假时执行 */
  onFalse?: Skill<TInput, TOutput>
}

/**
 * 条件执行技能
 * 
 * @param config - 条件配置
 * @param input - 输入数据
 * @param context - 执行上下文
 */
export async function conditional<TInput, TOutput>(
  config: ConditionalConfig<TInput, TOutput>,
  input: TInput,
  context?: Partial<SkillContext>,
): Promise<Result<SkillResult<TOutput | undefined>, SkillError>> {
  const ctx: SkillContext = {
    requestId: generateId(),
    ...context,
  }
  
  const conditionResult = await config.condition(input, ctx)
  
  if (conditionResult) {
    return config.onTrue.execute(input, ctx)
  }
  else if (config.onFalse) {
    return config.onFalse.execute(input, ctx)
  }
  
  return ok({
    data: undefined,
    duration: 0,
  })
}

/**
 * 重试执行配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts?: number
  /** 重试延迟（毫秒） */
  delay?: number
  /** 延迟倍数 */
  backoffMultiplier?: number
  /** 重试条件 */
  shouldRetry?: (error: SkillError, attempt: number) => boolean
}

/**
 * 带重试的技能执行
 * 
 * @param skill - 技能
 * @param input - 输入数据
 * @param context - 执行上下文
 * @param config - 重试配置
 */
export async function withRetry<TInput, TOutput>(
  skill: Skill<TInput, TOutput>,
  input: TInput,
  context?: Partial<SkillContext>,
  config: RetryConfig = {},
): Promise<Result<SkillResult<TOutput>, SkillError>> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = config
  
  let lastError: SkillError | null = null
  let currentDelay = delay
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await skill.execute(input, context)
    
    if (result.ok) {
      return result
    }
    
    lastError = result.error
    
    if (attempt < maxAttempts && shouldRetry(lastError, attempt)) {
      logger.debug(
        { skillName: skill.name, attempt, delay: currentDelay },
        'Retrying skill execution',
      )
      
      await new Promise(resolve => setTimeout(resolve, currentDelay))
      currentDelay *= backoffMultiplier
    }
  }
  
  return err(lastError!)
}
