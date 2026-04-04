<script lang='ts'>
  import type { PageData } from './$types'

  const { data }: { data: PageData } = $props()

  function methodClass(method: string): string {
    if (method === 'GET')
      return 'method get'
    if (method === 'POST')
      return 'method post'
    if (method === 'PUT')
      return 'method put'
    return 'method delete'
  }
</script>

<svelte:head>
  <title>{data.coreInfo.name} - API 示例首页</title>
</svelte:head>

<main class='container'>
  <header class='hero'>
    <h1>🚀 {data.coreInfo.name}</h1>
    <p>这是一个 API 服务示例首页，用于展示 core 基本信息与接口使用方式。</p>
  </header>

  <section class='card'>
    <h2>Core 基本信息（来自配置）</h2>
    <div class='meta-grid'>
      <p><strong>name：</strong>{data.coreInfo.name}</p>
      <p><strong>version：</strong>{data.coreInfo.version}</p>
      <p><strong>env：</strong>{data.coreInfo.env}</p>
      <p><strong>debug：</strong>{String(data.coreInfo.debug)}</p>
      <p><strong>defaultLocale：</strong>{data.coreInfo.defaultLocale}</p>
    </div>
  </section>

  <section class='card'>
    <h2>接口列表与使用说明</h2>
    <table>
      <thead>
        <tr>
          <th>Method</th>
          <th>Path</th>
          <th>Description</th>
          <th>Usage</th>
        </tr>
      </thead>
      <tbody>
        {#each data.apis as api}
          <tr>
            <td><span class={methodClass(api.method)}>{api.method}</span></td>
            <td><code>{api.path}</code></td>
            <td>{api.description}</td>
            <td><code>{api.usage}</code></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class='card cta-card'>
    <h2>Item 模拟使用页面</h2>
    <p>已提供独立的 Items 模拟 CRUD 页面，可直接演示接口调用与请求日志。</p>
    <a class='cta' href='/items-simulator'>前往 Items 模拟使用页面 →</a>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f7f8fa;
    color: #111827;
    font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }

  .container {
    max-width: 1080px;
    margin: 0 auto;
    padding: 2rem 1rem 3rem;
    display: grid;
    gap: 1rem;
  }

  .hero {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
  }

  .hero h1 {
    margin: 0;
    font-size: 1.3rem;
  }

  .hero p {
    margin: 0.5rem 0 0;
    color: #6b7280;
  }

  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem;
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.05rem;
  }

  .meta-grid {
    display: grid;
    gap: 0.45rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .meta-grid p {
    margin: 0;
    font-size: 0.92rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
  }

  th,
  td {
    border-bottom: 1px solid #f1f5f9;
    text-align: left;
    padding: 0.55rem;
    vertical-align: top;
  }

  th {
    background: #f8fafc;
    font-weight: 600;
  }

  .method {
    font-size: 0.78rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 0.16rem 0.5rem;
    display: inline-block;
  }

  .get {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .post {
    background: #dcfce7;
    color: #166534;
  }

  .put {
    background: #fef9c3;
    color: #a16207;
  }

  .delete {
    background: #fef2f2;
    color: #991b1b;
  }

  .cta-card p {
    margin: 0 0 0.8rem;
    color: #4b5563;
  }

  .cta {
    text-decoration: none;
    color: #fff;
    background: #2563eb;
    border-radius: 0.55rem;
    padding: 0.58rem 0.85rem;
    display: inline-block;
    font-size: 0.92rem;
  }

  .cta:hover {
    background: #1d4ed8;
  }

  code {
    font-size: 0.82rem;
    background: #f3f4f6;
    padding: 0.15rem 0.35rem;
    border-radius: 0.25rem;
  }

  @media (max-width: 860px) {
    table,
    thead,
    tbody,
    th,
    td,
    tr {
      display: block;
    }

    thead {
      display: none;
    }

    tr {
      border-bottom: 1px solid #e5e7eb;
      padding: 0.55rem 0;
    }

    td {
      border: none;
      padding: 0.3rem 0;
    }
  }
</style>
