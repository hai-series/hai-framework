/** 源文档路径映射为仓库子路径下可直接访问的静态目录。 */
export function docSlug(file: string): string {
  return file.replace(/(^|\/)README\.md$/, '$1').replace(/\.md$/, '').replace(/\/$/, '')
}

export function docLink(file: string, base: string): string {
  const slug = docSlug(file)
  return `${base}/docs/${slug ? `${slug}/` : ''}`
}
