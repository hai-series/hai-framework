/**
 * @h-ai/ai — 构建配置
 *
 * 入口说明：
 * - `index`        ：Node.js 主入口，包含 LLM Provider、MCP Server、工具、流处理等全部功能
 * - `browser`       ：浏览器条件入口，仅导出配置/类型/HTTP 客户端（不含 OpenAI SDK 和 MCP 依赖）
 * - `client/index`  ：独立客户端子路径入口（`@h-ai/ai/client`），供前端直接导入
 */

import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'browser': 'src/ai-index.browser.ts',
    'client/index': 'src/client/index.ts',
    'api/index': 'src/api/index.ts',
  },
  external: ['@h-ai/core', '@h-ai/vecdb', '@h-ai/reldb', '@h-ai/datapipe', 'openai', 'nanoid', '@modelcontextprotocol/sdk', '@lancedb/lancedb', '@qdrant/js-client-rest', 'zod'],
})
