import type {
  CodeWorkspaceFileNode,
  CodeWorkspaceFolder,
  CodeWorkspaceRange,
  CodeWorkspaceSource,
} from '@h-ai/ui/components/scenes/code/index'
import * as m from '#lib/paraglide/messages.js'

const src: CodeWorkspaceFolder = { kind: 'folder', id: 'src', name: 'src' }
const review: CodeWorkspaceFolder = { kind: 'folder', id: 'src/review', name: 'review' }
const shared: CodeWorkspaceFolder = { kind: 'folder', id: 'src/shared', name: 'shared' }
const docs: CodeWorkspaceFolder = { kind: 'folder', id: 'docs', name: 'docs' }
const version = 'demo-v1'

function file(id: string, name: string): CodeWorkspaceFileNode {
  return { kind: 'file', id, name, version }
}

export const reviewRules = file('src/review/rules.ts', 'rules.ts')
export const reviewAncestors = [src, review]

const reviewText = [
  'import { redact } from \'../shared/redact\'',
  '',
  'interface Review {',
  '  title: string',
  '  notes: string[]',
  '}',
  '',
  'export function summarize(review: Review) {',
  '  console.debug(review.notes)',
  '  const notes = review.notes.map(redact)',
  '  return { title: review.title, notes }',
  '}',
  '',
  'export function previewLines(lines: string[]) {',
  '  return lines.slice(0, 5)',
  '}',
  '',
  'export function hasNotes(review: Review) {',
  '  return review.notes.length > 0',
  '}',
]

export const reviewFindingRange: CodeWorkspaceRange = {
  startLine: 9,
  startColumn: 3,
  endLine: 9,
  endColumn: reviewText[8]!.length + 1,
}

export function createCodeWorkspaceDemoSource(): CodeWorkspaceSource {
  const flaggedRules: CodeWorkspaceFileNode = {
    ...reviewRules,
    markers: [
      {
        label: m.gallery_code_workspace_risk_reason(),
        text: m.gallery_code_workspace_risk_label(),
        tone: 'error',
      },
    ],
  }
  const changedReview: CodeWorkspaceFolder = {
    ...review,
    markers: [
      {
        label: m.gallery_code_workspace_git_changed(),
        text: 'M',
        tone: 'warning',
      },
    ],
  }
  const documents = [
    {
      node: flaggedRules,
      ancestors: [src, changedReview],
      language: 'typescript',
      lines: reviewText,
    },
    {
      node: file('src/index.ts', 'index.ts'),
      ancestors: [src],
      language: 'typescript',
      lines: ['export { hasNotes, previewLines, summarize } from \'./review/rules\''],
    },
    {
      node: file('src/shared/redact.ts', 'redact.ts'),
      ancestors: [src, shared],
      language: 'typescript',
      lines: [
        'const placeholder = "[redacted]"',
        '',
        '// Hide confidential preview text.',
        'export function redact(text: string) {',
        '  return text.trim() ? placeholder : ""',
        '}',
      ],
    },
    {
      node: file('docs/quick-start.md', 'quick-start.md'),
      ancestors: [docs],
      language: 'markdown',
      lines: ['# Quick start', '', 'Use the preview to inspect review notes.'],
    },
    {
      node: file('README.md', 'README.md'),
      ancestors: [],
      language: 'markdown',
      lines: ['# Review Kit', '', 'Browse the review rules in src/review/rules.ts.'],
    },
  ]
  const folders = [src, changedReview, shared, docs]

  return {
    async listChildren(parent, signal) {
      if (parent) {
        // 模拟远端目录，展示等待期间的键盘导航与取消。
        await new Promise<void>((resolve, reject) => {
          signal.throwIfAborted()
          const timer = setTimeout(() => {
            signal.removeEventListener('abort', cancel)
            resolve()
          }, 480)
          function cancel() {
            clearTimeout(timer)
            reject(signal.reason)
          }
          signal.addEventListener('abort', cancel, { once: true })
        })
      }
      signal.throwIfAborted()
      const id = parent?.id ?? ''
      const children = folders.filter(folder => folder.id.slice(0, Math.max(0, folder.id.lastIndexOf('/'))) === id)
      const files = documents
        .filter(document => (document.ancestors.at(-1)?.id ?? '') === id)
        .map(document => document.node)
      return [
        ...children,
        ...files,
      ]
    },
    readFile(node, signal) {
      signal.throwIfAborted()
      const document = documents.find(document => document.node.id === node.id)
      if (!document)
        throw new Error('Unknown demo file')

      return {
        text: document.lines.join('\n'),
        language: document.language,
        version,
        annotations: node.id === reviewRules.id
          ? [
              {
                range: reviewFindingRange,
                label: m.gallery_code_workspace_diagnostic(),
                tone: 'error',
                display: 'both',
              },
              {
                range: {
                  startLine: 14,
                  startColumn: 1,
                  endLine: 16,
                  endColumn: 2,
                },
                label: m.gallery_code_workspace_git_changed(),
                hoverText: m.gallery_code_workspace_git_hover(),
                tone: 'success',
                display: 'gutter',
              },
            ]
          : [],
      }
    },
    search({ mode, query }, signal) {
      signal.throwIfAborted()
      const needle = query.trim().toLowerCase()
      if (!needle)
        return { hits: [] }

      return {
        hits: documents.flatMap(({ node, ancestors, lines }) => {
          if (mode === 'files') {
            return node.id.toLowerCase().includes(needle)
              ? [
                  { node, ancestors },
                ]
              : []
          }

          return lines.flatMap((preview, index) => {
            const column = preview.toLowerCase().indexOf(needle)
            if (column < 0)
              return []

            return [
              {
                node,
                ancestors,
                preview,
                range: {
                  startLine: index + 1,
                  startColumn: column + 1,
                  endLine: index + 1,
                  endColumn: column + 1 + needle.length,
                },
              },
            ]
          })
        }),
      }
    },
  }
}
