/**
 * @h-ai/cli — Skill 模板生成
 *
 * 将 Skill 模板文件复制到用户项目中，供 AI 编程助手使用。
 * @module cli-skill-templates
 */

import type { AppType } from '../cli-types.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fse from 'fs-extra'
import Handlebars from 'handlebars'
import { cliM } from '../cli-i18n.js'

/**
 * 模块名到 Skill 目录名的映射
 */
const MODULE_SKILL_MAP: Record<string, string> = {
  'db': 'hai-reldb',
  'reldb': 'hai-reldb',
  'cache': 'hai-cache',
  'iam': 'hai-iam',
  'storage': 'hai-storage',
  'ai': 'hai-ai',
  'crypto': 'hai-crypto',
  'payment': 'hai-payment',
  'vecdb': 'hai-vecdb',
  'datapipe': 'hai-datapipe',
  'reach': 'hai-reach',
  'feedback': 'hai-feedback',
  'scheduler': 'hai-scheduler',
  'audit': 'hai-audit',
  'deploy': 'hai-deploy',
  'kit': 'hai-kit',
  'ui': 'hai-ui',
  'api-client': 'hai-api-client',
  'capacitor': 'hai-capacitor',
}

/**
 * 各 appType 互斥的 Skill。
 *
 * 生成样板工程时，默认复制 templates/skills 下所有 hai-* Skill，
 * 仅排除与当前样板技术栈明显冲突的少数 Skill。
 */
const SKILL_EXCLUSIONS_BY_APP_TYPE: Partial<Record<AppType, string[]>> = {
  'admin': ['hai-serv', 'hai-api-contract', 'hai-api-client', 'hai-capacitor'],
  'website': ['hai-serv', 'hai-api-contract', 'hai-api-client', 'hai-capacitor'],
  'h5': ['hai-serv', 'hai-api-contract', 'hai-api-client', 'hai-capacitor'],
  'api': ['hai-ui', 'hai-ui-design', 'hai-ui-review', 'hai-kit', 'hai-capacitor'],
  'mobile-app': ['hai-core', 'hai-kit', 'hai-serv', 'hai-api-contract'],
  'fullstack': ['hai-kit'],
}

const WORKFLOW_SKILLS = [
  'hai-build',
  'hai-spec-review',
  'hai-spec-implement',
  'hai-app-create',
  'hai-app-review',
  'hai-app-tests',
  'hai-framework-sync',
  'hai-ci',
  'hai-pr-review',
]

const PACKAGE_SKILL_MAP: Record<string, string> = {
  '@h-ai/api-contract': 'hai-api-contract',
  '@h-ai/api-client': 'hai-api-client',
  '@h-ai/core': 'hai-core',
  '@h-ai/serv': 'hai-serv',
  '@h-ai/kit': 'hai-kit',
  '@h-ai/ui': 'hai-ui',
  '@h-ai/reldb': 'hai-reldb',
  '@h-ai/cache': 'hai-cache',
  '@h-ai/iam': 'hai-iam',
  '@h-ai/storage': 'hai-storage',
  '@h-ai/ai': 'hai-ai',
  '@h-ai/crypto': 'hai-crypto',
  '@h-ai/payment': 'hai-payment',
  '@h-ai/vecdb': 'hai-vecdb',
  '@h-ai/datapipe': 'hai-datapipe',
  '@h-ai/reach': 'hai-reach',
  '@h-ai/feedback': 'hai-feedback',
  '@h-ai/scheduler': 'hai-scheduler',
  '@h-ai/audit': 'hai-audit',
  '@h-ai/deploy': 'hai-deploy',
  '@h-ai/capacitor': 'hai-capacitor',
}

const SKILL_TARGET_DIRS = ['.agents/skills'] as const

const BRIDGE_FILES = [
  {
    source: 'copilot-instructions.md',
    destination: '.github/copilot-instructions.md',
  },
  {
    source: 'CLAUDE.md',
    destination: 'CLAUDE.md',
  },
  {
    source: 'AGENTS.md',
    destination: 'AGENTS.md',
  },
  {
    source: 'opencode.json',
    destination: 'opencode.json',
  },
] as const

const BRIDGE_PROFILE_REGEX = /^[a-z0-9-]+$/

/** 从已有模板标识与实际包布局确认桥接类型，不按项目名称猜测技术栈。 */
async function detectBridgeContext(projectPath: string): Promise<{ appType?: AppType, projectName?: string }> {
  const packagePath = path.join(projectPath, 'package.json')
  if (!(await fse.pathExists(packagePath))) {
    return {}
  }

  let metadata: unknown
  try {
    metadata = await fse.readJson(packagePath)
  }
  catch {
    return {}
  }
  if (!metadata || typeof metadata !== 'object' || !('name' in metadata)
    || typeof metadata.name !== 'string' || !BRIDGE_PROFILE_REGEX.test(metadata.name)) {
    return {}
  }

  const projectName = metadata.name
  for (const [appType, directory, suffixes] of [
    ['fullstack', 'packages', ['contract', 'serv', 'shared']],
    ['api', 'apps', ['contract', 'service']],
  ] as const) {
    const manifests = await Promise.all(suffixes.map(suffix => fse.pathExists(
      path.join(projectPath, directory, `${projectName}-${suffix}`, 'package.json'),
    )))
    if (manifests.every(Boolean)) {
      return { appType, projectName }
    }
  }

  if ('keywords' in metadata && Array.isArray(metadata.keywords) && metadata.keywords.includes('hai')) {
    for (const appType of ['admin', 'website', 'h5', 'mobile-app'] as const) {
      if (metadata.keywords.includes(appType)) {
        return { appType, projectName }
      }
    }
  }
  return { projectName }
}

async function listTemplateSkillNames(templatesDir: string): Promise<string[]> {
  const entries = await fse.readdir(templatesDir, { withFileTypes: true })
  const skillNames: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('hai-')) {
      continue
    }

    const skillFilePath = path.join(templatesDir, entry.name, 'SKILL.md')
    if (await fse.pathExists(skillFilePath)) {
      skillNames.push(entry.name)
    }
  }

  return skillNames.sort((a, b) => a.localeCompare(b))
}

/**
 *
 * @param skillNames - 请求复制的 Skill 目录名。
 * @param appType - 应用模板类型，用于排除不适用的 Skill。
 * @returns 移除与应用技术栈明确冲突的 Skill 后的列表。
 * @example 模块内部上下文
 * ```ts
 * const names = resolveCompatibleSkillNames(['hai-ui', 'hai-serv', 'hai-app-tests'], 'api') // 排除与 API 工程冲突的 hai-ui。
 * ```
 */
export function resolveCompatibleSkillNames(
  skillNames: string[],
  appType?: AppType,
): string[] {
  const excludedSkills = new Set(appType ? SKILL_EXCLUSIONS_BY_APP_TYPE[appType] ?? [] : [])
  return skillNames.filter(skillName => !excludedSkills.has(skillName))
}

/**
 * 获取 templates/skills/ 目录的绝对路径
 *
 * 兼容两种运行环境：
 * - 构建后：dist/cli-skill-templates.js → ../templates/skills
 * - 测试时：src/commands/cli-skill-templates.ts → ../../templates/skills
 */
function getSkillTemplatesDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const distPath = path.resolve(currentDir, '..', 'templates', 'skills')
  if (fse.pathExistsSync(distPath)) {
    return distPath
  }
  return path.resolve(currentDir, '..', '..', 'templates', 'skills')
}

/**
 * 复制单个 Skill 目录到项目
 *
 * @param templatesDir - Skill 模板根目录
 * @param skillName - Skill 目录名（如 'hai-reldb'）
 * @param projectPath - 用户项目根目录
 */
async function copySkill(
  templatesDir: string,
  skillName: string,
  projectPath: string,
  targetDirs: readonly string[] = SKILL_TARGET_DIRS,
  overwrite = true,
): Promise<string[]> {
  const src = path.join(templatesDir, skillName)

  if (!(await fse.pathExists(src))) {
    return []
  }

  const copiedFiles: string[] = []
  const resources = await fse.readdir(src, { recursive: true, withFileTypes: true })
  const relativeFiles = resources.filter(resource => resource.isFile())
    .map(resource => path.relative(src, path.join(resource.parentPath, resource.name)))

  for (const targetDir of targetDirs) {
    const dest = path.join(projectPath, targetDir, skillName)
    await assertProjectOutputPath(projectPath, dest)
    if (!overwrite) {
      // 已有入口不能使新参考资源被跳过；逐文件补缺，同时保留用户修改。
      const missingFiles: string[] = []
      for (const relativeFile of relativeFiles) {
        if (!(await fse.pathExists(path.join(dest, relativeFile)))) {
          missingFiles.push(relativeFile)
        }
      }
      if (missingFiles.length === 0) {
        continue
      }
      for (const relativeFile of missingFiles)
        await assertProjectOutputPath(projectPath, path.join(dest, relativeFile))
      await fse.copy(src, dest, { overwrite: false })
      copiedFiles.push(...missingFiles.map(relativeFile => `${targetDir}/${skillName}/${relativeFile.replaceAll(path.sep, '/')}`))
    }
    else {
      for (const relativeFile of relativeFiles)
        await assertProjectOutputPath(projectPath, path.join(dest, relativeFile))
      await fse.copy(src, dest, { overwrite: true })
      copiedFiles.push(`${targetDir}/${skillName}/SKILL.md`)
    }
  }

  return copiedFiles
}

/**
 * 逐层检查现存祖先的真实路径，拒绝通过符号链接将 Skill 或桥接文件写到工程之外。
 * @param projectPath - 项目根目录。
 * @param destination - 本次复制的绝对目标路径。
 * @returns 路径安全时完成；越界或文件系统错误抛出。
 * @example 模块内部上下文
 * ```ts
 * const destination = path.resolve(process.cwd(), '.agents/skills/hai-ai/SKILL.md')
 * await assertProjectOutputPath(process.cwd(), destination)
 * ```
 */
async function assertProjectOutputPath(projectPath: string, destination: string): Promise<void> {
  let ancestor = destination
  while (!(await fse.pathExists(ancestor))) {
    const parent = path.dirname(ancestor)
    if (parent === ancestor)
      throw new Error(cliM('cli_generateOutsideWorkspace'))
    ancestor = parent
  }
  const relativeAncestor = path.relative(await fse.realpath(projectPath), await fse.realpath(ancestor))
  if (relativeAncestor === '..' || relativeAncestor.startsWith(`..${path.sep}`) || path.isAbsolute(relativeAncestor))
    throw new Error(cliM('cli_generateOutsideWorkspace'))
}

async function copySkills(
  templatesDir: string,
  skillNames: string[],
  projectPath: string,
  targetDirs: readonly string[] = SKILL_TARGET_DIRS,
  overwrite = true,
): Promise<string[]> {
  const copiedFiles: string[] = []

  // UI 使用、设计和审查按同一版本成套交付，补模块时也需补齐相邻资源。
  const selectedNames = skillNames.includes('hai-ui')
    ? [...skillNames, 'hai-ui-design', 'hai-ui-review']
    : skillNames

  for (const skillName of new Set(selectedNames)) {
    copiedFiles.push(...await copySkill(templatesDir, skillName, projectPath, targetDirs, overwrite))
  }

  return copiedFiles
}

/**
 * 复制桥接文件到项目
 *
 * @param templatesDir - Skill 模板根目录
 * @param projectPath - 用户项目根目录
 */
async function copyBridgeFiles(
  templatesDir: string,
  projectPath: string,
  overwrite = true,
  appType?: string,
  projectName?: string,
): Promise<string[]> {
  const copiedFiles: string[] = []

  for (const file of BRIDGE_FILES) {
    const src = await resolveBridgeSource(templatesDir, file.source, appType, projectName !== undefined)
    const dest = path.join(projectPath, file.destination)

    if (!src) {
      continue
    }

    if (!overwrite && await fse.pathExists(dest)) {
      continue
    }

    await assertProjectOutputPath(projectPath, dest)
    await fse.ensureDir(path.dirname(dest))
    if (src.endsWith('.hbs')) {
      const template = await fse.readFile(src, 'utf8')
      const rendered = Handlebars.compile(template, { noEscape: true })({ projectName })
      await fse.writeFile(dest, rendered, 'utf8')
    }
    else {
      await fse.copy(src, dest, { overwrite })
    }
    copiedFiles.push(file.destination)
  }

  return copiedFiles
}

async function resolveBridgeSource(
  templatesDir: string,
  source: string,
  appType?: string,
  allowTemplate = false,
): Promise<string | null> {
  const profile = appType && BRIDGE_PROFILE_REGEX.test(appType) ? appType : 'generic'
  const candidates = [
    ...(allowTemplate ? [path.join(templatesDir, 'bridges', profile, `${source}.hbs`)] : []),
    path.join(templatesDir, 'bridges', profile, source),
    path.join(templatesDir, 'bridges', 'generic', source),
    path.join(templatesDir, source),
  ]

  for (const candidate of candidates) {
    if (await fse.pathExists(candidate)) {
      return candidate
    }
  }

  return null
}

/**
 * 为新项目生成完整的 Skill 文件。
 *
 * 默认复制 templates/skills 下所有 hai-* Skill，再按 appType 排除互斥项。
 *
 * @param projectPath - 用户项目根目录
 * @param _features - 预留参数；保留签名兼容 createProject 调用方
 * @param appType - 应用类型（api 类型不复制 UI Skill）
 * 写入 .agents/skills 与各工具桥接文件；模板目录缺失时返回空数组，文件错误抛出。
 * @param projectName - 项目名称，用于渲染桥接说明。
 * @returns 本次复制的 Skill 与桥接文件路径。
 * @example 模块内部上下文
 * ```ts
 * const files = await generateSkillFiles(process.cwd(), ['ai'], 'api', 'shop')
 * // API 模板复制整个兼容 Skill 目录；features 参数不作为能力裁剪开关。
 * ```
 */
export async function generateSkillFiles(
  projectPath: string,
  _features: string[],
  appType?: string,
  projectName?: string,
): Promise<string[]> {
  const templatesDir = getSkillTemplatesDir()

  if (!(await fse.pathExists(templatesDir))) {
    return []
  }

  const copiedFiles: string[] = []

  const templateSkillNames = await listTemplateSkillNames(templatesDir)
  const compatibleSkillNames = resolveCompatibleSkillNames(templateSkillNames, appType as AppType | undefined)

  copiedFiles.push(...await copySkills(templatesDir, compatibleSkillNames, projectPath))

  // 复制桥接文件
  copiedFiles.push(...await copyBridgeFiles(templatesDir, projectPath, true, appType, projectName))

  return copiedFiles
}

/**
 * 为已有项目添加单个模块的 Skill 文件
 *
 * 同时补全普通开发所需工作流及缺失参考资源，保留已有文件。
 *
 * @param projectPath - 用户项目根目录
 * @param moduleId - 模块标识（如 'db'、'iam'）
 * @returns 复制的文件路径，若模块无对应 Skill 则返回 null
 * 未映射模块或没有新增文件时返回 null；已有 Skill 与桥接默认不覆盖。
 * @example 模块内部上下文
 * ```ts
 * const files = await generateModuleSkillFile(process.cwd(), 'ai')
 * if (files) {
 *   const generatedCount = files.length
 * }
 * ```
 */
export async function generateModuleSkillFile(
  projectPath: string,
  moduleId: string,
): Promise<string[] | null> {
  const skillName = MODULE_SKILL_MAP[moduleId]
  if (!skillName) {
    return null
  }

  const copiedFiles = await generateProjectAiSupport(projectPath, [skillName], {
    overwriteSkills: false,
    overwriteBridgeFiles: false,
  })
  return copiedFiles.length > 0 ? copiedFiles : null
}

/**
 *
 * @param packageNames - 实际依赖的 @h-ai/* 包名列表。
 * @returns 工作流与模块 Skill 合并后的去重目录名。
 * @example 模块内部上下文
 * ```ts
 * const names = resolveSkillNamesForPackages(['@h-ai/core', '@h-ai/ai']) // 含工作流 Skill，并去重模块 Skill。
 * ```
 */
export function resolveSkillNamesForPackages(packageNames: string[]): string[] {
  const skillNames = [...WORKFLOW_SKILLS]

  for (const packageName of packageNames) {
    const skillName = PACKAGE_SKILL_MAP[packageName]
    if (skillName) {
      skillNames.push(skillName)
    }
  }

  if (skillNames.includes('hai-ui'))
    skillNames.push('hai-ui-design', 'hai-ui-review')

  return [...new Set(skillNames)]
}

/**
 * 返回本次复制的文件；校验所有输出真实路径位于项目内，拒绝符号链接越界。
 * @throws Error - 模板读取、输出路径校验或写入失败。
 * @param projectPath - 允许写入的项目根目录。
 * @param skillNames - 请求复制的 Skill 目录名。
 * @param options - Skill/桥接覆盖策略与可选项目身份。
 * @param options.overwriteSkills - 是否覆盖已有 Skill；默认 true。
 * @param options.overwriteBridgeFiles - 是否覆盖工具桥接文件；默认 true。
 * @param options.appType - 明确的应用模板类型；省略时按项目布局检测。
 * @param options.projectName - 桥接文档中的项目名称；省略时检测 package.json。
 * @returns 本次复制的 Skill 与桥接文件路径。
 * @example 模块内部上下文
 * ```ts
 * const files = await generateProjectAiSupport(process.cwd(), resolveSkillNamesForPackages(['@h-ai/ai']), { overwriteSkills: false, overwriteBridgeFiles: false })
 * // 已有内容保留；确定模板类型时补全整个兼容目录。
 * ```
 */
export async function generateProjectAiSupport(
  projectPath: string,
  skillNames: string[],
  options: {
    overwriteSkills?: boolean
    overwriteBridgeFiles?: boolean
    appType?: string
    projectName?: string
  } = {},
): Promise<string[]> {
  const templatesDir = getSkillTemplatesDir()

  if (!(await fse.pathExists(templatesDir))) {
    return []
  }

  const {
    overwriteSkills = true,
    overwriteBridgeFiles = true,
  } = options

  const detected = await detectBridgeContext(projectPath)
  const appType = options.appType ?? detected.appType
  const projectName = options.projectName ?? detected.projectName
  // 已确认的样板补全整个兼容目录；其它项目只补工作流与明确请求的模块。
  const requestedSkillNames = appType
    ? [...resolveCompatibleSkillNames(await listTemplateSkillNames(templatesDir), appType as AppType), ...WORKFLOW_SKILLS, ...skillNames]
    : [...WORKFLOW_SKILLS, ...skillNames]
  const selectedSkillNames = resolveCompatibleSkillNames(requestedSkillNames, appType as AppType | undefined)
  const copiedFiles: string[] = []
  copiedFiles.push(...await copySkills(templatesDir, selectedSkillNames, projectPath, SKILL_TARGET_DIRS, overwriteSkills))
  copiedFiles.push(...await copyBridgeFiles(templatesDir, projectPath, overwriteBridgeFiles, appType, projectName))

  return copiedFiles
}
