<script lang="ts">
  /**
   * H5 首页 — 轮播 + 功能入口 + 推荐列表
   */
  const banners = [
    { title: '新品上线', subtitle: '精选好物等你来', color: 'bg-primary' },
    { title: '限时特惠', subtitle: '低至 5 折起', color: 'bg-secondary' },
    { title: '会员专享', subtitle: '注册即享优惠', color: 'bg-accent' }
  ]

  const quickEntries = [
    { icon: '🎁', label: '限时抢购' },
    { icon: '🏷️', label: '优惠券' },
    { icon: '📦', label: '我的订单' },
    { icon: '⭐', label: '收藏' },
    { icon: '🔥', label: '热门' },
    { icon: '📋', label: '分类' },
    { icon: '💬', label: '客服' },
    { icon: '📣', label: '公告' }
  ]

  const recommendations = [
    { title: '智能手表 Pro', price: '¥299', image: '⌚', tag: '新品' },
    { title: '无线蓝牙耳机', price: '¥129', image: '🎧', tag: '热卖' },
    { title: '便携充电宝', price: '¥89', image: '🔋', tag: '特价' },
    { title: '运动水杯', price: '¥49', image: '🥤', tag: '' }
  ]
</script>

<svelte:head>
  <title>H5 应用</title>
</svelte:head>

<!-- 搜索栏 -->
<div class="sticky top-0 z-10 bg-base-100 p-3">
  <div class="input input-bordered flex items-center gap-2 w-full">
    <span>🔍</span>
    <input type="text" class="grow" placeholder="搜索商品" />
  </div>
</div>

<!-- 轮播区 -->
<div class="carousel w-full h-36">
  {#each banners as banner, i}
    <div id="slide{i}" class="carousel-item relative w-full">
      <div class="{banner.color} w-full flex flex-col items-center justify-center text-white rounded-lg mx-3">
        <h2 class="text-xl font-bold">{banner.title}</h2>
        <p class="text-sm opacity-80">{banner.subtitle}</p>
      </div>
    </div>
  {/each}
</div>

<!-- 功能入口 -->
<div class="grid grid-cols-4 gap-2 p-4">
  {#each quickEntries as entry}
    <button class="flex flex-col items-center gap-1 p-2">
      <span class="text-2xl">{entry.icon}</span>
      <span class="text-xs text-gray-600">{entry.label}</span>
    </button>
  {/each}
</div>

<div class="divider mx-4 my-0"></div>

<!-- 推荐列表 -->
<section class="p-4">
  <h3 class="font-bold text-lg mb-3">为你推荐</h3>
  <div class="grid grid-cols-2 gap-3">
    {#each recommendations as item}
      <div class="card bg-base-100 shadow-sm border">
        <div class="flex items-center justify-center h-28 bg-base-200 rounded-t-lg text-4xl">
          {item.image}
        </div>
        <div class="card-body p-3">
          <h4 class="text-sm font-medium line-clamp-1">{item.title}</h4>
          <div class="flex items-center justify-between">
            <span class="text-primary font-bold text-sm">{item.price}</span>
            {#if item.tag}
              <span class="badge badge-sm badge-outline badge-primary">{item.tag}</span>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
</section>
