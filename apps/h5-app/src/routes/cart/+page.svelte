<script lang='ts'>
  /**
   * 购物车页 — 使用 SwipeCell 滑动删除
   */
  import * as m from '$lib/paraglide/messages.js'
  import { Button, Card, Empty, IconButton, SwipeCell } from '@h-ai/ui'

  let items = $state([
    { id: 1, name: m.home_rec_watch(), price: 299, qty: 1, icon: '⌚' },
    { id: 2, name: m.home_rec_earbuds(), price: 129, qty: 2, icon: '🎧' },
  ])

  const total = $derived(items.reduce((sum, item) => sum + item.price * item.qty, 0))

  function removeItem(id: number) {
    items = items.filter(item => item.id !== id)
  }

  function handleSwipeAction(itemId: number, actionId: string) {
    if (actionId === 'delete') {
      removeItem(itemId)
    }
  }
</script>

<svelte:head>
  <title>{m.cart_title()} - {m.app_title()}</title>
</svelte:head>

<div class='p-4'>
  <h1 class='text-xl font-bold mb-4 flex items-center gap-2'>
    <span class='icon-[tabler--shopping-cart] text-primary text-2xl'></span>
    {m.cart_title()}
  </h1>

  {#if items.length === 0}
    <Empty title={m.cart_empty()} icon='inbox'>
      {#snippet action()}
        <a href='/'>
          <Button variant='primary' size='sm'>
            <span class='icon-[tabler--arrow-left] text-base'></span>
            {m.cart_go_shopping()}
          </Button>
        </a>
      {/snippet}
    </Empty>
  {:else}
    <div class='space-y-3'>
      {#each items as item (item.id)}
        <SwipeCell
          actions={[
            { id: 'collect', label: m.swipe_collect(), variant: 'warning' },
            { id: 'delete', label: m.swipe_delete(), variant: 'error' },
          ]}
          onaction={actionId => handleSwipeAction(item.id, actionId)}
        >
          <Card padding='sm' shadow='sm'>
            <div class='flex items-center gap-3'>
              <div class='w-14 h-14 rounded-lg bg-base-200 flex items-center justify-center text-2xl shrink-0'>
                {item.icon}
              </div>
              <div class='flex-1 min-w-0'>
                <h3 class='font-medium text-sm truncate'>{item.name}</h3>
                <p class='text-primary font-bold text-sm mt-0.5'>¥{item.price}</p>
                <div class='flex items-center gap-1.5 mt-1.5'>
                  <IconButton variant='outline' size='xs' ariaLabel='decrease' onclick={() => {
                    if (item.qty > 1)
                      item.qty--
                  }}>
                    <span class='icon-[tabler--minus] text-sm'></span>
                  </IconButton>
                  <span class='text-sm w-6 text-center font-medium'>{item.qty}</span>
                  <IconButton variant='outline' size='xs' ariaLabel='increase' onclick={() => item.qty++}>
                    <span class='icon-[tabler--plus] text-sm'></span>
                  </IconButton>
                </div>
              </div>
              <IconButton variant='ghost' size='xs' ariaLabel='remove' class='text-base-content/30 hover:text-error' onclick={() => removeItem(item.id)}>
                <span class='icon-[tabler--trash] text-lg'></span>
              </IconButton>
            </div>
          </Card>
        </SwipeCell>
      {/each}
    </div>

    <div class='sticky bottom-0 bg-base-100 border-t border-base-200 p-3 mt-4 -mx-4 px-4 flex items-center justify-between'>
      <span class='font-bold'>{m.cart_total_label()}: <span class='text-primary text-lg'>¥{total}</span></span>
      <Button variant='primary' size='sm' class='rounded-full px-6'>{m.cart_checkout()}</Button>
    </div>
  {/if}
</div>
