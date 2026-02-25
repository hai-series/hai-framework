/**
 * =============================================================================
 * @h-ai/cli - 类型定义
 * =============================================================================
 */

/**
 * 可选功能
 */
export type FeatureId
  = | 'iam' // 身份与访问管理
    | 'db' // 数据库
    | 'cache' // 缓存
    | 'ai' // AI 集成（含 MCP）
    | 'storage' // 文件存储
    | 'crypto' // 加密模块
    | 'kit' // SvelteKit 集成
    | 'ui' // UI 组件库
    // 兼容性别名
    | 'auth' // 认证授权 → iam
    | 'mcp' // MCP 协议 → ai

/**
 * 功能定义
 */
export interface FeatureDefinition {
  /** 功能 ID */
  id: FeatureId
  /** 功能名称 */
  name: string
  /** 功能描述 */
  description: string
  /** 依赖的其他功能 */
  dependencies?: FeatureId[]
  /** 对应的 @h-ai/* 包 */
  packages: string[]
}

/**
 * CLI 全局选项
 */
export interface GlobalOptions {
  /** 是否显示详细输出 */
  verbose?: boolean
  /** 工作目录 */
  cwd?: string
}

/**
 * 应用类型
 */
export type AppType = 'admin' | 'website' | 'h5' | 'api'

/**
 * 模块配置值
 */
export interface ModuleConfigs {
  /** core 模块配置 */
  core?: CoreModuleConfig
  /** db 模块配置 */
  db?: DbModuleConfig
  /** cache 模块配置 */
  cache?: CacheModuleConfig
  /** iam 模块配置 */
  iam?: IamModuleConfig
  /** storage 模块配置 */
  storage?: StorageModuleConfig
  /** ai 模块配置 */
  ai?: AiModuleConfig
}

/**
 * core 模块配置
 */
export interface CoreModuleConfig {
  /** 应用名称 */
  name?: string
  /** 默认语言 */
  defaultLocale?: string
}

/**
 * db 模块配置
 */
export interface DbModuleConfig {
  /** 数据库类型 */
  type?: 'sqlite' | 'postgresql' | 'mysql'
  /** 数据库路径或名称 */
  database?: string
  /** 主机（postgresql/mysql） */
  host?: string
  /** 端口（postgresql/mysql） */
  port?: number
}

/**
 * cache 模块配置
 */
export interface CacheModuleConfig {
  /** 缓存类型 */
  type?: 'memory' | 'redis'
  /** Redis 主机 */
  host?: string
  /** Redis 端口 */
  port?: number
}

/**
 * iam 模块配置
 */
export interface IamModuleConfig {
  /** 启用密码登录 */
  loginPassword?: boolean
  /** 启用 OTP 登录 */
  loginOtp?: boolean
}

/**
 * storage 模块配置
 */
export interface StorageModuleConfig {
  /** 存储类型 */
  type?: 'local' | 's3'
  /** 本地存储路径 */
  localPath?: string
}

/**
 * ai 模块配置
 */
export interface AiModuleConfig {
  /** 默认 Provider */
  defaultProvider?: string
  /** 模型名称 */
  model?: string
}

/**
 * 项目创建选项
 */
export interface CreateProjectOptions extends GlobalOptions {
  /** 项目名称 */
  name: string
  /** 应用类型 */
  appType?: AppType
  /** 项目模板 */
  template?: 'default' | 'minimal' | 'full' | 'custom'
  /** 选择的功能 */
  features?: FeatureId[]
  /** 模块配置 */
  moduleConfigs?: ModuleConfigs
  /** 是否添加示例代码 */
  examples?: boolean
  /** 是否安装依赖 */
  install?: boolean
  /** 包管理器 */
  packageManager?: 'pnpm' | 'npm' | 'yarn'
  /** 是否初始化 Git */
  git?: boolean
}

/**
 * 代码生成选项
 */
export interface GenerateOptions extends GlobalOptions {
  /** 生成类型 */
  type: GeneratorType
  /** 名称 */
  name: string
  /** 输出路径 */
  output?: string
  /** 是否覆盖现有文件 */
  force?: boolean
}

/**
 * 生成器类型
 */
export type GeneratorType
  = | 'page'
    | 'component'
    | 'api'
    | 'model'
    | 'migration'

/**
 * 模板上下文
 */
export interface TemplateContext {
  /** 项目名称 */
  projectName?: string
  /** 名称（驼峰） */
  camelCase: string
  /** 名称（帕斯卡） */
  pascalCase: string
  /** 名称（短横线） */
  kebabCase: string
  /** 名称（下划线） */
  snakeCase: string
  /** 自定义数据 */
  [key: string]: unknown
}

/**
 * 生成器定义
 */
export interface GeneratorDefinition {
  /** 生成器名称 */
  name: string
  /** 描述 */
  description: string
  /** 模板文件 */
  templates: TemplateFile[]
  /** 提示问题 */
  prompts?: PromptDefinition[]
}

/**
 * 模板文件定义
 */
export interface TemplateFile {
  /** 模板路径（相对于 templates 目录） */
  template: string
  /** 输出路径（支持 handlebars） */
  output: string
}

/**
 * 提示问题定义
 */
export interface PromptDefinition {
  /** 字段名 */
  name: string
  /** 问题类型 */
  type: 'text' | 'confirm' | 'select' | 'multiselect'
  /** 提示消息 */
  message: string
  /** 选项（select/multiselect） */
  choices?: Array<{ title: string, value: string }>
  /** 默认值 */
  initial?: unknown
}

/**
 * 项目信息
 */
export interface ProjectInfo {
  /** 项目名称 */
  name: string
  /** 版本 */
  version: string
  /** 描述 */
  description?: string
  /** 是否为 hai 项目 */
  isHaiProject: boolean
  /** 已安装的 hai 包 */
  haiPackages: string[]
}
