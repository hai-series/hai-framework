/**
 * @h-ai/cli — 模板引擎
 *
 * 基于模板目录的项目生成逻辑：
 * 1. 拷贝 base 模板（骨架）
 * 2. 拷贝 apps/{type} 模板（应用类型路由）
 * 3. 叠加 features/{feat} 模板（可选功能路由，静态文件）
 * 4. 渲染 Handlebars 动态模板（base + apps + features 的 .hbs 文件）
 * 5. 拷贝 i18n 脚手架（project.inlang + messages）（当 hasI18n 为 true）
 *
 * @module cli-template-engine
 */

import type { AppType, FeatureId, FrontendTarget, ModuleConfigs } from '../cli-types.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fse from 'fs-extra'
import Handlebars from 'handlebars'
import { getCliVersion } from '../cli-utils.js'

// 注册自定义 Handlebars helpers
Handlebars.registerHelper('if_eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  return a === b ? options.fn(this) : options.inverse(this)
})

const TEMPLATE_SKIP_IF_EMPTY_MARKER = '@skipIfEmpty'
const NORMALIZED_RENDER_EXTENSIONS = new Set(['.ts', '.js', '.svelte', '.json', '.css'])

// Capacitor 应用为纯客户端 SPA（Svelte 5 + Vite），没有服务端运行时。
// 服务端专属产物（hooks、server init）必须跳过，否则预渲染会因访问 url.searchParams 报错。
const CAPACITOR_SKIPPED_SERVER_FILES = new Set([
  'src/hooks.server.ts',
  'src/lib/server/init.ts',
])

// 以下版本号与生成项目的 pnpm-workspace.yaml catalog 保持一致；
// 单包脚手架直接写具体版本，pnpm fullstack workspace 会通过 catalog: 引用这些版本。
const VERSIONS = {
  antfuEslintConfig: '^9.0.0',
  capacitorSecureStorage: '^8.0.0',
  // UI / Icon
  bitsUi: '^2.18.1',
  iconifyJsonTabler: '^1.2.35',
  iconifyTailwind: '^1.2.3',
  // Capacitor
  capacitorAndroid: '^8.3.4',
  capacitorApp: '^8.0.1',
  capacitorCamera: '^8.0.1',
  capacitorCli: '^8.3.4',
  capacitorCore: '^8.3.4',
  capacitorDevice: '^8.0.1',
  capacitorIos: '^8.3.4',
  capacitorPreferences: '^8.0.1',
  capacitorPushNotifications: '^8.0.1',
  capacitorStatusBar: '^8.0.1',
  // Tailwind / DaisyUI
  daisyui: '^5.5.20',
  tailwindcss: '^4.3.0',
  tailwindcssVite: '^4.3.0',
  // i18n
  inlangParaglide: '^2.18.1',
  inlangMessageFormat: '^4.4.0',
  // Svelte / Vite
  svelte: '^5.55.9',
  svelteCheck: '^4.4.8',
  sveltePlugin: '^7.1.2',
  // Build / Test
  vite: '^8.0.14',
  vitest: '^4.1.7',
  tsup: '^8.5.1',
  rimraf: '^6.1.3',
  // ESLint
  eslint: '^10.4.0',
  eslintPluginFormat: '^2.0.1',
  eslintPluginSvelte: '^3.17.1',
  svelteEslintParser: '^1.6.1',
  // Node / TS
  nodeTypes: '^25.9.1',
  typescript: '^6.0.3',
  // E2E
  playwright: '^1.60.0',
  // Validation
  zod: '^4.4.3',
  // Tauri
  tauriCli: '^2.10.1',
} as const

type ImplementedFrontendTarget = Exclude<FrontendTarget, 'miniapp'>

const FRONTEND_PORTS_DEFAULT: Record<ImplementedFrontendTarget, number> = {
  web: 4173,
  app: 5175,
  desktop: 5176,
}

const FRONTEND_LABELS: Record<FrontendTarget, string> = {
  web: 'Web',
  app: 'App',
  miniapp: 'Miniapp',
  desktop: 'Desktop',
}

const IMPLEMENTED_FRONTENDS: readonly FrontendTarget[] = ['web', 'app', 'desktop']
const DEFAULT_FULLSTACK_FRONTENDS: readonly FrontendTarget[] = ['web', 'app', 'desktop']
const DEFAULT_THEMES = ['light', 'dark'] as const
const DEFAULT_THEME_NAME = 'light'
const HAI_PACKAGE_VERSION = `^${getCliVersion()}`
const HAI_PACKAGE_SPECIFIER_CATALOG = 'catalog:'
type FullstackPackageSpecifiers = { [Key in keyof typeof VERSIONS]: string }
type CatalogPackageVersions = Readonly<Record<string, string>>

const HAI_CATALOG_PACKAGE_NAMES = [
  '@h-ai/ai',
  '@h-ai/api-client',
  '@h-ai/api-contract',
  '@h-ai/audit',
  '@h-ai/cache',
  '@h-ai/capacitor',
  '@h-ai/core',
  '@h-ai/crypto',
  '@h-ai/datapipe',
  '@h-ai/deploy',
  '@h-ai/iam',
  '@h-ai/kit',
  '@h-ai/payment',
  '@h-ai/reach',
  '@h-ai/reldb',
  '@h-ai/scheduler',
  '@h-ai/serv',
  '@h-ai/storage',
  '@h-ai/ui',
  '@h-ai/vecdb',
] as const
const HAI_CATALOG_PACKAGES: Record<string, string> = Object.fromEntries(
  HAI_CATALOG_PACKAGE_NAMES.map(packageName => [packageName, HAI_PACKAGE_VERSION]),
)

const FULLSTACK_EXTERNAL_CATALOG_PACKAGES: CatalogPackageVersions = {
  '@antfu/eslint-config': VERSIONS.antfuEslintConfig,
  '@aparajita/capacitor-secure-storage': VERSIONS.capacitorSecureStorage,
  '@capacitor/android': VERSIONS.capacitorAndroid,
  '@capacitor/app': VERSIONS.capacitorApp,
  '@capacitor/camera': VERSIONS.capacitorCamera,
  '@capacitor/cli': VERSIONS.capacitorCli,
  '@capacitor/core': VERSIONS.capacitorCore,
  '@capacitor/device': VERSIONS.capacitorDevice,
  '@capacitor/ios': VERSIONS.capacitorIos,
  '@capacitor/preferences': VERSIONS.capacitorPreferences,
  '@capacitor/push-notifications': VERSIONS.capacitorPushNotifications,
  '@capacitor/status-bar': VERSIONS.capacitorStatusBar,
  '@iconify-json/tabler': VERSIONS.iconifyJsonTabler,
  '@iconify/tailwind4': VERSIONS.iconifyTailwind,
  '@inlang/paraglide-js': VERSIONS.inlangParaglide,
  '@inlang/plugin-message-format': VERSIONS.inlangMessageFormat,
  '@playwright/test': VERSIONS.playwright,
  '@sveltejs/vite-plugin-svelte': VERSIONS.sveltePlugin,
  '@tailwindcss/vite': VERSIONS.tailwindcssVite,
  '@tauri-apps/cli': VERSIONS.tauriCli,
  '@types/node': VERSIONS.nodeTypes,
  'bits-ui': VERSIONS.bitsUi,
  'daisyui': VERSIONS.daisyui,
  'eslint': VERSIONS.eslint,
  'eslint-plugin-format': VERSIONS.eslintPluginFormat,
  'eslint-plugin-svelte': VERSIONS.eslintPluginSvelte,
  'rimraf': VERSIONS.rimraf,
  'svelte': VERSIONS.svelte,
  'svelte-check': VERSIONS.svelteCheck,
  'svelte-eslint-parser': VERSIONS.svelteEslintParser,
  'tailwindcss': VERSIONS.tailwindcss,
  'tsup': VERSIONS.tsup,
  'typescript': VERSIONS.typescript,
  'vite': VERSIONS.vite,
  'vitest': VERSIONS.vitest,
  'zod': VERSIONS.zod,
}

const FULLSTACK_CATALOG_PACKAGES: CatalogPackageVersions = {
  ...HAI_CATALOG_PACKAGES,
  ...FULLSTACK_EXTERNAL_CATALOG_PACKAGES,
}

const FULLSTACK_ROOT_CATALOG_PACKAGE_NAMES = [
  '@antfu/eslint-config',
  '@playwright/test',
  '@sveltejs/vite-plugin-svelte',
  '@types/node',
  'eslint',
  'eslint-plugin-format',
  'eslint-plugin-svelte',
  'rimraf',
  'svelte',
  'svelte-check',
  'svelte-eslint-parser',
  'tsup',
  'typescript',
  'vite',
  'vitest',
] as const

const FULLSTACK_CONTRACT_CATALOG_PACKAGE_NAMES = [
  '@h-ai/api-contract',
  '@h-ai/core',
  'zod',
] as const

const FULLSTACK_SERV_CATALOG_PACKAGE_NAMES = [
  '@h-ai/core',
  '@h-ai/serv',
] as const

const FULLSTACK_SHARED_CATALOG_PACKAGE_NAMES = [
  '@h-ai/api-client',
  '@h-ai/ui',
  '@inlang/paraglide-js',
  '@inlang/plugin-message-format',
  'svelte',
  'svelte-check',
  'typescript',
  'vite',
  'vitest',
] as const

const FULLSTACK_WEB_CATALOG_PACKAGE_NAMES = [
  '@antfu/eslint-config',
  '@h-ai/ui',
  '@iconify-json/tabler',
  '@iconify/tailwind4',
  '@inlang/paraglide-js',
  '@inlang/plugin-message-format',
  '@sveltejs/vite-plugin-svelte',
  '@tailwindcss/vite',
  'bits-ui',
  'daisyui',
  'eslint',
  'eslint-plugin-format',
  'eslint-plugin-svelte',
  'svelte',
  'svelte-check',
  'svelte-eslint-parser',
  'tailwindcss',
  'typescript',
  'vite',
  'vitest',
] as const

const FULLSTACK_APP_CATALOG_PACKAGE_NAMES = [
  ...FULLSTACK_WEB_CATALOG_PACKAGE_NAMES,
  '@aparajita/capacitor-secure-storage',
  '@capacitor/android',
  '@capacitor/app',
  '@capacitor/camera',
  '@capacitor/cli',
  '@capacitor/core',
  '@capacitor/device',
  '@capacitor/ios',
  '@capacitor/preferences',
  '@capacitor/push-notifications',
  '@capacitor/status-bar',
  '@h-ai/capacitor',
] as const

const FULLSTACK_DESKTOP_CATALOG_PACKAGE_NAMES = [
  ...FULLSTACK_WEB_CATALOG_PACKAGE_NAMES,
  '@tauri-apps/cli',
] as const

const API_WORKSPACE_EXTERNAL_CATALOG_PACKAGE_NAMES = [
  '@antfu/eslint-config',
  '@playwright/test',
  '@types/node',
  'eslint',
  'eslint-plugin-format',
  'rimraf',
  'tsup',
  'typescript',
  'vitest',
  'zod',
] as const

function pickCatalogPackages(
  packageNames: readonly string[],
  availableCatalogPackages: CatalogPackageVersions,
): Record<string, string> {
  return Object.fromEntries(
    [...new Set(packageNames)]
      .sort((left, right) => left.localeCompare(right))
      .map((packageName) => {
        const version = availableCatalogPackages[packageName]
        if (!version) {
          throw new Error(`Missing catalog version for package "${packageName}"`)
        }
        return [packageName, version]
      }),
  )
}

function buildFullstackPackageSpecifiers(useCatalogProtocol: boolean): FullstackPackageSpecifiers {
  return Object.fromEntries(
    Object.entries(VERSIONS).map(([key, version]) => [key, useCatalogProtocol ? HAI_PACKAGE_SPECIFIER_CATALOG : version]),
  ) as FullstackPackageSpecifiers
}

function buildApiWorkspaceCatalogPackages(featureMap: Record<string, boolean>): Record<string, string> {
  const packageNames: string[] = [
    ...API_WORKSPACE_EXTERNAL_CATALOG_PACKAGE_NAMES,
    '@h-ai/api-client',
    '@h-ai/api-contract',
    '@h-ai/core',
    '@h-ai/serv',
  ]

  if (featureMap.db)
    packageNames.push('@h-ai/reldb')
  if (featureMap.cache)
    packageNames.push('@h-ai/cache')
  if (featureMap.iam)
    packageNames.push('@h-ai/iam')
  if (featureMap.crypto)
    packageNames.push('@h-ai/crypto')
  if (featureMap.storage)
    packageNames.push('@h-ai/storage')
  if (featureMap.ai)
    packageNames.push('@h-ai/ai')
  if (featureMap.audit)
    packageNames.push('@h-ai/audit')
  if (featureMap.reach)
    packageNames.push('@h-ai/reach')
  if (featureMap.payment)
    packageNames.push('@h-ai/payment')
  if (featureMap.vecdb)
    packageNames.push('@h-ai/vecdb')
  if (featureMap.datapipe)
    packageNames.push('@h-ai/datapipe')
  if (featureMap.scheduler)
    packageNames.push('@h-ai/scheduler')
  if (featureMap.deploy)
    packageNames.push('@h-ai/deploy')

  return pickCatalogPackages(packageNames, FULLSTACK_CATALOG_PACKAGES)
}

function buildAppHaiCatalogPackages(options: {
  featureMap: Record<string, boolean>
  hasUi: boolean
  isCapacitorApp: boolean
  isSvelteOnlyApp: boolean
}): Record<string, string> {
  const packageNames: string[] = []

  if (options.isSvelteOnlyApp) {
    packageNames.push('@h-ai/api-client', '@h-ai/capacitor', '@h-ai/ui')
    return pickCatalogPackages(packageNames, HAI_CATALOG_PACKAGES)
  }

  packageNames.push('@h-ai/core', '@h-ai/kit')
  if (options.hasUi)
    packageNames.push('@h-ai/ui')
  if (options.featureMap.db)
    packageNames.push('@h-ai/reldb')
  if (options.featureMap.cache)
    packageNames.push('@h-ai/cache')
  if (options.featureMap.iam)
    packageNames.push('@h-ai/iam')
  if (options.featureMap.crypto)
    packageNames.push('@h-ai/crypto')
  if (options.featureMap.storage)
    packageNames.push('@h-ai/storage')
  if (options.featureMap.ai)
    packageNames.push('@h-ai/ai')
  if (options.featureMap.audit)
    packageNames.push('@h-ai/audit')
  if (options.featureMap.reach)
    packageNames.push('@h-ai/reach')
  if (options.featureMap.payment)
    packageNames.push('@h-ai/payment')
  if (options.featureMap.vecdb)
    packageNames.push('@h-ai/vecdb')
  if (options.featureMap.datapipe)
    packageNames.push('@h-ai/datapipe')
  if (options.featureMap.scheduler)
    packageNames.push('@h-ai/scheduler')
  if (options.featureMap.deploy)
    packageNames.push('@h-ai/deploy')
  if (options.featureMap['api-client'])
    packageNames.push('@h-ai/api-client')
  if (options.featureMap.capacitor)
    packageNames.push('@h-ai/capacitor')
  if (options.isCapacitorApp && !options.featureMap['api-client'])
    packageNames.push('@h-ai/api-client')
  if (options.isCapacitorApp && !options.featureMap.capacitor)
    packageNames.push('@h-ai/capacitor')

  return pickCatalogPackages(packageNames, HAI_CATALOG_PACKAGES)
}

function buildFullstackCatalogPackages(frontends: readonly FrontendTarget[]): Record<string, string> {
  const packageNames: string[] = [
    ...FULLSTACK_ROOT_CATALOG_PACKAGE_NAMES,
    ...FULLSTACK_CONTRACT_CATALOG_PACKAGE_NAMES,
    ...FULLSTACK_SERV_CATALOG_PACKAGE_NAMES,
    ...FULLSTACK_SHARED_CATALOG_PACKAGE_NAMES,
  ]

  if (frontends.includes('web'))
    packageNames.push(...FULLSTACK_WEB_CATALOG_PACKAGE_NAMES)
  if (frontends.includes('app'))
    packageNames.push(...FULLSTACK_APP_CATALOG_PACKAGE_NAMES)
  if (frontends.includes('desktop'))
    packageNames.push(...FULLSTACK_DESKTOP_CATALOG_PACKAGE_NAMES)

  return pickCatalogPackages(packageNames, FULLSTACK_CATALOG_PACKAGES)
}

// =============================================================================
// 类型
// =============================================================================

/**
 * 模板渲染上下文
 */
export interface TemplateContext {
  /** 项目名称 */
  projectName: string
  /** 是否对 @h-ai/* 依赖启用 pnpm catalog 协议 */
  useCatalogProtocol: boolean
  /** @h-ai/* 依赖写入 package.json 时使用的版本说明符 */
  haiPackageSpecifier: string
  /** 生成项目时引用的 @h-ai/* 发布版本 */
  haiPackageVersion: string
  /** 生成项目时写入 pnpm-workspace.yaml 的 catalog 条目 */
  haiCatalogPackages: Record<string, string>
  /** 应用类型 */
  appType: AppType
  /** 选中的 feature 集合（用于 {{#if features.xxx}}） */
  features: Record<string, boolean>
  /** 是否有 UI（非 api / fullstack 类型） */
  hasUi: boolean
  /** 是否有 i18n（非 api / fullstack 类型） */
  hasI18n: boolean
  /** 是否为 Capacitor 原生移动应用（mobile-app） */
  isCapacitorApp: boolean
  /** 是否为 API workspace（service + contract） */
  isApiWorkspace: boolean
  /** 是否为不依赖 SvelteKit 的纯 Svelte 5 应用 */
  isSvelteOnlyApp: boolean
  /** 默认语言 */
  defaultLocale: string
  /** 包管理器 */
  packageManager: string
  /** API workspace 专用上下文 */
  api?: ApiWorkspaceTemplateContext
  /** 前后端分离工程专用上下文 */
  fullstack?: FullstackTemplateContext
}

export interface ApiWorkspaceTemplateContext {
  /** 依赖版本集合 */
  versions: typeof VERSIONS
  /** 写入 package.json 的依赖说明符（pnpm 时为 catalog:） */
  packageSpecifiers: FullstackPackageSpecifiers
  /** 共享 contract 包名 */
  contractPackageName: string
  /** 共享 contract 导出变量名 */
  contractExportName: string
  /** 后端 service 包名 */
  servicePackageName: string
  /** Service App 工厂函数名 */
  serviceAppFactoryName: string
  /** procedures 聚合函数名 */
  serviceProceduresFactoryName: string
}

export interface FullstackFrontendApp {
  /** 前端目标 */
  target: ImplementedFrontendTarget
  /** 包名 */
  packageName: string
  /** 展示名称 */
  label: string
  /** 本地端口 */
  port: number
}

/**
 * 国际化配置（已解析后的最终值）
 */
export interface FullstackI18nContext {
  baseLocale: string
  locales: readonly string[]
}

/**
 * 主题配置（已解析后的最终值）
 */
export interface FullstackThemeContext {
  defaultTheme: string
  themes: readonly string[]
}

export interface FullstackTemplateContext {
  /** 依赖版本集合 */
  versions: typeof VERSIONS
  /** 写入 package.json 的依赖说明符（pnpm 时为 catalog:） */
  packageSpecifiers: FullstackPackageSpecifiers
  /** 共享 contract 包名 */
  contractPackageName: string
  /** 共享 contract 导出变量名 */
  contractExportName: string
  /** 后端 service 包名 */
  servPackageName: string
  /** 原生壳 appId / bundle identifier 使用的安全短名 */
  nativeAppIdSegment: string
  /** 前端共享代码包名 */
  sharedPackageName: string
  /** 所有已选择前端 */
  selectedFrontends: readonly FrontendTarget[]
  /** 已选择前端 JSON 字面量 */
  selectedFrontendsJson: string
  /** 可运行前端应用 */
  frontendApps: readonly FullstackFrontendApp[]
  /** Playwright 默认验证前端 */
  e2eFrontend?: FullstackFrontendApp
  /** 前端选择布尔表，用于模板条件创建 */
  frontends: Record<FrontendTarget, boolean>
  /** 各前端端口（key 为 target） */
  ports: Record<ImplementedFrontendTarget, number>
  /** 是否选择小程序预留 */
  hasMiniapp: boolean
  /** i18n 配置 */
  i18n: FullstackI18nContext
  /** 主题配置 */
  theme: FullstackThemeContext
}

/**
 * feature 对应的路由目录映射
 *
 * 每个 feature 可以有：
 * - `routes-shared/` — 所有应用类型共用（如 API 端点）
 * - `routes-{appType}/` — 特定应用类型专用（如 UI 页面）
 * - `routes/` — 通用路由（任何类型都拷贝）
 */
const FEATURE_ROUTE_DIRS: Record<string, string[]> = {
  iam: ['routes-shared'],
  storage: ['routes'],
  ai: ['routes'],
  payment: ['routes'],
  vecdb: ['routes'],
  datapipe: ['routes'],
  reach: ['routes'],
  scheduler: ['routes'],
  audit: ['routes'],
}

/**
 * feature 的 appType 专用路由
 */
const FEATURE_APP_ROUTE_DIRS: Record<string, string[]> = {
  iam: ['admin', 'h5'],
}

const FEATURE_ID_REGEX = /^[a-z0-9-]+$/
const HBS_SUFFIX_REGEX = /\.hbs$/
const FULLSTACK_FRONTEND_TEMPLATE_PATH_REGEX = /^apps\/\{\{projectName\}\}-(web|app|desktop|miniapp)\//
const NON_IDENTIFIER_CHAR_REGEX = /[^a-z0-9]+/i
const IDENTIFIER_START_REGEX = /^[a-z_$]/i

// =============================================================================
// 路径工具
// =============================================================================

/**
 * 获取 templates/ 目录的绝对路径
 *
 * 兼容两种运行环境：
 * - 构建后：dist/cli-template-engine.js → ../templates
 * - 测试时：src/commands/cli-template-engine.ts → ../../templates
 */
function getTemplatesRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  // 优先尝试 dist 模式（../templates），再尝试 src 模式（../../templates）
  const distPath = path.resolve(currentDir, '..', 'templates')
  if (fse.pathExistsSync(distPath)) {
    return distPath
  }
  return path.resolve(currentDir, '..', '..', 'templates')
}

// =============================================================================
// 拷贝工具
// =============================================================================

/**
 * 拷贝目录，自动跳过 .hbs 文件（这些由 renderDynamicFiles 处理）
 *
 * @param src - 源目录
 * @param dest - 目标目录
 * @param excludePaths - 需要排除的相对路径前缀（如 'messages'）
 */
async function copyStaticDir(src: string, dest: string, excludePaths?: string[]): Promise<void> {
  if (!(await fse.pathExists(src))) {
    return
  }

  await fse.copy(src, dest, {
    overwrite: true,
    filter: (filePath: string) => {
      const rel = path.relative(src, filePath)
      // 含 Handlebars 占位符的路径必须走动态渲染，避免复制出字面量目录
      if (rel.includes('{{') || rel.includes('}}')) {
        return false
      }
      // 跳过 .hbs 模板文件
      if (filePath.endsWith('.hbs')) {
        return false
      }
      // 跳过排除路径
      if (excludePaths && excludePaths.length > 0) {
        return !excludePaths.some(p => rel === p || rel.startsWith(`${p}${path.sep}`))
      }
      return true
    },
  })
}

/**
 * 查找目录中所有 .hbs 文件并返回相对路径
 */
async function findHbsFiles(dir: string): Promise<string[]> {
  if (!(await fse.pathExists(dir))) {
    return []
  }

  const results: string[] = []

  async function walk(current: string): Promise<void> {
    const entries = await fse.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      }
      else if (entry.name.endsWith('.hbs')) {
        results.push(path.relative(dir, fullPath))
      }
    }
  }

  await walk(dir)
  return results
}

/**
 * 查找位于动态路径中的静态资源。
 *
 * 普通静态文件已经由 copyStaticDir 复制；这里专门补上带 Handlebars 路径片段
 * 的资源，例如 fullstack Tauri 图标目录。
 */
async function findRenderedStaticPathFiles(dir: string): Promise<string[]> {
  if (!(await fse.pathExists(dir))) {
    return []
  }

  const results: string[] = []

  async function walk(current: string): Promise<void> {
    const entries = await fse.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }

      const relPath = path.relative(dir, fullPath)
      if (!entry.name.endsWith('.hbs') && (relPath.includes('{{') || relPath.includes('}}'))) {
        results.push(relPath)
      }
    }
  }

  await walk(dir)
  return results
}

// =============================================================================
// 构建上下文
// =============================================================================

/**
 * 根据用户选项构建模板渲染上下文
 */
export function buildTemplateContext(options: {
  name: string
  appType: AppType
  features: FeatureId[]
  frontends?: readonly FrontendTarget[]
  moduleConfigs?: ModuleConfigs
  packageManager: string
}): TemplateContext {
  const featureMap: Record<string, boolean> = {}
  for (const f of options.features) {
    featureMap[f] = true
  }

  // 强制补全模块硬依赖，防止调用方未经过 resolveFeatureDependencies 时遗漏依赖
  // iam 依赖 reldb（用户/角色/权限持久化）和 cache（会话/OTP 缓存），以及 crypto（密码哈希）
  if (featureMap.iam) {
    featureMap.db = true
    featureMap.cache = true
    featureMap.crypto = true
  }
  // audit / scheduler / payment 依赖 reldb
  if (featureMap.audit || featureMap.scheduler || featureMap.payment) {
    featureMap.db = true
  }

  const isApi = options.appType === 'api'
  const isFullstack = options.appType === 'fullstack'
  const isCapacitorApp = options.appType === 'mobile-app'
  const isSvelteOnlyApp = isCapacitorApp
  const useCatalogProtocol = options.packageManager === 'pnpm'
  const hasUi = !isApi && !isFullstack
  const selectedFrontends = options.frontends ?? DEFAULT_FULLSTACK_FRONTENDS
  let haiCatalogPackages: string[]
  if (isFullstack) {
    haiCatalogPackages = buildFullstackCatalogPackages(selectedFrontends)
  }
  else if (isApi) {
    haiCatalogPackages = buildApiWorkspaceCatalogPackages(featureMap)
  }
  else {
    haiCatalogPackages = buildAppHaiCatalogPackages({
      featureMap,
      hasUi,
      isCapacitorApp,
      isSvelteOnlyApp,
    })
  }

  return {
    projectName: options.name,
    useCatalogProtocol,
    haiPackageSpecifier: useCatalogProtocol ? HAI_PACKAGE_SPECIFIER_CATALOG : HAI_PACKAGE_VERSION,
    haiPackageVersion: HAI_PACKAGE_VERSION,
    haiCatalogPackages,
    appType: options.appType,
    features: featureMap,
    hasUi,
    hasI18n: !isApi && !isFullstack,
    isCapacitorApp,
    isApiWorkspace: isApi,
    isSvelteOnlyApp,
    defaultLocale: options.moduleConfigs?.core?.defaultLocale ?? 'zh-CN',
    packageManager: options.packageManager,
    api: isApi
      ? buildApiWorkspaceTemplateContext(options.name, useCatalogProtocol)
      : undefined,
    fullstack: isFullstack
      ? buildFullstackTemplateContext(
          options.name,
          selectedFrontends,
          options.moduleConfigs,
          useCatalogProtocol,
        )
      : undefined,
  }
}

function buildApiWorkspaceTemplateContext(
  projectName: string,
  useCatalogProtocol = false,
): ApiWorkspaceTemplateContext {
  const identifier = toIdentifier(projectName)
  const pascalName = toPascalIdentifier(identifier)

  return {
    versions: VERSIONS,
    packageSpecifiers: buildFullstackPackageSpecifiers(useCatalogProtocol),
    contractPackageName: `${projectName}-contract`,
    contractExportName: `${identifier}Contract`,
    servicePackageName: `${projectName}-service`,
    serviceAppFactoryName: `create${pascalName}App`,
    serviceProceduresFactoryName: `create${pascalName}Procedures`,
  }
}

function buildFullstackTemplateContext(
  projectName: string,
  frontendsInput: readonly FrontendTarget[],
  moduleConfigs?: ModuleConfigs,
  useCatalogProtocol = false,
): FullstackTemplateContext {
  const selectedFrontends = [...new Set(frontendsInput.length > 0 ? frontendsInput : DEFAULT_FULLSTACK_FRONTENDS)]

  const portsConfig = moduleConfigs?.fullstack?.ports ?? {}
  const portFor = (target: ImplementedFrontendTarget): number =>
    portsConfig[target] ?? FRONTEND_PORTS_DEFAULT[target]

  const frontendApps = selectedFrontends
    .filter(isImplementedFrontend)
    .map(target => ({
      target,
      packageName: `${projectName}-${target}`,
      label: FRONTEND_LABELS[target],
      port: portFor(target),
    }))

  return {
    versions: VERSIONS,
    packageSpecifiers: buildFullstackPackageSpecifiers(useCatalogProtocol),
    contractPackageName: `${projectName}-contract`,
    contractExportName: `${toIdentifier(projectName)}Contract`,
    servPackageName: `${projectName}-serv`,
    nativeAppIdSegment: toIdentifier(projectName).toLowerCase(),
    sharedPackageName: `${projectName}-shared`,
    selectedFrontends,
    selectedFrontendsJson: `[${selectedFrontends.map(f => `'${f}'`).join(', ')}]`,
    frontendApps,
    e2eFrontend: frontendApps[0],
    frontends: {
      web: selectedFrontends.includes('web'),
      app: selectedFrontends.includes('app'),
      miniapp: selectedFrontends.includes('miniapp'),
      desktop: selectedFrontends.includes('desktop'),
    },
    ports: {
      web: portFor('web'),
      app: portFor('app'),
      desktop: portFor('desktop'),
    },
    hasMiniapp: selectedFrontends.includes('miniapp'),
    i18n: resolveI18nContext(moduleConfigs),
    theme: resolveThemeContext(moduleConfigs),
  }
}

function resolveI18nContext(moduleConfigs?: ModuleConfigs): FullstackI18nContext {
  const coreLocale = moduleConfigs?.core?.defaultLocale ?? 'zh-CN'
  const baseLocale = moduleConfigs?.fullstack?.i18n?.baseLocale ?? coreLocale
  const fallbackLocale = baseLocale === 'en-US' ? 'zh-CN' : 'en-US'
  const requested = moduleConfigs?.fullstack?.i18n?.locales
  const locales = requested && requested.length > 0
    ? [...new Set(requested)]
    : [baseLocale, fallbackLocale]
  if (!locales.includes(baseLocale)) {
    locales.unshift(baseLocale)
  }
  return { baseLocale, locales }
}

function resolveThemeContext(moduleConfigs?: ModuleConfigs): FullstackThemeContext {
  const defaultTheme = moduleConfigs?.fullstack?.theme?.defaultTheme ?? DEFAULT_THEME_NAME
  const requested = moduleConfigs?.fullstack?.theme?.themes
  const themes = requested && requested.length > 0
    ? [...new Set(requested)]
    : [...DEFAULT_THEMES]
  if (!themes.includes(defaultTheme)) {
    themes.unshift(defaultTheme)
  }
  return { defaultTheme, themes }
}

function isImplementedFrontend(target: FrontendTarget): target is ImplementedFrontendTarget {
  return IMPLEMENTED_FRONTENDS.includes(target)
}

function toIdentifier(value: string): string {
  const words = value
    .split(NON_IDENTIFIER_CHAR_REGEX)
    .filter(Boolean)
  const camel = words
    .map((word, index) => {
      const normalized = word.toLowerCase()
      return index === 0
        ? normalized
        : `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
    })
    .join('')
  if (!camel)
    return 'app'
  return IDENTIFIER_START_REGEX.test(camel) ? camel : `app${camel}`
}

function toPascalIdentifier(value: string): string {
  if (!value)
    return 'App'
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

// =============================================================================
// 核心：生成项目
// =============================================================================

/**
 * 从模板生成项目
 *
 * 执行流程：
 * 1. 拷贝 base 静态文件
 * 2. 拷贝 apps/{appType} 路由
 * 3. 叠加选中 feature 的路由
 * 4. 渲染所有 .hbs 动态模板
 *
 * @param projectPath - 项目目标目录
 * @param context - 模板渲染上下文
 */
export async function generateFromTemplates(
  projectPath: string,
  context: TemplateContext,
): Promise<void> {
  const root = getTemplatesRoot()
  const includeBaseTemplate = context.appType !== 'fullstack' && !context.isApiWorkspace

  // ─── ① 拷贝 base 骨架（静态文件） ───
  if (includeBaseTemplate) {
    await copyStaticDir(path.join(root, 'base'), projectPath)
  }

  // ─── ② 拷贝 apps/{appType} 路由 ───
  // messages/ 目录仅在 hasI18n 时拷贝
  const appDir = path.join(root, 'apps', context.appType)
  if (await fse.pathExists(appDir)) {
    const appExcludes = context.hasI18n ? [] : ['messages']
    await copyStaticDir(appDir, projectPath, appExcludes)
  }

  // ─── ③ 叠加 feature 路由 ───
  if (!context.isApiWorkspace) {
    for (const featureId of Object.keys(context.features)) {
      if (context.isSvelteOnlyApp) {
        continue
      }

      if (!context.features[featureId]) {
        continue
      }

      // 安全校验：featureId 只允许字母、数字和连字符，防止路径遍历
      if (!FEATURE_ID_REGEX.test(featureId)) {
        continue
      }

      const featureDir = path.join(root, 'features', featureId)
      if (!(await fse.pathExists(featureDir))) {
        continue
      }

      // 通用路由（routes/）
      const sharedDirs = FEATURE_ROUTE_DIRS[featureId] || []
      for (const dirName of sharedDirs) {
        // Capacitor SPA 无服务端运行时，跳过服务端 API 路由（routes-shared）
        if (context.isCapacitorApp && dirName === 'routes-shared') {
          continue
        }
        const routesSrc = path.join(featureDir, dirName)
        if (await fse.pathExists(routesSrc)) {
          await copyStaticDir(routesSrc, path.join(projectPath, 'src', 'routes'))
        }
      }

      // appType 专用路由（routes-{appType}）
      const appSpecificTypes = FEATURE_APP_ROUTE_DIRS[featureId] || []
      if (appSpecificTypes.includes(context.appType)) {
        const appRouteSrc = path.join(featureDir, `routes-${context.appType}`)
        if (await fse.pathExists(appRouteSrc)) {
          await copyStaticDir(appRouteSrc, path.join(projectPath, 'src', 'routes'))
        }
      }
    }
  }

  // ─── ④ 渲染 .hbs 动态模板 ───
  await renderDynamicFiles(root, projectPath, context)

  // ─── ⑤ 拷贝 i18n 脚手架（project.inlang + messages） ───
  if (context.hasI18n) {
    const i18nDir = path.join(root, 'i18n')
    if (await fse.pathExists(i18nDir)) {
      await fse.copy(i18nDir, projectPath, { overwrite: true })
    }
  }

  // ─── ⑥ 确保 static 目录存在 ───
  if (includeBaseTemplate) {
    await fse.ensureDir(path.join(projectPath, 'static'))
  }
}

// =============================================================================
// 动态模板渲染
// =============================================================================

/**
 * 渲染所有 .hbs 文件：base、apps/{appType}、以及选中 feature 的路由目录
 *
 * base / apps 的 .hbs 渲染后输出到 projectPath 根目录；
 * feature 的 .hbs 渲染后输出到 projectPath/src/routes/。
 */
async function renderDynamicFiles(
  templatesRoot: string,
  projectPath: string,
  context: TemplateContext,
): Promise<void> {
  // ── base + apps/{appType} → 输出到项目根 ──
  const rootDirs = context.appType === 'fullstack' || context.isApiWorkspace
    ? [path.join(templatesRoot, 'apps', context.appType)]
    : [
        path.join(templatesRoot, 'base'),
        path.join(templatesRoot, 'apps', context.appType),
      ]

  for (const dir of rootDirs) {
    await renderHbsInDir(dir, projectPath, context)
    await copyRenderedStaticPathFiles(dir, projectPath, context)
  }

  // ── feature 路由 → 输出到 src/routes/ ──
  if (context.isApiWorkspace) {
    return
  }

  const routesDest = path.join(projectPath, 'src', 'routes')
  for (const featureId of Object.keys(context.features)) {
    if (context.isSvelteOnlyApp) {
      continue
    }

    if (!context.features[featureId]) {
      continue
    }

    const featureDir = path.join(templatesRoot, 'features', featureId)
    if (!(await fse.pathExists(featureDir))) {
      continue
    }

    // 通用路由（routes-shared / routes 等）
    const sharedDirs = FEATURE_ROUTE_DIRS[featureId] || []
    for (const dirName of sharedDirs) {
      // Capacitor SPA 无服务端运行时，跳过服务端 API 路由（routes-shared）
      if (context.isCapacitorApp && dirName === 'routes-shared') {
        continue
      }
      await renderHbsInDir(path.join(featureDir, dirName), routesDest, context)
    }

    // appType 专用路由（routes-{appType}）
    const appSpecificTypes = FEATURE_APP_ROUTE_DIRS[featureId] || []
    if (appSpecificTypes.includes(context.appType)) {
      await renderHbsInDir(
        path.join(featureDir, `routes-${context.appType}`),
        routesDest,
        context,
      )
    }
  }
}

/**
 * 渲染指定目录下所有 .hbs 文件并输出到目标目录（去掉 .hbs 后缀）
 */
async function renderHbsInDir(
  dir: string,
  destRoot: string,
  context: TemplateContext,
): Promise<void> {
  const hbsFiles = await findHbsFiles(dir)
  for (const relPath of hbsFiles) {
    const srcPath = path.join(dir, relPath)
    const outRelPathTemplate = relPath.replace(HBS_SUFFIX_REGEX, '')

    const template = await fse.readFile(srcPath, 'utf-8')
    const compiled = Handlebars.compile(template, { noEscape: true })
    const rendered = compiled(context)
    if (shouldSkipRenderedFile(template, rendered)) {
      continue
    }

    const outRelPath = renderOutputPath(outRelPathTemplate, context)
    if (!isSafeRelativePath(outRelPath)) {
      continue
    }

    // Capacitor SPA 跳过服务端专属文件（hooks / server init）
    if (context.isCapacitorApp && CAPACITOR_SKIPPED_SERVER_FILES.has(outRelPath.split(path.sep).join('/'))) {
      continue
    }

    const destPath = path.join(destRoot, outRelPath)
    const normalizedRendered = normalizeRenderedContent(rendered, outRelPath)

    await fse.ensureDir(path.dirname(destPath))
    await fse.writeFile(destPath, normalizedRendered, 'utf-8')
  }
}

async function copyRenderedStaticPathFiles(
  dir: string,
  destRoot: string,
  context: TemplateContext,
): Promise<void> {
  const staticFiles = await findRenderedStaticPathFiles(dir)
  for (const relPath of staticFiles) {
    if (!shouldCopyRenderedStaticPathFile(relPath, context)) {
      continue
    }

    const outRelPath = renderOutputPath(relPath, context)
    if (!isSafeRelativePath(outRelPath)) {
      continue
    }

    const srcPath = path.join(dir, relPath)
    const destPath = path.join(destRoot, outRelPath)
    await fse.ensureDir(path.dirname(destPath))
    await fse.copyFile(srcPath, destPath)
  }
}

function shouldCopyRenderedStaticPathFile(relPath: string, context: TemplateContext): boolean {
  if (context.appType !== 'fullstack' || !context.fullstack) {
    return true
  }

  const normalizedPath = relPath.split(path.sep).join('/')
  const frontendMatch = FULLSTACK_FRONTEND_TEMPLATE_PATH_REGEX.exec(normalizedPath)
  if (!frontendMatch) {
    return true
  }

  const target = frontendMatch[1] as FrontendTarget
  return Boolean(context.fullstack.frontends[target])
}

function normalizeRenderedContent(content: string, outRelPath: string): string {
  const normalizedLineEndings = content.replace(/\r\n/g, '\n')
  const ext = path.extname(outRelPath)
  const normalized = NORMALIZED_RENDER_EXTENSIONS.has(ext)
    ? normalizedLineEndings.replace(/\n{3,}/g, '\n\n')
    : normalizedLineEndings
  if (normalized.trim().length === 0) {
    return ''
  }
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`
}

function shouldSkipRenderedFile(template: string, rendered: string): boolean {
  return template.includes(TEMPLATE_SKIP_IF_EMPTY_MARKER) && rendered.trim().length === 0
}

function renderOutputPath(pathTemplate: string, context: TemplateContext): string {
  const normalizedTemplate = pathTemplate.split(path.sep).join('/')
  return Handlebars.compile(normalizedTemplate, { noEscape: true })(context)
}

function isSafeRelativePath(relativePath: string): boolean {
  const normalized = path.normalize(relativePath)
  return !path.isAbsolute(normalized) && normalized !== '..' && !normalized.startsWith(`..${path.sep}`)
}
