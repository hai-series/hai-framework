/**
 * =============================================================================
 * @hai/config - 配置加载器
 * =============================================================================
 * 提供 YAML 配置文件加载、环境变量插值、配置合并功能
 * 
 * 配置文件约定:
 * - _xxx.yml: 默认配置（框架提供）
 * - xxx.yml: 用户配置（覆盖默认）
 * 
 * 环境变量插值语法:
 * - ${ENV_VAR}: 必须存在的环境变量
 * - ${ENV_VAR:default}: 带默认值的环境变量
 * =============================================================================
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createLogger, deepMerge, err, ok, type Result } from '@hai/core'
import { parse } from 'yaml'
import type { ZodSchema, ZodError } from 'zod'

/** Logger for config module */
const logger = createLogger({ name: 'config' })

/**
 * 配置加载错误类型
 */
export type ConfigErrorType =
    | 'FILE_NOT_FOUND'
    | 'PARSE_ERROR'
    | 'VALIDATION_ERROR'
    | 'ENV_VAR_MISSING'

/**
 * 配置加载错误
 */
export interface ConfigError {
    type: ConfigErrorType
    message: string
    path?: string
    details?: unknown
}

/**
 * 环境变量插值正则
 * 匹配: ${VAR_NAME} 或 ${VAR_NAME:default_value}
 */
const ENV_VAR_PATTERN = /\$\{([^}:]+)(?::([^}]*))?\}/g

/**
 * 递归替换字符串中的环境变量引用
 * 
 * @param value - 要处理的值
 * @returns 处理结果
 */
function interpolateEnvVars(value: unknown): Result<unknown, ConfigError> {
    if (typeof value === 'string') {
        let result = value
        let match: RegExpExecArray | null

        // 重置正则状态
        ENV_VAR_PATTERN.lastIndex = 0

        while ((match = ENV_VAR_PATTERN.exec(value)) !== null) {
            const [fullMatch, varName, defaultValue] = match
            const envValue = process.env[varName]

            if (envValue === undefined && defaultValue === undefined) {
                return err({
                    type: 'ENV_VAR_MISSING',
                    message: `Environment variable '${varName}' is not set and has no default value`,
                })
            }

            result = result.replace(fullMatch, envValue ?? defaultValue ?? '')
        }

        return ok(result)
    }

    if (Array.isArray(value)) {
        const results: unknown[] = []
        for (const item of value) {
            const itemResult = interpolateEnvVars(item)
            if (!itemResult.ok) return itemResult
            results.push(itemResult.value)
        }
        return ok(results)
    }

    if (value !== null && typeof value === 'object') {
        const results: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(value)) {
            const valResult = interpolateEnvVars(val)
            if (!valResult.ok) return valResult
            results[key] = valResult.value
        }
        return ok(results)
    }

    return ok(value)
}

/**
 * 读取并解析 YAML 文件
 * 
 * @param filePath - 文件路径
 * @returns 解析结果
 */
function readYamlFile(filePath: string): Result<unknown, ConfigError> {
    if (!existsSync(filePath)) {
        return err({
            type: 'FILE_NOT_FOUND',
            message: `Configuration file not found: ${filePath}`,
            path: filePath,
        })
    }

    try {
        const content = readFileSync(filePath, 'utf-8')
        const data = parse(content)
        return ok(data)
    }
    catch (error) {
        return err({
            type: 'PARSE_ERROR',
            message: `Failed to parse YAML file: ${filePath}`,
            path: filePath,
            details: error,
        })
    }
}

/**
 * 加载配置选项
 */
export interface LoadConfigOptions<T> {
    /** 配置文件基础路径 */
    basePath: string
    /** 配置文件名（不含扩展名） */
    name: string
    /** Zod schema 用于验证 */
    schema: ZodSchema<T>
    /** 是否允许默认配置不存在 */
    allowMissingDefault?: boolean
    /** 是否允许用户配置不存在 */
    allowMissingUser?: boolean
}

/**
 * 加载并验证配置文件
 * 
 * 加载顺序:
 * 1. 读取 _name.yml (默认配置)
 * 2. 读取 name.yml (用户配置)
 * 3. 深度合并配置
 * 4. 环境变量插值
 * 5. Schema 验证
 * 
 * @param options - 加载选项
 * @returns 验证后的配置对象
 * 
 * @example
 * ```ts
 * const result = loadConfig({
 *   basePath: './config',
 *   name: 'app',
 *   schema: AppConfigSchema,
 * })
 * 
 * if (result.ok) {
 *   console.log(result.value) // 类型安全的配置对象
 * }
 * ```
 */
export function loadConfig<T>(options: LoadConfigOptions<T>): Result<T, ConfigError> {
    const {
        basePath,
        name,
        schema,
        allowMissingDefault = false,
        allowMissingUser = true,
    } = options

    const defaultPath = resolve(basePath, `_${name}.yml`)
    const userPath = resolve(basePath, `${name}.yml`)

    logger.debug({ defaultPath, userPath }, `Loading config: ${name}`)

    // 读取默认配置
    let defaultConfig: unknown = {}
    const defaultResult = readYamlFile(defaultPath)

    if (!defaultResult.ok) {
        if (defaultResult.error.type === 'FILE_NOT_FOUND' && allowMissingDefault) {
            logger.debug(`Default config not found, using empty defaults: ${defaultPath}`)
        }
        else {
            return defaultResult as Result<T, ConfigError>
        }
    }
    else {
        defaultConfig = defaultResult.value ?? {}
    }

    // 读取用户配置
    let userConfig: unknown = {}
    const userResult = readYamlFile(userPath)

    if (!userResult.ok) {
        if (userResult.error.type === 'FILE_NOT_FOUND' && allowMissingUser) {
            logger.debug(`User config not found, using defaults only: ${userPath}`)
        }
        else {
            return userResult as Result<T, ConfigError>
        }
    }
    else {
        userConfig = userResult.value ?? {}
    }

    // 合并配置
    const mergedConfig = deepMerge(
        defaultConfig as Record<string, unknown>,
        userConfig as Record<string, unknown>,
    )
    logger.trace({ mergedConfig }, `Merged config: ${name}`)

    // 环境变量插值
    const interpolateResult = interpolateEnvVars(mergedConfig)
    if (!interpolateResult.ok) {
        return interpolateResult as Result<T, ConfigError>
    }

    const interpolatedConfig = interpolateResult.value

    // Schema 验证
    const parseResult = schema.safeParse(interpolatedConfig)

    if (!parseResult.success) {
        const zodError = parseResult.error as ZodError
        return err({
            type: 'VALIDATION_ERROR',
            message: `Configuration validation failed for '${name}'`,
            details: zodError.errors.map(e => ({
                path: e.path.join('.'),
                message: e.message,
            })),
        })
    }

    logger.info(`Config loaded successfully: ${name}`)
    return ok(parseResult.data)
}

/**
 * 从纯对象加载配置（不读取文件）
 * 
 * @param data - 配置数据
 * @param schema - Zod schema
 * @returns 验证后的配置对象
 */
export function parseConfig<T>(
    data: unknown,
    schema: ZodSchema<T>,
): Result<T, ConfigError> {
    // 环境变量插值
    const interpolateResult = interpolateEnvVars(data)
    if (!interpolateResult.ok) {
        return interpolateResult as Result<T, ConfigError>
    }

    // Schema 验证
    const parseResult = schema.safeParse(interpolateResult.value)

    if (!parseResult.success) {
        const zodError = parseResult.error as ZodError
        return err({
            type: 'VALIDATION_ERROR',
            message: 'Configuration validation failed',
            details: zodError.errors.map(e => ({
                path: e.path.join('.'),
                message: e.message,
            })),
        })
    }

    return ok(parseResult.data)
}

/**
 * 批量加载多个配置文件
 * 
 * @param basePath - 配置文件基础路径
 * @param configs - 配置名称和 schema 映射
 * @returns 所有配置对象
 */
export function loadConfigs<
    T extends Record<string, ZodSchema>,
>(
    basePath: string,
    configs: T,
): Result<{ [K in keyof T]: T[K] extends ZodSchema<infer U> ? U : never }, ConfigError> {
    const results: Record<string, unknown> = {}

    for (const [name, schema] of Object.entries(configs)) {
        const result = loadConfig({
            basePath,
            name,
            schema,
            allowMissingDefault: true,
            allowMissingUser: true,
        })

        if (!result.ok) {
            return result as Result<never, ConfigError>
        }

        results[name] = result.value
    }

    return ok(results as { [K in keyof T]: T[K] extends ZodSchema<infer U> ? U : never })
}
