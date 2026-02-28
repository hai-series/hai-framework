/**
 * =============================================================================
 * Corporate Website - 应用初始化
 * =============================================================================
 *
 * 初始化顺序：
 * 1. core.init — 加载配置文件
 * 2. ai.init — AI 助手（可选，配置不存在或 API Key 为空时跳过）
 * 3. reach.init — 触达服务（可选，用于联系表单邮件）
 */

import type { AIConfigInput } from '@h-ai/ai'
import type { ReachConfigInput } from '@h-ai/reach'
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'

let initialized = false

export async function initApp(): Promise<void> {
  if (initialized)
    return

  // 1. 加载配置
  core.init({
    configDir: './config',
    logging: { level: 'info' },
  })

  // 2. 初始化 AI（可选）
  const aiConfig = core.config.get<AIConfigInput>('ai')
  if (aiConfig?.llm?.apiKey) {
    const aiResult = ai.init(aiConfig)
    if (!aiResult.success) {
      core.logger.warn('AI module initialization failed, assistant features unavailable', {
        error: aiResult.error.message,
      })
    }
  }
  else {
    core.logger.info('AI module skipped: no API key configured')
  }

  // 3. 初始化 Reach（可选）
  const reachConfig = core.config.get<ReachConfigInput>('reach')
  if (reachConfig) {
    const reachResult = await reach.init(reachConfig)
    if (!reachResult.success) {
      core.logger.warn('Reach module initialization failed, contact form email unavailable', {
        error: reachResult.error.message,
      })
    }
  }

  initialized = true
  core.logger.info('Corporate Website initialized.')
}
