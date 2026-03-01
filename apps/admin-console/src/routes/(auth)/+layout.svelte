<!--
  Admin Console - 认证页面布局
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  
  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200/60 p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="text-center mb-6">
      <div class="flex justify-center mb-2">
        <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <span class="icon-[tabler--box] size-5 text-primary"></span>
        </div>
      </div>
      <h1 class="text-lg font-semibold text-base-content tracking-tight">Admin Console</h1>
    </div>
    
    <!-- Card -->
    <div class="card bg-base-100 border border-base-content/6 rounded-xl shadow-lg">
      <div class="card-body p-6">
        {@render children()}
      </div>
    </div>
    
    <!-- Footer -->
    <div class="text-center mt-5 text-base-content/25 text-2xs">
      <p>Powered by hai-framework</p>
    </div>
  </div>
</div>
