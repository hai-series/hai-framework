import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'browser': 'src/iam-index.browser.ts',
    'ldap-bindings': 'src/authn/ldap/iam-authn-ldap-migrate.ts',
  },
  external: [
    '@h-ai/core',
    '@h-ai/audit',
    '@h-ai/crypto',
    '@h-ai/reldb',
    '@h-ai/cache',
    '@h-ai/reach',
    'zod',
    'ldapts',
    'altcha/lib',
  ],
})
