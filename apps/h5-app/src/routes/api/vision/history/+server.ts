/**
 * =============================================================================
 * H5 App - 拍照识图历史 API
 * =============================================================================
 */

import { kit } from '@h-ai/kit'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { buildVisionHistoryQuery, getSessionUserId } from '../vision-user-isolation.js'

interface VisionRow {
  id: string
  storage_key: string
  file_name: string
  mime_type: string
  prompt: string | null
  analysis: string
  tags_json: string
  confidence: number
  created_at: number
}

export const GET = kit.handler(async ({ locals }) => {
  const userId = getSessionUserId(locals.session)
  if (!userId) {
    return kit.response.unauthorized()
  }

  const query = buildVisionHistoryQuery(userId)
  const rowsResult = await reldb.sql.query<VisionRow>(query.sql, query.params)

  if (!rowsResult.success) {
    return kit.response.internalError('Query history failed')
  }

  return kit.response.ok(
    rowsResult.data.map(row => ({
      id: row.id,
      key: row.storage_key,
      imageUrl: storage.presign.publicUrl(row.storage_key),
      fileName: row.file_name,
      mimeType: row.mime_type,
      prompt: row.prompt,
      analysis: row.analysis,
      tags: (() => {
        try {
          const parsed = JSON.parse(row.tags_json) as unknown
          return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : []
        }
        catch {
          return []
        }
      })(),
      confidence: row.confidence,
      createdAt: row.created_at,
    })),
  )
})
