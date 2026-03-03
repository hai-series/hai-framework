<script lang="ts">
  /**
   * 企业官网首页 — SEO 友好的着陆页
   */
  import { Button, Input, Spinner } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages.js'

  let chatMessages = $state<Array<{ role: 'user' | 'assistant', content: string }>>([
    { role: 'assistant', content: m.home_ai_greeting() },
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
      const reply = data.data?.reply ?? m.home_ai_fallback()
      chatMessages = [...chatMessages, { role: 'assistant', content: reply }]
    }
    catch {
      chatMessages = [...chatMessages, { role: 'assistant', content: m.home_ai_error() }]
    }
    finally {
      chatLoading = false
    }
  }

  const advantages = $derived([
    {
      icon: 'icon-[tabler--trophy]',
      color: 'text-primary',
      accent: 'bg-primary/8',
      title: m.home_advantage_team_title(),
      desc: m.home_advantage_team_desc(),
    },
    {
      icon: 'icon-[tabler--bolt]',
      color: 'text-secondary',
      accent: 'bg-secondary/8',
      title: m.home_advantage_delivery_title(),
      desc: m.home_advantage_delivery_desc(),
    },
    {
      icon: 'icon-[tabler--shield-check]',
      color: 'text-accent',
      accent: 'bg-accent/8',
      title: m.home_advantage_security_title(),
      desc: m.home_advantage_security_desc(),
    },
  ])
</script>

<svelte:head>
  <title>{m.brand()} - {m.home_title()}</title>
  <meta name="description" content={m.meta_description()} />
  <meta name="keywords" content="企业服务, 解决方案, 技术支持" />
  <meta property="og:title" content={`${m.brand()} - ${m.home_title()}`} />
  <meta property="og:description" content={m.meta_description()} />
  <meta property="og:type" content="website" />
</svelte:head>

<!-- Hero 区域 -->
<section class="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
  <div class="absolute inset-0 bg-linear-to-br from-primary/5 via-base-100 to-secondary/5"></div>
  <div class="relative z-10 text-center px-4 max-w-3xl mx-auto hai-fade-in">
    <h1 class="text-5xl lg:text-6xl font-bold mb-6 leading-tight tracking-tight text-base-content">
      {m.home_title()}
    </h1>
    <p class="text-lg text-base-content/60 mb-10 max-w-xl mx-auto leading-relaxed">
      {m.home_subtitle()}
    </p>
    <div class="flex flex-wrap gap-4 justify-center">
      <a href="/partners">
        <Button variant="primary" size="lg">{m.home_partner_cta()}</Button>
      </a>
      <a href="/services">
        <Button variant="default" size="lg" outline>{m.home_service_cta()}</Button>
      </a>
    </div>
  </div>
</section>

<!-- 核心优势 -->
<section class="py-20 px-4 lg:px-8">
  <div class="max-w-7xl mx-auto">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold tracking-tight text-base-content">{m.home_why_title()}</h2>
      <p class="text-base-content/50 mt-2 max-w-2xl mx-auto">{m.home_why_subtitle()}</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      {#each advantages as item}
        <Card shadow="sm" class="hover:-translate-y-1 hover:shadow-(--shadow-lifted) transition-all duration-200">
          <div class="flex flex-col items-center text-center">
            <div class="w-14 h-14 rounded-2xl {item.accent} flex items-center justify-center mb-4">
              <span class="{item.icon} size-7 {item.color}"></span>
            </div>
            <h3 class="text-lg font-semibold text-base-content mb-2">{item.title}</h3>
            <p class="text-sm text-base-content/60 leading-relaxed">{item.desc}</p>
          </div>
        </Card>
      {/each}
    </div>
  </div>
</section>

<!-- 数据统计 -->
<section class="py-16 px-4 bg-primary text-primary-content">
  <div class="max-w-7xl mx-auto">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="text-center">
        <div class="text-4xl font-bold tabular-nums">500+</div>
        <div class="text-primary-content/70 text-sm mt-1">{m.home_stat_clients()}</div>
      </div>
      <div class="text-center">
        <div class="text-4xl font-bold tabular-nums">10+</div>
        <div class="text-primary-content/70 text-sm mt-1">{m.home_stat_experience()}</div>
      </div>
      <div class="text-center">
        <div class="text-4xl font-bold tabular-nums">99.9%</div>
        <div class="text-primary-content/70 text-sm mt-1">{m.home_stat_uptime()}</div>
      </div>
      <div class="text-center">
        <div class="text-4xl font-bold tabular-nums">24/7</div>
        <div class="text-primary-content/70 text-sm mt-1">{m.home_stat_support()}</div>
      </div>
    </div>
  </div>
</section>

<!-- AI 智能助手 -->
<section class="py-20 px-4 lg:px-8">
  <div class="max-w-3xl mx-auto">
    <div class="text-center mb-8">
      <h2 class="text-3xl font-bold tracking-tight text-base-content">{m.home_ai_title()}</h2>
      <p class="text-base-content/50 mt-2">{m.home_ai_subtitle()}</p>
    </div>

    <Card shadow="md" padding="lg">
      <!-- 聊天消息区域 -->
      <div class="min-h-50 max-h-75 overflow-y-auto space-y-3 mb-4">
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
              <Spinner size="sm" />
            </div>
          </div>
        {/if}
      </div>

      <!-- 输入区域 -->
      <form class="flex gap-2" onsubmit={handleChat}>
        <Input
          placeholder={m.home_ai_placeholder()}
          bind:value={chatInput}
          disabled={chatLoading}
        />
        <Button type="submit" variant="primary" disabled={chatLoading || !chatInput.trim()}>
          {m.home_ai_send()}
        </Button>
      </form>
    </Card>
  </div>
</section>

<!-- CTA 区域 -->
<section class="py-20 px-4 bg-base-200/50">
  <div class="max-w-3xl mx-auto text-center">
    <h2 class="text-3xl font-bold tracking-tight text-base-content mb-4">{m.home_cta_title()}</h2>
    <p class="text-base-content/60 mb-8">{m.home_cta_subtitle()}</p>
    <a href="/contact">
      <Button variant="primary" size="lg">{m.home_cta_button()}</Button>
    </a>
  </div>
</section>
