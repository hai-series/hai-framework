<script lang="ts">
  /**
   * 新闻动态页面
   */
  const articles = [
    {
      title: '公司荣获年度最佳技术创新奖',
      date: '2025-01-15',
      summary: '在第十届技术创新峰会上，公司凭借卓越的技术能力和创新产品荣获年度最佳技术创新奖。',
      tag: '荣誉'
    },
    {
      title: '新一代云平台正式发布',
      date: '2025-01-10',
      summary: '经过一年多的研发迭代，全新云平台正式对外发布，提供更强大的计算和存储能力。',
      tag: '产品'
    },
    {
      title: '与某大型企业达成战略合作',
      date: '2024-12-20',
      summary: '双方将在云计算、大数据、人工智能等领域展开深度合作，共同推动数字化转型。',
      tag: '合作'
    },
    {
      title: '年终技术沙龙圆满举办',
      date: '2024-12-05',
      summary: '年度技术沙龙吸引了超过 500 名开发者参与，共同探讨前沿技术趋势。',
      tag: '活动'
    }
  ]
</script>

<svelte:head>
  <title>新闻动态 - 企业名称</title>
  <meta name="description" content="了解企业最新动态、行业资讯与技术分享。" />
</svelte:head>

<section class="py-20 px-4 lg:px-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-4xl font-bold text-center mb-4">新闻动态</h1>
    <p class="text-center text-gray-500 mb-12">了解我们的最新动态</p>

    <div class="space-y-6">
      {#each articles as article}
        <article class="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
          <div class="card-body">
            <div class="flex items-center gap-3 mb-2">
              <span class="badge badge-primary">{article.tag}</span>
              <time class="text-sm text-gray-400">{article.date}</time>
            </div>
            <h2 class="card-title text-lg">{article.title}</h2>
            <p class="text-gray-600">{article.summary}</p>
            <div class="card-actions justify-end mt-2">
              <button class="btn btn-ghost btn-sm">阅读更多 →</button>
            </div>
          </div>
        </article>
      {/each}
    </div>
  </div>
</section>
