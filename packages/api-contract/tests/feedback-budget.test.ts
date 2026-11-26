import { expect, it } from 'vitest'
import { apiContract, feedbackLimits } from '../src/feedback/index.js'

it('只为带文件的反馈路径声明共享传输容量', () => {
  const budget = feedbackLimits.maxPlaintextBytes
  expect(apiContract.feedbackTransportRoutes('/services/v1/')).toEqual({
    '/services/v1/feedback/reports': budget,
    '/services/v1/feedback/reports/*/messages': budget,
    '/services/v1/feedback/reports/*/attachments/*': budget,
  })
  expect(budget).toBeGreaterThan(4 * Math.ceil(feedbackLimits.maxTotalFileBytes / 3))
})
