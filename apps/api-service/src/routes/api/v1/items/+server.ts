import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'

/** 内存中的示例数据存储 */
interface Item {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

const items: Map<string, Item> = new Map()

let idCounter = 0

function nextId(): string {
  return String(++idCounter)
}

/**
 * 获取所有 items
 */
export const GET: RequestHandler = async ({ url }) => {
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '20')

  const allItems = Array.from(items.values())
  const start = (page - 1) * pageSize
  const data = allItems.slice(start, start + pageSize)

  return json({
    data,
    total: allItems.length,
    page,
    pageSize
  })
}

/**
 * 创建 item
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()

  if (!body.name || typeof body.name !== 'string') {
    return json({ error: 'name is required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const item: Item = {
    id: nextId(),
    name: body.name,
    description: body.description ?? '',
    createdAt: now,
    updatedAt: now
  }

  items.set(item.id, item)

  return json({ data: item }, { status: 201 })
}
