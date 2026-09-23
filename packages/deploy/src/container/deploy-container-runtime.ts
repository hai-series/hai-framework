/**
 * @h-ai/deploy — 本地容器运行时
 *
 * 探测本地 docker / podman，构建镜像并导出为 tar 制品。
 * @module deploy-container-runtime
 */

import type { HaiResult } from '@h-ai/core'
import type { ContainerRuntime } from './deploy-container-types.js'
import { core, err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'
import { runCommand } from './deploy-command.js'

const logger = core.logger.child({ module: 'deploy', scope: 'container-runtime' })

/**
 * 探测本地容器运行时。
 *
 * `auto` 时优先 podman，其次 docker；指定引擎时校验其可用性。
 * 用 `version`（而非 `--version`）探测：同时确认命令存在与引擎/机器可达，
 * 避免选中“已装 CLI 但未启动”的运行时。
 *
 * @param preferred - 期望引擎（auto / docker / podman）
 * @returns 可用的容器运行时
 */
export async function detectLocalRuntime(
  preferred: 'auto' | ContainerRuntime = 'auto',
): Promise<HaiResult<ContainerRuntime>> {
  const candidates: ContainerRuntime[] = preferred === 'auto'
    ? ['podman', 'docker']
    : [preferred]

  for (const runtime of candidates) {
    const probe = await runCommand(runtime, ['version'], { timeoutMs: 15_000 })
    if (probe.success) {
      logger.info('Local container runtime detected', { runtime })
      return ok(runtime)
    }
  }

  return err(
    HaiDeployError.CONTAINER_RUNTIME_NOT_FOUND,
    deployM('deploy_containerRuntimeNotFound', { params: { runtime: candidates.join(' / ') } }),
  )
}

/**
 * 构建应用镜像。
 *
 * podman 多阶段构建追加 `--format docker --jobs=1`，保留 HEALTHCHECK 并规避并行阶段的信号量 panic。
 *
 * @param runtime - 容器运行时
 * @param options - 构建参数
 * @param options.contextDir - 构建上下文目录
 * @param options.dockerfilePath - Dockerfile 路径
 * @param options.imageRef - 镜像引用
 * @returns 构建结果
 */
export async function buildImage(
  runtime: ContainerRuntime,
  options: { contextDir: string, dockerfilePath: string, imageRef: string },
): Promise<HaiResult<void>> {
  const args = ['build', '-f', options.dockerfilePath, '-t', options.imageRef]
  if (runtime === 'podman')
    args.push('--format', 'docker', '--jobs', '1')
  args.push(options.contextDir)

  logger.info('Building container image', { runtime, imageRef: options.imageRef })
  const result = await runCommand(runtime, args, { cwd: options.contextDir })
  if (!result.success) {
    return err(
      HaiDeployError.CONTAINER_BUILD_FAILED,
      deployM('deploy_containerBuildFailed', { params: { error: result.error.message } }),
      result.error,
    )
  }
  return ok(undefined)
}

/**
 * 将镜像导出为 tar 制品。
 *
 * @param runtime - 容器运行时
 * @param imageRef - 镜像引用
 * @param tarPath - 输出 tar 路径
 * @returns 导出结果
 */
export async function saveImage(
  runtime: ContainerRuntime,
  imageRef: string,
  tarPath: string,
): Promise<HaiResult<void>> {
  logger.info('Saving container image', { runtime, imageRef, tarPath })
  const result = await runCommand(runtime, ['save', '-o', tarPath, imageRef], {})
  if (!result.success) {
    return err(
      HaiDeployError.CONTAINER_BUILD_FAILED,
      deployM('deploy_containerBuildFailed', { params: { error: result.error.message } }),
      result.error,
    )
  }
  return ok(undefined)
}
