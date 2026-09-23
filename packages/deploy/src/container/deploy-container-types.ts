/**
 * @h-ai/deploy — 容器部署内部类型
 *
 * 定义 docker-ssh 等容器部署 Provider 的内部接口与编排上下文。
 * 这些类型不从包入口导出，避免把实现细节暴露给模块使用方。
 * @internal
 */

import type { HaiResult } from '@h-ai/core'
import type { DeployResult, ScanResult } from '../deploy-types.js'

/** 本地/远程容器运行时 */
export type ContainerRuntime = 'docker' | 'podman'

/** 容器部署编排上下文（由 main 准备后交给 Provider） */
export interface ContainerDeployContext {
  /** 应用根目录（同时作为镜像构建上下文） */
  appDir: string
  /** 项目名（已归一化为 [a-z0-9-]） */
  projectName: string
  /** 应用扫描结果 */
  scan: ScanResult
  /** Provisioner 开通得到的环境变量（云资源，优先于自建 sidecar） */
  provisionEnv: Record<string, string>
}

/**
 * 容器部署 Provider 接口（docker-ssh 等）。
 *
 * 与面向 SaaS 平台的 `DeployProvider` 并列：容器 Provider 自行完成
 * 构建镜像 → 传输 → 远程 compose up → 健康检查的完整闭环。
 */
export interface ContainerDeployProvider {
  /** Provider 名称 */
  readonly name: string
  /** 执行完整容器部署（内部含 SSH 与运行时预检） */
  deploy: (context: ContainerDeployContext) => Promise<HaiResult<DeployResult>>
}
