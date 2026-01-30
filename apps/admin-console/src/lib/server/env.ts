/**
 * =============================================================================
 * Admin Console - 环境变量配置
 * =============================================================================
 */

import { z } from 'zod'

/**
 * 环境变量 Schema
 */
const envSchema = z.object({
  // 应用配置
  PUBLIC_APP_NAME: z.string().default('hai Admin Console'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // 数据库
  DATABASE_PATH: z.string().default('./data/admin.db'),

  // 会话
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default('hai_session'),
  SESSION_MAX_AGE: z.coerce.number().default(604800), // 7 days

  // 存储
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  STORAGE_PATH: z.string().default('./data/uploads'),

  // 缓存
  CACHE_TYPE: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().optional(),

  // 加密
  CRYPTO_SM4_KEY: z.string().length(16).optional(),

  // AI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // 功能开关
  FEATURE_AI_CHAT: z.coerce.boolean().default(true),
  FEATURE_API_ACCESS: z.coerce.boolean().default(true),
})

export type Env = z.infer<typeof envSchema>

/**
 * 解析并验证环境变量
 */
function parseEnv(): Env {
  // eslint-disable-next-line node/prefer-global/process
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('❌ 环境变量配置错误:')
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    throw new Error('环境变量配置无效')
  }

  return result.data
}

/**
 * 环境变量配置（延迟初始化）
 */
let _env: Env | null = null

export function getEnv(): Env {
  if (!_env) {
    _env = parseEnv()
  }
  return _env
}

/**
 * 检查是否为开发环境
 */
export function isDev(): boolean {
  return getEnv().NODE_ENV === 'development'
}

/**
 * 检查是否为生产环境
 */
export function isProd(): boolean {
  return getEnv().NODE_ENV === 'production'
}
