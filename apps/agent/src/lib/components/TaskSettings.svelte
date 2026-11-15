<script lang='ts'>
  import type { HomeView } from '#lib/client.js'
  import type { AgentSettings, AgentTask } from '#lib/workspace.js'
  import { onMount } from 'svelte'
  import { read, send } from '#lib/client.js'
  import * as m from '#lib/paraglide/messages.js'

  interface Props {
    task: AgentTask
    home: HomeView
    onclose: () => void
    onsave: () => void
    onerror: (error: unknown) => void
  }
  const { task, home, onclose, onsave, onerror }: Props = $props()
  let next = $state<AgentSettings>()
  let plan = $state<{ mode: string, reason: string, model?: string, environment: string }>()
  let carry = $state(true)
  let busy = $state(false)
  let rules = $state<{ id: string, summary?: string }[]>([])
  let seconds = $state<number>()
  const backend = $derived(home.agents.find(agent => agent.id === next?.agentId))
  const modes = {
    auto: m.mode_auto,
    shared: m.mode_shared,
    user: m.mode_user,
    task: m.mode_task,
  }
  const reasons: Record<string, () => string> = {
    'explicit': m.plan_explicit,
    'user-policy': m.plan_user,
    'verified-shared': m.plan_shared,
    'isolated-default': m.plan_task,
  }

  $effect(() => {
    next = {
      ...task.settings,
      tools: [...task.settings.tools],
      rules: [...task.settings.rules],
    }
    seconds = task.settings.runTimeoutMs
      ? task.settings.runTimeoutMs / 1000
      : undefined
  })

  onMount(() => {
    void read<typeof rules>({ pane: 'permissions' }).then((items) => {
      rules = items
    }).catch(onerror)
  })

  async function submit(save: boolean) {
    if (!next)
      return
    busy = true
    plan = undefined
    try {
      const settings = {
        ...next,
        runTimeoutMs: seconds
          ? seconds * 1000
          : undefined,
      }
      if (save) {
        await send({
          type: 'settings',
          id: task.id,
          settings,
          carry,
        })
        onsave()
      }
      else {
        plan = await send({ type: 'plan', id: task.id, settings })
      }
    }
    catch (error) { onerror(error) }
    finally { busy = false }
  }
</script>

{#if next}
  <section class='mx-auto w-full max-w-3xl p-5 sm:p-8'>
    <header class='mb-5 flex items-center justify-between'>
      <h2 class='text-xl font-semibold'>{m.settings()}</h2>
      <button class='btn btn-ghost btn-sm' onclick={onclose}>{m.close()}</button>
    </header>
    <form class='grid gap-3 sm:grid-cols-2' onsubmit={(event) => {
      event.preventDefault()
      void submit(true)
    }}>
      <label class='grid gap-1 text-sm'>{m.backend()}
        <select class='select w-full' bind:value={next.agentId} onchange={() => {
          if (next) {
            next.modelId = undefined
            next.mode = 'auto'
            next.reasoningEffort = undefined
          }
        }}>
          {#each home.agents as agent (agent.id)}<option value={agent.id}>{agent.name}</option>{/each}
        </select>
      </label>
      <label class='grid gap-1 text-sm'>{m.model()}
        <select class='select w-full' value={next.modelId ?? ''} onchange={(event) => {
          if (next)
            next.modelId = event.currentTarget.value || undefined
        }}>
          <option value="">{m.model_default()}</option>
          {#each backend?.models ?? [] as model (model)}<option value={model}>{model}</option>{/each}
        </select>
      </label>
      <label class='grid gap-1 text-sm'>{m.mode()}
        <select class='select w-full' bind:value={next.mode}>
          {#each Object.entries(modes) as [id, name] (id)}
            <option value={id} disabled={id !== 'auto' && !backend?.modes.includes(id)}>{name()}</option>
          {/each}
        </select>
      </label>
      <label class='grid gap-1 text-sm'>{m.profile()}
        <select class='select w-full' bind:value={next.profile} disabled={next.mode === 'shared'}>
          <option value='read-only'>{m.profile_read()}</option>
          <option value='workspace'>{m.profile_workspace()}</option>
          <option value='full-access'>{m.profile_full()}</option>
        </select>
      </label>
      <label class='grid gap-1 text-sm'>{m.project()}
        <select aria-label={m.project()} class='select w-full' value={next.project ?? ''} onchange={(event) => {
          if (next)
            next.project = event.currentTarget.value || undefined
        }}>
          <option value="">{m.project_none()}</option>
          {#each home.projects as project (project.id)}<option value={project.id}>{project.title}</option>{/each}
        </select>
      </label>
      <label class='grid gap-1 text-sm'>{m.approval()}
        <select class='select w-full' bind:value={next.approval}>
          <option value='on-request'>{m.approval_request()}</option><option value='never'>{m.approval_never()}</option>
        </select>
      </label>
      <label class='grid gap-1 text-sm'>{m.output()}
        <select class='select w-full' bind:value={next.output}><option value='text'>{m.output_text()}</option><option value='json'>JSON</option></select>
      </label>
      <label class='grid gap-1 text-sm'>{m.limit()}<input type='number' min='1' max='600' class='input w-full' bind:value={seconds} /></label>
      {#if backend?.adapter === 'codex'}
        <label class='grid gap-1 text-sm'>{m.reasoning()}
          <select class='select w-full' value={next.reasoningEffort ?? ''} onchange={(event) => {
            if (next)
              next.reasoningEffort = event.currentTarget.value || undefined
          }}>
            <option value="">{m.reasoning_default()}</option>
            {#each ['low', 'medium', 'high', 'xhigh'] as level (level)}<option value={level}>{level}</option>{/each}
          </select>
        </label>
      {/if}
      {#if home.tools.length}
        <fieldset class='grid gap-2 rounded-lg border agent-divider p-3 sm:col-span-2'>
          <legend class='px-1 text-sm font-medium'>{m.tool_list()}</legend>
          {#each home.tools as tool (tool.id)}
            <label class='flex items-center gap-2 text-sm' title={tool.description}><input class='checkbox checkbox-sm' type='checkbox' value={tool.id} bind:group={next.tools} />{tool.id}</label>
          {/each}
        </fieldset>
      {/if}
      {#if rules.length}
        <fieldset class='grid gap-2 rounded-lg border agent-divider p-3 sm:col-span-2'>
          <legend class='px-1 text-sm font-medium'>{m.permissions()}</legend>
          {#each rules as rule (rule.id)}
            <label class='flex items-center gap-2 break-all text-sm'><input class='checkbox checkbox-sm' type='checkbox' value={rule.id} bind:group={next.rules} />{rule.summary ?? rule.id}</label>
          {/each}
        </fieldset>
      {/if}
      <label class='flex items-center gap-2 text-sm sm:col-span-2'><input class='checkbox checkbox-sm' type='checkbox' bind:checked={carry} disabled={next.mode === 'shared'} />{m.carry()}</label>
      <div class='flex flex-wrap gap-2 pt-2 sm:col-span-2'>
        <button class='btn btn-primary' disabled={busy}>{m.save_settings()}</button>
        <button type='button' class='btn btn-ghost' disabled={busy} onclick={() => submit(false)}>{m.preview_plan()}</button>
      </div>
      {#if plan}
        <div role='status' class='rounded-lg border agent-divider p-3 text-sm sm:col-span-2'>
          <div><strong>{m.mode()}</strong> {modes[plan.mode as keyof typeof modes]?.() ?? plan.mode} · {reasons[plan.reason]?.() ?? plan.reason}</div>
          <div class='agent-muted mt-1'>{plan.model ?? m.model_default()} · {plan.environment}</div>
        </div>
      {/if}
    </form>
  </section>
{/if}
