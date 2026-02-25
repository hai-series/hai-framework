<script lang="ts">
  /**
   * 个人中心页
   */
  const menuItems = [
    { icon: '📦', label: '我的订单', badge: '3' },
    { icon: '💳', label: '我的钱包', badge: '' },
    { icon: '📍', label: '收货地址', badge: '' },
    { icon: '⭐', label: '我的收藏', badge: '12' },
    { icon: '🎫', label: '优惠券', badge: '5' },
    { icon: '⚙️', label: '设置', badge: '' }
  ]
</script>

<svelte:head>
  <title>我的 - H5 应用</title>
</svelte:head>

<div>
  <!-- 用户信息卡片 -->
  <div class="bg-primary text-primary-content p-6 pb-10">
    <div class="flex items-center gap-4">
      <div class="avatar placeholder">
        <div class="bg-neutral text-neutral-content w-16 rounded-full">
          <span class="text-2xl">👤</span>
        </div>
      </div>
      <div>
        <h2 class="text-lg font-bold">未登录</h2>
        <p class="text-sm opacity-80">点击登录享更多权益</p>
      </div>
    </div>
  </div>

  <!-- 统计 -->
  <div class="bg-base-100 rounded-t-2xl -mt-4 pt-4 px-4">
    <div class="grid grid-cols-4 text-center py-3">
      <div>
        <p class="font-bold">0</p>
        <p class="text-xs text-gray-500">待付款</p>
      </div>
      <div>
        <p class="font-bold">0</p>
        <p class="text-xs text-gray-500">待发货</p>
      </div>
      <div>
        <p class="font-bold">0</p>
        <p class="text-xs text-gray-500">待收货</p>
      </div>
      <div>
        <p class="font-bold">0</p>
        <p class="text-xs text-gray-500">待评价</p>
      </div>
    </div>

    <div class="divider my-0"></div>

    <!-- 菜单列表 -->
    <ul class="menu p-0">
      {#each menuItems as item}
        <li>
          <button class="flex items-center justify-between w-full">
            <span class="flex items-center gap-3">
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </span>
            {#if item.badge}
              <span class="badge badge-sm badge-primary">{item.badge}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  </div>
</div>
