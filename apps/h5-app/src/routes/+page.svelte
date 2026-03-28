<script lang='ts'>
  /**
   * H5 首页 — 轮播 + 功能入口 + 推荐列表（PullRefresh + InfiniteScroll）
   */
  import * as m from '$lib/paraglide/messages.js'
  import { Badge, Card, InfiniteScroll, Input, PullRefresh } from '@h-ai/ui'

  const banners = [
    { title: m.home_banner_new_title, subtitle: m.home_banner_new_subtitle, color: 'from-primary to-primary/70' },
    { title: m.home_banner_sale_title, subtitle: m.home_banner_sale_subtitle, color: 'from-secondary to-secondary/70' },
    { title: m.home_banner_member_title, subtitle: m.home_banner_member_subtitle, color: 'from-accent to-accent/70' },
  ]

  const quickEntries = [
    { icon: 'icon-[tabler--bolt]', label: m.home_quick_flash_sale, color: 'text-error' },
    { icon: 'icon-[tabler--ticket]', label: m.home_quick_coupon, color: 'text-warning' },
    { icon: 'icon-[tabler--package]', label: m.home_quick_orders, color: 'text-primary' },
    { icon: 'icon-[tabler--star]', label: m.home_quick_favorites, color: 'text-accent' },
    { icon: 'icon-[tabler--flame]', label: m.home_quick_hot, color: 'text-error' },
    { icon: 'icon-[tabler--category]', label: m.home_quick_categories, color: 'text-info' },
    { icon: 'icon-[tabler--message-circle]', label: m.home_quick_support, color: 'text-success' },
    { icon: 'icon-[tabler--speakerphone]', label: m.home_quick_notice, color: 'text-secondary' },
  ]

  /** 模拟推荐列表（支持分页加载更多） */
  const allItems = [
    { title: m.home_rec_watch(), price: '¥299', image: '⌚', tag: m.home_tag_new() },
    { title: m.home_rec_earbuds(), price: '¥129', image: '🎧', tag: m.home_tag_hot() },
    { title: m.home_rec_powerbank(), price: '¥89', image: '🔋', tag: m.home_tag_special() },
    { title: m.home_rec_bottle(), price: '¥49', image: '🥤', tag: '' },
    { title: m.home_rec_watch(), price: '¥259', image: '⌚', tag: m.home_tag_hot() },
    { title: m.home_rec_earbuds(), price: '¥99', image: '🎧', tag: m.home_tag_special() },
  ]

  const PAGE_SIZE = 4
  let recommendations = $state(allItems.slice(0, PAGE_SIZE))
  const hasMore = $derived(recommendations.length < allItems.length)

  let searchValue = $state('')

  /** 下拉刷新 */
  async function handleRefresh() {
    await new Promise(resolve => setTimeout(resolve, 800))
    recommendations = allItems.slice(0, PAGE_SIZE)
  }

  /** 上拉加载更多 */
  async function handleLoadMore() {
    await new Promise(resolve => setTimeout(resolve, 600))
    const next = allItems.slice(recommendations.length, recommendations.length + PAGE_SIZE)
    recommendations = [...recommendations, ...next]
  }
</script>

<svelte:head>
  <title>{m.app_title()}</title>
</svelte:head>

<!-- 搜索栏 -->
<div class='sticky top-0 z-10 bg-base-100/95 backdrop-blur px-3 py-2'>
  <Input
    bind:value={searchValue}
    placeholder={m.home_search_placeholder()}
    size='sm'
    class='rounded-full'
  />
</div>

<PullRefresh onrefresh={handleRefresh}>
  <!-- 轮播区 -->
  <div class='carousel w-full h-40 px-3 pt-2 gap-3'>
    {#each banners as banner, i}
      <div id='slide{i}' class='carousel-item w-[90%] first:ml-0'>
        <div class='bg-linear-to-br {banner.color} w-full flex flex-col items-start justify-center text-white rounded-2xl px-6 shadow-md'>
          <h2 class='text-xl font-bold'>{banner.title()}</h2>
          <p class='text-sm opacity-80 mt-1'>{banner.subtitle()}</p>
        </div>
      </div>
    {/each}
  </div>

  <!-- 功能入口 -->
  <div class='grid grid-cols-4 gap-1 px-4 py-3'>
    {#each quickEntries as entry}
      <button class='flex flex-col items-center gap-1.5 py-2.5 rounded-xl active:bg-base-200/60 transition-colors'>
        <span class='w-10 h-10 rounded-full bg-base-200/70 flex items-center justify-center'>
          <span class='{entry.icon} text-xl {entry.color}'></span>
        </span>
        <span class='text-xs text-base-content/70'>{entry.label()}</span>
      </button>
    {/each}
  </div>

  <!-- 推荐列表（InfiniteScroll 上拉加载） -->
  <section class='px-4 pb-4'>
    <h3 class='font-bold text-base mb-3 flex items-center gap-1.5'>
      <span class='icon-[tabler--sparkles] text-primary text-lg'></span>
      {m.home_recommend_title()}
    </h3>
    <InfiniteScroll
      onloadmore={handleLoadMore}
      {hasMore}
      loadingText={m.load_loading()}
      noMoreText={m.load_no_more()}
    >
      <div class='grid grid-cols-2 gap-3'>
        {#each recommendations as item}
          <Card padding='none' shadow='sm' class='overflow-hidden'>
            <div class='flex items-center justify-center h-28 bg-base-200/50 text-4xl'>
              {item.image}
            </div>
            <div class='p-3 space-y-1.5'>
              <h4 class='text-sm font-medium line-clamp-1'>{item.title}</h4>
              <div class='flex items-center justify-between'>
                <span class='text-primary font-bold text-sm'>{item.price}</span>
                {#if item.tag}
                  <Badge variant='primary' size='sm'>{item.tag}</Badge>
                {/if}
              </div>
            </div>
          </Card>
        {/each}
      </div>
    </InfiniteScroll>
  </section>
</PullRefresh>
