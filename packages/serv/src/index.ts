/**
 * @h-ai/serv — 包入口
 *
 * 仅暴露 `serv` 扁平命名空间和公开类型；内部实现细节通过子路径
 * （`@h-ai/serv/features/iam` 等）按需引入。
 * @module index
 */

export * from './serv-main.js'
export * from './serv-types.js'
