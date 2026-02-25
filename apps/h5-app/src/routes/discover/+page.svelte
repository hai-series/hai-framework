<script lang="ts">
  /**
   * 发现页 — 分类浏览
   */
  const categories = [
    { name: '数码', icon: '📱', count: 128 },
    { name: '服饰', icon: '👕', count: 256 },
    { name: '美食', icon: '🍜', count: 89 },
    { name: '家居', icon: '🏠', count: 167 },
    { name: '运动', icon: '⚽', count: 95 },
    { name: '图书', icon: '📚', count: 312 }
  ]

  const trending = [
    { title: '热门话题 1', desc: '这是一个热门话题描述' },
    { title: '热门话题 2', desc: '这是另一个热门话题' },
    { title: '热门话题 3', desc: '更多精彩内容等你发现' }
  ]
</script>

<svelte:head>
  <title>发现 - H5 应用</title>
</svelte:head>

<div class="p-4">
  <h1 class="text-xl font-bold mb-4">发现</h1>

  <!-- 分类 -->
  <section class="mb-6">
    <h2 class="font-semibold mb-3">热门分类</h2>
    <div class="grid grid-cols-3 gap-3">
      {#each categories as cat}
        <button class="card bg-base-200 p-4 flex flex-col items-center gap-2">
          <span class="text-3xl">{cat.icon}</span>
          <span class="text-sm font-medium">{cat.name}</span>
          <span class="text-xs text-gray-400">{cat.count} 件</span>
        </button>
      {/each}
    </div>
  </section>

  <!-- 热门话题 -->
  <section>
    <h2 class="font-semibold mb-3">热门话题</h2>
    <div class="space-y-3">
      {#each trending as topic, i}
        <div class="flex items-start gap-3 p-3 bg-base-200 rounded-lg">
          <span class="text-primary font-bold text-lg">{i + 1}</span>
          <div>
            <h3 class="font-medium text-sm">{topic.title}</h3>
            <p class="text-xs text-gray-500">{topic.desc}</p>
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>
