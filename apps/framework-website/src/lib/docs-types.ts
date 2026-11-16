import type { DocLocale } from './doc-links.js'

/** 文档导航由 docs/usage/navigation.json 人工维护，官网只负责阅读呈现。 */
export interface DocNode {
  id: string
  title: string
  /** 各语言的侧栏名称；例如包名在三种语言下相同，可以省略。 */
  titles?: Partial<Record<DocLocale, string>>
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
  sourceLocale: DocLocale
  partialTranslation: boolean
}
