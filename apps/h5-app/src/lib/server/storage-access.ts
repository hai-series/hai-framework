/** H5 上传和识图共用的私有图片键；旧无归属键不推测所属用户。 */
export function ownedImageKey(userId: string, kind: 'uploads' | 'vision', filename: string): string {
  return `${kind}/${encodeURIComponent(userId)}/${filename}`
}

/** 只接受当前身份命名空间内的规范图片名，拒绝私有目录及 Windows 路径别名。 */
export function canReadOwnedImage(userId: string, key: string): boolean {
  const [kind, owner, filename, extra] = key.split('/')
  return (kind === 'uploads' || kind === 'vision')
    && owner === encodeURIComponent(userId)
    && owner !== '.' && owner !== '..'
    && extra === undefined
    && /^[\w-]+\.(?:png|jpe?g|webp)$/.test(filename ?? '')
}

/** 私有图片始终经同源授权端点读取，不签发绕过当前会话的公开地址。 */
export function ownedImageUrl(key: string): string {
  return `/api/upload/${key.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
}
