<script lang="ts">
  /**
   * 企业官网根布局
   */
  import type { Snippet } from 'svelte'
  import '../app.css'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="min-h-screen flex flex-col">
  <!-- 导航栏 -->
  <header class="navbar bg-base-100 shadow-sm px-4 lg:px-8 sticky top-0 z-50">
    <div class="flex-1">
      <a href="/" class="text-xl font-bold">企业名称</a>
    </div>
    <nav class="flex-none hidden md:block">
      <ul class="menu menu-horizontal px-1">
        <li><a href="/">首页</a></li>
        <li><a href="/about">关于我们</a></li>
        <li><a href="/services">服务</a></li>
        <li><a href="/news">新闻</a></li>
        <li><a href="/contact">联系我们</a></li>
      </ul>
    </nav>
    <div class="flex-none md:hidden">
      <label for="mobile-nav" class="btn btn-ghost btn-square">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-5 h-5 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
      </label>
    </div>
  </header>

  <!-- 主内容 -->
  <main class="flex-1">
    {@render children()}
  </main>

  <!-- 页脚 -->
  <footer class="bg-neutral text-neutral-content">
    <div class="footer p-10 max-w-7xl mx-auto">
      <nav>
        <h6 class="footer-title">关于</h6>
        <a href="/about" class="link link-hover">公司介绍</a>
        <a href="/about" class="link link-hover">发展历程</a>
        <a href="/about" class="link link-hover">合作伙伴</a>
      </nav>
      <nav>
        <h6 class="footer-title">服务</h6>
        <a href="/services" class="link link-hover">咨询服务</a>
        <a href="/services" class="link link-hover">技术支持</a>
        <a href="/services" class="link link-hover">解决方案</a>
      </nav>
      <nav>
        <h6 class="footer-title">联系</h6>
        <a href="/contact" class="link link-hover">联系方式</a>
        <a href="/contact" class="link link-hover">在线留言</a>
      </nav>
    </div>
    <div class="footer footer-center p-4 bg-neutral-focus text-neutral-content border-t border-neutral-content/10">
      <p>Copyright © {new Date().getFullYear()} 企业名称. All rights reserved.</p>
    </div>
  </footer>
</div>
