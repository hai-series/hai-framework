import { ai } from '@h-ai/ai'
import { iam } from '@h-ai/iam'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'

/** 创建 API Service 的应用级 procedures。 */
export function createApiServiceProcedures() {
  return {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({ storage }),
    ai: createAiProcedures({ ai }),
  }
}
