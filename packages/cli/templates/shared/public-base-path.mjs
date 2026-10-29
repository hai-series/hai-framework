/** 公开的网站挂载目录；只读取显式构建值，不加载私有环境文件。 */
import process from 'node:process'
import { core } from '@h-ai/core'

const basePathMessage = core.i18n.createMessageGetter({
  'zh-CN': { invalid: 'PUBLIC_BASE_PATH须为空或以/开头的站内目录；不允许外部地址、末尾/、查询、片段或路径逃逸。' },
  'en-US': { invalid: 'PUBLIC_BASE_PATH must be empty or a site-local directory beginning with /. External URLs, trailing /, queries, fragments and path traversal are not allowed.' },
  'ja-JP': { invalid: 'PUBLIC_BASE_PATHは空、または/で始まるサイト内ディレクトリーです。外部URL、末尾の/、クエリー、フラグメント、パス逸脱は使えません。' },
})

/** @param {string} [value] - 无末尾斜杠的公开目录；空字符串表示域名根目录。 */
export function resolvePublicBasePath(value = process.env.PUBLIC_BASE_PATH ?? '') {
  if (value && (!/^\/[\w.-]+(?:\/[\w.-]+)*$/.test(value) || value.split('/').some(segment => segment === '.' || segment === '..'))) {
    const language = [process.env.HAI_CORE_DEFAULTLOCALE, process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG].find(item => item?.trim())?.split(/[_.-]/)[0]?.toLowerCase()
    const locale = language === 'en' || language === 'c' || language === 'posix' ? 'en-US' : language === 'ja' ? 'ja-JP' : 'zh-CN'
    throw new Error(basePathMessage('invalid', { locale }))
  }
  return value
}
