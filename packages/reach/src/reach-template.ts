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
 * 用自身属性替换{word}占位符，未知变量保留原文；不读取原型链，不做HTML转义。
 * @param template - 模板文本。
 * @param vars - 字符串变量。
 * @returns 渲染文本，最终HTML安全上下文另行处理。
 *
 * @example 模块内部上下文
 * ```ts
 * const text = renderString('Hello {name}, {missing}', { name: 'Alice' })
 * ```
 */
function renderString(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return Object.hasOwn(vars, key) ? vars[key] : match
  })
}

/**
 * 将持久模板转换为主题/正文，渲染异常返回TEMPLATE_RENDER_FAILED，不改写原模板。
 * @param template - 已解析模板。
 * @param vars - 变量字典。
 * @returns 渲染HaiResult，结果不代表内容已消毒或消息已发送。
 *
 * @example 模块内部上下文
 * ```ts
 * const result = renderTemplate({ name: 'welcome', provider: 'webhook', body: 'Hello {name}' }, { name: 'Alice' })
 * if (!result.success) throw new Error(result.error.message)
 * ```
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
 * 内部数据库模板注册表工厂；无repo时明确不保存到内存，写入返回失败、解析找不到模板、列表为空。
 * @param repo - 已初始化的模板数据库仓库。
 * @returns 注册表；批量保存逐条upsert，不承诺事务全有全无。
 *
 * @example 模块内部上下文
 * ```ts
 * const registry = createTemplateRegistry()
 * const result = await registry.save({ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' })
 * if (!result.success) { const code = result.error.code }
 * // 无数据库明确失败；应用通过reach.template使用持久注册表。
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
