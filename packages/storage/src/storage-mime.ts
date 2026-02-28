/**
 * =============================================================================
 * @h-ai/storage - MIME 类型映射
 * =============================================================================
 *
 * 集中维护文件扩展名到 MIME 类型的映射表。
 * 供 local provider 和 client 端共用，避免重复定义。
 *
 * @module storage-mime
 * =============================================================================
 */

/**
 * 文件扩展名 → MIME 类型映射表
 *
 * 键为小写扩展名（不含点号），值为标准 MIME 类型字符串。
 * 未匹配项统一回退到 `application/octet-stream`。
 */
export const MIME_TYPES: Record<string, string> = {
  // 图片
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',

  // 文档
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // 文本
  'txt': 'text/plain',
  'html': 'text/html',
  'css': 'text/css',
  'js': 'text/javascript',
  'json': 'application/json',
  'xml': 'application/xml',
  'csv': 'text/csv',
  'md': 'text/markdown',

  // 音视频
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'ogg': 'audio/ogg',

  // 压缩包
  'zip': 'application/zip',
  'rar': 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  'tar': 'application/x-tar',
  'gz': 'application/gzip',

  // 字体
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'ttf': 'font/ttf',
  'otf': 'font/otf',
}

/**
 * MIME 类型默认值（未知扩展名回退）
 */
export const MIME_TYPE_DEFAULT = 'application/octet-stream'
