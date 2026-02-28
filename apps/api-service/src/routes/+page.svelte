<script lang="ts">
  /**
   * API Service — 接口文档首页
   */
</script>

<svelte:head>
  <title>API Service - hai Framework</title>
</svelte:head>

<main style="font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 3rem auto; padding: 0 1.5rem; color: #1a1a1a;">
  <div style="border-bottom: 2px solid #e5e7eb; padding-bottom: 1.5rem; margin-bottom: 2rem;">
    <h1 style="font-size: 1.75rem; font-weight: 700; margin: 0;">🚀 hai API Service</h1>
    <p style="color: #6b7280; margin-top: 0.5rem;">RESTful API backend powered by hai Framework — using core, db, cache, crypto modules</p>
  </div>

  <section style="margin-bottom: 2rem;">
    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem;">Modules Used</h2>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
      <div style="padding: 0.75rem; background: #f3f4f6; border-radius: 0.5rem;">
        <strong>@h-ai/core</strong>
        <p style="font-size: 0.875rem; color: #6b7280; margin: 0.25rem 0 0;">Config, logging, ID generation</p>
      </div>
      <div style="padding: 0.75rem; background: #f3f4f6; border-radius: 0.5rem;">
        <strong>@h-ai/kit</strong>
        <p style="font-size: 0.875rem; color: #6b7280; margin: 0.25rem 0 0;">Request handling, validation, response</p>
      </div>
      <div style="padding: 0.75rem; background: #f3f4f6; border-radius: 0.5rem;">
        <strong>@h-ai/db</strong>
        <p style="font-size: 0.875rem; color: #6b7280; margin: 0.25rem 0 0;">SQLite database operations</p>
      </div>
      <div style="padding: 0.75rem; background: #f3f4f6; border-radius: 0.5rem;">
        <strong>@h-ai/cache</strong>
        <p style="font-size: 0.875rem; color: #6b7280; margin: 0.25rem 0 0;">In-memory / Redis caching</p>
      </div>
      <div style="padding: 0.75rem; background: #f3f4f6; border-radius: 0.5rem;">
        <strong>@h-ai/crypto</strong>
        <p style="font-size: 0.875rem; color: #6b7280; margin: 0.25rem 0 0;">Hashing, encryption</p>
      </div>
    </div>
  </section>

  <section style="margin-bottom: 2rem;">
    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem;">API Endpoints</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb; text-align: left;">
          <th style="padding: 0.5rem;">Method</th>
          <th style="padding: 0.5rem;">Endpoint</th>
          <th style="padding: 0.5rem;">Description</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 0.5rem;"><code style="background: #dbeafe; padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #1d4ed8;">GET</code></td>
          <td style="padding: 0.5rem;"><code>/api/v1/health</code></td>
          <td style="padding: 0.5rem;">Health check with module status</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 0.5rem;"><code style="background: #dbeafe; padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #1d4ed8;">GET</code></td>
          <td style="padding: 0.5rem;"><code>/api/v1/items</code></td>
          <td style="padding: 0.5rem;">List items (paginated, searchable, cached)</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 0.5rem;"><code style="background: #dcfce7; padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #15803d;">POST</code></td>
          <td style="padding: 0.5rem;"><code>/api/v1/items</code></td>
          <td style="padding: 0.5rem;">Create a new item (Zod validated)</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 0.5rem;"><code style="background: #dbeafe; padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #1d4ed8;">GET</code></td>
          <td style="padding: 0.5rem;"><code>/api/v1/items/:id</code></td>
          <td style="padding: 0.5rem;">Get item by ID (cached)</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 0.5rem;"><code style="background: #fef9c3; padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #a16207;">PUT</code></td>
          <td style="padding: 0.5rem;"><code>/api/v1/items/:id</code></td>
          <td style="padding: 0.5rem;">Update item (partial update)</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 0.5rem;"><code style="background: #fee2e2; padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #dc2626;">DELETE</code></td>
          <td style="padding: 0.5rem;"><code>/api/v1/items/:id</code></td>
          <td style="padding: 0.5rem;">Delete item</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section style="margin-bottom: 2rem;">
    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem;">Features Demonstrated</h2>
    <ul style="line-height: 1.8; padding-left: 1.5rem;">
      <li>Module initialization with <code>core.init()</code> and YAML config files</li>
      <li>SQLite database with DDL auto-creation via <code>@h-ai/db</code></li>
      <li>Response caching with TTL via <code>@h-ai/cache</code></li>
      <li>Request validation with Zod schemas via <code>kit.validate</code></li>
      <li>Standardized API responses via <code>kit.response</code></li>
      <li>Request logging and rate limiting middleware</li>
      <li>Health check endpoint with module status reporting</li>
    </ul>
  </section>

  <div style="padding: 1rem; background: #f0fdf4; border-left: 3px solid #22c55e; border-radius: 0.25rem; font-size: 0.875rem;">
    <strong>Quick Start:</strong> Run <code>pnpm --filter api-service dev</code> to start the service, then visit <code>/api/v1/health</code> to verify.
  </div>
</main>
