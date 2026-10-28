import { readFile } from 'node:fs/promises'
import { getNavigation } from '$lib/server/docs.js'

/** 只提供人工维护的公开导航；不向静态页面序列化服务端配置。 */
export async function load() {
  const manifest = JSON.parse(await readFile('../../package.json', 'utf8')) as { version: string }
  return { navigation: await getNavigation(), version: manifest.version }
}
