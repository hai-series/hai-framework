import { mergeConfig } from 'vitest/config'

import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  test: {
    include: ['packages/a2ui-kit/tests/**/*.{test,spec}.ts'],
    coverage: {
      include: ['packages/a2ui-kit/src/**/*.ts'],
    },
  },
})
