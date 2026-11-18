import { Buffer } from 'node:buffer'
import { expect, it, vi } from 'vitest'
import { loadLdapClientFactory } from '../src/authn/ldap/iam-authn-ldap-client.js'
import { LdapConfigSchema } from '../src/iam-config.js'

const { search } = vi.hoisted(() => ({
  search: vi.fn(),
}))
vi.mock('ldapts', () => ({
  Client: class Fixture {
    search = search
    async unbind() {}
  },
}))

it('aD 标识以 LDAP 返回字节原序编码，属性名大小写不影响读取', async () => {
  const hex = '8af25cde4b7841e38a6a4cebed0583ab'
  search.mockResolvedValueOnce({
    searchEntries: [
      {
        dn: 'cn=fixture,dc=test',
        OBJECTGUID: Buffer.from(hex, 'hex'),
        uid: 'fixture',
      },
    ],
  })
  const factory = await loadLdapClientFactory()
  const result = await factory(LdapConfigSchema.parse({
    url: 'ldaps://directory.invalid',
    bindDn: 'cn=reader,dc=test',
    bindPassword: 'fixture-only',
    searchBase: 'dc=test',
    directoryId: 'company-directory',
    identityAttribute: 'objectGUID',
  }))
  expect(result.success).toBe(true)
  if (!result.success)
    return
  try {
    expect(await result.data.search('dc=test', '(uid=fixture)', ['uid', 'objectGUID'])).toMatchObject({
      success: true,
      data: [
        {
          attributes: { uid: 'fixture', objectGUID: hex },
        },
      ],
    })
    expect(search).toHaveBeenCalledWith('dc=test', expect.objectContaining({
      explicitBufferAttributes: ['objectGUID'],
    }))
  }
  finally {
    await result.data.unbind()
  }
})
