/** 文档导航由 docs/usage/navigation.json 人工维护，官网只负责阅读呈现。 */
export interface DocNode {
  id: string
  title: string
  path: string
  children?: DocNode[]
}

export interface DocNavigation {
  version: number
  locales: Record<string, { title: string, path: string }>
  sections: DocNode[]
}

export interface SearchEntry {
  title: string
  href: string
  text: string
}
