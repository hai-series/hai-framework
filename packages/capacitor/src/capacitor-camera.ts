/**
 * @h-ai/capacitor — 相机 / 相册
 *
 * 封装 `@capacitor/camera` 插件，提供拍照与相册选择能力。
 *
 * @module capacitor-camera
 */

import type { Result } from '@h-ai/core'
import type { CapacitorError, PhotoOptions, PhotoResult } from './capacitor-types.js'
import { err, ok } from '@h-ai/core'
import { CapacitorErrorCode } from './capacitor-config.js'
import { capacitorM } from './capacitor-i18n.js'

/** 照片来源映射（内部使用） */
const SOURCE_MAP = {
  camera: 'Camera',
  photos: 'Photos',
  prompt: 'Prompt',
} as const

/** 结果类型映射（内部使用） */
const RESULT_TYPE_MAP = {
  uri: 'Uri',
  base64: 'Base64',
  dataUrl: 'DataUrl',
} as const

/**
 * 拍照或选取相册图片
 *
 * 需要安装 `@capacitor/camera` 插件。
 *
 * @param options - 照片选项
 * @returns 照片结果
 *
 * @example
 * ```ts
 * import { takePhoto } from '@h-ai/capacitor'
 *
 * const result = await takePhoto({ source: 'camera', quality: 80 })
 * if (result.success) {
 *   imageUrl = result.data.data
 * }
 * ```
 */
export async function takePhoto(options?: PhotoOptions): Promise<Result<PhotoResult, CapacitorError>> {
  try {
    const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera')

    const source = options?.source ?? 'prompt'
    const resultType = options?.resultType ?? 'uri'

    const photo = await Camera.getPhoto({
      quality: options?.quality ?? 90,
      source: CameraSource[SOURCE_MAP[source] as keyof typeof CameraSource],
      resultType: CameraResultType[RESULT_TYPE_MAP[resultType] as keyof typeof CameraResultType],
      width: options?.width,
      height: options?.height,
    })

    // 根据 resultType 返回对应数据
    let data: string
    if (resultType === 'base64') {
      data = photo.base64String ?? ''
    }
    else if (resultType === 'dataUrl') {
      data = photo.dataUrl ?? ''
    }
    else {
      data = photo.webPath ?? ''
    }

    return ok({
      data,
      format: photo.format,
    })
  }
  catch (cause) {
    return err({
      code: CapacitorErrorCode.CAMERA_FAILED,
      message: capacitorM('capacitor_cameraFailed'),
      cause,
    })
  }
}
