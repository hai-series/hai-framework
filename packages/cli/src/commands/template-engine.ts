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
 * @module template-engine
 */

import type { AppType, FeatureId, ModuleConfigs } from '../types.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fse from 'fs-extra'
import Handlebars from 'handlebars'

// =============================================================================
// 类型
// =============================================================================

/**
 * 模板渲染上下文
 */
export interface TemplateContext {
  /** 项目名称 */
  projectName: string
  /** 应用类型 */
  appType: AppType
  /** 选中的 feature 集合（用于 {{#if features.xxx}}） */
  features: Record<string, boolean>
  /** 是否有 UI（非 api 类型） */
  hasUi: boolean
  /** 是否有 i18n（非 api 类型） */
  hasI18n: boolean
  /** 是否为 Capacitor 原生应用（android-app） */
  isCapacitorApp: boolean
  /** 默认语言 */
  defaultLocale: string
  /** 包管理器 */
  packageManager: string
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

// =============================================================================
// 路径工具
// =============================================================================

/**
 * 获取 templates/ 目录的绝对路径
 *
 * 兼容两种运行环境：
 * - 构建后：dist/template-engine.js → ../templates
 * - 测试时：src/commands/template-engine.ts → ../../templates
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
      // 跳过 .hbs 模板文件
      if (filePath.endsWith('.hbs')) {
        return false
      }
      // 跳过排除路径
      if (excludePaths && excludePaths.length > 0) {
        const rel = path.relative(src, filePath)
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
  const isCapacitorApp = options.appType === 'android-app'

  return {
    projectName: options.name,
    appType: options.appType,
    features: featureMap,
    hasUi: !isApi,
    hasI18n: !isApi,
    isCapacitorApp,
    defaultLocale: options.moduleConfigs?.core?.defaultLocale ?? 'zh-CN',
    packageManager: options.packageManager,
  }
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

  // ─── ① 拷贝 base 骨架（静态文件） ───
  await copyStaticDir(path.join(root, 'base'), projectPath)

  // ─── ② 拷贝 apps/{appType} 路由 ───
  // messages/ 目录仅在 hasI18n 时拷贝
  const appDir = path.join(root, 'apps', context.appType)
  if (await fse.pathExists(appDir)) {
    const appExcludes = context.hasI18n ? [] : ['messages']
    await copyStaticDir(appDir, projectPath, appExcludes)
  }

  // ─── ③ 叠加 feature 路由 ───
  for (const featureId of Object.keys(context.features)) {
    if (!context.features[featureId]) {
      continue
    }

    // 安全校验：featureId 只允许字母、数字和连字符，防止路径遍历
    if (!/^[a-z0-9-]+$/.test(featureId)) {
      continue
    }

    const featureDir = path.join(root, 'features', featureId)
    if (!(await fse.pathExists(featureDir))) {
      continue
    }

    // 通用路由（routes/）
    const sharedDirs = FEATURE_ROUTE_DIRS[featureId] || []
    for (const dirName of sharedDirs) {
      const routesSrc = path.join(featureDir, dirName)
      if (await fse.pathExists(routesSrc)) {
        await copyStaticDir(routesSrc, path.join(projectPath, 'src', 'routes'))
      }
    }

    // appType 专用路由（routes-{appType}/）
    const appSpecificTypes = FEATURE_APP_ROUTE_DIRS[featureId] || []
    if (appSpecificTypes.includes(context.appType)) {
      const appRouteSrc = path.join(featureDir, `routes-${context.appType}`)
      if (await fse.pathExists(appRouteSrc)) {
        await copyStaticDir(appRouteSrc, path.join(projectPath, 'src', 'routes'))
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
  await fse.ensureDir(path.join(projectPath, 'static'))
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
  const rootDirs = [
    path.join(templatesRoot, 'base'),
    path.join(templatesRoot, 'apps', context.appType),
  ]

  for (const dir of rootDirs) {
    await renderHbsInDir(dir, projectPath, context)
  }

  // ── feature 路由 → 输出到 src/routes/ ──
  const routesDest = path.join(projectPath, 'src', 'routes')
  for (const featureId of Object.keys(context.features)) {
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
    const outRelPath = relPath.replace(/\.hbs$/, '')
    const destPath = path.join(destRoot, outRelPath)

    const template = await fse.readFile(srcPath, 'utf-8')
    const compiled = Handlebars.compile(template, { noEscape: true })
    const rendered = compiled(context)

    await fse.ensureDir(path.dirname(destPath))
    await fse.writeFile(destPath, rendered, 'utf-8')
  }
}
