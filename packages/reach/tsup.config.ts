import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/core', 'zod', 'nodemailer', '@alicloud/dysmsapi20170525', '@alicloud/openapi-client'],
})
