import { expect, test } from '@playwright/test'

interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  error?: {
    code?: string
    message?: string
  }
}

test.describe('Items API CRUD', () => {
  test('create, list, get, update, delete item', async ({ request }) => {
    const uniqueName = `e2e-item-${Date.now()}`

    const createResponse = await request.post('/api/v1/items', {
      data: {
        name: uniqueName,
        description: 'created by playwright e2e',
      },
    })
    expect(createResponse.ok()).toBeTruthy()

    const createBody = await createResponse.json() as ApiResponse<{
      id: string
      name: string
      description: string
      status: string
    }>
    expect(createBody.success).toBe(true)
    expect(createBody.data.id).toBeTruthy()
    expect(createBody.data.name).toBe(uniqueName)

    const itemId = createBody.data.id

    const listResponse = await request.get('/api/v1/items?page=1&pageSize=20')
    expect(listResponse.ok()).toBeTruthy()
    const listBody = await listResponse.json() as ApiResponse<{
      items: Array<{ id: string }>
      total: number
    }>
    expect(listBody.success).toBe(true)
    expect(Array.isArray(listBody.data.items)).toBe(true)
    expect(listBody.data.items.some(item => item.id === itemId)).toBe(true)

    const getResponse = await request.get(`/api/v1/items/${itemId}`)
    expect(getResponse.ok()).toBeTruthy()
    const getBody = await getResponse.json() as ApiResponse<{ id: string, name: string }>
    expect(getBody.success).toBe(true)
    expect(getBody.data.id).toBe(itemId)
    expect(getBody.data.name).toBe(uniqueName)

    const updateResponse = await request.put(`/api/v1/items/${itemId}`, {
      data: {
        status: 'archived',
        description: 'updated by playwright e2e',
      },
    })
    expect(updateResponse.ok()).toBeTruthy()
    const updateBody = await updateResponse.json() as ApiResponse<{ status: string, description: string }>
    expect(updateBody.success).toBe(true)
    expect(updateBody.data.status).toBe('archived')
    expect(updateBody.data.description).toBe('updated by playwright e2e')

    const deleteResponse = await request.delete(`/api/v1/items/${itemId}`)
    expect(deleteResponse.ok()).toBeTruthy()
    const deleteBody = await deleteResponse.json() as ApiResponse<{ deleted: boolean }>
    expect(deleteBody.success).toBe(true)
    expect(deleteBody.data.deleted).toBe(true)

    const afterDeleteResponse = await request.get(`/api/v1/items/${itemId}`)
    expect(afterDeleteResponse.status()).toBe(404)
  })
})
