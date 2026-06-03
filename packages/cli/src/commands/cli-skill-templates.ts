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
  'api': ['hai-ui', 'hai-kit', 'hai-capacitor'],
  'mobile-app': ['hai-core', 'hai-kit', 'hai-serv', 'hai-api-contract'],
  'fullstack': ['hai-kit'],
}

const WORKFLOW_SKILLS = [
  'hai-build',
  'hai-app-create',
  'hai-app-review',
  'hai-app-tests',
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

  for (const targetDir of targetDirs) {
    const dest = path.join(projectPath, targetDir, skillName)
    const skillFilePath = path.join(dest, 'SKILL.md')

    if (!overwrite && await fse.pathExists(skillFilePath)) {
      continue
    }

    await fse.copy(src, dest, { overwrite: true })
    copiedFiles.push(`${targetDir}/${skillName}/SKILL.md`)
  }

  return copiedFiles
}

async function copySkills(
  templatesDir: string,
  skillNames: string[],
  projectPath: string,
  targetDirs: readonly string[] = SKILL_TARGET_DIRS,
  overwrite = true,
): Promise<string[]> {
  const copiedFiles: string[] = []

  for (const skillName of new Set(skillNames)) {
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
): Promise<string[]> {
  const copiedFiles: string[] = []

  for (const file of BRIDGE_FILES) {
    const src = await resolveBridgeSource(templatesDir, file.source, appType)
    const dest = path.join(projectPath, file.destination)

    if (!src) {
      continue
    }

    if (!overwrite && await fse.pathExists(dest)) {
      continue
    }

    await fse.copy(src, dest, { overwrite })
    copiedFiles.push(file.destination)
  }

  return copiedFiles
}

async function resolveBridgeSource(
  templatesDir: string,
  source: string,
  appType?: string,
): Promise<string | null> {
  const profile = appType && BRIDGE_PROFILE_REGEX.test(appType) ? appType : 'generic'
  const candidates = [
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
 */
export async function generateSkillFiles(
  projectPath: string,
  _features: string[],
  appType?: string,
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
  copiedFiles.push(...await copyBridgeFiles(templatesDir, projectPath, true, appType))

  return copiedFiles
}

/**
 * 为已有项目添加单个模块的 Skill 文件
 *
 * 在 `hai add <module>` 时调用，仅复制对应模块的 Skill 文件。
 *
 * @param projectPath - 用户项目根目录
 * @param moduleId - 模块标识（如 'db'、'iam'）
 * @returns 复制的文件路径，若模块无对应 Skill 则返回 null
 */
export async function generateModuleSkillFile(
  projectPath: string,
  moduleId: string,
): Promise<string[] | null> {
  const skillName = MODULE_SKILL_MAP[moduleId]
  if (!skillName) {
    return null
  }

  const templatesDir = getSkillTemplatesDir()
  if (!(await fse.pathExists(templatesDir))) {
    return null
  }

  const missingTargetDirs: string[] = []

  for (const targetDir of SKILL_TARGET_DIRS) {
    const skillFilePath = path.join(projectPath, targetDir, skillName, 'SKILL.md')
    if (!(await fse.pathExists(skillFilePath))) {
      missingTargetDirs.push(targetDir)
    }
  }

  const copiedBridgeFiles = await copyBridgeFiles(templatesDir, projectPath, false)
  if (missingTargetDirs.length === 0) {
    return copiedBridgeFiles.length > 0 ? copiedBridgeFiles : null
  }

  const copiedSkillFiles = await copySkill(templatesDir, skillName, projectPath, missingTargetDirs)
  const copiedFiles = [...copiedBridgeFiles, ...copiedSkillFiles]

  if (copiedFiles.length === 0) {
    return null
  }

  return copiedFiles
}

export function resolveSkillNamesForPackages(packageNames: string[]): string[] {
  const skillNames = [...WORKFLOW_SKILLS]

  for (const packageName of packageNames) {
    const skillName = PACKAGE_SKILL_MAP[packageName]
    if (skillName) {
      skillNames.push(skillName)
    }
  }

  return [...new Set(skillNames)]
}

export async function generateProjectAiSupport(
  projectPath: string,
  skillNames: string[],
  options: {
    overwriteSkills?: boolean
    overwriteBridgeFiles?: boolean
    appType?: string
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

  const copiedFiles: string[] = []
  copiedFiles.push(...await copySkills(templatesDir, skillNames, projectPath, SKILL_TARGET_DIRS, overwriteSkills))
  copiedFiles.push(...await copyBridgeFiles(templatesDir, projectPath, overwriteBridgeFiles, options.appType))

  return copiedFiles
}
