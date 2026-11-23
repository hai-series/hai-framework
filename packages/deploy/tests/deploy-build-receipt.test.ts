import type { DeploymentArtifact } from '../src/index.js'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { deploy } from '../src/index.js'

const version = '1.0.0'
const buildId = `20261122-101010-a1b2c3-${version}`
const commit = 'f'.repeat(40)
const file = `serv-${version}.tar`
let projectDir: string

beforeEach(async () => {
  projectDir = await mkdtemp(join(await realpath(tmpdir()), 'hai-cli-receipt-'))
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

async function create(partial = false) {
  const input = join(projectDir, 'image.tar')
  await writeFile(input, 'archived image bytes')
  const manifest: DeploymentArtifact = {
    version: 5,
    webBasePath: '',
    primaryService: 'serv',
    appVersion: version,
    buildId,
    source: { commit, dirty: false },
    partial,
    hasWeb: false,
    images: [
      {
        name: 'serv',
        file,
        imageRef: `localhost/hai-shop-serv:${buildId}`,
        sha256: await deploy.artifactChecksum(input),
        platform: 'linux/amd64',
      },
    ],
  }
  const result = deploy.buildReceipt(projectDir, '@demo/shop', manifest)
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.message)
  const receipt = result.data
  await mkdir(receipt.artifactDir, { recursive: true })
  await writeFile(receipt.manifestPath, JSON.stringify(manifest))
  await writeFile(join(receipt.artifactDir, file), 'archived image bytes')
  return receipt
}

it('读取兼容的 v1 单行回执，并同时校验 v5 清单、Git 来源、所选角色与真实归档', async () => {
  const receipt = await create()
  expect(receipt.schemaVersion).toBe(1)
  expect(receipt.manifest.version).toBe(5)
  const json = JSON.stringify(receipt)
  const expected = {
    projectDir,
    projectName: 'shop',
    sourceCommit: commit,
    cleanSource: true,
    platform: 'linux/amd64',
    imageRoles: ['serv'] as const,
  }
  expect(await deploy.verifyBuildReceipt(`${json}\n`, expected)).toEqual({ success: true, data: receipt })
  expect(await deploy.verifyBuildReceipt(json, {
    ...expected,
    sourceCommit: '0'.repeat(40),
  })).toMatchObject({ success: false })
  expect(await deploy.verifyBuildReceipt(json, { ...expected, platform: 'linux/arm64' })).toMatchObject({ success: false })
  expect(await deploy.verifyBuildReceipt(json, {
    ...expected,
    imageRoles: ['web'],
  })).toMatchObject({ success: false })
  expect(await deploy.verifyBuildReceipt(`progress\n${json}`, expected)).toMatchObject({ success: false })
  await writeFile(join(receipt.artifactDir, file), 'different archive')
  expect(await deploy.verifyBuildReceipt(json, expected)).toMatchObject({ success: false })
})

it('保留部分构建，并拒绝软链接清单；归档校验前允许调用方取消', async () => {
  const receipt = await create(true)
  const json = JSON.stringify(receipt)
  const expected = { projectDir, projectName: 'shop' }
  expect(await deploy.verifyBuildReceipt(json, expected)).toMatchObject({ success: true })
  expect(await deploy.verifyBuildReceipt(json, { ...expected, complete: true })).toMatchObject({ success: false })
  const onIdentified = vi.fn().mockResolvedValue(false)
  expect(await deploy.verifyBuildReceipt(json, { ...expected, onIdentified })).toMatchObject({ success: false })
  expect(onIdentified).toHaveBeenCalledWith(receipt)
  const manifestOutside = join(projectDir, 'outside.json')
  await writeFile(manifestOutside, JSON.stringify(receipt.manifest))
  await rm(receipt.manifestPath)
  await symlink(manifestOutside, receipt.manifestPath)
  expect(await deploy.verifyBuildReceipt(json, expected)).toMatchObject({ success: false })
})
