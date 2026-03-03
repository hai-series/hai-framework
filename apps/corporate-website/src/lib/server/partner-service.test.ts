import { describe, expect, it } from 'vitest'
import {
  PartnerAdminLoginSchema,
  PartnerLeadQuerySchema,
  PartnerLeadSchema,
} from './partner-service.js'

describe('partner-service schemas', () => {
  it('accepts valid partner lead payload', () => {
    const result = PartnerLeadSchema.safeParse({
      companyName: 'Hai Enterprise',
      contactName: 'Alice',
      email: 'alice@example.com',
      phone: '13800138000',
      cooperationType: 'solution',
      budgetRange: '100k-500k',
      message: 'We want to discuss a long-term enterprise solution partnership.',
      source: 'website',
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid admin login payload', () => {
    const result = PartnerAdminLoginSchema.safeParse({
      username: 'ad',
      password: '123',
    })

    expect(result.success).toBe(false)
  })

  it('normalizes query pagination defaults', () => {
    const result = PartnerLeadQuerySchema.parse({})

    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
    expect(result.status).toBeUndefined()
  })
})
