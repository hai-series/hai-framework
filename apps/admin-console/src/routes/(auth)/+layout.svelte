<!--
  =============================================================================
  Admin Console - 认证页面布局
  =============================================================================
  使用 DaisyUI 样式，保持与 @hai/ui 组件的一致性
  =============================================================================
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  
  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-secondary p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="text-center mb-8 text-primary-content">
      <div class="flex justify-center mb-2">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-primary-content">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <h1 class="text-2xl font-semibold">Admin Console</h1>
    </div>
    
    <!-- Card -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        {@render children()}
      </div>
    </div>
    
    <!-- Footer -->
    <div class="text-center mt-6 text-primary-content/80 text-sm">
      <p>Powered by <strong class="text-primary-content">hai-framework</strong></p>
    </div>
  </div>
</div>
