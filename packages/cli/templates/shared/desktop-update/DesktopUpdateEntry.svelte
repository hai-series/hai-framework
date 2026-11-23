<script module lang='ts'>
  type MessageKey
    = 'about' | 'version' | 'check' | 'checking' | 'available' | 'reminder' | 'current'
      | 'unavailable' | 'check_failed' | 'download_install' | 'confirm' | 'save_work' | 'later'
      | 'downloading' | 'installing' | 'install_failed' | 'installed' | 'restart' | 'restart_failed'

  export type DesktopUpdateMessage = `desktop_update_${MessageKey}`
</script>

<script lang='ts'>
  import { Button, Modal, ui } from '@h-ai/ui'
  import { onMount, tick } from 'svelte'
  import { DesktopUpdate } from './desktop-update.svelte.js'

  interface Props { message: (key: DesktopUpdateMessage) => string }
  const { message }: Props = $props()
  const id = $props.id()
  const updater = new DesktopUpdate()
  const cancelId = `${id}-update-later`
  let open = $state(false)
  let confirming = $state(false)
  const installing = $derived(updater.status === 'downloading' || updater.status === 'installing')

  async function backgroundCheck(): Promise<void> {
    await updater.initialize()
    if (updater.enabled) {
      await updater.check()
      if (updater.status === 'available' && !open)
        ui.notifyInfo(message('desktop_update_reminder'))
    }
  }

  onMount(() => {
    void backgroundCheck()
    return () => updater.dispose()
  })

  async function checkForUpdate(): Promise<void> {
    await updater.check()
    if (updater.status === 'check-failed')
      ui.notifyError(message('desktop_update_check_failed'))
  }

  async function confirmInstall(): Promise<void> {
    confirming = true
    await tick()
    document.getElementById(cancelId)?.querySelector('button')?.focus()
  }

  async function install(): Promise<void> {
    confirming = false
    await updater.install()
    if (updater.status === 'install-failed')
      ui.notifyError(message('desktop_update_install_failed'))
  }

  async function restart(): Promise<void> {
    if (!await updater.restart())
      ui.notifyError(message('desktop_update_restart_failed'))
  }
</script>

{#if updater.version}
  <div class='fixed end-3 bottom-3 z-20'>
    <Button size='xs' data-testid='desktop-update-open' onclick={() => { open = true }}>
      {message('desktop_update_about')}
    </Button>
  </div>
  <Modal bind:open title={message('desktop_update_about')} showClose={!installing} closeOnEscape={!installing}
         closeOnBackdrop={!installing} onclose={() => { confirming = false }}>
    <p class='text-sm'>
      {message('desktop_update_version')}
      <strong data-testid='desktop-update-version'>{updater.version}</strong>
    </p>
    <div class='mt-3 space-y-2 text-sm' role='status' aria-live='polite' data-testid='desktop-update-status' data-status={updater.status}>
      {#if confirming}
        <p>{message('desktop_update_save_work')}</p>
      {:else if updater.status === 'checking'}
        <p>{message('desktop_update_checking')}</p>
      {:else if updater.status === 'available'}
        <p>{message('desktop_update_available')} <strong>{updater.latestVersion}</strong></p>
        {#if updater.notes}
          <p class='max-h-48 overflow-auto whitespace-pre-wrap break-words'>{updater.notes}</p>
        {/if}
      {:else if updater.status === 'current'}
        <p>{message('desktop_update_current')}</p>
      {:else if updater.status === 'unavailable'}
        <p>{message('desktop_update_unavailable')}</p>
      {:else if updater.status === 'downloading'}
        <p>{message('desktop_update_downloading')}{updater.percent === undefined
          ? ''
          : ` ${updater.percent}%`}</p>
      {:else if updater.status === 'installing'}
        <p>{message('desktop_update_installing')}</p>
      {:else if updater.status === 'installed'}
        <p>{message('desktop_update_installed')}</p>
      {/if}
    </div>
    {#snippet footer()}
      {#if updater.enabled && !confirming && !installing && updater.status !== 'installed'}
        <Button variant={updater.status === 'available'
          ? 'ghost'
          : 'primary'} loading={updater.busy}
                data-testid='desktop-update-check' onclick={() => void checkForUpdate()}>
          {message('desktop_update_check')}
        </Button>
      {/if}
      {#if confirming}
        <div id={cancelId}><Button onclick={() => { confirming = false }}>{message('desktop_update_later')}</Button></div>
        <Button variant='primary' data-testid='desktop-update-confirm' onclick={() => void install()}>
          {message('desktop_update_confirm')}
        </Button>
      {:else if updater.status === 'available'}
        <Button onclick={() => { open = false }}>{message('desktop_update_later')}</Button>
        <Button variant='primary' data-testid='desktop-update-install' onclick={() => void confirmInstall()}>
          {message('desktop_update_download_install')}
        </Button>
      {:else if updater.status === 'installed'}
        <Button variant='primary' data-testid='desktop-update-restart' onclick={() => void restart()}>
          {message('desktop_update_restart')}
        </Button>
      {/if}
    {/snippet}
  </Modal>
{/if}
