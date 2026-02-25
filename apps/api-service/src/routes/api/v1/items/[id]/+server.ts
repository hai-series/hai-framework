import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'

/**
 * 获取单个 item
 */
export const GET: RequestHandler = async ({ params }) => {
  const id = params.id
  // 在实际项目中应通过数据库查询
  return json({ data: { id, name: `Item ${id}`, description: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } })
}

/**
 * 更新 item
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const id = params.id
  const body = await request.json()
  const now = new Date().toISOString()

  return json({
    data: {
      id,
      name: body.name ?? `Item ${id}`,
      description: body.description ?? '',
      updatedAt: now,
    },
  })
}

/**
 * 删除 item
 */
export const DELETE: RequestHandler = async ({ params }) => {
  const id = params.id
  // 在实际项目中应通过数据库删除
  return json({ data: { id, deleted: true } })
}
