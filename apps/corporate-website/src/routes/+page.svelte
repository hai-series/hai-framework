<script lang="ts">
  /**
   * 企业官网首页 — SEO 友好的着陆页
   */
  let chatMessages = $state<Array<{ role: 'user' | 'assistant', content: string }>>([
    { role: 'assistant', content: '您好！我是智能助手，有什么可以帮您的吗？' },
  ])
  let chatInput = $state('')
  let chatLoading = $state(false)

  async function handleChat(e: Event) {
    e.preventDefault()
    const msg = chatInput.trim()
    if (!msg) return

    chatMessages = [...chatMessages, { role: 'user', content: msg }]
    chatInput = ''
    chatLoading = true

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      const reply = data.data?.reply ?? '抱歉，暂时无法回复。'
      chatMessages = [...chatMessages, { role: 'assistant', content: reply }]
    }
    catch {
      chatMessages = [...chatMessages, { role: 'assistant', content: '网络错误，请稍后重试。' }]
    }
    finally {
      chatLoading = false
    }
  }
</script>

<svelte:head>
  <title>企业名称 - 专业企业服务</title>
  <meta name="description" content="企业名称官方网站，提供专业的企业服务和解决方案。" />
  <meta name="keywords" content="企业服务, 解决方案, 技术支持" />
  <meta property="og:title" content="企业名称 - 专业企业服务" />
  <meta property="og:description" content="企业名称官方网站，提供专业的企业服务和解决方案。" />
  <meta property="og:type" content="website" />
</svelte:head>

<!-- Hero 区域 -->
<section class="hero min-h-[70vh] bg-gradient-to-br from-primary/10 to-secondary/10">
  <div class="hero-content text-center">
    <div class="max-w-3xl">
      <h1 class="text-5xl lg:text-6xl font-bold mb-6 leading-tight">
        专业、可靠的<br />企业级解决方案
      </h1>
      <p class="text-lg text-gray-600 mb-8 max-w-xl mx-auto">
        我们致力于为企业提供高质量的技术服务和解决方案，助力数字化转型。
      </p>
      <div class="flex flex-wrap gap-4 justify-center">
        <a href="/contact" class="btn btn-primary btn-lg">立即咨询</a>
        <a href="/services" class="btn btn-outline btn-lg">了解更多</a>
      </div>
    </div>
  </div>
</section>

<!-- 核心优势 -->
<section class="py-20 px-4 lg:px-8 bg-base-100">
  <div class="max-w-7xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-4">为什么选择我们</h2>
    <p class="text-center text-gray-500 mb-12 max-w-2xl mx-auto">多年行业经验，服务数百家企业客户</p>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="card bg-base-200 hover:shadow-lg transition-shadow">
        <div class="card-body items-center text-center">
          <div class="text-4xl mb-4">🏆</div>
          <h3 class="card-title">专业团队</h3>
          <p class="text-gray-600">拥有多年行业经验的专业技术团队，经验丰富、值得信赖。</p>
        </div>
      </div>
      <div class="card bg-base-200 hover:shadow-lg transition-shadow">
        <div class="card-body items-center text-center">
          <div class="text-4xl mb-4">⚡</div>
          <h3 class="card-title">高效交付</h3>
          <p class="text-gray-600">敏捷开发流程，快速响应需求变化，确保按时高质量交付。</p>
        </div>
      </div>
      <div class="card bg-base-200 hover:shadow-lg transition-shadow">
        <div class="card-body items-center text-center">
          <div class="text-4xl mb-4">🛡️</div>
          <h3 class="card-title">安全可靠</h3>
          <p class="text-gray-600">企业级安全防护，全方位保障客户数据安全和业务稳定。</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- 数据统计 -->
<section class="py-16 px-4 bg-primary text-primary-content">
  <div class="max-w-7xl mx-auto">
    <div class="stats stats-vertical lg:stats-horizontal w-full bg-transparent text-primary-content">
      <div class="stat place-items-center">
        <div class="stat-value">500+</div>
        <div class="stat-desc text-primary-content/70">服务客户</div>
      </div>
      <div class="stat place-items-center">
        <div class="stat-value">10+</div>
        <div class="stat-desc text-primary-content/70">年行业经验</div>
      </div>
      <div class="stat place-items-center">
        <div class="stat-value">99.9%</div>
        <div class="stat-desc text-primary-content/70">服务可用率</div>
      </div>
      <div class="stat place-items-center">
        <div class="stat-value">24/7</div>
        <div class="stat-desc text-primary-content/70">技术支持</div>
      </div>
    </div>
  </div>
</section>

<!-- AI 智能助手 -->
<section class="py-20 px-4 lg:px-8 bg-base-100">
  <div class="max-w-3xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-4">智能助手</h2>
    <p class="text-center text-gray-500 mb-8">有任何问题？试试我们的 AI 助手，powered by @h-ai/ai</p>

    <div class="card bg-base-200 shadow-lg">
      <div class="card-body">
        <!-- 聊天消息区域 -->
        <div class="min-h-[200px] max-h-[300px] overflow-y-auto space-y-3 mb-4">
          {#each chatMessages as msg}
            <div class="chat {msg.role === 'user' ? 'chat-end' : 'chat-start'}">
              <div class="chat-bubble {msg.role === 'user' ? 'chat-bubble-primary' : ''}">
                {msg.content}
              </div>
            </div>
          {/each}
          {#if chatLoading}
            <div class="chat chat-start">
              <div class="chat-bubble">
                <span class="loading loading-dots loading-sm"></span>
              </div>
            </div>
          {/if}
        </div>

        <!-- 输入区域 -->
        <form class="flex gap-2" onsubmit={handleChat}>
          <input
            type="text"
            placeholder="输入您的问题..."
            class="input input-bordered flex-1"
            bind:value={chatInput}
            disabled={chatLoading}
          />
          <button type="submit" class="btn btn-primary" disabled={chatLoading || !chatInput.trim()}>
            发送
          </button>
        </form>
      </div>
    </div>
  </div>
</section>

<!-- CTA 区域 -->
<section class="py-20 px-4 bg-base-200">
  <div class="max-w-3xl mx-auto text-center">
    <h2 class="text-3xl font-bold mb-4">准备开始了吗？</h2>
    <p class="text-gray-600 mb-8">联系我们，获取免费咨询和解决方案报价。</p>
    <a href="/contact" class="btn btn-primary btn-lg">免费咨询</a>
  </div>
</section>
