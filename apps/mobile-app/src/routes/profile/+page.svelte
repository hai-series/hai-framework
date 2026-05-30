<script lang='ts'>
  import type { UserProfileSubmitData } from '@h-ai/ui'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import * as m from '$lib/paraglide/messages.js'
  import { getLocale, setLocale } from '$lib/paraglide/runtime.js'
  import {
    currentPermissions,
    currentRoles,
    currentUser,
    isLoading,
    logout,
    refreshCurrentUser,
    updateProfile,
  } from '$lib/stores/auth-store.svelte.js'
  import { applyTheme, getSavedTheme, setGlobalLocale, toast } from '@h-ai/ui'
  import { onMount } from 'svelte'

  const me = $derived(currentUser())
  let currentTheme = $state('light')
  let currentLanguage = $state('zh-CN')
  let errors = $state<Record<string, string>>({})

  onMount(() => {
    currentTheme = getSavedTheme()
    currentLanguage = getLocale()
  })

  async function handleRefresh(): Promise<void> {
    await refreshCurrentUser()
  }

  function handleThemeChange(theme: string): void {
    applyTheme(theme)
    currentTheme = theme
  }

  function handleLanguageChange(language: string): void {
    setGlobalLocale(language)
    setLocale(language as 'zh-CN' | 'en-US', { reload: false })
    currentLanguage = language
  }

  async function handleSave(data: UserProfileSubmitData): Promise<void> {
    errors = {}
    const error = await updateProfile({
      username: data.username,
      email: data.email,
    })
    if (error) {
      errors = { general: m.profile_update_failed({ message: error }) }
      toast.error(m.profile_update_failed({ message: error }))
      return
    }

    toast.success(m.profile_update_success())
  }

  async function handleLogout(): Promise<void> {
    await logout()
    await goto(resolve('/auth/login', {}))
  }
</script>

<svelte:head>
  <title>{m.profile_title()} - {m.app_title()}</title>
</svelte:head>

<PullRefresh onrefresh={handleRefresh}>
  <div class='space-y-4 p-4 pb-6'>
    <section class='bg-linear-to-br from-primary to-primary/80 text-primary-content rounded-2xl p-5 shadow-sm'>
      <div class='flex items-center gap-4'>
        <div class='flex h-16 w-16 items-center justify-center rounded-full bg-primary-content/20 text-2xl font-bold'>
          {me?.username?.slice(0, 1).toUpperCase() ?? '?'}
        </div>
        <div class='min-w-0'>
          <h1 class='truncate text-xl font-bold'>{me?.displayName ?? me?.username}</h1>
          <p class='truncate text-sm opacity-80'>{me?.email ?? m.profile_email_empty()}</p>
        </div>
      </div>
    </section>

    {#if me}
      <Card title={m.profile_account_title()} shadow='sm'>
        <UserProfile
          user={{ id: me.id, username: me.username, email: me.email ?? undefined }}
          editable
          alwaysEditable
          fields={['username', 'email']}
          loading={isLoading()}
          {errors}
          onsubmit={handleSave}
        />
      </Card>

      <Card title={m.profile_settings_title()} shadow='sm' class='overflow-visible'>
        <div class='space-y-4'>
          <div class='flex items-center justify-between gap-3'>
            <div class='min-w-0'>
              <p class='font-medium'>{m.profile_language_label()}</p>
              <p class='text-base-content/50 text-xs'>{m.profile_language_desc()}</p>
            </div>
            <LanguageSwitch currentLanguage={currentLanguage} onchange={handleLanguageChange} class='shrink-0' />
          </div>

          <div class='divider my-0'></div>

          <div class='flex items-center justify-between gap-3'>
            <div class='min-w-0'>
              <p class='font-medium'>{m.profile_theme_label()}</p>
              <p class='text-base-content/50 text-xs'>{m.profile_theme_desc()}</p>
            </div>
            <ThemeSelector
              currentTheme={currentTheme}
              onchange={handleThemeChange}
              showPreview
              compact
              grouped={false}
              class='shrink-0'
            />
          </div>
        </div>
      </Card>

      <Card title={m.profile_scope_title()} shadow='sm'>
        <div class='space-y-3'>
          <div>
            <p class='text-base-content/50 mb-2 text-sm'>{m.profile_roles_label()}</p>
            <div class='flex flex-wrap gap-2'>
              {#each currentRoles() as role (role)}
                <Badge variant='primary' size='sm'>{role}</Badge>
              {:else}
                <span class='text-base-content/50 text-sm'>{m.common_empty()}</span>
              {/each}
            </div>
          </div>

          <div>
            <p class='text-base-content/50 mb-2 text-sm'>{m.profile_permissions_label()}</p>
            <div class='flex flex-wrap gap-2'>
              {#each currentPermissions() as permission (permission)}
                <Badge variant='info' size='sm'>{permission}</Badge>
              {:else}
                <span class='text-base-content/50 text-sm'>{m.common_empty()}</span>
              {/each}
            </div>
          </div>
        </div>
      </Card>

      <Button variant='error' outline class='w-full' onclick={handleLogout}>
        <span class='icon-[tabler--logout] text-lg'></span>
        {m.action_logout()}
      </Button>
    {:else}
      <Alert variant='warning' title={m.profile_guest_title()}>
        {m.profile_guest_desc()}
      </Alert>
    {/if}
  </div>
</PullRefresh>
