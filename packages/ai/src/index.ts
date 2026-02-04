/**
 * =============================================================================
 * @hai/ai - AI 模块
 * =============================================================================
 * 提供统一的 AI 能力接口
 *
 * 支持：
 * - LLM（大模型调用、流式响应）
 * - MCP（工具、资源、提示词）
 * - Skills（技能注册与执行）
 *
 * @example
 * ```ts
 * import { ai } from '@hai/ai'
 *
 * // 初始化
 * ai.init({
 *     llm: {
 *         model: 'gpt-4o-mini',
 *         apiKey: process.env.OPENAI_API_KEY,
 *     }
 * })
 *
 * // LLM 调用
 * const result = await ai.llm.chat({
 *     messages: [
 *         { role: 'system', content: '你是一个有帮助的助手' },
 *         { role: 'user', content: '你好！' }
 *     ]
 * })
 *
 * // 流式调用
 * for await (const chunk of ai.llm.chatStream({ messages: [...] })) {
 *     // 处理 chunk.choices[0].delta.content
 * }
 *
 * // MCP 工具
 * ai.mcp.registerTool(
 *     { name: 'search', description: '搜索', inputSchema: {} },
 *     async (input) => ({ results: [] })
 * )
 * await ai.mcp.callTool('search', { query: 'hello' })
 *
 * // 技能
 * ai.skills.register(mySkill)
 * await ai.skills.execute('translate', { text: 'hello', to: 'zh' })
 *
 * // 关闭
 * ai.close()
 * ```
 *
 * @packageDocumentation
 * =============================================================================
 */

import { core } from '@hai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// =============================================================================
// 类型导出
// =============================================================================

export * from './ai-config.js'

// =============================================================================
// 配置导出
// =============================================================================

export { ai } from './ai-main.js'

// =============================================================================
// 统一服务入口
// =============================================================================

export * from './ai-stream.js'

// =============================================================================
// 工具相关
// =============================================================================

export * from './ai-tools.js'

// =============================================================================
// 流处理
// =============================================================================

export * from './ai-types.js'

// i18n
type AiMessageKey = keyof typeof messagesZhCN
export const getAiMessage
  = core.i18n.createMessageGetter<AiMessageKey>({ 'zh-CN': messagesZhCN, 'en-US': messagesEnUS })

// =============================================================================
// Provider 实现（高级用法）
// =============================================================================

export { createHaiLLMProvider } from './provider/ai-provider-llm.js'
export { createHaiMCPProvider } from './provider/ai-provider-mcp.js'
export { createHaiSkillsProvider, defineSkill } from './provider/ai-provider-skills.js'
