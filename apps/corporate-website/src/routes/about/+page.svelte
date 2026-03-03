<script lang="ts">
  /**
   * 关于我们
   */
  import { Badge } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages.js'

  const teamMembers = $derived([
    {
      name: m.about_team_ceo_name(),
      role: m.about_team_ceo_role(),
      abbr: 'CEO',
      color: 'text-primary',
      accent: 'bg-primary/8',
    },
    {
      name: m.about_team_cto_name(),
      role: m.about_team_cto_role(),
      abbr: 'CTO',
      color: 'text-secondary',
      accent: 'bg-secondary/8',
    },
    {
      name: m.about_team_coo_name(),
      role: m.about_team_coo_role(),
      abbr: 'COO',
      color: 'text-accent',
      accent: 'bg-accent/8',
    },
  ])
</script>

<svelte:head>
  <title>{m.about_page_title()} - {m.brand()}</title>
  <meta name="description" content={m.about_page_description()} />
</svelte:head>

<section class="py-20 px-4 lg:px-8">
  <div class="max-w-5xl mx-auto">
    <PageHeader title={m.about_page_title()} description={m.about_page_description()} />

    <Card shadow="sm" padding="lg" class="mb-8">
      <p class="text-lg text-base-content/70 leading-relaxed">
        {m.about_intro()}
      </p>
    </Card>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
      <Card shadow="sm">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
            <span class="icon-[tabler--eye] size-5 text-primary"></span>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-base-content mb-2">{m.about_vision_title()}</h2>
            <p class="text-sm text-base-content/60 leading-relaxed">{m.about_vision_content()}</p>
          </div>
        </div>
      </Card>

      <Card shadow="sm">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-secondary/8 flex items-center justify-center shrink-0">
            <span class="icon-[tabler--target] size-5 text-secondary"></span>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-base-content mb-2">{m.about_mission_title()}</h2>
            <p class="text-sm text-base-content/60 leading-relaxed">{m.about_mission_content()}</p>
          </div>
        </div>
      </Card>
    </div>

    <!-- 团队介绍 -->
    <div>
      <h2 class="text-2xl font-bold tracking-tight text-base-content mb-6">{m.about_team_title()}</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        {#each teamMembers as member}
          <Card shadow="sm" class="hover:-translate-y-1 hover:shadow-(--shadow-lifted) transition-all duration-200">
            <div class="flex flex-col items-center text-center">
              <div class="w-16 h-16 rounded-2xl {member.accent} flex items-center justify-center mb-3">
                <span class="text-lg font-bold {member.color}">{member.abbr}</span>
              </div>
              <h3 class="font-semibold text-base-content">{member.name}</h3>
              <Badge variant="default" size="sm" class="mt-1">{member.role}</Badge>
            </div>
          </Card>
        {/each}
      </div>
    </div>
  </div>
</section>
