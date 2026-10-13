import { iam } from '@h-ai/iam'

export function load() {
  return { iamPublicConfig: iam.publicConfig }
}
