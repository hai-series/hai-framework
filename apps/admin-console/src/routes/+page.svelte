/**
 * =============================================================================
 * hai Admin Console - 首页
 * =============================================================================
 */
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

<div class="container">
  <header class="hero">
    <h1 class="title">
      <span class="logo">hai</span>
      <span class="subtitle">Admin Framework</span>
    </h1>
    <p class="tagline">AI-Native · Configuration-Driven · Security-First</p>
    
    <div class="actions">
      <a href="/login" class="btn btn-primary">开始使用</a>
      <a href="https://github.com/hai-framework/hai" class="btn btn-secondary" target="_blank">
        GitHub
      </a>
    </div>
  </header>
  
  <section class="features">
    <h2 class="section-title">核心特性</h2>
    <div class="feature-grid">
      {#each features as feature}
        <div class="feature-card">
          <span class="feature-icon">{feature.icon}</span>
          <h3 class="feature-title">{feature.title}</h3>
          <p class="feature-desc">{feature.description}</p>
        </div>
      {/each}
    </div>
  </section>
  
  <section class="tech-stack">
    <h2 class="section-title">技术栈</h2>
    <div class="tech-tags">
      <span class="tech-tag">SvelteKit 2.x</span>
      <span class="tech-tag">Svelte 5 Runes</span>
      <span class="tech-tag">TypeScript 5.7+</span>
      <span class="tech-tag">Drizzle ORM</span>
      <span class="tech-tag">国密算法</span>
      <span class="tech-tag">Pino 日志</span>
      <span class="tech-tag">Zod 验证</span>
      <span class="tech-tag">MCP 协议</span>
    </div>
  </section>
  
  <footer class="footer">
    <p>© {new Date().getFullYear()} hai Admin Framework. MIT License.</p>
  </footer>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  .hero {
    text-align: center;
    padding: 4rem 0;
  }
  
  .title {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .logo {
    color: #3b82f6;
    font-weight: 800;
  }
  
  .subtitle {
    font-weight: 300;
    color: #666;
  }
  
  .tagline {
    font-size: 1.25rem;
    color: #888;
    margin-bottom: 2rem;
  }
  
  .actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }
  
  .btn {
    padding: 0.75rem 2rem;
    border-radius: 0.5rem;
    font-weight: 500;
    transition: all 0.2s;
  }
  
  .btn-primary {
    background: #3b82f6;
    color: white;
  }
  
  .btn-primary:hover {
    background: #2563eb;
  }
  
  .btn-secondary {
    background: white;
    border: 1px solid #ddd;
    color: #333;
  }
  
  .btn-secondary:hover {
    background: #f5f5f5;
  }
  
  .section-title {
    text-align: center;
    font-size: 1.5rem;
    margin-bottom: 2rem;
    color: #333;
  }
  
  .features {
    padding: 3rem 0;
  }
  
  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
  }
  
  .feature-card {
    background: white;
    padding: 1.5rem;
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .feature-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .feature-icon {
    font-size: 2rem;
    display: block;
    margin-bottom: 0.75rem;
  }
  
  .feature-title {
    font-size: 1.125rem;
    margin-bottom: 0.5rem;
  }
  
  .feature-desc {
    color: #666;
    font-size: 0.875rem;
  }
  
  .tech-stack {
    padding: 3rem 0;
  }
  
  .tech-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
  }
  
  .tech-tag {
    background: #e0e7ff;
    color: #3730a3;
    padding: 0.5rem 1rem;
    border-radius: 2rem;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .footer {
    text-align: center;
    padding: 2rem 0;
    color: #888;
    font-size: 0.875rem;
  }
</style>
