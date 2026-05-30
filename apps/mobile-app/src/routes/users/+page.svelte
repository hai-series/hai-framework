<script lang='ts'>
  import * as m from '$lib/paraglide/messages.js'
  import {
    currentUsers,
    currentUsersError,
    currentUsersTotal,
    hasMoreUsers,
    isUsersLoading,
    loadMoreUsers,
    refreshUsers,
  } from '$lib/stores/users-store.svelte.js'
  import { onMount } from 'svelte'

  onMount(() => {
    void refreshUsers()
  })
</script>

<svelte:head>
  <title>{m.users_title()} - {m.app_title()}</title>
</svelte:head>

<PullRefresh onrefresh={refreshUsers}>
  <div class='space-y-4 p-4 pb-6'>
    <section>
      <h1 class='text-2xl font-bold'>{m.users_title()}</h1>
      <p class='text-base-content/60 mt-1 text-sm'>{m.users_subtitle({ total: currentUsersTotal() })}</p>
    </section>

    {#if currentUsersError()}
      <Alert variant='error' title={m.users_error_title()}>
        {currentUsersError()}
      </Alert>
    {/if}

    <InfiniteScroll
      onloadmore={loadMoreUsers}
      hasMore={hasMoreUsers()}
      loadingText={m.common_loading()}
      noMoreText={m.common_no_more()}
    >
      <div class='space-y-3'>
        {#each currentUsers() as user (user.id)}
          <Card padding='sm' shadow='sm'>
            <div class='flex items-center gap-3'>
              <div class='bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-full font-bold'>
                {user.username.slice(0, 1).toUpperCase()}
              </div>
              <div class='min-w-0 flex-1'>
                <div class='flex items-center gap-2'>
                  <p class='truncate font-medium'>{user.username}</p>
                  <Badge variant={user.enabled ? 'success' : 'warning'} size='sm'>
                    {user.enabled ? m.common_enabled() : m.common_disabled()}
                  </Badge>
                </div>
                <p class='text-base-content/50 truncate text-sm'>{user.email ?? m.users_email_empty()}</p>
              </div>
            </div>
          </Card>
        {:else}
          {#if !isUsersLoading()}
            <div class='text-base-content/50 py-12 text-center text-sm'>{m.users_empty()}</div>
          {/if}
        {/each}
      </div>
    </InfiniteScroll>
  </div>
</PullRefresh>
