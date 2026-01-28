/**
 * =============================================================================
 * @hai/skills - 主入口
 * =============================================================================
 * 技能模块，提供:
 * - 技能定义
 * - 技能注册表
 * - 技能组合
 * =============================================================================
 */

// 技能定义
export {
  defineSkill,
  type DefineSkillOptions,
  type Skill,
  type SkillContext,
  type SkillError,
  type SkillErrorType,
  type SkillMetadata,
  type SkillResult,
} from './skill.js'

// 技能注册表
export {
  createSkillRegistry,
  SkillRegistry,
  type RegistryEvent,
  type RegistryEventListener,
  type RegistryEventType,
  type SkillQuery,
} from './registry.js'

// 技能组合
export {
  conditional,
  createPipeline,
  parallel,
  SkillPipeline,
  withRetry,
  type ConditionalConfig,
  type ParallelConfig,
  type PipelineResult,
  type PipelineStep,
  type RetryConfig,
} from './compose.js'
