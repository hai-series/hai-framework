import { describe, expect, it } from 'vitest'
import { docLink, docSlug } from '../src/lib/doc-links.js'
import { contentHref, getDocument, getNavigation, routeDocuments, searchIndex } from '../src/lib/server/docs.js'
import { searchDocuments } from '../src/lib/services/search.js'

describe('公开手册的静态阅读契约', () => {
  it('相对文档、图片、源码链接在repo子路径保持正确，私有路径不发布', () => {
    expect(docLink('configuration/README.md', '/hai-framework')).toBe('/hai-framework/docs/configuration/')
    expect(contentHref('../images/config-core.png', 'configuration/runtime.md', '/hai-framework')).toBe('/hai-framework/guide-images/config-core.png')
    expect(contentHref('../configuration/runtime.md#日志采集与隐私', 'development/ui.md', '/hai-framework')).toBe('/hai-framework/docs/configuration/runtime/#%E6%97%A5%E5%BF%97%E9%87%87%E9%9B%86%E4%B8%8E%E9%9A%90%E7%A7%81')
    expect(contentHref('../../../packages/core/README.md', 'configuration/runtime.md', '/hai-framework')).toBe('https://github.com/hai-series/hai-framework/blob/main/packages/core/README.md')
    expect(contentHref('C:/private/report.md', 'README.md', '/hai-framework')).toBe('#')
    expect(contentHref('../../tmp/private.md', 'README.md', '/hai-framework')).toBe('#')
  })

  it('导航中的每个公开文档都存在，生成的标题和锚点不依赖服务器', async () => {
    const routes = await routeDocuments()
    expect(routes).toContain('configuration/README.md')
    expect(routes).toContain('operations/README.md')
    expect(routes).not.toContain('configuration.md')
    expect(routes).not.toContain('operations.md')
    expect(new Set(routes.map(docSlug)).size).toBe(routes.length)
    const navigation = await getNavigation()
    const http = navigation.sections.find(section => section.id === 'configuration')?.children?.find(node => node.id === 'configuration-http')
    expect(http?.children?.map(node => node.path)).toContain('configuration/request-access.md')
    for (const file of routes) {
      const document = await getDocument(file, '/hai-framework')
      expect(document, file).toBeDefined()
      expect(document?.title).toBeTruthy()
      for (const heading of document?.headings ?? [])
        expect(document?.sections.some(part => part.id === heading.id), `${file}#${heading.id}`).toBe(true)
    }
    expect(await getDocument('../../package.json', '/hai-framework')).toBeUndefined()
  })

  it('全文包含配置正文，空查询不误命中，所有词同时匹配且标题优先', async () => {
    const entries = await searchIndex('/hai-framework')
    expect(searchDocuments('', entries)).toEqual([])
    const results = searchDocuments('maxAge', entries)
    expect(results.some(result => result.href === '/hai-framework/docs/configuration/identity/')).toBe(true)
    expect(searchDocuments('maxAge 非存在关键词xyz', entries)).toEqual([])
    expect(new Set(entries.map(entry => entry.href)).size).toBe(entries.length)
  })
})
