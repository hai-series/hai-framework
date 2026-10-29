import { describe, expect, it } from 'vitest'
import { DeploymentArtifactSchema, normalizeProjectName } from '../src/index.js'

describe('交付角色与项目身份', () => {
  it('网站挂载路径保留在制品中，非法路径和没有Web的路径配置拒绝', () => {
    const artifact = { version: 4, primaryService: 'web', hasWeb: true, appVersion: '1.0.0', buildId: 'build-prefix', images: [{ name: 'web', file: 'web-1.0.0.tar', imageRef: 'localhost/prefix-web:build-1', sha256: 'a'.repeat(64) }] }
    expect(DeploymentArtifactSchema.parse({ ...artifact, version: 5, webBasePath: '/yyy/sub' })).toMatchObject({ version: 5, webBasePath: '/yyy/sub' })
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, webBasePath: '/yyy/sub' }).success).toBe(false)
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, version: 5 }).success).toBe(false)
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, webBasePath: '' }).success).toBe(true)
    for (const value of ['/', '//host', '/a/', '/a/../b', '/a?x=1', '/a#b', '/a%2fb'])
      expect(DeploymentArtifactSchema.safeParse({ ...artifact, version: 5, webBasePath: value }).success).toBe(false)
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, primaryService: 'serv', hasWeb: false, webBasePath: '/yyy', images: [{ ...artifact.images[0], name: 'serv', file: 'serv-1.0.0.tar' }] }).success).toBe(false)
  })

  it.each([
    { primaryService: 'serv', hasWeb: false, names: ['serv'] },
    { primaryService: 'web', hasWeb: true, names: ['web'] },
    { primaryService: 'serv', hasWeb: true, names: ['serv', 'web'] },
  ])('完整与增量制品保留真实工程拓扑：$names', ({ primaryService, hasWeb, names }) => {
    const images = names.map(name => ({ name, file: `${name}-1.0.0.tar`, imageRef: `localhost/hai-shop-${name}:build-1`, sha256: 'a'.repeat(64) }))
    const artifact = { version: 4, primaryService, hasWeb, appVersion: '1.0.0', buildId: 'build-1', images }
    expect(DeploymentArtifactSchema.safeParse(artifact).success).toBe(true)
    for (const image of images)
      expect(DeploymentArtifactSchema.safeParse({ ...artifact, partial: true, images: [image] }).success).toBe(true)
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, images: images.filter(image => image.name !== primaryService) }).success).toBe(false)
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, version: 3 }).success).toBe(false)
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, images: [{ ...images[0], name: 'app', file: 'app-1.0.0.tar' }] }).success).toBe(false)
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, primaryService: 'web', hasWeb: false }).success).toBe(false)
  })

  it('项目名使用同一规则且不以通用名或目录名代替无效身份', () => {
    expect(normalizeProjectName('@example/Order_Portal')).toBe('order-portal')
    expect(normalizeProjectName('orders-serv')).toBe('orders-serv')
    for (const name of ['', ' ', '@@', '@example/'])
      expect(() => normalizeProjectName(name)).toThrow()
  })
})
