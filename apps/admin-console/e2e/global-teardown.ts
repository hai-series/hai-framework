import type { FullConfig } from '@playwright/test'

/** 服务退出后的数据清理由托管入口负责；这里只释放 fixture 内的 LDAP 子进程。 */
export default async function globalTeardown(config: FullConfig) {
  if (config.metadata.notificationFixture !== true)
    return
  const response = await fetch('http://127.0.0.1:12580/shutdown', { method: 'POST', signal: AbortSignal.timeout(15_000) })
  if (!response.ok)
    throw new Error('Notification fixture shutdown failed')
  await response.json()
}
