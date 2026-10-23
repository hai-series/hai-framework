/**
 * @h-ai/serv — 包入口
 *
 * 根入口暴露 `serv` 扁平命名空间与公开类型；默认 feature 通过公开子路径
 * （`@h-ai/serv/features/iam` 等）按需引入，普通源文件 export 不代表包公开 API。
 * @module index
 */

export * from './serv-main.js'
export * from './serv-types.js'
