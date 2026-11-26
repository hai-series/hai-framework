/** @h-ai/serv — AI 上传和输出文件的 MIME 与字节前缀校验。 */

import type { AudioContent, GeneratedImage, ReferenceImage } from '@h-ai/ai'

const imageExtensions = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
])

/**
 * 将 WAV/MP3 的字节前缀与上传的 MIME 对照。
 * @example 模块内部上下文
 * ```ts
 * const format = audioUploadFormat(new TextEncoder().encode('ID3'), 'audio/mpeg')
 * void format
 * ```
 */
export function audioUploadFormat(data: Uint8Array, mime: string): 'mp3' | 'wav' | undefined {
  if (mime === 'audio/wav' || mime === 'audio/x-wav') {
    return hasHeader(data, 'RIFF') && hasHeader(data, 'WAVE', 8)
      ? 'wav'
      : undefined
  }
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') {
    const frame = data[1]
    if (hasHeader(data, 'ID3') || (frame !== undefined && data[0] === 0xFF && (frame & 0xE0) === 0xE0))
      return 'mp3'
  }
  return undefined
}

/**
 * 暴露标准音频二进制，使用实际格式的 MIME 与固定名称。
 * @example 模块内部上下文
 * ```ts
 * const file = audioFile({ format: 'mp3', data: new TextEncoder().encode('ID3') })
 * void file?.name
 * ```
 */
export function audioFile(audio: AudioContent): File | undefined {
  const mime = audio.format === 'wav'
    ? 'audio/wav'
    : audio.format === 'mp3'
      ? 'audio/mpeg'
      : undefined
  if (!mime || !audioUploadFormat(audio.data, mime))
    return undefined
  return new File([
    Uint8Array.from(audio.data),
  ], `speech.${audio.format}`, { type: mime })
}

/**
 * 将受支持的参考图片转换成 SDK 输入，字节类型须与 MIME 相符。
 * @example 模块内部上下文
 * ```ts
 * const file = new File(['GIF89a'], 'reference.gif', { type: 'image/gif' })
 * const image = await referenceImage(file)
 * void image
 * ```
 */
export async function referenceImage(file: File): Promise<ReferenceImage | undefined> {
  const data = new Uint8Array(await file.arrayBuffer())
  return matchesImage(data, file.type)
    ? { data, mimeType: file.type }
    : undefined
}

/**
 * 暴露图像二进制，固定文件名避免泄露原文件名和 Provider 数据。
 * @example 模块内部上下文
 * ```ts
 * const file = imageFile({ mimeType: 'image/gif', data: new TextEncoder().encode('GIF89a') })
 * void file?.name
 * ```
 */
export function imageFile(image: GeneratedImage | undefined): File | undefined {
  if (!image)
    return undefined
  const extension = imageExtensions.get(image.mimeType)
  if (!extension || !matchesImage(image.data, image.mimeType))
    return undefined
  return new File([
    Uint8Array.from(image.data),
  ], `image.${extension}`, { type: image.mimeType })
}

function hasHeader(data: Uint8Array, header: string, offset = 0): boolean {
  return data.byteLength >= offset + header.length
    && [...header].every((char, index) => data[offset + index] === char.charCodeAt(0))
}

function matchesImage(data: Uint8Array, mime: string): boolean {
  switch (mime) {
    case 'image/png':
      return hasHeader(data, '\x89PNG\r\n\x1A\n')
    case 'image/jpeg':
      return hasHeader(data, '\xFF\xD8\xFF')
    case 'image/gif':
      return hasHeader(data, 'GIF87a') || hasHeader(data, 'GIF89a')
    case 'image/webp':
      return hasHeader(data, 'RIFF') && hasHeader(data, 'WEBP', 8)
    default:
      return false
  }
}
