<!--
  =============================================================================
  hai Admin Console - 首页
  =============================================================================
-->
<script lang="ts">
  /**
   * 首页组件
   */
  const features = [
    {
      icon: '🔐',
      title: '端到端加密',
      description: '使用国密算法 SM2/SM3/SM4 保护数据安全',
    },
    {
      icon: '🤖',
      title: 'AI 原生',
      description: '内置 AI 能力，支持 OpenAI 兼容 API 和 MCP 协议',
    },
    {
      icon: '⚡',
      title: '配置驱动',
      description: 'YAML 配置文件，环境变量插值，热重载',
    },
    {
      icon: '🎨',
      title: 'Svelte 5',
      description: '使用最新 Runes 语法，组件简洁高效',
    },
    {
      icon: '🗃️',
      title: '多数据库',
      description: '支持 SQLite、PostgreSQL、MySQL',
    },
    {
      icon: '📦',
      title: '模块化',
      description: '按需引入，减少打包体积',
    },
  ]
</script>

<svelte:head>
  <title>hai Admin Framework</title>
  <meta name="description" content="AI-Native, Configuration-Driven, Security-First Admin Framework" />
</svelte:head>

<div class="max-w-6xl mx-auto px-8 py-8">
  <!-- Hero -->
  <header class="text-center py-16">
    <h1 class="text-5xl font-bold mb-4">
      <span class="text-primary font-extrabold">hai</span>
      <span class="font-light text-base-content/60">Admin Framework</span>
    </h1>
    <p class="text-xl text-base-content/50 mb-8">AI-Native · Configuration-Driven · Security-First</p>
    
    <div class="flex gap-4 justify-center">
      <a href="/login" class="btn btn-primary">开始使用</a>
      <a href="https://github.com/hai-framework/hai" class="btn btn-outline" target="_blank">
        GitHub
      </a>
    </div>
  </header>
  
  <!-- 核心特性 -->
  <section class="py-12">
    <h2 class="text-center text-2xl font-semibold text-base-content mb-8">核心特性</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each features as feature}
        <div class="card bg-base-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div class="card-body">
            <span class="text-3xl">{feature.icon}</span>
            <h3 class="card-title text-lg">{feature.title}</h3>
            <p class="text-base-content/60 text-sm">{feature.description}</p>
          </div>
        </div>
      {/each}
    </div>
  </section>
  
  <!-- 技术栈 -->
  <section class="py-12">
    <h2 class="text-center text-2xl font-semibold text-base-content mb-8">技术栈</h2>
    <div class="flex flex-wrap gap-3 justify-center">
      <span class="badge badge-primary badge-lg">SvelteKit 2.x</span>
      <span class="badge badge-primary badge-lg">Svelte 5 Runes</span>
      <span class="badge badge-primary badge-lg">TypeScript 5.7+</span>
      <span class="badge badge-primary badge-lg">Drizzle ORM</span>
      <span class="badge badge-primary badge-lg">国密算法</span>
      <span class="badge badge-primary badge-lg">Pino 日志</span>
      <span class="badge badge-primary badge-lg">Zod 验证</span>
      <span class="badge badge-primary badge-lg">MCP 协议</span>
    </div>
  </section>
  
  <!-- Footer -->
  <footer class="text-center py-8 text-base-content/50 text-sm">
    <p>© {new Date().getFullYear()} hai Admin Framework. MIT License.</p>
  </footer>
</div>
