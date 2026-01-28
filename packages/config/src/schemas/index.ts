/**
 * =============================================================================
 * @hai/config - Schema 入口
 * =============================================================================
 * 导出所有配置 Schema
 * =============================================================================
 */

// 应用配置
export {
    AppConfigSchema,
    EnvSchema,
    FeaturesConfigSchema,
    LogConfigSchema,
    ServerConfigSchema,
    type AppConfig,
    type Env,
    type FeaturesConfig,
    type LogConfig,
    type ServerConfig,
} from './app.js'

// 认证配置
export {
    AuthConfigSchema,
    JwtConfigSchema,
    LoginLimitsSchema,
    OAuthProviderSchema,
    PasswordPolicySchema,
    SessionConfigSchema,
    type AuthConfig,
    type JwtConfig,
    type LoginLimits,
    type OAuthProvider,
    type PasswordPolicy,
    type SessionConfig,
} from './auth.js'

// 数据库配置
export {
    DatabaseConfigSchema,
    DatabaseTypeSchema,
    DbConfigSchema,
    MysqlConfigSchema,
    PostgresConfigSchema,
    RedisConfigSchema,
    SqliteConfigSchema,
    type DatabaseConfig,
    type DatabaseType,
    type DbConfig,
    type MysqlConfig,
    type PostgresConfig,
    type RedisConfig,
    type SqliteConfig,
} from './db.js'

// AI 配置
export {
    AIConfigSchema,
    AIRateLimitSchema,
    GenerationParamsSchema,
    LLMModelConfigSchema,
    LLMProviderSchema,
    type AIConfig,
    type AIRateLimit,
    type GenerationParams,
    type LLMModelConfig,
    type LLMProvider,
} from './ai.js'
