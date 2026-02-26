<!--
  =============================================================================
  hai Admin Console - 首页
  =============================================================================
-->
<script lang="ts">
  import * as m from '$lib/paraglide/messages'

  /**
   * 首页组件
   */
  const features = $derived([
    {
      icon: '🔐',
      title: m.home_feature_encryption_title(),
      description: m.home_feature_encryption_desc(),
    },
    {
      icon: '🤖',
      title: m.home_feature_ai_title(),
      description: m.home_feature_ai_desc(),
    },
    {
      icon: '⚡',
      title: m.home_feature_config_title(),
      description: m.home_feature_config_desc(),
    },
    {
      icon: '🎨',
      title: 'Svelte 5',
      description: m.home_feature_svelte_desc(),
    },
    {
      icon: '🗃️',
      title: m.home_feature_multi_db_title(),
      description: m.home_feature_multi_db_desc(),
    },
    {
      icon: '📦',
      title: m.home_feature_modular_title(),
      description: m.home_feature_modular_desc(),
    },
  ])
</script>

<svelte:head>
  <title>{m.home_title()}</title>
  <meta name="description" content={m.home_meta_desc()} />
</svelte:head>

<div class="max-w-6xl mx-auto px-8 py-8">
  <!-- Hero -->
  <header class="text-center py-16">
    <h1 class="text-5xl font-bold mb-4">
      <span class="text-primary font-extrabold">hai</span>
      <span class="font-light text-base-content/60">Agent Framework</span>
    </h1>
    <p class="text-xl text-base-content/50 mb-8">{m.home_slogan()}</p>
    
    <div class="flex gap-4 justify-center">
      <a href="/login" class="btn btn-primary">{m.home_get_started()}</a>
      <a href="https://github.com/hai-framework/hai" class="btn btn-outline" target="_blank">
        GitHub
      </a>
    </div>
  </header>
  
  <!-- 核心特性 -->
  <section class="py-12">
    <h2 class="text-center text-2xl font-semibold text-base-content mb-8">{m.home_features_title()}</h2>
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
    <h2 class="text-center text-2xl font-semibold text-base-content mb-8">{m.home_tech_stack_title()}</h2>
    <div class="flex flex-wrap gap-3 justify-center">
      <span class="badge badge-primary badge-lg">SvelteKit 2.x</span>
      <span class="badge badge-primary badge-lg">Svelte 5 Runes</span>
      <span class="badge badge-primary badge-lg">TypeScript 5.7+</span>
      <span class="badge badge-primary badge-lg">{m.home_tech_sm_algo()}</span>
      <span class="badge badge-primary badge-lg">{m.home_tech_pino()}</span>
      <span class="badge badge-primary badge-lg">{m.home_tech_zod()}</span>
      <span class="badge badge-primary badge-lg">{m.home_tech_mcp()}</span>
    </div>
  </section>
  
  <!-- Footer -->
  <footer class="text-center py-8 text-base-content/50 text-sm">
    <p>© {new Date().getFullYear()} hai Agent Framework. MIT License.</p>
  </footer>
</div>
