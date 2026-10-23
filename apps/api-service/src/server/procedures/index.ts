import type { AppProcedureDeps } from './app-procedures.js'
import { ai } from '@h-ai/ai'
import { iam } from '@h-ai/iam'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'
import { createAppProcedures } from './app-procedures.js'

/** 创建 API Service 的应用级 procedures。 */
export function createApiServiceProcedures(deps: { app: AppProcedureDeps }) {
  return {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({
      storage,
      authorize: ({ context, keys }) => keys.every(key =>
        key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
    }),
    // AI 默认绑定可信 session.userId，跨主体访问需另行提供 authorizeObject 策略。
    ai: createAiProcedures({ ai }),
    app: createAppProcedures(deps.app),
  }
}
