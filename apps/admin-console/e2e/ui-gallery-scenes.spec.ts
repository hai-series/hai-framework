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
  })
})
