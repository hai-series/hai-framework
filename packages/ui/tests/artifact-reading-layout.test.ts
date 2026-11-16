// @vitest-environment jsdom
import type { ArtifactDocument } from '../src/lib/components/scenes/tools/workspace-types.js'
import { flushSync, mount, unmount } from 'svelte'
import { expect, it } from 'vitest'
import ArtifactWorkspace from '../src/lib/components/scenes/tools/ArtifactWorkspace.svelte'
import { uiM } from '../src/lib/messages.js'

it('starts with the outline collapsed so the document remains readable, and keeps outline navigation available', async () => {
  const document: ArtifactDocument = {
    id: 'readable',
    title: 'Readable product guide',
    kind: 'markdown',
    version: 1,
    content: '# Product guide\n\nRead the document without an overlapping outline.\n',
  }
  const target = window.document.body.appendChild(window.document.createElement('div'))
  const component = mount(ArtifactWorkspace, {
    target,
    props: {
      artifacts: [document],
      onread: async () => document,
    },
  })
  try {
    flushSync()
    await expect.poll(() => target.querySelector('article p')?.textContent).toBe('Read the document without an overlapping outline.')
    expect(target.querySelector('.hai-ai-doc-outline')).toBeNull()
    const open = target.querySelector<HTMLButtonElement>(`button[aria-label="${uiM('markdown_show_outline')}"]`)
    expect(open).not.toBeNull()
    open!.click()
    flushSync()
    expect(target.querySelector('.hai-ai-doc-outline')).not.toBeNull()
    expect(target.querySelector('article p')?.textContent).toBe('Read the document without an overlapping outline.')
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
