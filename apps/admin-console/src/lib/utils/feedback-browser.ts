/** 二进制展示只使用本地 Blob URL，不向组件暴露存储凭据。 */
export function feedbackBlobUrl(bytes: Uint8Array, contentType: string): string {
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: contentType }))
}

export function feedbackBase64Bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0))
}

export function feedbackApiBaseUrl(): string {
  return `${location.origin}/api`
}

export async function feedbackImageSize(bytes: Uint8Array, contentType: string) {
  const image = new Image()
  const url = feedbackBlobUrl(bytes, contentType)
  try {
    image.src = url
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

export function downloadFeedbackBytes(name: string, bytes: Uint8Array, contentType = 'application/zip'): void {
  const url = feedbackBlobUrl(bytes, contentType)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
