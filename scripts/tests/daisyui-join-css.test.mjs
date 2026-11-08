import { readFileSync } from 'node:fs'
import { compile, optimize } from '@tailwindcss/node'
import { expect, it, vi } from 'vitest'

it('preserves real DaisyUI join focus and hover stacking through Tailwind optimization', async () => {
  const compiler = await compile('@import "tailwindcss" source(none); @plugin "daisyui" { include: join; themes: false; logs: false; }', {
    base: process.cwd(),
    onDependency() {},
  })
  const raw = compiler.build(['join', 'join-item'])
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const css = optimize(raw, { minify: false }).code
    expect(warn).not.toHaveBeenCalled()
    expect(css).toMatch(/:where\(:scope\)\s*>\s*:where\(:focus,\s*:has\(:focus\)\)\s*\{\s*z-index:\s*2/)
    expect(css).toMatch(/:where\(:scope\)\s*>\s*:where\(\.btn:hover,\s*:has\(\.btn:hover\)\)\s*\{\s*z-index:\s*1/)
  }
  finally {
    warn.mockRestore()
  }
})

it('ships the same CSS build compatibility patch to generated UI projects', () => {
  const rootPatch = readFileSync(new URL('../../patches/daisyui-5.7.50.patch', import.meta.url), 'utf8')
  expect(readFileSync(new URL('../../packages/cli/templates/base/patches/daisyui-5.7.50.patch', import.meta.url), 'utf8')).toBe(rootPatch)
})
