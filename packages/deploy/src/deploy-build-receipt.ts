import type { HaiResult } from '@h-ai/core'
import type { DeploymentArtifact } from './deploy-artifact.js'
import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { DeploymentArtifactSchema, readDeploymentArtifact } from './deploy-artifact.js'
import { normalizeProjectName } from './deploy-functions.js'
import { deployM } from './deploy-i18n.js'
import { HaiDeployError } from './deploy-types.js'

const receiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  artifactDir: z.string(),
  manifestPath: z.string(),
  manifest: DeploymentArtifactSchema,
})

/**
 * CLI 镜像构建的单行 JSON 回执。清单版本独立于回执版本。
 * @example
 * ```ts
 * import type { BuildReceipt } from '@h-ai/deploy'
 * function getBuildId(receipt: BuildReceipt): string {
 *   return receipt.manifest.buildId
 * }
 * ```
 */
export type BuildReceipt = z.infer<typeof receiptSchema>

/**
 * 调用方从可信工程或构建请求取得的预期身份；可按任务限制完整性和来源。
 * @example
 * ```ts
 * import type { BuildReceiptExpectation } from '@h-ai/deploy'
 * const expected: BuildReceiptExpectation = {
 *   projectDir: '/workspace/shop', projectName: '@demo/shop', complete: true,
 *   imageRoles: ['serv', 'web'], platform: 'linux/amd64', cleanSource: true,
 * }
 * ```
 */
export interface BuildReceiptExpectation {
  projectDir: string
  projectName: string
  appVersion?: string
  sourceCommit?: string
  cleanSource?: boolean
  platform?: string
  imageRoles?: readonly DeploymentArtifact['images'][number]['name'][]
  complete?: boolean
  signal?: AbortSignal
  /** 完成路径与身份校验后登记镜像，便于后续文件校验失败时清理本批输出。 */
  onIdentified?: (receipt: BuildReceipt) => boolean | void | Promise<boolean | void>
}

const invalidReceipt = () => core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))

/**
 * 根据工程根和已构建清单产生 CLI v1 回执及目标路径。
 * @example 模块内部上下文
 * ```ts
 * function outputPath(manifest: DeploymentArtifact): string {
 *   const receipt = buildReceipt('/workspace/shop', 'shop', manifest)
 *   if (!receipt.success) throw new Error(receipt.error.message)
 *   return receipt.data.artifactDir
 * }
 * ```
 */
export function buildReceipt(projectDir: string, projectName: string, manifest: DeploymentArtifact): HaiResult<BuildReceipt> {
  try {
    const artifactDir = resolve(projectDir, '.hai', 'build', 'docker', `build-${normalizeProjectName(projectName)}-image-${manifest.buildId}`)
    const parsed = receiptSchema.safeParse({
      schemaVersion: 1,
      artifactDir,
      manifestPath: join(artifactDir, 'manifest.json'),
      manifest,
    })
    return parsed.success
      ? core.ok(parsed.data)
      : invalidReceipt()
  }
  catch {
    return invalidReceipt()
  }
}

/**
 * 校验单行回执、可信构建根、文件身份和镜像 tar SHA-256。
 * @example 模块内部上下文
 * ```ts
 * async function identify(output: string, input: BuildReceiptExpectation): Promise<string | undefined> {
 *   const receipt = await verifyBuildReceipt(output, input)
 *   return receipt.success ? receipt.data.manifest.buildId : undefined
 * }
 * ```
 */
export async function verifyBuildReceipt(stdout: string, expected: BuildReceiptExpectation): Promise<HaiResult<BuildReceipt>> {
  try {
    const line = stdout.replace(/\r?\n$/, '')
    if (line.length > 65_536 || /[\r\n]/.test(line) || !isAbsolute(expected.projectDir))
      return invalidReceipt()
    const receipt = receiptSchema.parse(JSON.parse(line))
    const { manifest, artifactDir, manifestPath } = receipt
    const canonical = buildReceipt(expected.projectDir, expected.projectName, manifest)
    if (!canonical.success)
      return canonical
    const project = normalizeProjectName(expected.projectName)
    const tag = manifest.buildId.toLowerCase().replaceAll('+', '_')
    if (artifactDir !== canonical.data.artifactDir || manifestPath !== canonical.data.manifestPath
      || !/^\d{8}-\d{6}-[a-f\d]{6}-[\da-z][\w.+-]*$/i.test(manifest.buildId)
      || !manifest.buildId.endsWith(`-${manifest.appVersion}`)
      || (expected.appVersion !== undefined && expected.appVersion !== manifest.appVersion)
      || (expected.complete && manifest.partial)
      || (expected.imageRoles && (new Set(expected.imageRoles).size !== manifest.images.length
        || !manifest.images.every(image => expected.imageRoles?.includes(image.name))))
      || manifest.images.some(image => image.imageRef !== `localhost/hai-${project}-${image.name}:${tag}`)) {
      return invalidReceipt()
    }
    if (await expected.onIdentified?.(receipt) === false)
      return invalidReceipt()
    expected.signal?.throwIfAborted()
    if ((expected.sourceCommit !== undefined && expected.sourceCommit !== manifest.source?.commit)
      || (expected.cleanSource && manifest.source?.dirty !== false)
      || (expected.platform !== undefined && manifest.images.some(image => image.platform !== expected.platform))) {
      return invalidReceipt()
    }
    if (await realpath(artifactDir) !== artifactDir || !(await lstat(manifestPath)).isFile())
      return invalidReceipt()
    const saved = await readDeploymentArtifact(artifactDir, expected.signal)
    return isDeepStrictEqual(saved, manifest)
      ? core.ok(receipt)
      : invalidReceipt()
  }
  catch {
    return invalidReceipt()
  }
}
