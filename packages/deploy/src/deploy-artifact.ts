/** 已构建镜像的交付契约；构建器写入，部署器只校验和消费。 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

/**
 * 镜像制品清单，例如 `{ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: '1.2.3-build1', partial: false, hasWeb: false, images: [...] }`。
 * 根目录制品保留格式4；非根目录使用格式5，强制旧部署器拒绝而非静默忽略挂载路径。
 * 完整产物包含primaryService，hasWeb记录浏览器端拓扑；结构验证不能代替真实归档校验。
 * @example
 * ```ts
 * import { readFile } from 'node:fs/promises'
 * import { DeploymentArtifactSchema } from '@h-ai/deploy'
 * const content = await readFile('.hai/build/docker/build-id/manifest.json', 'utf8')
 * const parsed = DeploymentArtifactSchema.safeParse(JSON.parse(content))
 * if (!parsed.success) throw new Error('Invalid artifact manifest')
 * // Schema 只验证结构；文件路径与 SHA-256 核验使用 readDeploymentArtifact。
 * ```
 */
export const DeploymentArtifactSchema = z.object({
  /** 清单格式版本，与应用版本和部署环境无关。 */
  version: z.union([z.literal(4), z.literal(5)]),
  /** 主运行服务：独立后端为 serv，独立浏览器站点（静态或 SSR）为 web。 */
  primaryService: z.enum(['serv', 'web']),
  /** 应用根 package.json 的版本，用于归档、Compose 与桌面交付；最长 80 字符。 */
  appVersion: z.string().max(80).regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9a-z-]+(?:\.[0-9a-z-]+)*)?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i),
  /** 本次构建标识；同一应用版本允许重复构建。 */
  buildId: z.string().max(128).regex(/^[a-z0-9][\w.+-]*$/i),
  /** 只包含所选镜像的构建不能用于首次安装。 */
  partial: z.boolean().default(false),
  /** 是否包含浏览器端；仅构建 serv 时也保留完整工程的 Web 拓扑。 */
  hasWeb: z.boolean().default(false),
  /** Web构建的公开挂载目录，无末尾斜杠；省略或空字符串保持域名根目录。增量制品须保留完整拓扑的同一值。 */
  webBasePath: z.string().refine(value => value === '' || (/^\/[\w.-]+(?:\/[\w.-]+)*$/.test(value) && !value.split('/').some(segment => segment === '.' || segment === '..'))).optional(),
  /** 工程显式配置的后端端口，部分构建未包含 serv 时仍保留。 */
  servContainerPort: z.number().int().min(1).max(65535).optional(),
  /** 工程显式配置的 Web 端口，部分构建未包含 web 镜像时仍保留；缺省使用部署默认值。 */
  webContainerPort: z.number().int().min(1).max(65535).optional(),
  /** 本次构建选择的镜像归档。 */
  images: z.array(z.object({
    /** serv 为独立 API 后端，web 为浏览器站点（静态或 SSR）。 */
    name: z.enum(['serv', 'web']),
    /** 相对于清单目录的 tar 文件名。 */
    file: z.string().regex(/^[\w.+-]+\.tar$/),
    /** 归档导入后可直接使用的不可变镜像引用。 */
    imageRef: z.string().regex(/^[a-z0-9][a-z0-9./:_-]*:[a-z0-9_][a-z0-9_.-]*$/).refine(value => !value.endsWith(':latest')),
    /** tar 内容的 SHA-256，用于部署前校验。 */
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    /** 容器内部监听端口；服务器公开端口由部署选择。 */
    containerPort: z.number().int().min(1).max(65535).optional(),
  })).min(1).max(2).refine(images => new Set(images.map(image => image.name)).size === images.length),
}).refine(artifact => artifact.version === 5 ? !!artifact.webBasePath : !artifact.webBasePath).refine(artifact => !artifact.webBasePath || artifact.hasWeb).refine(artifact => artifact.images.every(image => image.file === `${image.name}-${artifact.appVersion}.tar`)).refine(artifact => artifact.primaryService !== 'web' || artifact.hasWeb).refine(artifact => artifact.images.every(image => image.name === artifact.primaryService || (image.name === 'web' && artifact.hasWeb))).refine(artifact => artifact.partial || artifact.images.some(image => image.name === artifact.primaryService)).refine(artifact => artifact.partial || !artifact.hasWeb || artifact.images.some(image => image.name === 'web'))

/**
 * 构建器与部署器共享的镜像交付结构；参见 DeploymentArtifactSchema 示例。
 * @example
 * ```ts
 * import type { DeploymentArtifact } from '@h-ai/deploy'
 * import { readDeploymentArtifact } from '@h-ai/deploy'
 * const directory = '.hai/build/docker/build-id'
 * const artifact = await readDeploymentArtifact(directory)
 * const verified: DeploymentArtifact = artifact
 * const references = verified.images.map(image => image.imageRef)
 * ```
 */
export type DeploymentArtifact = z.infer<typeof DeploymentArtifactSchema>

/**
 * 流式计算制品校验和，避免将大镜像一次性读入内存。
 * @throws Error - 文件读取失败；返回真实 tar 内容的 SHA-256，不校验清单其它字段。
 * @param file - 真实镜像归档文件路径。
 * @returns 文件内容的 SHA-256 十六进制摘要。
 * @example
 * ```ts
 * import { artifactChecksum } from '@h-ai/deploy'
 * const digest = await artifactChecksum('.hai/build/docker/build-id/serv-1.0.0.tar')
 * ```
 */
export async function artifactChecksum(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file))
    hash.update(chunk)
  return hash.digest('hex')
}

/**
 * 校验完整构建产物；缺失、损坏或非法清单均抛错，由部署边界转换为 HaiResult。
 * @throws Error - 清单、路径、镜像 tar 或摘要校验失败；不能用未验证的清单绕过本函数。
 * @param directory - 包含已准备制品或部署文件的目录；具体见函数用途。
 * @returns 已经验证的构建制品清单。
 * @example
 * ```ts
 * import { readDeploymentArtifact } from '@h-ai/deploy'
 * const directory = '.hai/build/docker/build-id'
 * const artifact = await readDeploymentArtifact(directory)
 * const images = artifact.images.map(image => ({ name: image.name, imageRef: image.imageRef }))
 * ```
 */
export async function readDeploymentArtifact(directory: string): Promise<DeploymentArtifact> {
  const artifact = DeploymentArtifactSchema.parse(JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8')))
  for (const image of artifact.images) {
    const file = resolve(directory, image.file)
    if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() || await artifactChecksum(file) !== image.sha256)
      throw new Error(`Invalid artifact: ${image.file}`)
  }
  return artifact
}
