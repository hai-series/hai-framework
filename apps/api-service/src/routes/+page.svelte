<script lang="ts">
  /**
   * API 服务首页 — 仅展示 API 文档入口
   */
</script>

<svelte:head>
  <title>API Service</title>
</svelte:head>

<main style="font-family: system-ui, sans-serif; max-width: 600px; margin: 4rem auto; padding: 0 1rem;">
  <h1>API Service</h1>
  <p>This is a headless API service. No UI is served.</p>
  <h2>Available Endpoints</h2>
  <ul>
    <li><code>GET /api/v1/health</code> — Health check</li>
    <li><code>GET /api/v1/items</code> — List items</li>
    <li><code>POST /api/v1/items</code> — Create item</li>
    <li><code>GET /api/v1/items/:id</code> — Get item by ID</li>
    <li><code>PUT /api/v1/items/:id</code> — Update item</li>
    <li><code>DELETE /api/v1/items/:id</code> — Delete item</li>
  </ul>
</main>
