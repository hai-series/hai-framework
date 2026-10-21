/** 已构建镜像的交付契约；构建器写入，部署器只校验和消费。 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

/** 镜像制品清单，例如 `{ version: 1, buildId: '...', images: [{ name: 'app', file: 'app.tar', imageRef: 'localhost/demo:1', sha256: '...' }] }`。 */
export const DeploymentArtifactSchema = z.object({
  /** 清单格式版本，与应用版本和部署环境无关。 */
  version: z.literal(1),
  /** 一次完整构建的标识，app/web 必须来自同一份清单。 */
  buildId: z.string().regex(/^[\w-]+$/),
  /** API/独立应用和可选 Web 的镜像归档，至少包含一个 app。 */
  images: z.array(z.object({
    /** app 为服务或独立应用，web 为同源 API 代理的静态前端。 */
    name: z.enum(['app', 'web']),
    /** 相对于清单目录的 tar 文件名。 */
    file: z.string().regex(/^[\w-]+\.tar$/),
    /** 归档导入后可直接使用的不可变镜像引用。 */
    imageRef: z.string().regex(/^[a-z0-9][a-z0-9./:_-]+$/),
    /** tar 内容的 SHA-256，用于部署前校验。 */
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    /** 容器内部监听端口；服务器公开端口由部署选择。 */
    containerPort: z.number().int().min(1).max(65535).optional(),
  })).min(1).max(2).refine(images => images.filter(image => image.name === 'app').length === 1 && new Set(images.map(image => image.name)).size === images.length),
})

/** 构建器与部署器共享的镜像交付结构；参见 DeploymentArtifactSchema 示例。 */
export type DeploymentArtifact = z.infer<typeof DeploymentArtifactSchema>

/**
 * 流式计算制品校验和，避免将大镜像一次性读入内存。
 * @example `const checksum = await artifactChecksum("/release/app.tar")`
 */
export async function artifactChecksum(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file))
    hash.update(chunk)
  return hash.digest('hex')
}

/**
 * 校验完整构建产物；缺失、损坏或非法清单均抛错，由部署边界转换为 HaiResult。
 * @example `const artifact = await readDeploymentArtifact("/release/build-1")`
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
