/**
 * =============================================================================
 * @hai/storage - MIME 类型工具
 * =============================================================================
 * 简单的 MIME 类型查找
 * =============================================================================
 */

/**
 * MIME 类型映射
 */
const MIME_TYPES: Record<string, string> = {
  // 文本
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.xml': 'text/xml',
  
  // JavaScript/TypeScript
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.cjs': 'application/javascript',
  '.ts': 'application/typescript',
  '.mts': 'application/typescript',
  '.cts': 'application/typescript',
  '.jsx': 'text/jsx',
  '.tsx': 'text/tsx',
  
  // JSON/YAML
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  
  // 图片
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  
  // 音频
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  
  // 视频
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  
  // 文档
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // 压缩
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  
  // 字体
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  
  // 其他
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.md': 'text/markdown',
  '.mdx': 'text/mdx',
}

/**
 * 根据文件路径查找 MIME 类型
 * 
 * @param path - 文件路径
 * @returns MIME 类型
 */
export function lookup(path: string): string {
  const ext = getExtension(path)
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

/**
 * 获取文件扩展名
 * 
 * @param path - 文件路径
 * @returns 扩展名（包含点号）
 */
function getExtension(path: string): string {
  const lastDot = path.lastIndexOf('.')
  if (lastDot === -1 || lastDot === path.length - 1) {
    return ''
  }
  return path.slice(lastDot).toLowerCase()
}

/**
 * 根据 MIME 类型获取扩展名
 * 
 * @param mimeType - MIME 类型
 * @returns 扩展名（包含点号），未找到返回空字符串
 */
export function extension(mimeType: string): string {
  for (const [ext, mime] of Object.entries(MIME_TYPES)) {
    if (mime === mimeType) {
      return ext
    }
  }
  return ''
}
