/**
 * @h-ai/reach — 模板引擎
 *
 * 本文件提供触达模块的模板定义与渲染功能。
 * @module reach-template
 */

import type { Result } from '@h-ai/core'
import type { ReachError, ReachTemplate, ReachTemplateRegistry, RenderedTemplate } from './reach-types.js'

import { err, ok } from '@h-ai/core'

import { ReachErrorCode } from './reach-config.js'
import { reachM } from './reach-i18n.js'

// ─── 变量渲染 ───

/**
 * 将模板字符串中的 `{key}` 占位符替换为实际值
 *
 * @param template - 包含 `{key}` 占位符的模板字符串
 * @param vars - 变量键值对
 * @returns 替换后的字符串
 */
function renderString(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  })
}

// ─── 模板注册表工厂 ───

/**
 * 创建模板注册表
 *
 * @returns 模板注册表实例
 *
 * @example
 * ```ts
 * const registry = createTemplateRegistry()
 *
 * registry.register({
 *   name: 'welcome',
 *   subject: '欢迎加入 {appName}',
 *   body: '亲爱的 {userName}，欢迎使用 {appName}！',
 * })
 *
 * const result = registry.render('welcome', { appName: 'Hai', userName: '张三' })
 * if (result.success) {
 *   // result.data.subject === '欢迎加入 Hai'
 *   // result.data.body === '亲爱的 张三，欢迎使用 Hai！'
 * }
 * ```
 */
export function createTemplateRegistry(): ReachTemplateRegistry {
  const templates = new Map<string, ReachTemplate>()

  return {
    register(template: ReachTemplate): void {
      templates.set(template.name, template)
    },

    registerMany(list: ReachTemplate[]): void {
      for (const template of list) {
        templates.set(template.name, template)
      }
    },

    get(name: string): ReachTemplate | undefined {
      return templates.get(name)
    },

    has(name: string): boolean {
      return templates.has(name)
    },

    list(): ReachTemplate[] {
      return Array.from(templates.values())
    },

    render(name: string, vars: Record<string, string>): Result<RenderedTemplate, ReachError> {
      const template = templates.get(name)
      if (!template) {
        return err({
          code: ReachErrorCode.TEMPLATE_NOT_FOUND,
          message: reachM('reach_templateNotFound', { params: { template: name } }),
        })
      }

      try {
        const rendered: RenderedTemplate = {
          subject: template.subject ? renderString(template.subject, vars) : undefined,
          body: renderString(template.body, vars),
        }
        return ok(rendered)
      }
      catch (error) {
        return err({
          code: ReachErrorCode.TEMPLATE_RENDER_FAILED,
          message: reachM('reach_templateRenderFailed', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          cause: error,
        })
      }
    },
  }
}
