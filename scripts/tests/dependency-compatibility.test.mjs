/** 验证安全版本覆盖后的真实第三方调用路径，不以版本字符串代替兼容性证明。 */
import { RawImage } from '@huggingface/transformers'
import { serialize } from 'cookie'
import katex from 'katex'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import xcode from 'xcode'

describe('security dependency compatibility', () => {
  it('preserves session cookie serialization and rejects invalid cookie names', () => {
    expect(serialize('session', 'token', { httpOnly: true, sameSite: 'lax', path: '/' })).toBe('session=token; Path=/; HttpOnly; SameSite=Lax')
    expect(() => serialize('invalid\nname', 'value')).toThrow()
  })

  it('decodes and resizes images through the Transformers sharp integration', async () => {
    const png = await sharp({ create: { width: 16, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer()
    const image = await RawImage.fromBlob(new Blob([png], { type: 'image/png' }))
    expect([image.width, image.height, image.channels]).toEqual([16, 8, 3])
    expect(Array.from(image.data.slice(0, 3))).toEqual([255, 0, 0])
    const resized = await image.resize(8, 4)
    expect([resized.width, resized.height, resized.channels]).toEqual([8, 4, 3])
  })

  it('keeps mathematical rendering and rejects untrusted links', () => {
    expect(katex.renderToString('\\frac{1}{2}')).toContain('katex-mathml')
    expect(katex.renderToString('\\href{javascript:alert(1)}{link}', { trust: false })).not.toContain('href="javascript:')
  })

  it('allows the Capacitor Xcode builder to generate project identifiers', () => {
    const project = xcode.project('unused.pbxproj')
    project.hash = { project: { objects: {} } }
    const first = project.generateUuid()
    expect(first).toMatch(/^[A-F\d]{24}$/)
    expect(project.generateUuid()).not.toBe(first)
  })
})
