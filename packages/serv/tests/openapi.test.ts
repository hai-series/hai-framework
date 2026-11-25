import { apiContract } from '@h-ai/api-contract'
import { describe, expect, it } from 'vitest'
import { createDocsPage, generateSpec, getScalarScript, SCALAR_ROUTE } from '../src/serv-openapi.js'

const testContract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

describe('generateSpec', () => {
  it('produces an OpenAPI document with bearer security scheme', async () => {
    const spec = await generateSpec(testContract, {
      title: 'test-service',
      version: '0.0.1',
      apiPrefix: '/api/v1',
    })

    expect(spec.openapi.startsWith('3.')).toBe(true)
    expect(spec.info.title).toBe('test-service')
    expect(spec.info.version).toBe('0.0.1')
    expect(spec.servers).toEqual([
      { url: '/api/v1' },
    ])
    expect(spec.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
    expect(spec.paths).toBeDefined()
    expect(Object.keys(spec.paths ?? {}).length).toBeGreaterThan(0)
  })

  it('skips servers when apiPrefix not provided', async () => {
    const spec = await generateSpec(testContract, { title: 'no-prefix' })
    expect(spec.servers).toBeUndefined()
  })

  it('describes public IAM operations without bearer while retaining generated schemas', async () => {
    const spec = await generateSpec(testContract)
    const auth = apiContract.iam.auth
    const paths = spec.paths

    expect(paths?.[apiContract.pathOf(auth.publicConfig)]?.get?.security).toEqual([])
    for (const procedure of [
      auth.createCaptcha,
      auth.renewPassword,
      auth.loginWithLdap,
      auth.requestPasswordReset,
      auth.confirmPasswordReset,
      auth.login,
      auth.loginWithOtp,
      auth.refresh,
      auth.sendOtp,
      auth.register,
    ]) {
      expect(paths?.[apiContract.pathOf(procedure)]?.post?.security).toEqual([])
    }

    const bearer = [
      { bearerAuth: [] },
    ]
    expect(spec.security).toEqual(bearer)
    for (const operation of [
      paths?.[apiContract.pathOf(auth.currentUser)]?.get,
      paths?.[apiContract.pathOf(auth.logout)]?.post,
      paths?.[apiContract.pathOf(auth.closeSession)]?.post,
    ]) {
      expect(operation).toBeDefined()
      expect(operation?.security ?? spec.security).toEqual(bearer)
    }
    for (const procedure of [auth.login, auth.refresh]) {
      const operation = paths?.[apiContract.pathOf(procedure)]?.post
      const jsonSchemaPath = ['content', 'application/json', 'schema']
      expect(operation?.requestBody).toHaveProperty(jsonSchemaPath)
      expect(operation?.responses?.[200]).toHaveProperty(jsonSchemaPath)
    }
  })

  it('creates docs page that points to local Scalar route by default', async () => {
    const spec = await generateSpec(testContract, { title: 'docs-test' })
    const html = createDocsPage(spec)

    expect(html).toContain(SCALAR_ROUTE)
  })

  it('loads bundled Scalar script from @scalar/api-reference', async () => {
    const script = await getScalarScript()

    expect(script).toBeDefined()
    expect(script).toContain('createApiReference')
  })
})
