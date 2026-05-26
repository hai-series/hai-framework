import { describe, expect, it } from 'vitest'
import { apiServiceContract, AppEchoInputSchema } from '../src/index.js'

describe('@h-ai/api-service-contract', () => {
  it('组合 iam/storage/ai 与 app 自有 contract', () => {
    expect(apiServiceContract.iam.auth.login).toBeDefined()
    expect(apiServiceContract.storage.presignedUrls.createUpload).toBeDefined()
    expect(apiServiceContract.ai.chats.createCompletion).toBeDefined()
    expect(apiServiceContract.app.info).toBeDefined()
    expect(apiServiceContract.app.echo).toBeDefined()
  })

  it('app.echo 输入限制非空且不超过 2000 字符', () => {
    expect(AppEchoInputSchema.safeParse({ message: 'hello' }).success).toBe(true)
    expect(AppEchoInputSchema.safeParse({ message: '' }).success).toBe(false)
    expect(AppEchoInputSchema.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false)
  })
})
