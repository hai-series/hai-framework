/**
 * =============================================================================
 * @hai/config - 主入口
 * =============================================================================
 * 配置管理包，提供:
 * - Zod Schema 定义
 * - YAML 配置加载
 * - 环境变量插值
 * - 配置验证与类型推断
 * - 配置热重载
 * =============================================================================
 */

// 导出所有 Schema
export * from './schemas/index.js'

// 导出配置加载器
export {
    loadConfig,
    loadConfigs,
    parseConfig,
    type ConfigError,
    type ConfigErrorType,
    type LoadConfigOptions,
} from './loader.js'

// 导出配置管理器
export {
    ConfigManager,
    getConfigManager,
} from './manager.js'
