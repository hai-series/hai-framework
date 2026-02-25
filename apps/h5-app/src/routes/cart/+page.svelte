<script lang="ts">
  /**
   * 购物车页
   */
  let items = $state([
    { id: 1, name: '智能手表 Pro', price: 299, qty: 1, icon: '⌚' },
    { id: 2, name: '无线蓝牙耳机', price: 129, qty: 2, icon: '🎧' }
  ])

  const total = $derived(items.reduce((sum, item) => sum + item.price * item.qty, 0))

  function removeItem(id: number) {
    items = items.filter((item) => item.id !== id)
  }
</script>

<svelte:head>
  <title>购物车 - H5 应用</title>
</svelte:head>

<div class="p-4">
  <h1 class="text-xl font-bold mb-4">购物车</h1>

  {#if items.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-gray-400">
      <span class="text-5xl mb-4">🛒</span>
      <p>购物车是空的</p>
      <a href="/" class="btn btn-primary btn-sm mt-4">去逛逛</a>
    </div>
  {:else}
    <div class="space-y-3">
      {#each items as item (item.id)}
        <div class="flex items-center gap-3 p-3 bg-base-200 rounded-lg">
          <span class="text-3xl">{item.icon}</span>
          <div class="flex-1">
            <h3 class="font-medium text-sm">{item.name}</h3>
            <p class="text-primary font-bold text-sm">¥{item.price}</p>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn btn-xs btn-outline" onclick={() => { if (item.qty > 1) item.qty-- }}>-</button>
            <span class="text-sm w-6 text-center">{item.qty}</span>
            <button class="btn btn-xs btn-outline" onclick={() => item.qty++}>+</button>
          </div>
          <button class="btn btn-ghost btn-xs text-error" onclick={() => removeItem(item.id)}>✕</button>
        </div>
      {/each}
    </div>

    <div class="fixed bottom-16 left-0 right-0 max-w-lg mx-auto bg-base-100 border-t p-3 flex items-center justify-between">
      <span class="text-lg font-bold">合计：<span class="text-primary">¥{total}</span></span>
      <button class="btn btn-primary btn-sm">去结算</button>
    </div>
  {/if}
</div>
