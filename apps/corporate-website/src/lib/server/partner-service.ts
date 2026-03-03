import { createHash, timingSafeEqual } from 'node:crypto'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { db } from '@h-ai/db'
import { storage } from '@h-ai/storage'
import { z } from 'zod'

export const PartnerLeadSchema = z.object({
  companyName: z.string().min(2).max(120),
  contactName: z.string().min(2).max(80),
  email: z.string().email().max(120),
  phone: z.string().min(6).max(32),
  cooperationType: z.enum(['channel', 'solution', 'delivery', 'marketing', 'other']),
  budgetRange: z.string().max(64).default('unknown'),
  message: z.string().min(10).max(3000),
  source: z.string().max(64).default('website'),
})

export const PartnerLeadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(120).optional(),
  status: z.enum(['pending', 'contacted', 'archived']).optional(),
})

export const PartnerAdminLoginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
})

export const PartnerAdminConfigSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
  sessionTtlSeconds: z.coerce.number().int().min(600).max(60 * 60 * 24).default(4 * 60 * 60),
})

export type PartnerAdminConfig = z.infer<typeof PartnerAdminConfigSchema>
export type PartnerLeadInput = z.infer<typeof PartnerLeadSchema>

interface PartnerAdminSession {
  userId: string
  username: string
  role: 'partner-admin'
  issuedAt: string
}

const RECORDS_CACHE_PREFIX = 'corp:partner:records'
const SESSION_CACHE_PREFIX = 'corp:partner:session'

function sha256(value: string): Uint8Array {
  return createHash('sha256').update(value).digest()
}

function safeCompareString(left: string, right: string): boolean {
  const leftHash = sha256(left)
  const rightHash = sha256(right)
  return timingSafeEqual(leftHash, rightHash)
}

function recordsCacheKey(page: number, pageSize: number, search?: string, status?: string): string {
  return `${RECORDS_CACHE_PREFIX}:${page}:${pageSize}:${search ?? ''}:${status ?? ''}`
}

export function getPartnerAdminConfig(): PartnerAdminConfig {
  const validation = core.config.validate('partner', PartnerAdminConfigSchema)
  if (!validation.success) {
    throw new Error(`Partner config invalid: ${validation.error.message}`)
  }

  return core.config.getOrThrow<PartnerAdminConfig>('partner')
}

export async function ensurePartnerTables(): Promise<void> {
  const tableResult = await db.ddl.createTable('partner_leads', {
    id: { type: 'TEXT', primaryKey: true },
    company_name: { type: 'TEXT', notNull: true },
    contact_name: { type: 'TEXT', notNull: true },
    email: { type: 'TEXT', notNull: true },
    phone: { type: 'TEXT', notNull: true },
    cooperation_type: { type: 'TEXT', notNull: true },
    budget_range: { type: 'TEXT', notNull: true, defaultValue: 'unknown' },
    message: { type: 'TEXT', notNull: true },
    source: { type: 'TEXT', notNull: true, defaultValue: 'website' },
    status: { type: 'TEXT', notNull: true, defaultValue: 'pending' },
    created_at: { type: 'TEXT', notNull: true },
    updated_at: { type: 'TEXT', notNull: true },
  })

  if (!tableResult.success) {
    throw new Error(`Ensure partner_leads table failed: ${tableResult.error.message}`)
  }
}

export async function createPartnerLead(input: PartnerLeadInput) {
  const id = core.id.generate()
  const now = new Date().toISOString()

  const insertResult = await db.sql.execute(
    `INSERT INTO partner_leads
      (id, company_name, contact_name, email, phone, cooperation_type, budget_range, message, source, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.companyName,
      input.contactName,
      input.email,
      input.phone,
      input.cooperationType,
      input.budgetRange,
      input.message,
      input.source,
      'pending',
      now,
      now,
    ],
  )

  if (!insertResult.success) {
    return insertResult
  }

  await cache.kv.del(recordsCacheKey(1, 20))

  if (storage.isInitialized) {
    const snapshot = {
      id,
      ...input,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    const archiveResult = await storage.file.put(
      `partner-leads/${id}.json`,
      JSON.stringify(snapshot, null, 2),
      { contentType: 'application/json; charset=utf-8' },
    )

    if (!archiveResult.success) {
      core.logger.warn('Partner lead archive failed', { error: archiveResult.error.message, id })
    }
  }

  return {
    success: true as const,
    data: {
      id,
      status: 'pending',
      createdAt: now,
    },
  }
}

export async function listPartnerLeads(options: z.infer<typeof PartnerLeadQuerySchema>) {
  const cacheKey = recordsCacheKey(options.page, options.pageSize, options.search, options.status)
  const cached = await cache.kv.get<string>(cacheKey)
  if (cached.success && cached.data) {
    return {
      success: true as const,
      data: JSON.parse(cached.data) as {
        items: Record<string, unknown>[]
        total: number
        page: number
        pageSize: number
      },
    }
  }

  let sql = 'SELECT * FROM partner_leads'
  const where: string[] = []
  const params: unknown[] = []

  if (options.search) {
    where.push('(company_name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR phone LIKE ?)')
    const keyword = `%${options.search}%`
    params.push(keyword, keyword, keyword, keyword)
  }

  if (options.status) {
    where.push('status = ?')
    params.push(options.status)
  }

  if (where.length > 0) {
    sql += ` WHERE ${where.join(' AND ')}`
  }

  sql += ' ORDER BY created_at DESC'

  const queryResult = await db.sql.queryPage<Record<string, unknown>>({
    sql,
    params,
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
    },
  })

  if (!queryResult.success) {
    return queryResult
  }

  const payload = {
    items: queryResult.data.items,
    total: queryResult.data.total,
    page: options.page,
    pageSize: options.pageSize,
  }

  await cache.kv.set(cacheKey, JSON.stringify(payload), { ex: 30 })

  return {
    success: true as const,
    data: payload,
  }
}

export function verifyPartnerAdminCredential(username: string, password: string): boolean {
  const config = getPartnerAdminConfig()
  return safeCompareString(config.username, username) && safeCompareString(config.password, password)
}

export async function createPartnerAdminSession(username: string) {
  const config = getPartnerAdminConfig()
  const token = core.id.generate()
  const payload: PartnerAdminSession = {
    userId: `partner-admin:${username}`,
    username,
    role: 'partner-admin',
    issuedAt: new Date().toISOString(),
  }

  await cache.kv.set(`${SESSION_CACHE_PREFIX}:${token}`, JSON.stringify(payload), {
    ex: config.sessionTtlSeconds,
  })

  return token
}

export async function getPartnerAdminSessionByToken(token: string) {
  const result = await cache.kv.get<string>(`${SESSION_CACHE_PREFIX}:${token}`)
  if (!result.success || !result.data) {
    return null
  }

  try {
    return JSON.parse(result.data) as PartnerAdminSession
  }
  catch {
    return null
  }
}

export async function clearPartnerAdminSession(token: string) {
  await cache.kv.del(`${SESSION_CACHE_PREFIX}:${token}`)
}
