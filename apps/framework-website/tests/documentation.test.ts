import { describe, expect, it } from 'vitest'
import { docChapter, docLink, docSlug, docTitle } from '../src/lib/doc-links.js'
import { contentHref, getDocument, getDocumentPage, getNavigation, routeDocuments, searchIndex } from '../src/lib/server/docs.js'
import { searchDocuments } from '../src/lib/services/search.js'

describe('公开手册的静态阅读契约', () => {
  const base = ''

  it('配置示例标明 YAML 语言，校验元数据不作为语言名', async () => {
    const document = await getDocument('configuration/runtime.md', base)
    const html = document?.sections.map(section => section.html).join('\n') ?? ''
    expect(html).toContain('language-yaml')
    expect(html).not.toContain('language-yaml schema=')
  })
  it('正文流程图使用公开路径并预留尺寸，浏览器加载前不推动锚点', async () => {
    const document = await getDocument('configuration/runtime.md', base)
    const html = document?.sections.map(section => section.html).join('\n') ?? ''
    expect(html).toContain('src="/guide-images/configuration-sources.svg"')
    expect(html).toContain('width="1080" height="540"')
  })
  it('相对文档、图片、源码链接在根路径保持正确，私有路径不发布', () => {
    expect(docLink('configuration/README.md', base)).toBe('/docs/configuration/')
    expect(contentHref('../images/auth-login-split.png', 'configuration/runtime.md', base)).toBe('/guide-images/auth-login-split.png')
    expect(contentHref('../configuration/runtime.md#日志采集与隐私', 'development/ui.md', base)).toBe('/docs/configuration/runtime/#%E6%97%A5%E5%BF%97%E9%87%87%E9%9B%86%E4%B8%8E%E9%9A%90%E7%A7%81')
    expect(contentHref('../../../packages/core/README.md', 'configuration/runtime.md', base)).toBe('https://github.com/hai-series/hai-framework/blob/main/packages/core/README.md')
    expect(contentHref('C:/private/report.md', 'README.md', base)).toBe('#')
    expect(contentHref('../../tmp/private.md', 'README.md', base)).toBe('#')
  })

  it('导航中的每个公开文档都存在，生成的标题和锚点不依赖服务器', async () => {
    const routes = await routeDocuments()
    expect(routes).toContain('configuration/README.md')
    expect(routes).toContain('operations/README.md')
    expect(routes).not.toContain('configuration.md')
    expect(routes).not.toContain('operations.md')
    expect(new Set(routes.map(file => docSlug(file))).size).toBe(routes.length)
    const navigation = await getNavigation()
    const http = navigation.sections.find(section => section.id === 'configuration')?.children?.find(node => node.id === 'configuration-http')
    expect(http?.children?.map(node => node.path)).toContain('configuration/request-access.md')
    for (const file of routes) {
      const document = await getDocument(file, base)
      expect(document, file).toBeDefined()
      expect(document?.title).toBeTruthy()
      for (const heading of document?.headings ?? [])
        expect(document?.sections.some(part => part.id === heading.id), `${file}#${heading.id}`).toBe(true)
    }
    expect(await getDocument('../../package.json', base)).toBeUndefined()
  })

  it('全文包含配置正文，空查询不误命中，所有词同时匹配且标题优先', async () => {
    const entries = await searchIndex(base)
    expect(searchDocuments('', entries)).toEqual([])
    const results = searchDocuments('maxAge', entries)
    expect(results.some(result => result.href === '/docs/configuration/identity/')).toBe(true)
    expect(searchDocuments('maxAge 非存在关键词xyz', entries)).toEqual([])
    expect(new Set(entries.map(entry => entry.href)).size).toBe(entries.length)
  })

  it('三语地址对应同一章，中文和旧译文地址仍可访问', async () => {
    expect(docLink('function/core.md', base)).toBe('/docs/function/core/')
    expect(docLink('function/core.md', base, 'en-US')).toBe('/docs/en/function/core/')
    expect(docLink('function/core.ja.md', base)).toBe('/docs/ja/function/core/')
    expect(docLink('getting-started/workflow.en.md', base)).toBe('/docs/en/getting-started/')
    const chapter = docChapter('/docs/en/function/core/', base)
    expect(chapter).toEqual({ slug: 'function/core', locale: 'en-US' })
    expect(docChapter('/docs/function/core.en/', base)).toEqual(chapter)
    expect(docChapter('/docsmith/', base)).toBeUndefined()
    const translated = await getDocumentPage(chapter!, base)
    expect(translated?.sourceLocale).toBe('en-US')
    expect(translated?.sections.some(section => section.id === 'config-api')).toBe(true)
    expect(translated?.sections.map(section => section.html).join('')).toContain('href="/docs/function/core/"')
    expect(await getDocumentPage({ slug: 'missing', locale: 'en-US' }, base)).toBeUndefined()
  })

  it('缺译文时显示中文，并让侧栏、相关链接和搜索保留请求语言', async () => {
    const fallback = await getDocumentPage({ slug: 'configuration/runtime', locale: 'ja-JP' }, base)
    expect(fallback?.locale).toBe('ja-JP')
    expect(fallback?.sourceLocale).toBe('zh-CN')
    expect(fallback?.file).toBe('configuration/runtime.md')
    expect(fallback?.sections.map(section => section.html).join('')).toContain('href="/docs/ja/configuration/"')
    const navigation = await getNavigation()
    expect(docTitle(navigation.sections.find(node => node.id === 'configuration')!, 'ja-JP')).toContain('設定')
    const entries = await searchIndex(base, 'ja-JP')
    expect(entries.every(entry => entry.href.startsWith('/docs/ja/'))).toBe(true)
    expect(entries.find(entry => entry.href.endsWith('/configuration/runtime/'))?.sourceLocale).toBe('zh-CN')
    expect(new Set(entries.map(entry => entry.href)).size).toBe(entries.length)
  })

  it('各模块手册列出 API，已完成译文在索引中不再标为部分', async () => {
    const { sections } = await getNavigation()
    const modules = sections.find(section => section.id === 'function')?.children ?? []
    expect(modules.map(module => module.path)).toContain('function/tools.md')
    for (const module of modules) {
      const document = await getDocument(module.path, base)
      expect(document?.sections.some(section => section.id === 'api-reference'), module.path).toBe(true)
      expect(document?.sections.some(section => section.html.includes('<table>')), module.path).toBe(true)
      for (const locale of ['en-US', 'ja-JP'] as const) {
        for (const section of ['configuration', 'data', 'function']) {
          const slug = docSlug(module.path.replace('function/', `${section}/`))
          const translated = await getDocumentPage({ slug, locale }, base)
          expect(translated?.sourceLocale, `${locale}/${slug}`).toBe(locale)
          if (section === 'function')
            expect(translated?.sections.some(part => part.id === 'api-reference'), `${locale}/${slug}`).toBe(true)
        }
      }
    }
    const entries = await searchIndex(base, 'en-US')
    expect(entries.find(entry => entry.href.endsWith('/function/core/'))?.partialTranslation).toBe(false)
    expect(entries.find(entry => entry.href.endsWith('/function/datapipe/'))).toMatchObject({
      sourceLocale: 'en-US',
      partialTranslation: false,
    })
  })
})
