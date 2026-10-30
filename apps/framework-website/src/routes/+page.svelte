<script lang='ts'>
  import type { PageProps } from './$types'
  import { asset, resolve } from '$app/paths'
  import * as m from '$lib/paraglide/messages'
  import { Badge, MarkdownRenderer } from '@h-ai/ui'

  const { data }: PageProps = $props()
  const install = '```sh\npnpm add -g @h-ai/cli@latest\nhai create my-app --type website --defaults\ncd my-app && pnpm dev\n```'
  const features = [
    { icon: 'icon-[tabler--layout-grid]', title: m.site_feature_apps, body: m.site_feature_apps_body, slug: 'getting-started/create' },
    { icon: 'icon-[tabler--settings]', title: m.site_feature_config, body: m.site_feature_config_body, slug: 'configuration/data' },
    { icon: 'icon-[tabler--shield-check]', title: m.site_feature_security, body: m.site_feature_security_body, slug: 'development/authentication' },
    { icon: 'icon-[tabler--sparkles]', title: m.site_feature_ai, body: m.site_feature_ai_body, slug: 'development/ai' },
    { icon: 'icon-[tabler--components]', title: m.site_feature_ui, body: m.site_feature_ui_body, slug: 'development/ui' },
    { icon: 'icon-[tabler--package]', title: m.site_feature_delivery, body: m.site_feature_delivery_body, slug: 'operations/deployment' },
  ]
  const previews = [
    { id: 'fullstack', title: m.site_preview_fullstack, body: m.site_preview_fullstack_body, image: '/template-previews/fullstack-users.png', width: 1280, height: 720, command: 'hai create my-business --type fullstack --frontends web --defaults' },
    { id: 'website', title: m.site_preview_website, body: m.site_preview_website_body, image: '/guide-images/website-static-contact-warning.png', width: 1280, height: 720, command: 'hai create my-site --type website --defaults' },
    { id: 'admin', title: m.site_preview_admin, body: m.site_preview_admin_body, image: '/template-previews/admin-login.png', width: 1280, height: 720, command: 'hai create my-admin --type admin --defaults' },
    { id: 'mobile', title: m.site_preview_mobile, body: m.site_preview_mobile_body, image: '/template-previews/mobile-login.png', width: 390, height: 933, command: 'hai create my-mobile --type mobile-app --defaults' },
  ]
</script>

<svelte:head>
  <title>hai-framework — {m.site_tagline()}</title>
  <meta name='description' content={m.site_description()} />
  <meta property='og:title' content='hai-framework' />
  <meta property='og:description' content={m.site_description()} />
  <link rel='canonical' href='https://hai-series.github.io/hai-framework/' />
</svelte:head>

<div class='home-shell'>
  <section class='home-hero'>
    <div class='hero-copy'>
      <Badge variant='primary'>{m.site_open_source()} · {data.version}</Badge>
      <h1>{m.site_headline()}<span>{m.site_tagline()}</span></h1>
      <p class='hero-description'>{m.site_description()}</p>
      <div class='hero-actions'><a class='btn btn-primary' href={resolve('/docs/[...slug]', { slug: 'getting-started/create' })}>{m.site_start()} <span aria-hidden='true'>→</span></a><a class='btn btn-outline' href={resolve('/docs/[...slug]', { slug: '' })}>{m.site_read_docs()}</a></div>
      <p class='hero-footnote'>TypeScript · Svelte 5 · SvelteKit · pnpm</p>
    </div>
    <div class='install-panel'><div class='panel-heading'><span class='terminal-dots' aria-hidden='true'>● ● ●</span><span>{m.site_terminal()}</span></div><MarkdownRenderer content={install} /><p>{m.site_install_note()}</p></div>
  </section>

  <section class='home-section' aria-labelledby='capabilities'>
    <div class='section-intro'><span class='eyebrow'>{m.site_capabilities_label()}</span><h2 id='capabilities'>{m.site_capabilities()}</h2><p>{m.site_capabilities_body()}</p></div>
    <div class='feature-grid'>
      {#each features as feature (feature.icon)}
        <article class='feature-card'><span class={`${feature.icon} feature-icon`} aria-hidden='true'></span><h3>{feature.title()}</h3><p>{feature.body()}</p><a href={resolve('/docs/[...slug]', { slug: feature.slug })}>{m.site_learn_more()} <span aria-hidden='true'>→</span></a></article>
      {/each}
    </div>
  </section>

  <section class='home-section' aria-labelledby='template-previews'>
    <div class='section-intro'><span class='eyebrow'>{m.site_previews_label()}</span><h2 id='template-previews'>{m.site_previews_title()}</h2><p>{m.site_previews_body()}</p></div>
    <div class='template-grid'>
      {#each previews as preview (preview.id)}
        <article class='template-card' data-template-preview={preview.id}>
          <a class='template-image-link' href={asset(preview.image)} target='_blank' rel='noopener noreferrer' aria-label={m.site_preview_open({ name: preview.title() })}>
            <div class='template-image-frame'><img src={asset(preview.image)} alt={preview.title()} width={preview.width} height={preview.height} loading='lazy' /></div>
            <span class='template-image-action'>{m.site_preview_original()} <span aria-hidden='true'>↗</span></span>
          </a>
          <div class='template-card-copy'><h3>{preview.title()}</h3><p>{preview.body()}</p><code>{preview.command}</code></div>
        </article>
      {/each}
    </div>
    <p class='template-source-note'>{m.site_previews_note()}</p>
  </section>

  <section class='home-section reading-paths' aria-labelledby='paths'>
    <div><span class='eyebrow'>{m.site_paths_label()}</span><h2 id='paths'>{m.site_paths()}</h2><p>{m.site_paths_body()}</p></div>
    <div class='path-grid'>
      <a href={resolve('/docs/[...slug]', { slug: 'getting-started' })}><strong>{m.site_path_developer()}</strong><span>{m.site_path_developer_body()}</span><span aria-hidden='true'>↗</span></a>
      <a href={resolve('/docs/[...slug]', { slug: 'configuration' })}><strong>{m.site_path_configuration()}</strong><span>{m.site_path_configuration_body()}</span><span aria-hidden='true'>↗</span></a>
      <a href={resolve('/docs/[...slug]', { slug: 'governance/security-review' })}><strong>{m.site_path_security()}</strong><span>{m.site_path_security_body()}</span><span aria-hidden='true'>↗</span></a>
    </div>
  </section>

  <section class='community-panel'><div><h2>{m.site_community()}</h2><p>{m.site_community_body()}</p></div><a class='btn btn-outline' href='https://github.com/hai-series/hai-framework/issues' target='_blank' rel='noopener noreferrer'>{m.site_view_repository()} ↗</a></section>
</div>
