/**
 * =============================================================================
 * E2E 测试 - UI Gallery / Scenes（AiDocumentEditor Mermaid 示例）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('UI Gallery Scenes', () => {
  test('AiDocumentEditor 的 Mermaid 文档与代码示例可正常渲染', async ({ page, request }) => {
    await registerAndLogin(page, request, 'sceneui')
    await page.goto('/admin/ui-gallery/scenes')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('AiDocumentEditor · Mermaid 文档')).toBeVisible()
    await expect(page.getByText('AiDocumentEditor · Mermaid 代码')).toBeVisible()

    const documentDemo = page.getByTestId('mermaid-document-demo')
    await expect(documentDemo).toBeVisible()
    await expect(documentDemo.locator('.hai-md-mermaid svg').first()).toBeVisible({ timeout: 15_000 })

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
  })
})
