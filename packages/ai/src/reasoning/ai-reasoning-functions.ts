/**
 * @h-ai/ai — Reasoning 子功能实现
 *
 * 提供 ReAct、CoT、Plan-and-Execute 三种推理策略的实现。
 * @module ai-reasoning-functions
 */

import type { Result } from '@h-ai/core'
import type { AIConfig, ModelScenario } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type {
  ReasoningOperations,
  ReasoningOptions,
  ReasoningResult,
  ReasoningStep,
} from './ai-reasoning-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode, resolveModelEntry } from '../ai-config.js'

import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'reasoning' })

// ─── 策略提示词 ───

const REACT_SYSTEM_PROMPT = `You are a reasoning agent that follows the ReAct (Reasoning and Acting) framework.
For each step:
1. Think: Analyze what you know and what you need to find out.
2. Act: If you need to use a tool, call it. If you have enough information, provide the final answer.
3. Observe: Review the tool results.

Repeat until you can provide a confident final answer.
Always think step by step before acting.`

const COT_SYSTEM_PROMPT = `You are a reasoning assistant that uses Chain-of-Thought reasoning.
Break down the problem into clear logical steps.
Show your reasoning process explicitly.
After working through all steps, provide a clear final answer.`

const PLAN_EXECUTE_SYSTEM_PROMPT = `You are a planning and execution agent.
First, create a detailed step-by-step plan to solve the problem.
Then, execute each step one by one.
After completing all steps, provide the final answer.

Format your plan as a numbered list.`

/**
 * 创建 Reasoning 操作接口
 *
 * @param config - 校验后的 AI 配置
 * @param llm - LLM 操作接口
 * @returns ReasoningOperations 实例
 */
export function createReasoningOperations(config: AIConfig, llm: LLMOperations): ReasoningOperations {
  /**
   * 提取场景对应的模型名称（仅用于构造请求， API Key 校验由 provider 层负责）
   */
  function scenarioModel(scenario: ModelScenario, explicit?: string): string | undefined {
    const result = resolveModelEntry(config.llm, scenario, explicit)
    return result.success ? result.data.model : explicit
  }
  /**
   * 执行 ReAct 策略推理
   */
  async function runReact(
    query: string,
    options: ReasoningOptions,
  ): Promise<Result<ReasoningResult, AIError>> {
    const maxRounds = options.maxRounds ?? 10
    const systemPrompt = options.systemPrompt ?? REACT_SYSTEM_PROMPT
    const steps: ReasoningStep[] = []
    let stepIndex = 0

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(options.messages ?? []),
      { role: 'user', content: query },
    ]

    for (let round = 0; round < maxRounds; round++) {
      // 调用 LLM
      const chatResult = await llm.chat({
        model: scenarioModel('reasoning', options.model),
        messages,
        temperature: options.temperature,
        tools: options.tools?.getDefinitions(),
        tool_choice: options.tools ? 'auto' : undefined,
        objectId: options.objectId,
        sessionId: options.sessionId,
      })

      if (!chatResult.success)
        return chatResult

      const choice = chatResult.data.choices[0]
      if (!choice) {
        return err({
          code: AIErrorCode.REASONING_FAILED,
          message: aiM('ai_internalError', { params: { error: 'No response from LLM' } }),
        })
      }

      const assistantMessage = choice.message

      // 记录思考步骤
      if (assistantMessage.content) {
        steps.push({
          type: 'thought',
          content: typeof assistantMessage.content === 'string' ? assistantMessage.content : '',
          index: stepIndex++,
        })
      }

      // 添加助手消息到历史
      messages.push(assistantMessage)

      // 如果有工具调用
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && options.tools) {
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== 'function')
            continue
          // 记录 action 步骤
          steps.push({
            type: 'action',
            content: `Calling tool: ${toolCall.function.name}`,
            toolCall: {
              name: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
            },
            index: stepIndex++,
          })

          // 执行工具
          const toolResult = await options.tools.execute(toolCall)
          const rawToolContent = toolResult.success
            ? toolResult.data.content
            : `Tool error: ${toolResult.error.message}`
          const toolContent = typeof rawToolContent === 'string'
            ? rawToolContent
            : (rawToolContent as Array<{ text?: string }>).map(p => p.text ?? '').join(' ')

          // 记录 observation 步骤
          steps.push({
            type: 'observation',
            content: toolContent,
            index: stepIndex++,
          })

          // 添加工具消息
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolContent,
          })
        }
        continue
      }

      // 完成推理
      if (choice.finish_reason === 'stop') {
        const answer = typeof assistantMessage.content === 'string' ? assistantMessage.content : ''
        steps.push({ type: 'answer', content: answer, index: stepIndex })

        return ok({
          answer,
          steps,
          strategy: 'react',
          rounds: round + 1,
          messages,
        })
      }
    }

    // 达到最大轮次
    return err({
      code: AIErrorCode.REASONING_MAX_ROUNDS,
      message: aiM('ai_internalError', { params: { error: `Max rounds (${maxRounds}) reached` } }),
    })
  }

  /**
   * 执行 Chain-of-Thought 策略推理
   */
  async function runCoT(
    query: string,
    options: ReasoningOptions,
  ): Promise<Result<ReasoningResult, AIError>> {
    const systemPrompt = options.systemPrompt ?? COT_SYSTEM_PROMPT
    const steps: ReasoningStep[] = []

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(options.messages ?? []),
      { role: 'user', content: `${query}\n\nPlease think step by step.` },
    ]

    const chatResult = await llm.chat({
      model: scenarioModel('reasoning', options.model),
      messages,
      temperature: options.temperature,
      objectId: options.objectId,
      sessionId: options.sessionId,
    })

    if (!chatResult.success)
      return chatResult

    const choice = chatResult.data.choices[0]
    const answer = choice?.message?.content ?? ''

    // 将回答解析为步骤
    const lines = answer.split('\n').filter(l => l.trim().length > 0)
    let isAnswer = false
    let stepIndex = 0

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.toLowerCase().startsWith('final answer') || trimmed.toLowerCase().startsWith('answer:')) {
        isAnswer = true
      }

      steps.push({
        type: isAnswer ? 'answer' : 'thought',
        content: trimmed,
        index: stepIndex++,
      })
    }

    messages.push({ role: 'assistant', content: answer })

    return ok({
      answer,
      steps,
      strategy: 'cot',
      rounds: 1,
      messages,
    })
  }

  /**
   * 执行 Plan-and-Execute 策略推理
   */
  async function runPlanExecute(
    query: string,
    options: ReasoningOptions,
  ): Promise<Result<ReasoningResult, AIError>> {
    const maxRounds = options.maxRounds ?? 10
    const systemPrompt = options.systemPrompt ?? PLAN_EXECUTE_SYSTEM_PROMPT
    const steps: ReasoningStep[] = []
    let stepIndex = 0

    // 阶段1：生成计划
    const planMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(options.messages ?? []),
      { role: 'user', content: `Create a plan to solve this:\n${query}` },
    ]

    const planResult = await llm.chat({
      model: scenarioModel('plan', options.planModel ?? options.model),
      messages: planMessages,
      temperature: options.temperature,
      objectId: options.objectId,
      sessionId: options.sessionId,
    })

    if (!planResult.success)
      return planResult

    const plan = planResult.data.choices[0]?.message?.content ?? ''
    steps.push({ type: 'plan', content: plan, index: stepIndex++ })

    // 阶段2：执行计划
    const executeMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
      { role: 'assistant', content: plan },
      { role: 'user', content: 'Now execute each step of the plan. Use tools if available.' },
    ]

    for (let round = 0; round < maxRounds; round++) {
      const execResult = await llm.chat({
        model: scenarioModel('execute', options.executeModel ?? options.model),
        messages: executeMessages,
        temperature: options.temperature,
        tools: options.tools?.getDefinitions(),
        tool_choice: options.tools ? 'auto' : undefined,
        objectId: options.objectId,
        sessionId: options.sessionId,
      })

      if (!execResult.success)
        return execResult

      const choice = execResult.data.choices[0]
      if (!choice)
        break

      const msg = choice.message

      if (msg.content) {
        steps.push({ type: 'thought', content: typeof msg.content === 'string' ? msg.content : '', index: stepIndex++ })
      }

      executeMessages.push(msg)

      // 工具调用
      if (msg.tool_calls && msg.tool_calls.length > 0 && options.tools) {
        for (const toolCall of msg.tool_calls) {
          if (toolCall.type !== 'function')
            continue
          steps.push({
            type: 'action',
            content: `Executing: ${toolCall.function.name}`,
            toolCall: {
              name: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
            },
            index: stepIndex++,
          })

          const toolResult = await options.tools.execute(toolCall)
          const rawToolContent = toolResult.success
            ? toolResult.data.content
            : `Tool error: ${toolResult.error.message}`
          const toolContent = typeof rawToolContent === 'string'
            ? rawToolContent
            : (rawToolContent as Array<{ text?: string }>).map(p => p.text ?? '').join(' ')

          steps.push({ type: 'observation', content: toolContent, index: stepIndex++ })
          executeMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolContent })
        }
        continue
      }

      // 完成
      if (choice.finish_reason === 'stop') {
        const answer = typeof msg.content === 'string' ? msg.content : ''
        steps.push({ type: 'answer', content: answer, index: stepIndex })
        return ok({
          answer,
          steps,
          strategy: 'plan-execute',
          rounds: round + 1,
          messages: executeMessages,
        })
      }
    }

    return err({
      code: AIErrorCode.REASONING_MAX_ROUNDS,
      message: aiM('ai_internalError', { params: { error: `Max rounds (${maxRounds}) reached` } }),
    })
  }

  return {
    async run(query: string, options?: ReasoningOptions): Promise<Result<ReasoningResult, AIError>> {
      const strategy = options?.strategy ?? 'react'
      logger.debug('Starting reasoning', { strategy, maxRounds: options?.maxRounds })

      try {
        switch (strategy) {
          case 'react':
            return await runReact(query, options ?? {})
          case 'cot':
            return await runCoT(query, options ?? {})
          case 'plan-execute':
            return await runPlanExecute(query, options ?? {})
          default:
            return err({
              code: AIErrorCode.REASONING_STRATEGY_NOT_FOUND,
              message: aiM('ai_internalError', { params: { error: `Unknown strategy: ${strategy}` } }),
            })
        }
      }
      catch (error) {
        logger.error('Reasoning failed', { error })
        return err({
          code: AIErrorCode.REASONING_FAILED,
          message: aiM('ai_internalError', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }
}
