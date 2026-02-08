/**
 * =============================================================================
 * @hai/core - i18n 公共类型
 * =============================================================================
 * 仅导出对外公开的 i18n 类型，用于入口文件 `export *` 聚合。
 *
 * 内部实现（i18n 对象、CoreMessageKey 等）不在此导出，
 * 由 `core-main.ts` 通过 `i18n/index.ts` 内部引用。
 * =============================================================================
 */

export type {
  InterpolationParams,
  Locale,
  LocaleInfo,
  LocaleMessages,
  MessageDictionary,
  MessageOptions,
} from './core-i18n-utils.js'
