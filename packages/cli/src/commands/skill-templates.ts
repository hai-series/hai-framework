/**
 * @h-ai/cli — Skill 模板生成
 *
 * 将 Skill 模板文件复制到用户项目中，供 AI 编程助手使用。
 * @module skill-templates
 */

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
 * 基础 Skill（所有项目都需要的）
 */
const BASE_SKILLS = [
  'hai-build',
  'hai-core',
  'hai-kit',
  'hai-ui',
  'hai-app-create',
  'hai-app-review',
  'hai-app-tests',
]

/**
 * Capacitor 应用额外需要的 Skill
 */
const CAPACITOR_SKILLS = ['hai-api-client', 'hai-capacitor']

/**
 * API 类型项目不需要的 UI 相关 Skill
 */
const UI_SKILLS = ['hai-ui']

const WORKFLOW_SKILLS = [
  'hai-build',
  'hai-app-create',
  'hai-app-review',
  'hai-app-tests',
]

const PACKAGE_SKILL_MAP: Record<string, string> = {
  '@h-ai/core': 'hai-core',
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
  '@h-ai/api-client': 'hai-api-client',
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

/**
 * 获取 templates/skills/ 目录的绝对路径
 *
 * 兼容两种运行环境：
 * - 构建后：dist/skill-templates.js → ../templates/skills
 * - 测试时：src/commands/skill-templates.ts → ../../templates/skills
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
): Promise<string[]> {
  const copiedFiles: string[] = []

  for (const file of BRIDGE_FILES) {
    const src = path.join(templatesDir, file.source)
    const dest = path.join(projectPath, file.destination)

    if (!(await fse.pathExists(src))) {
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

/**
 * 为新项目生成完整的 Skill 文件
 *
 * 根据用户选择的功能模块，复制基础 Skill 和模块 Skill 到项目中。
 *
 * @param projectPath - 用户项目根目录
 * @param features - 用户选择的功能模块列表（如 ['db', 'iam', 'cache']）
 * @param appType - 应用类型（api 类型不复制 UI Skill）
 */
export async function generateSkillFiles(
  projectPath: string,
  features: string[],
  appType?: string,
): Promise<string[]> {
  const templatesDir = getSkillTemplatesDir()

  if (!(await fse.pathExists(templatesDir))) {
    return []
  }

  const copiedFiles: string[] = []

  // 确定需要的基础 Skill
  const baseSkills = appType === 'api'
    ? BASE_SKILLS.filter(s => !UI_SKILLS.includes(s))
    : [...BASE_SKILLS]

  // Capacitor 应用额外添加 api-client 和 capacitor Skill
  if (appType === 'android-app') {
    baseSkills.push(...CAPACITOR_SKILLS)
  }

  // 复制基础 Skill
  copiedFiles.push(...await copySkills(templatesDir, baseSkills, projectPath))

  // 复制模块 Skill
  const featureSkills: string[] = []
  for (const featureId of features) {
    const skillName = MODULE_SKILL_MAP[featureId]
    if (skillName && !baseSkills.includes(skillName)) {
      featureSkills.push(skillName)
    }
  }
  copiedFiles.push(...await copySkills(templatesDir, featureSkills, projectPath))

  // 复制桥接文件
  copiedFiles.push(...await copyBridgeFiles(templatesDir, projectPath))

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
  copiedFiles.push(...await copyBridgeFiles(templatesDir, projectPath, overwriteBridgeFiles))

  return copiedFiles
}
