<!--
  @component SessionRecoveryDialog 原地恢复已失效会话，复用正常认证、验证码、锁定与改密流程。
  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import { createSessionRecovery, SessionRecoveryDialog } from '@h-ai/ui'
  import { kit } from '@h-ai/kit'
  const recovery = createSessionRecovery()
  const component = mount(SessionRecoveryDialog, { target: document.body, props: { recovery, actions: kit.client.createAuthActions() } })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { AuthPanelActions } from '../types.js'
  import type { SessionRecovery } from './session-recovery.svelte.js'
  import { err, HaiCommonError } from '@h-ai/core'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'
  import Modal from '../../compounds/Modal.svelte'
  import Button from '../../primitives/Button.svelte'
  import AuthPanel from './AuthPanel.svelte'

  const { recovery, actions, ...restProps }: { recovery: SessionRecovery, actions: AuthPanelActions } & DataAttributes = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
  let authenticating = $state(false)
  let authenticatedId = ''
  let authenticatedVersion = 0
  const recoveryActions = $derived({
    ...actions,
    login: async (input: Parameters<AuthPanelActions['login']>[0]) => {
      const expectedUserId = recovery.user?.id
      const version = recovery.version
      if (!expectedUserId || !recovery.open)
        return err(HaiCommonError.UNAUTHORIZED, uiM('session_recovery_account_error'))
      authenticating = true
      try {
        const result = await actions.login({ ...input, expectedUserId })
        if (result.success) {
          const data = result.data
          if (!data || typeof data !== 'object' || !('user' in data) || !data.user || typeof data.user !== 'object' || !('id' in data.user) || data.user.id !== expectedUserId)
            return err(HaiCommonError.UNAUTHORIZED, uiM('session_recovery_account_error'))
          authenticatedId = expectedUserId
          authenticatedVersion = version
        }
        return result
      }
      finally { authenticating = false }
    },
  })
</script>

<Modal {...dataAttributes} open={recovery.open} title={uiM('session_recovery_title')} onclose={() => recovery.cancel()} closeOnBackdrop={!authenticating} closeOnEscape={!authenticating} showClose={!authenticating} size='md'>
  {#if recovery.open}
    <div data-testid='session-recovery-dialog'>
      <p class='mb-4 text-sm text-base-content/60'>{uiM('session_recovery_hint')}</p>
      {#if recovery.user?.username}<p class='mb-4 text-sm font-medium'>{recovery.user.username}</p>{/if}
      {#if recovery.config}
        <AuthPanel embedded initialIdentifier={recovery.user?.username} config={{ ...recovery.config, register: { enabled: false } }} actions={recoveryActions} onauthenticated={() => recovery.complete(authenticatedId, authenticatedVersion)} />
      {/if}
      <div class='mt-4 flex justify-end'><Button variant='ghost' disabled={authenticating} onclick={() => recovery.cancel()}>{uiM('session_recovery_later')}</Button></div>
    </div>
  {/if}
</Modal>
