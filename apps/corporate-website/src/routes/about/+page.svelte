<script lang="ts">
  /**
   * 关于我们
   */
</script>

<svelte:head>
  <title>关于我们 - 企业名称</title>
  <meta name="description" content="了解企业名称的发展历程、团队和愿景。" />
</svelte:head>

<section class="py-20 px-4 lg:px-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-4xl font-bold mb-8">关于我们</h1>

    <div class="prose max-w-none">
      <p class="text-lg text-gray-600 mb-8">
        我们是一家专注于企业数字化转型的科技公司，致力于为客户提供高质量的技术服务和解决方案。
      </p>

      <h2>我们的愿景</h2>
      <p>成为行业领先的企业服务提供商，用技术驱动商业创新。</p>

      <h2>我们的使命</h2>
      <p>帮助每一家企业实现数字化升级，提高运营效率，创造更大价值。</p>
    </div>

    <!-- 团队介绍 -->
    <div class="mt-16">
      <h2 class="text-3xl font-bold mb-8">我们的团队</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="card bg-base-200">
          <div class="card-body items-center text-center">
            <div class="avatar placeholder mb-4">
              <div class="bg-primary text-primary-content rounded-full w-20">
                <span class="text-2xl">CEO</span>
              </div>
            </div>
            <h3 class="card-title">创始人</h3>
            <p class="text-sm text-gray-500">首席执行官</p>
          </div>
        </div>
        <div class="card bg-base-200">
          <div class="card-body items-center text-center">
            <div class="avatar placeholder mb-4">
              <div class="bg-secondary text-secondary-content rounded-full w-20">
                <span class="text-2xl">CTO</span>
              </div>
            </div>
            <h3 class="card-title">技术负责人</h3>
            <p class="text-sm text-gray-500">首席技术官</p>
          </div>
        </div>
        <div class="card bg-base-200">
          <div class="card-body items-center text-center">
            <div class="avatar placeholder mb-4">
              <div class="bg-accent text-accent-content rounded-full w-20">
                <span class="text-2xl">COO</span>
              </div>
            </div>
            <h3 class="card-title">运营负责人</h3>
            <p class="text-sm text-gray-500">首席运营官</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
