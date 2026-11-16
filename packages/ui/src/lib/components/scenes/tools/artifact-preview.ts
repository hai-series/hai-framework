/**
 * 在不执行脚本的解析阶段插入离线资源策略，并移除声明式跳转。
 * iframe 必须同时使用 allow-scripts 且不开放 same-origin；宿主仍须限制预览导航与出口。
 * @example 模块内部上下文
 * ```ts
 * const html = prepareHtmlPreview('<button onclick="this.textContent=42">运行</button>')
 * ```
 */
export function prepareHtmlPreview(content: string): string {
  if (typeof document === 'undefined')
    return ''
  // template 内容在主应用内保持 inert，解析阶段也不加载外部图片或框架。
  const template = document.createElement('template')
  template.innerHTML = content
  for (const element of template.content.querySelectorAll('base, meta[http-equiv], iframe, frame, object, embed'))
    element.remove()
  const policy = document.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = 'default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\''
  const referrer = document.createElement('meta')
  referrer.name = 'referrer'
  referrer.content = 'no-referrer'
  // 链接只保留同页锚点，表单和脚本的其他行为继续由 sandbox/CSP 限制。
  for (const link of template.content.querySelectorAll('a[href]')) {
    if (!link.getAttribute('href')?.startsWith('#'))
      link.removeAttribute('href')
    link.removeAttribute('target')
    link.removeAttribute('ping')
  }
  return `<!doctype html>\n<html><head>${policy.outerHTML}${referrer.outerHTML}</head><body>${template.innerHTML}</body></html>`
}
