import type { ServContext } from '@h-ai/serv'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { serv } from '@h-ai/serv'
import { LabStatusSchema } from '#lib/ai-lab-types.js'
import { getLabStatus } from './ai-lab.js'

const contract = apiContract.create({
  status: apiContract.route({ method: 'GET', path: '/status' })
    .output(apiContract.haiResultSchema(LabStatusSchema)),
})
const procedures = serv.implement(contract).context<ServContext>().route('status', () => core.ok(getLabStatus())).build()

/** 首页继续从 /api/status 读取能力；同一操作也可以挂载在独立的 Serv。 */
export const labContractHandler = serv.createContractHandler({
  contract,
  procedures,
  http: { apiPrefix: '/api' },
})
