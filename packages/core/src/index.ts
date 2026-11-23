/**
 * @h-ai/core — Node.js 入口
 *
 * Node.js 环境的完整功能入口。
 * @module index
 */

// 配置 Schema 与错误码（HaiConfigError, HaiCommonError, CoreConfigSchema 等）
export * from './core-config.js'

// Core 聚合服务（包含 logger, config, error, id, i18n, module, typeUtils, object, sanitize, string, array, async, time）
export * from './core-main.node.js'

// 类型定义（HaiResult, Logger 等）
export { HaiCommonError, HaiConfigError } from './core-types.js'
export type { AccessCondition, AccessDecision, AccessFunctions, ArrayFn, AsyncFn, BrowserConfigFn, BrowserCoreFunctions, ConfigFn, CoreConfig, CoreFunctions, CoreLogger, CoreOptions, CreateNotInitializedKitFn, Env, ErrorFn, ErrorInfo, ErrorInfoValue, HaiError, HaiErrorDef, HaiResult, I18nFn, IdFn, InterpolationParams, Locale, LocaleInfo, LocaleMessages, LogContext, LogFormat, Logger, LoggerFunctions, LoggerOptions, LoggingConfig, LogLevel, LogObserver, LogRecord, MatchHandlers, MessageDictionary, MessageOptions, ModuleFn, ModuleRuntime, NodeCoreFunctions, NotInitializedKit, ObjectFn, PaginatedResult, PaginationOptions, PaginationOptionsInput, RequestAccessCheck, RequestAccessConfigInput, RequestAccessPolicy, RequestContext, RequestEncryptionMode, RuntimeStep, SanitizeFn, SanitizeSensitiveFieldsOptions, SensitiveKeyMatcher, StringFn, TimeFn, TrustedProxies, TypeUtilFn, ValidationFormError, WatchCallback, ZodMessageGetter, ZodValidationFn, ZodValidationMessageKey } from './core-types.js'
export type * from './core-worker-types.js'
