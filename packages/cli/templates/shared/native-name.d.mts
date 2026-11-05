/** 原生构建只透传显式的 Core 名称与环境模式。 */
export declare function nativeNameEnvironment(envDir?: string): Record<string, string>

/** 从 Core YAML 与分层环境配置解析原生应用名称。 */
export declare function resolveNativeName(envDir: string, configFile: string, mode?: string): string
