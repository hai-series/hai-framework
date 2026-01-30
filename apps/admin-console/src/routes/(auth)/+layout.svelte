<!--
  =============================================================================
  Admin Console - 认证页面布局
  =============================================================================
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  
  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="auth-layout">
  <div class="auth-container">
    <div class="auth-logo">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
      <h1>Admin Console</h1>
    </div>
    
    <div class="auth-card">
      {@render children()}
    </div>
    
    <div class="auth-footer">
      <p>Powered by <strong>hai-framework</strong></p>
    </div>
  </div>
</div>

<style>
  .auth-layout {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 1rem;
  }

  .auth-container {
    width: 100%;
    max-width: 400px;
  }

  .auth-logo {
    text-align: center;
    margin-bottom: 2rem;
    color: white;
  }

  .auth-logo svg {
    margin-bottom: 0.5rem;
  }

  .auth-logo h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
  }

  .auth-card {
    background: white;
    border-radius: 0.75rem;
    padding: 2rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  .auth-footer {
    text-align: center;
    margin-top: 1.5rem;
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.875rem;
  }

  .auth-footer strong {
    color: white;
  }
</style>
