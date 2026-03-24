/**
 * @h-ai/reach — 模板引擎
 *
 * 本文件提供触达模块的模板定义与渲染功能。
 * 所有模板通过数据库持久化存储，避免多节点部署时的状态不一致。
 * @module reach-template
 */

import type { HaiResult } from '@h-ai/core'
import type { ReachTemplate, ReachTemplateRegistry, RenderedTemplate } from './reach-types.js'

import type { TemplateRepository } from './repositories/reach-repository-template.js'
import { err, ok } from '@h-ai/core'

import { reachM } from './reach-i18n.js'
import { HaiReachError } from './reach-types.js'

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

/**
 * 渲染模板实体
 */
function renderTemplate(template: ReachTemplate, vars: Record<string, string>): HaiResult<RenderedTemplate> {
  try {
    const rendered: RenderedTemplate = {
      subject: template.subject ? renderString(template.subject, vars) : undefined,
      body: renderString(template.body, vars),
    }
    return ok(rendered)
  }
  catch (error) {
    return err(
      HaiReachError.TEMPLATE_RENDER_FAILED,
      reachM('reach_templateRenderFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      error,
    )
  }
}

// ─── 无数据库时的错误 ───

function noDbError(msgKey: 'reach_templateSaveFailed' | 'reach_templateDeleteFailed'): HaiResult<never> {
  return err(
    HaiReachError.SEND_FAILED,
    reachM(msgKey, { params: { error: 'database not available' } }),
  )
}

// ─── 模板注册表工厂 ───

/**
 * 创建模板注册表
 *
 * @param repo - 可选的数据库模板存储。所有模板操作均通过数据库完成。
 * @returns 模板注册表实例
 *
 * @example
 * ```ts
 * const registry = createTemplateRegistry(templateRepo)
 *
 * await registry.save({
 *   name: 'welcome',
 *   provider: 'email',
 *   subject: '欢迎加入 {appName}',
 *   body: '亲爱的 {userName}，欢迎使用 {appName}！',
 * })
 *
 * const result = await registry.render('welcome', { appName: 'Hai', userName: '张三' })
 * ```
 */
export function createTemplateRegistry(repo?: TemplateRepository | null): ReachTemplateRegistry {
  return {
    async resolve(name: string): Promise<HaiResult<ReachTemplate>> {
      if (!repo) {
        return err(
          HaiReachError.TEMPLATE_NOT_FOUND,
          reachM('reach_templateNotFound', { params: { template: name } }),
        )
      }

      const dbResult = await repo.findByName(name)
      if (!dbResult.success) {
        return dbResult
      }
      if (dbResult.data) {
        return ok({
          name: dbResult.data.name,
          provider: dbResult.data.provider,
          subject: dbResult.data.subject ?? undefined,
          body: dbResult.data.body,
        })
      }

      return err(
        HaiReachError.TEMPLATE_NOT_FOUND,
        reachM('reach_templateNotFound', { params: { template: name } }),
      )
    },

    async save(template: ReachTemplate): Promise<HaiResult<void>> {
      if (!repo) {
        return noDbError('reach_templateSaveFailed')
      }
      return repo.upsert(template)
    },

    async saveBatch(templates: ReachTemplate[]): Promise<HaiResult<void>> {
      if (!repo) {
        return noDbError('reach_templateSaveFailed')
      }
      const results = await Promise.all(templates.map(t => repo!.upsert(t)))
      const failed = results.find(r => !r.success)
      if (failed) {
        return failed
      }
      return ok(undefined)
    },

    async remove(name: string): Promise<HaiResult<void>> {
      if (!repo) {
        return noDbError('reach_templateDeleteFailed')
      }
      return repo.deleteByName(name)
    },

    async list(): Promise<HaiResult<ReachTemplate[]>> {
      if (!repo) {
        return ok([])
      }
      return repo.listTemplates()
    },

    async render(name: string, vars: Record<string, string>): Promise<HaiResult<RenderedTemplate>> {
      const resolved = await this.resolve(name)
      if (!resolved.success) {
        return resolved
      }
      return renderTemplate(resolved.data, vars)
    },
  }
}
