<script lang="ts">
  /**
   * 服务页面
   */
</script>

<svelte:head>
  <title>服务 - 企业名称</title>
  <meta name="description" content="企业名称提供的专业服务和解决方案。" />
</svelte:head>

<section class="py-20 px-4 lg:px-8">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-4xl font-bold text-center mb-4">我们的服务</h1>
    <p class="text-center text-gray-500 mb-12 max-w-2xl mx-auto">
      为企业提供全方位的技术服务和解决方案
    </p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <div class="text-3xl mb-2">💻</div>
          <h2 class="card-title">软件定制开发</h2>
          <p class="text-gray-600">根据业务需求量身定制软件系统，满足企业个性化需要。</p>
          <ul class="list-disc list-inside text-sm text-gray-500 mt-4 space-y-1">
            <li>需求分析与方案设计</li>
            <li>系统开发与测试</li>
            <li>部署上线与运维</li>
          </ul>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <div class="text-3xl mb-2">☁️</div>
          <h2 class="card-title">云服务与部署</h2>
          <p class="text-gray-600">提供云架构设计、迁移和运维服务，确保业务稳定运行。</p>
          <ul class="list-disc list-inside text-sm text-gray-500 mt-4 space-y-1">
            <li>云架构设计</li>
            <li>数据迁移</li>
            <li>高可用保障</li>
          </ul>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <div class="text-3xl mb-2">🔐</div>
          <h2 class="card-title">安全咨询</h2>
          <p class="text-gray-600">安全评估、渗透测试、合规咨询，全面保障企业信息安全。</p>
          <ul class="list-disc list-inside text-sm text-gray-500 mt-4 space-y-1">
            <li>安全评估</li>
            <li>渗透测试</li>
            <li>合规审计</li>
          </ul>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <div class="text-3xl mb-2">📊</div>
          <h2 class="card-title">数据分析</h2>
          <p class="text-gray-600">大数据分析、BI 报表、数据可视化，助力数据驱动决策。</p>
          <ul class="list-disc list-inside text-sm text-gray-500 mt-4 space-y-1">
            <li>数据采集与清洗</li>
            <li>BI 报表系统</li>
            <li>数据可视化大屏</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>
