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
  db: 'hai-db',
  cache: 'hai-cache',
  iam: 'hai-iam',
  storage: 'hai-storage',
  ai: 'hai-ai',
  crypto: 'hai-crypto',
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
 * API 类型项目不需要的 UI 相关 Skill
 */
const UI_SKILLS = ['hai-ui']

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
 * @param skillName - Skill 目录名（如 'hai-db'）
 * @param projectPath - 用户项目根目录
 */
async function copySkill(templatesDir: string, skillName: string, projectPath: string): Promise<void> {
  const src = path.join(templatesDir, skillName)
  const dest = path.join(projectPath, '.github', 'skills', skillName)

  if (await fse.pathExists(src)) {
    await fse.copy(src, dest, { overwrite: true })
  }
}

/**
 * 复制桥接文件到项目
 *
 * @param templatesDir - Skill 模板根目录
 * @param projectPath - 用户项目根目录
 */
async function copyBridgeFiles(templatesDir: string, projectPath: string): Promise<void> {
  // copilot-instructions.md → .github/copilot-instructions.md
  const copilotSrc = path.join(templatesDir, 'copilot-instructions.md')
  if (await fse.pathExists(copilotSrc)) {
    await fse.copy(copilotSrc, path.join(projectPath, '.github', 'copilot-instructions.md'), { overwrite: true })
  }

  // CLAUDE.md → 项目根目录
  const claudeSrc = path.join(templatesDir, 'CLAUDE.md')
  if (await fse.pathExists(claudeSrc)) {
    await fse.copy(claudeSrc, path.join(projectPath, 'CLAUDE.md'), { overwrite: true })
  }

  // AGENTS.md → 项目根目录
  const agentsSrc = path.join(templatesDir, 'AGENTS.md')
  if (await fse.pathExists(agentsSrc)) {
    await fse.copy(agentsSrc, path.join(projectPath, 'AGENTS.md'), { overwrite: true })
  }
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

  // 复制基础 Skill
  for (const skillName of baseSkills) {
    await copySkill(templatesDir, skillName, projectPath)
    copiedFiles.push(`.github/skills/${skillName}/SKILL.md`)
  }

  // 复制模块 Skill
  for (const featureId of features) {
    const skillName = MODULE_SKILL_MAP[featureId]
    if (skillName && !baseSkills.includes(skillName)) {
      await copySkill(templatesDir, skillName, projectPath)
      copiedFiles.push(`.github/skills/${skillName}/SKILL.md`)
    }
  }

  // 复制桥接文件
  await copyBridgeFiles(templatesDir, projectPath)
  copiedFiles.push('.github/copilot-instructions.md', 'CLAUDE.md', 'AGENTS.md')

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
): Promise<string | null> {
  const skillName = MODULE_SKILL_MAP[moduleId]
  if (!skillName) {
    return null
  }

  const templatesDir = getSkillTemplatesDir()
  if (!(await fse.pathExists(templatesDir))) {
    return null
  }

  const destPath = path.join(projectPath, '.github', 'skills', skillName)

  // 已存在则跳过
  if (await fse.pathExists(destPath)) {
    return null
  }

  await copySkill(templatesDir, skillName, projectPath)
  return `.github/skills/${skillName}/SKILL.md`
}
