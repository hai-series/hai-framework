/**
 * @h-ai/ai — 文生图公共类型
 *
 * 公共契约只暴露业务需要的提示词、尺寸和标准化图片字节。
 * 厂商请求字段、临时 URL 与响应中间态由 Provider 内部处理。
 * @module image/ai-image-types
 */

import type { HaiResult } from '@h-ai/core'

/** 图片像素尺寸 */
export interface ImageSize {
  /** 宽度（像素） */
  width: number
  /** 高度（像素） */
  height: number
}

/** 可选参考图；Provider 会转换为对应厂商的传输格式 */
export interface ReferenceImage {
  /** 图片二进制内容 */
  data: Uint8Array
  /** 图片 MIME 类型，例如 `image/png`、`image/jpeg` */
  mimeType: string
}

/** 文生图请求 */
export interface GenerateImageRequest {
  /** 图片内容与风格提示词 */
  prompt: string
  /** 模型 ID；不传时使用配置中的默认文生图模型 */
  model?: string
  /** 输出像素尺寸；不传时由模型决定 */
  size?: ImageSize
  /** 用于图生图、编辑或风格参考的一张或多张图片 */
  referenceImages?: ReferenceImage[]
  /** 请求取消信号 */
  signal?: AbortSignal
}

/** 标准化后的单张图片 */
export interface GeneratedImage {
  /** 图片二进制内容 */
  data: Uint8Array
  /** 图片 MIME 类型 */
  mimeType: string
  /** 实际宽度（厂商返回时提供） */
  width?: number
  /** 实际高度（厂商返回时提供） */
  height?: number
}

/** 文生图结果 */
export interface GenerateImageResult {
  /** 厂商实际返回的图片；通常为一张 */
  images: GeneratedImage[]
}

/** 文生图操作接口（通过 `ai.image` 访问） */
export interface ImageOperations {
  /** 根据文本提示生成图片 */
  generate: (request: GenerateImageRequest) => Promise<HaiResult<GenerateImageResult>>
}
