/**
 * =============================================================================
 * @hai/ai - AI 模块
 * =============================================================================
 * 提供统一的 AI 能力接口
 *
 * 所有功能通过 `ai` 对象统一访问：
 * - `ai.llm` — 大模型调用、流式响应（OpenAI 兼容协议）
 * - `ai.mcp` — MCP 工具/资源/提示词注册与调用
 * - `ai.tools` — OpenAI function calling 工具定义与注册表
 * - `ai.stream` — 流处理器、SSE 编解码
 * - `ai.config` / `ai.isInitialized` / `ai.init()` / `ai.close()`
 *
 * 前端客户端通过 `@hai/ai/client` 独立入口访问。
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
 * // LLM
 * const result = await ai.llm.chat({
 *     messages: [{ role: 'user', content: '你好！' }]
 * })
 *
 * // 工具
 * const tool = ai.tools.define({ name: 'greet', ... })
 * const registry = ai.tools.createRegistry()
 *
 * // 流处理
 * const processor = ai.stream.createProcessor()
 *
 * // 关闭
 * ai.close()
 * ```
 *
 * @packageDocumentation
 * =============================================================================
 */

// =============================================================================
// 统一服务入口
// =============================================================================

export { ai } from './ai-main.js'

// =============================================================================
// 类型导出（含子模块类型）
// =============================================================================

export * from './ai-types.js'
