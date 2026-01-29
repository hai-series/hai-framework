/**
 * =============================================================================
 * @hai/ai - AI 集成（LLM、MCP、技能）
 * =============================================================================
 */

// 类型定义
export type * from './ai-types.js'

// 统一服务入口
export { ai, createAIService } from './ai.main.js'

// HAI Provider 实现
export { createHaiLLMProvider } from './provider/hai/ai-hai-llm.js'
export { createHaiMCPProvider } from './provider/hai/ai-hai-mcp.js'
export { createHaiSkillsProvider, defineSkill } from './provider/hai/ai-hai-skills.js'
