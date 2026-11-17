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
    expect(css).toMatch(/:where\(:scope\s*>\s*:focus,\s*:scope\s*>\s*:has\(:focus\)\)\s*\{\s*z-index:\s*2/)
    expect(css).toMatch(/:where\(:scope\s*>\s*\.btn:hover,\s*:scope\s*>\s*:has\(\.btn:hover\)\)\s*\{\s*z-index:\s*1/)
  }
  finally {
    warn.mockRestore()
  }
})
