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

it('扩大写入预算，保留单文件读取预算', () => {
  const budget = apiContract.feedbackTransportRoutes('/api', 24 * 1024 * 1024)
  expect(budget).toEqual({
    '/api/feedback/reports': 33 * 1024 * 1024,
    '/api/feedback/reports/*/messages': 33 * 1024 * 1024,
    '/api/feedback/reports/*/attachments/*': 16 * 1024 * 1024,
  })
})
