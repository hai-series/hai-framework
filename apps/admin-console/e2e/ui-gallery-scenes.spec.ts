/**
 * =============================================================================
 * E2E 测试 - UI Gallery / Scenes（AiDocumentEditor Mermaid 示例）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('UI Gallery Scenes', () => {
  test('AiDocumentEditor 的 Mermaid 文档与代码示例可正常渲染', async ({ page, request, context }, testInfo) => {
    await registerAndLogin(page, request, 'sceneui')
    await page.goto('/admin/ui-gallery/scenes')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('AiDocumentEditor · Mermaid 文档')).toBeVisible()
    await expect(page.getByText('AiDocumentEditor · Mermaid 代码')).toBeVisible()

    const documentDemo = page.getByTestId('mermaid-document-demo')
    await expect(documentDemo).toBeVisible()
    await expect(documentDemo.locator('.hai-md-mermaid svg').first()).toBeVisible({ timeout: 15_000 })
    const nodeShape = documentDemo.locator('.hai-md-mermaid svg .node rect').first()
    await expect(nodeShape).toBeVisible()
    // 仅判断 SVG 存在无法发现样式丢失后黑色文字叠在黑色节点上的问题。
    const fill = await nodeShape.evaluate(element => getComputedStyle(element).fill)
    expect(fill).not.toBe('rgb(0, 0, 0)')
    await expect(documentDemo.locator('.hai-md-mermaid svg style').first()).toBeHidden()
    // 导出当前浏览器已渲染的 SVG 单独截图，避免固定高度阅读区裁掉长流程图。
    const diagram = await context.newPage()
    try {
      const svg = await documentDemo.locator('.hai-md-mermaid svg').first().evaluate(element => element.outerHTML)
      await diagram.setContent(`<html lang="zh-CN"><body style="margin:24px;background:white">${svg}</body></html>`)
      await diagram.locator('svg').screenshot({ path: testInfo.outputPath('ai-mermaid-diagram.png') })
    }
    finally { await diagram.close() }

    const codeDemo = page.getByTestId('mermaid-code-demo')
    await expect(codeDemo).toBeVisible()
    await expect(codeDemo.locator('code')).toContainText('stateDiagram-v2')

    const previewToggle = codeDemo.locator('[data-code-view-toggle][data-code-view="preview"]').first()
    await expect(previewToggle).toBeVisible()
    await previewToggle.click()

    await expect(
      codeDemo.locator('[data-code-view-toggle][data-code-view="preview"][aria-pressed="true"]'),
    ).toBeVisible()
    await expect(codeDemo.locator('.hai-md-mermaid-preview svg')).toBeVisible({ timeout: 15_000 })

    await expect(page.getByText('MarkdownRenderer · 字号与 HTML 标签')).toBeVisible()
    await expect(page.getByText('AiDocumentEditor · 字号与 HTML 标签')).toBeVisible()

    const markdownHtmlOffDemo = page.getByTestId('markdown-html-off-demo')
    const markdownHtmlOnDemo = page.getByTestId('markdown-html-on-demo')
    await expect(markdownHtmlOffDemo.locator('b')).toHaveCount(0)
    await expect(markdownHtmlOnDemo.locator('b').first()).toHaveText('粗体强调')

    const markdownOffFontSize = await markdownHtmlOffDemo.locator('.hai-markdown').evaluate(
      element => window.getComputedStyle(element).fontSize,
    )
    const markdownOnFontSize = await markdownHtmlOnDemo.locator('.hai-markdown').evaluate(
      element => window.getComputedStyle(element).fontSize,
    )
    expect(Number.parseFloat(markdownOnFontSize)).toBeGreaterThan(Number.parseFloat(markdownOffFontSize))

    const aiDocumentHtmlOffDemo = page.getByTestId('ai-document-html-off-demo')
    const aiDocumentHtmlOnDemo = page.getByTestId('ai-document-html-on-demo')
    await expect(aiDocumentHtmlOffDemo.locator('article b')).toHaveCount(0)
    await expect(aiDocumentHtmlOnDemo.locator('article b').first()).toHaveText('重点')

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    const copy = documentDemo.getByRole('button', { name: '复制全文', exact: true })
    const colors = await copy.evaluate(async (element) => {
      const context = document.createElement('canvas').getContext('2d')!
      const luminance = (value: string) => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
        const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((channel) => {
          const unit = channel / 255
          return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
        })
        return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
      }
      const measure = () => {
        const style = getComputedStyle(element)
        const color = style.color
        const background = style.backgroundColor
        const a = luminance(color)
        const b = luminance(background)
        return { color, background, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
      }
      // 切换主题会触发按钮的颜色过渡；先读取样式，再等待真实过渡完成后检查最终配色。
      const before = measure()
      const animations = element.getAnimations()
      await Promise.all(animations.map(animation => animation.finished))
      return { before, after: measure(), animationCount: animations.length }
    })
    await testInfo.attach('theme-contrast.json', { body: JSON.stringify(colors, null, 2), contentType: 'application/json' })
    await documentDemo.screenshot({ path: testInfo.outputPath('ai-document-dark.png') })
    expect(colors.after.contrast).toBeGreaterThanOrEqual(4.5)
  })
})
