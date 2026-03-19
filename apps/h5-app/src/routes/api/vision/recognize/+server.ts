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
import { buildVisionInsertStatement, getSessionUserId } from '../vision-user-isolation.js'

const MAX_FILE_SIZE = 4 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const POST = kit.handler(async ({ request, locals }) => {
  const userId = getSessionUserId(locals.session)
  if (!userId) {
    return kit.response.unauthorized()
  }

  if (!storage.isInitialized) {
    return kit.response.error('STORAGE_UNAVAILABLE', 'File storage is not configured', 503)
  }

  if (!ai.isInitialized) {
    return kit.response.error('AI_UNAVAILABLE', 'AI service is not configured', 503)
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const prompt = String(formData.get('prompt') ?? '').trim()

  if (!file || !(file instanceof File)) {
    return kit.response.badRequest(m.discover_error_no_file())
  }

  if (file.size > MAX_FILE_SIZE) {
    return kit.response.badRequest('Image size exceeds 4MB limit')
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return kit.response.badRequest('Only JPG, PNG, WEBP are supported')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split('.').pop() ?? 'jpg'
  const key = `vision/${core.id.generate()}.${ext}`

  const storeResult = await storage.file.put(key, buffer, {
    contentType: file.type,
  })
  if (!storeResult.success) {
    core.logger.error('Vision image upload failed', { error: storeResult.error.message })
    return kit.response.internalError('Image upload failed')
  }

  const imageDataUrl = `data:${file.type};base64,${buffer.toString('base64')}`
  const locale = locals.locale === 'en-US' ? 'en-US' : 'zh-CN'

  const systemPrompt = locale === 'en-US'
    ? 'You are an image recognition assistant. Return strict JSON only with keys: summary(string), details(string[]), tags(string[]), confidence(number 0..1).'
    : '你是图片识别助手。仅返回严格 JSON，包含字段：summary(字符串)、details(字符串数组)、tags(字符串数组)、confidence(0到1数字)。'

  const userText = locale === 'en-US'
    ? `Analyze this image and describe key content. Extra request: ${prompt || 'none'}`
    : `请识别这张图片并描述关键内容。补充要求：${prompt || '无'}`

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
    return kit.response.internalError('AI analysis failed')
  }

  const raw = aiResult.data.choices[0]?.message.content?.trim() ?? ''
  const analysis = parseVisionAnalysis(raw)

  const recordId = core.id.generate()
  const createdAt = Date.now()
  const insert = buildVisionInsertStatement({
    id: recordId,
    userId,
    key,
    fileName: file.name,
    mimeType: file.type,
    prompt: prompt || null,
    analysis: analysis.summary,
    tagsJson: JSON.stringify(analysis.tags),
    confidence: analysis.confidence,
    createdAt,
  })
  const insertResult = await reldb.sql.execute(insert.sql, insert.params)

  if (!insertResult.success) {
    core.logger.error('Vision record insert failed', { error: insertResult.error.message })
    return kit.response.internalError('Record save failed')
  }

  return kit.response.ok({
    id: recordId,
    key,
    imageUrl: storage.presign.publicUrl(key),
    prompt,
    analysis,
    createdAt,
  })
})
