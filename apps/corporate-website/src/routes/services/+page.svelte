<script lang="ts">
  /**
   * 服务页面
   */
  import * as m from '$lib/paraglide/messages.js'

  const services = $derived([
    {
      icon: 'icon-[tabler--code]',
      color: 'text-primary',
      accent: 'bg-primary/8',
      title: m.services_item_software_title(),
      desc: m.services_item_software_desc(),
      points: [m.services_item_software_point_1(), m.services_item_software_point_2(), m.services_item_software_point_3()],
    },
    {
      icon: 'icon-[tabler--cloud]',
      color: 'text-info',
      accent: 'bg-info/8',
      title: m.services_item_cloud_title(),
      desc: m.services_item_cloud_desc(),
      points: [m.services_item_cloud_point_1(), m.services_item_cloud_point_2(), m.services_item_cloud_point_3()],
    },
    {
      icon: 'icon-[tabler--lock]',
      color: 'text-warning',
      accent: 'bg-warning/8',
      title: m.services_item_security_title(),
      desc: m.services_item_security_desc(),
      points: [m.services_item_security_point_1(), m.services_item_security_point_2(), m.services_item_security_point_3()],
    },
    {
      icon: 'icon-[tabler--chart-bar]',
      color: 'text-success',
      accent: 'bg-success/8',
      title: m.services_item_data_title(),
      desc: m.services_item_data_desc(),
      points: [m.services_item_data_point_1(), m.services_item_data_point_2(), m.services_item_data_point_3()],
    },
  ])
</script>

<svelte:head>
  <title>{m.services_page_title()} - {m.brand()}</title>
  <meta name="description" content={m.services_page_description()} />
</svelte:head>

<section class="py-20 px-4 lg:px-8">
  <div class="max-w-7xl mx-auto">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold tracking-tight text-base-content">{m.services_page_title()}</h1>
      <p class="text-base-content/50 mt-2 max-w-2xl mx-auto">{m.services_page_subtitle()}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      {#each services as service}
        <Card shadow="sm" class="hover:-translate-y-1 hover:shadow-(--shadow-lifted) transition-all duration-200">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-xl {service.accent} flex items-center justify-center shrink-0">
              <span class="{service.icon} size-6 {service.color}"></span>
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-lg font-semibold text-base-content mb-1">{service.title}</h2>
              <p class="text-sm text-base-content/60 mb-3">{service.desc}</p>
              <ul class="space-y-1.5">
                {#each service.points as point}
                  <li class="flex items-center gap-2 text-sm text-base-content/50">
                    <span class="icon-[tabler--check] size-4 text-success shrink-0"></span>
                    {point}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        </Card>
      {/each}
    </div>
  </div>
</section>
