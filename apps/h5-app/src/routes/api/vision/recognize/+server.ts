/**
 * =============================================================================
 * H5 App - 拍照识图 API
 * =============================================================================
 */

import { Buffer } from 'node:buffer'
import * as m from '$lib/paraglide/messages.js'
import { parseVisionAnalysis } from '$lib/server/vision'
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'

const MAX_FILE_SIZE = 4 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const POST = kit.handler(async ({ request, locals }) => {
  const locale = locals.locale === 'en-US' ? 'en-US' : locals.locale === 'ja-JP' ? 'ja-JP' : 'zh-CN'
  if (!storage.isInitialized) {
    return kit.response.error('STORAGE_UNAVAILABLE', m.vision_storage_unavailable({}, { locale }), 503)
  }

  if (!ai.isInitialized) {
    return kit.response.error('AI_UNAVAILABLE', m.vision_ai_unavailable({}, { locale }), 503)
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const prompt = String(formData.get('prompt') ?? '').trim()

  if (!file || !(file instanceof File)) {
    return kit.response.badRequest(m.discover_error_no_file({}, { locale }))
  }

  if (file.size > MAX_FILE_SIZE) {
    return kit.response.badRequest(m.vision_size_exceeded({}, { locale }))
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return kit.response.badRequest(m.vision_type_unsupported({}, { locale }))
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = EXT_MAP[file.type]
  const key = `vision/${core.id.generate()}.${ext}`

  const storeResult = await storage.file.put(key, buffer, {
    contentType: file.type,
  })
  if (!storeResult.success) {
    core.logger.error('Vision image upload failed', { error: storeResult.error.message })
    return kit.response.internalError(m.vision_upload_failed({}, { locale }))
  }

  const imageDataUrl = `data:${file.type};base64,${buffer.toString('base64')}`

  const systemPrompt = m.vision_system_prompt({}, { locale })
  const userText = m.vision_user_prompt({ prompt: prompt || m.vision_no_prompt({}, { locale }) }, { locale })

  const aiResult = await ai.llm.chat({
    temperature: 0.2,
    max_tokens: 700,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'auto' } },
        ],
      },
    ],
  })

  if (!aiResult.success) {
    core.logger.error('Vision AI analyze failed', { error: aiResult.error.message })
    return kit.response.internalError(m.vision_analysis_failed({}, { locale }))
  }

  const raw = aiResult.data.choices[0]?.message.content?.trim() ?? ''
  const analysis = parseVisionAnalysis(raw)

  const recordId = core.id.generate()
  const insertResult = await reldb.sql.execute(
    `INSERT INTO vision_records
      (id, storage_key, file_name, mime_type, prompt, analysis, tags_json, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recordId,
      key,
      file.name,
      file.type,
      prompt || null,
      analysis.summary,
      JSON.stringify(analysis.tags),
      analysis.confidence,
      Date.now(),
    ],
  )

  if (!insertResult.success) {
    core.logger.error('Vision record insert failed', { error: insertResult.error.message })
    return kit.response.internalError(m.vision_save_failed({}, { locale }))
  }

  return kit.response.ok({
    id: recordId,
    key,
    imageUrl: storage.presign.publicUrl(key),
    prompt,
    analysis,
    createdAt: Date.now(),
  })
})
