import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import capacitorConfig from '../capacitor.config.js'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')

async function readPackageJson() {
  const raw = await readFile(resolve(appRoot, 'package.json'), 'utf8')
  return JSON.parse(raw) as {
    name: string
    scripts: Record<string, string>
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
}

describe('mobile app configuration', () => {
  it('uses the mobile-app package name', async () => {
    const pkg = await readPackageJson()
    expect(pkg.name).toBe('mobile-app')
  })

  it('depends on api-service contract and api-client', async () => {
    const pkg = await readPackageJson()
    expect(pkg.dependencies['@h-ai/api-client']).toBe('workspace:*')
    expect(pkg.dependencies['@h-ai/api-service-contract']).toBe('workspace:*')
  })

  it('defines Android and iOS Capacitor scripts', async () => {
    const pkg = await readPackageJson()
    expect(pkg.scripts['cap:build:android:release']).toContain('cap sync android')
    expect(pkg.scripts['cap:build:android:release']).toContain('cap build android')
    expect(pkg.scripts['cap:sync:ios']).toContain('cap sync ios')
    expect(pkg.scripts['cap:build:ios']).toContain('cap build ios')
    expect(pkg.devDependencies['@capacitor/android']).toBe('catalog:')
    expect(pkg.devDependencies['@capacitor/ios']).toBe('catalog:')
  })

  it('uses the mobile Capacitor app identity', () => {
    expect(capacitorConfig.appId).toBe('com.hai.mobile.app')
    expect(capacitorConfig.appName).toBe('hai Mobile App')
    expect(capacitorConfig.webDir).toBe('build')
  })
})
