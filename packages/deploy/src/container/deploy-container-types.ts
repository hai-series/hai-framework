/**
 * @h-ai/deploy — 容器部署内部类型
 *
 * 定义 docker-ssh 等容器部署 Provider 的内部接口与编排上下文。
 * 这些类型不从包入口导出，避免把实现细节暴露给模块使用方。
 * @internal
 */

import type { HaiResult } from '@h-ai/core'
import type { DeploymentArtifact } from '../deploy-artifact.js'
import type { DeployAppOptions, DeployResult, ScanResult } from '../deploy-types.js'

/**
 * 本地/远程容器运行时
 * 实际探测选定的引擎，已排除 auto。
 * @example 模块内部上下文
 * ```ts
 * const runtime: ContainerRuntime = 'podman'
 * ```
 */
export type ContainerRuntime = 'docker' | 'podman'

/**
 * 容器部署编排上下文（由 main 准备后交给 Provider）
 * @example 模块内部上下文
 * ```ts
 * const { readDeploymentArtifact } = await import('../deploy-artifact.js')
 * const artifactDir = '.hai/build/docker/build-id'
 * const artifact = await readDeploymentArtifact(artifactDir)
 * const { scanApp } = await import('../deploy-scanner.js')
 * const scanned = await scanApp(process.cwd())
 * if (!scanned.success) throw new Error(scanned.error.message)
 * const context: ContainerDeployContext = { appDir: process.cwd(), artifact, artifactDir, projectName: 'shop', scan: scanned.data, provisionEnv: {}, options: { bundleOnly: true } }
 * ```
 */
export interface ContainerDeployContext {
  /** 应用根目录（读取配置与锁文件） */
  appDir: string
  /** 已校验的构建产物及其所在目录。 */
  artifact: DeploymentArtifact
  artifactDir: string
  /** 项目名（已归一化为 [a-z0-9-]） */
  projectName: string
  /** 应用扫描结果 */
  scan: ScanResult
  /** Provisioner 开通得到的环境变量（云资源，优先于自建 sidecar） */
  provisionEnv: Record<string, string>
  /** 已加载的应用环境，与云开通结果分开，避免误判已有配置为自动开通结果。 */
  appEnv?: Record<string, string>
  /** 环境标识及各中间件处理策略。 */
  options?: DeployAppOptions
}

/**
 * 容器部署 Provider 接口（docker-ssh 等）。
 *
 * 与面向 SaaS 平台的 `DeployProvider` 并列：容器 Provider 自行完成
 * 打包已有镜像 → 传输 → 远程 compose up → 健康检查的完整闭环。
 * @example 模块内部上下文
 * ```ts
 * const { createDockerSshProvider } = await import('../providers/deploy-provider-docker-ssh.js')
 * const provider: ContainerDeployProvider = createDockerSshProvider({ type: 'docker-ssh', remote: { baseDir: '/opt/hai/apps', runtime: 'auto' }, expose: { type: 'port', hostPort: 8080, containerPort: 3000 } })
 * const { readDeploymentArtifact } = await import('../deploy-artifact.js')
 * const artifactDir = '.hai/build/docker/build-id'
 * const artifact = await readDeploymentArtifact(artifactDir)
 * const { scanApp } = await import('../deploy-scanner.js')
 * const scanned = await scanApp(process.cwd())
 * if (!scanned.success) throw new Error(scanned.error.message)
 * const context: ContainerDeployContext = { appDir: process.cwd(), artifact, artifactDir, projectName: 'shop', scan: scanned.data, provisionEnv: {}, options: { bundleOnly: true } }
 * const result = await provider.deploy(context)
 * if (!result.success) throw new Error(result.error.message)
 * ```
 */
export interface ContainerDeployProvider {
  /** Provider 名称 */
  readonly name: string
  /** 执行完整容器部署（内部含 SSH 与运行时预检） */
  deploy: (context: ContainerDeployContext) => Promise<HaiResult<DeployResult>>
}
