/**
 * IAM 浏览器入口，只提供纯配置、错误及类型；服务端 iam 对象从 Node 主入口使用。
 * @module iam-index.browser
 */
export * from './iam-config.js'
export { HaiIamError } from './iam-types.js'
export type * from './iam-types.js'
