/** 桌面宿主提供当前版本，Tauri updater 负责下载、验签和安装。 */
import { getVersion } from '@tauri-apps/api/app'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Update } from '@tauri-apps/plugin-updater'

type UpdateStatus
  = 'idle' | 'checking' | 'current' | 'available' | 'unavailable' | 'check-failed'
    | 'downloading' | 'installing' | 'install-failed' | 'installed'

type UpdateMetadata = Omit<ConstructorParameters<typeof Update>[0], 'body'> & { body?: string | null }
type CheckResult = { status: 'current' | 'unavailable' } | { status: 'available', update: UpdateMetadata }

export class DesktopUpdate {
  version = $state('')
  enabled = $state(false)
  status = $state<UpdateStatus>('idle')
  latestVersion = $state('')
  notes = $state('')
  percent = $state<number>()
  busy = $derived(['checking', 'downloading', 'installing'].includes(this.status))

  private candidate: Update | null = null
  private disposed = false

  async initialize(): Promise<void> {
    if (!isTauri())
      return
    const [version, enabled] = await Promise.all([
      getVersion().catch(() => ''),
      invoke<boolean>('desktop_update_configured').catch(() => false),
    ])
    if (!this.disposed) {
      this.version = version
      this.enabled = enabled
    }
  }

  async check(): Promise<void> {
    if (!this.enabled || this.busy || this.status === 'installed' || this.disposed)
      return
    this.status = 'checking'
    this.latestVersion = ''
    this.notes = ''
    await this.releaseCandidate()
    if (this.disposed)
      return
    try {
      const result = await invoke<CheckResult>('desktop_update_check')
      if (result.status === 'available') {
        this.candidate = new Update({ ...result.update, body: result.update.body ?? undefined })
        if (this.disposed) {
          await this.releaseCandidate()
          return
        }
        this.latestVersion = this.candidate.version
        this.notes = this.candidate.body?.trim().slice(0, 6000) ?? ''
      }
      if (!this.disposed)
        this.status = result.status
    }
    catch {
      await this.releaseCandidate()
      if (!this.disposed)
        this.status = 'check-failed'
    }
  }

  async install(): Promise<void> {
    const candidate = this.candidate
    if (!candidate || this.status !== 'available' || this.disposed)
      return
    this.status = 'downloading'
    this.percent = undefined
    let total: number | undefined
    let received = 0
    try {
      await candidate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength
            break
          case 'Progress':
            received += event.data.chunkLength
            if (total)
              this.percent = Math.min(100, Math.floor(received * 100 / total))
            break
          case 'Finished':
            this.status = 'installing'
            break
        }
      }, { timeout: 300_000 })
      this.status = 'installed'
    }
    catch {
      this.status = 'install-failed'
    }
    finally {
      await this.releaseCandidate()
    }
  }

  async restart(): Promise<boolean> {
    if (this.status !== 'installed')
      return false
    try {
      await invoke('desktop_update_restart')
      return true
    }
    catch {
      return false
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.status !== 'downloading' && this.status !== 'installing')
      void this.releaseCandidate()
  }

  private async releaseCandidate(): Promise<void> {
    const candidate = this.candidate
    this.candidate = null
    await candidate?.close().catch(() => {})
  }
}
