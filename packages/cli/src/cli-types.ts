/**
 * @h-ai/cli — 类型定义
 * @module cli-types
 */

/**
 * 可选功能
 * @example 模块内部上下文
 * ```ts
 * const features: FeatureId[] = ['ai', 'db', 'vecdb']
 * ```
 */
export type FeatureId
  = | 'iam' // 身份与访问管理
    | 'db' // 数据库
    | 'cache' // 缓存
    | 'ai' // AI 集成（含 MCP）
    | 'storage' // 文件存储
    | 'crypto' // 加密模块
    | 'audit' // 审计日志
    | 'reach' // 触达服务
    | 'kit' // SvelteKit 集成
    | 'ui' // UI 组件库
    | 'deploy' // 自动化部署
    | 'payment' // 统一支付（微信/支付宝/Stripe）
    | 'vecdb' // 向量数据库
    | 'datapipe' // 数据处理管道
    | 'scheduler' // 任务调度
    | 'capacitor' // 移动端能力
    | 'api-client' // HTTP 客户端

/**
 * 功能定义
 * @example 模块内部上下文
 * ```ts
 * const feature: FeatureDefinition = { id: 'ai', name: 'AI', description: '共享会话与知识检索', dependencies: ['db', 'vecdb'], packages: ['@h-ai/ai'] }
 * ```
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
 * @example 模块内部上下文
 * ```ts
 * const options: GlobalOptions = { cwd: '/workspace/shop', verbose: true }
 * ```
 */
export interface GlobalOptions {
  /** 是否显示详细输出 */
  verbose?: boolean
  /** 工作目录 */
  cwd?: string
}

/**
 * 应用类型
 * @example 模块内部上下文
 * ```ts
 * const appType: AppType = 'fullstack'
 * ```
 */
export type AppType = 'admin' | 'website' | 'h5' | 'api' | 'mobile-app' | 'fullstack'

/**
 * 前后端分离工程的前端目标
 * @example 模块内部上下文
 * ```ts
 * const frontend: FrontendTarget = 'web' // miniapp 仅为占位目标，不是可启动的小程序。
 * ```
 */
export type FrontendTarget = 'web' | 'app' | 'miniapp' | 'desktop'

/**
 * 模块配置值
 * @example 模块内部上下文
 * ```ts
 * const configs: ModuleConfigs = { core: { name: 'Shop', defaultLocale: 'en-US' }, db: { type: 'postgresql', host: 'db', database: 'shop' } }
 * ```
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
  /** fullstack 工程级配置（仅 fullstack 类型生效） */
  fullstack?: FullstackModuleConfig
}

/**
 * fullstack 工程级配置（i18n / theme / 端口）
 * @example 模块内部上下文
 * ```ts
 * const config: FullstackModuleConfig = { i18n: { baseLocale: 'zh-CN', locales: ['zh-CN', 'en-US'] }, theme: { defaultTheme: 'light', themes: ['light', 'dark'] }, ports: { web: 4173 } }
 * ```
 */
export interface FullstackModuleConfig {
  /** i18n 配置 */
  i18n?: {
    /** 基础语言（默认取 core.defaultLocale） */
    baseLocale?: string
    /** 支持的语言列表（≥ 1，必须包含 baseLocale） */
    locales?: string[]
  }
  /** 主题配置（daisyUI 主题名） */
  theme?: {
    /** 默认主题 */
    defaultTheme?: string
    /** 可切换主题列表（≥ 1，必须包含 defaultTheme） */
    themes?: string[]
  }
  /** 各前端开发端口 */
  ports?: {
    web?: number
    app?: number
    desktop?: number
  }
}

/**
 * core 模块配置
 * @example 模块内部上下文
 * ```ts
 * const config: CoreModuleConfig = { name: 'Shop', defaultLocale: 'en-US' }
 * ```
 */
export interface CoreModuleConfig {
  /** 应用名称 */
  name?: string
  /** 默认语言 */
  defaultLocale?: string
}

/**
 * db 模块配置
 * @example 模块内部上下文
 * ```ts
 * const config: DbModuleConfig = { type: 'postgresql', host: 'db', port: 5432, database: 'shop' } // 密码通过私有环境注入。
 * ```
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
 * @example 模块内部上下文
 * ```ts
 * const config: CacheModuleConfig = { type: 'redis', host: 'cache', port: 6379 }
 * ```
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
 * @example 模块内部上下文
 * ```ts
 * const config: IamModuleConfig = { loginPassword: true, loginOtp: false }
 * ```
 */
export interface IamModuleConfig {
  /** 启用密码登录 */
  loginPassword?: boolean
  /** 启用 OTP 登录 */
  loginOtp?: boolean
}

/**
 * storage 模块配置
 * @example 模块内部上下文
 * ```ts
 * const config: StorageModuleConfig = { type: 's3' } // 生产连接与凭据由环境配置注入。
 * ```
 */
export interface StorageModuleConfig {
  /** 存储类型 */
  type?: 'local' | 's3'
  /** 本地存储路径 */
  localPath?: string
}

/**
 * ai 模块配置
 * @example 模块内部上下文
 * ```ts
 * const config: AiModuleConfig = { defaultProvider: 'openai', model: 'gpt-4o-mini' }
 * ```
 */
export interface AiModuleConfig {
  /** 默认 Provider */
  defaultProvider?: string
  /** 模型名称 */
  model?: string
}

/**
 * 项目创建选项
 * @example 模块内部上下文
 * ```ts
 * const options: CreateProjectOptions = { name: 'shop', appType: 'api', features: ['ai'], packageManager: 'pnpm', yes: true, install: false, git: false, deploy: false } // AI 自动补 db/vecdb。
 * ```
 */
export interface CreateProjectOptions extends GlobalOptions {
  /** 默认包含部署工具；false 明确关闭。 */
  deploy?: boolean
  /** 项目名称 */
  name: string
  /** 应用类型 */
  appType?: AppType
  /** 前后端分离工程的前端目标 */
  frontends?: FrontendTarget[]
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
  /** Git 远程仓库地址 */
  gitRemote?: string
  /** 使用默认值跳过交互 */
  yes?: boolean
}

/**
 * 代码生成选项
 * @example 模块内部上下文
 * ```ts
 * const options: GenerateOptions = { cwd: '/workspace/shop', workspace: 'shop-serv', type: 'api', name: 'orders' } // 对应 hai g api orders --workspace shop-serv。
 * ```
 */
export interface GenerateOptions extends GlobalOptions {
  /** 生成类型；省略时交互选择。 */
  type?: GeneratorType
  /** 名称；省略时交互输入。 */
  name?: string
  /** 输出路径 */
  output?: string
  /** 是否覆盖现有文件 */
  force?: boolean
  /** 目标 workspace 的包名或相对路径；歧义时必须指定。 */
  workspace?: string
}

/**
 * 生成器类型
 * @example 模块内部上下文
 * ```ts
 * const generator: GeneratorType = 'api' // serv workspace 会同步 contract 与 procedure 聚合入口。
 * ```
 */
export type GeneratorType
  = | 'page'
    | 'component'
    | 'api'
    | 'model'
    | 'migration'

/**
 * 模板上下文
 * @example 模块内部上下文
 * ```ts
 * const context: TemplateContext = { projectName: 'shop', camelCase: 'orderItem', pascalCase: 'OrderItem', kebabCase: 'order-item', snakeCase: 'order_item' }
 * ```
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
 * @example 模块内部上下文
 * ```ts
 * const generator: GeneratorDefinition = { name: 'model', description: '订单模型', templates: [{ template: 'model.hbs', output: 'src/lib/models/{{kebabCase}}.ts' }] }
 * ```
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
 * @example 模块内部上下文
 * ```ts
 * const template: TemplateFile = { template: 'model.hbs', output: 'src/lib/models/{{kebabCase}}.ts' }
 * ```
 */
export interface TemplateFile {
  /** 模板路径（相对于 templates 目录） */
  template: string
  /** 输出路径（支持 handlebars） */
  output: string
}

/**
 * 提示问题定义
 * @example 模块内部上下文
 * ```ts
 * const prompt: PromptDefinition = { name: 'kind', type: 'select', message: '选择类型', choices: [{ title: '页面', value: 'page' }], initial: 'page' }
 * ```
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
 * @example 模块内部上下文
 * ```ts
 * const project: ProjectInfo = { name: 'shop', version: '1.0.0', isHaiProject: true, haiPackages: ['@h-ai/core', '@h-ai/serv'] }
 * ```
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
