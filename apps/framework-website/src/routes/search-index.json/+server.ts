import { resolve } from '$app/paths'
import { searchIndex } from '#lib/server/docs.js'

// Vite 配置固定 paths.relative=false，HTTP 前缀不会随 SSR 页面深度改变。
const base = resolve('/').replace(/\/$/, '')

export const prerender = true
export async function GET() {
  return Response.json(await searchIndex(base))
}
