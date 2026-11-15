import type { ACPPlatformRequest, AIConfig, ChatMessage } from '@h-ai/ai'
import type { RunnerScope } from '@h-ai/runner'
import type { actionSchema, AgentSettings, AgentTask, AgentTurn, SendTurn, WorkspaceEntry } from '#lib/workspace.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { ai, AIConfigSchema, HaiAIError } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { settingsSchema } from '#lib/workspace.js'
import { config } from './config.js'
import { activeTurn, addResource, findTask, getPrefs, insertTask, listResources, listTasks, listTurns, missing, owner, removeResource, reserveTurn, resource, turnById, value, withTask, WorkspaceError, writePrefs, writeTask, writeTurn } from './data.js'
import { collection, knowledgeLists, memory, projects, readFile, readText } from './resources.js'

const aiConfig = (): AIConfig => AIConfigSchema.parse(core.config.get('ai'))
const acp = (scope: RunnerScope) => ai.acp.scoped(scope)
const liveStates = new Set(['queued', 'running', 'cancelling'])

function defaultSettings(agentId?: string, mode?: AgentSettings['mode']) {
  return settingsSchema.parse({
    agentId: agentId || aiConfig().acp?.agents.find(agent => agent.enabled)?.id,
    mode,
  })
}

function planInput(settings: AgentSettings): ACPPlatformRequest {
  const { agentId, mode, profile, modelId, project, tools, rules, output, runTimeoutMs, approval, reasoningEffort } = settings
  if (!agentId)
    throw new WorkspaceError(503, 'backend-unavailable')
  return {
    agentId,
    model: { id: modelId, reasoningEffort },
    execution: { mode },
    permissions: {
      profile: mode === 'shared'
        ? 'read-only'
        : profile,
      approval,
      ruleIds: rules,
    },
    workspaceId: project,
    tools: { allow: tools },
    limits: { runTimeoutMs },
    output: { format: output },
  }
}

function cleanTask(task: AgentTask) {
  const { acpId, ...publicTask } = task
  return publicTask
}

function projectOutput(input: unknown): AgentTurn['output'] {
  return z.object({
    text: z.string().optional(),
    json: z.unknown().optional(),
    stopReason: z.string().optional(),
    error: z.string().optional(),
  }).parse(input ?? {})
}

function visibleEvent(input: unknown) {
  const parsed = z.object({
    type: z.string(),
    id: z.string().optional(),
    text: z.string().optional(),
    title: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    input: z.string().optional(),
    kind: z.string().optional(),
    result: z.string().optional(),
    excerpt: z.string().optional(),
    approvalId: z.string().optional(),
    summary: z.string().optional(),
    deadline: z.number().optional(),
    used: z.number().optional(),
    size: z.number().optional(),
  }).safeParse(input)
  return parsed.success ? parsed.data : undefined
}

async function conclude(scope: RunnerScope, turn: AgentTurn, status: string, output: AgentTurn['output']) {
  if (!turn.receipt)
    return turn
  const page = await acp(scope).tasks.events(turn.receipt, 0, 100)
  let events = page.success
    ? page.data
    : []
  const details = new Map<string, WorkspaceEntry>()
  for (let pages = 0; pages < 5 && events.length; pages++) {
    for (const row of events) {
      const event = visibleEvent(row.data)
      if (!event || ![
        'tool',
        'citation',
        'artifact',
        'usage',
      ].includes(event.type)) {
        continue
      }
      const key = `${event.type}:${event.id ?? row.sequence}`
      const previous = details.get(key)
      details.set(key, {
        ...previous,
        ...event,
      })
    }
    if (events.length < 100)
      break
    const next = await acp(scope).tasks.events(turn.receipt, events.at(-1)!.sequence, 100)
    events = next.success
      ? next.data
      : []
  }
  const final = {
    ...turn,
    status: output?.error ? 'failed' : status,
    output,
    eventSummary: [
      ...details.values(),
    ].slice(-100),
  }
  await writeTurn(owner(scope), final)
  return final
}

async function checkTurn(scope: RunnerScope, turn: AgentTurn) {
  if (!turn.receipt || !liveStates.has(turn.status))
    return turn
  const current = await acp(scope).tasks.get(turn.receipt)
  if (!current.success) {
    if (current.error.code === HaiAIError.ACP_NOT_FOUND.code) {
      const expired = { ...turn, status: 'unknown' }
      await writeTurn(owner(scope), expired)
      return expired
    }
    return value<never>(current)
  }
  const status = current.data.status
  return liveStates.has(status)
    ? { ...turn, status }
    : conclude(scope, turn, status, projectOutput(current.data.output))
}

export async function view(scope: RunnerScope, task?: string, after = 0, offset = 0, latestOnly = false) {
  const user = owner(scope)
  if (!task) {
    const prefs = await getPrefs(user)
    const agents = await Promise.all((aiConfig().acp?.agents ?? []).filter(agent => agent.enabled && agent.environmentIds.length).map(async (agent) => {
      const result = await acp(scope).agents.describe(agent.id)
      return {
        id: agent.id,
        name: agent.name,
        adapter: agent.adapter,
        models: agent.modelIds,
        modes: result.success
          ? result.data.workerModes
          : ['task'],
      }
    }))
    return {
      preferences: prefs,
      tasks: await listTasks(user),
      agents,
      projects: (await projects(scope)).map(project => ({ id: project.id, title: project.title })),
      tools: config().toolUrl
        ? config().tools.map(tool => ({ id: tool.id, description: tool.description }))
        : [],
      skills: config().skills.map(skill => ({ id: skill.id, title: skill.title })),
      speech: {
        tts: ai.audio.getCapabilities({ operation: 'synthesize' }).success,
        asr: ai.audio.getCapabilities({ operation: 'transcribe' }).success,
      },
    }
  }
  const current = await findTask(user, task)
  const all = await listTurns(user, current.id, offset, latestOnly ? 1 : 40)
  const tail = all.at(-1)
  const running = tail
    ? await checkTurn(scope, tail)
    : undefined
  if (running)
    all[all.length - 1] = running
  const events = running?.receipt && liveStates.has(running.status)
    ? value(await acp(scope).tasks.events(running.receipt, after, 100))
    : []
  return {
    task: cleanTask(current),
    turns: all,
    events,
  }
}

export async function library(scope: RunnerScope, pane: string, query: string) {
  const user = owner(scope)
  if (pane === 'knowledge')
    return knowledgeLists(user)
  if (pane === 'files' || pane === 'artifacts') {
    return listResources(user, pane === 'files'
      ? 'file'
      : 'artifact')
  }
  if (pane === 'permissions')
    return value(await acp(scope).approvals.rules())
  if (pane === 'memory') {
    const entries = query
      ? value(await memory(scope).recall(query, { topK: 30 }))
      : value(await memory(scope).listPage({ limit: 50 })).items
    return { entries, proposals: await listResources(user, 'memory-proposal') }
  }
  return missing()
}

async function toMessages(user: string, task: string, currentId: string) {
  return (await listTurns(user, task)).filter(turn => turn.status === 'succeeded' && turn.id !== currentId).flatMap((turn): ChatMessage[] => [
    { role: 'user', content: turn.text },
    { role: 'assistant', content: turn.output?.text ?? '' },
  ])
}

async function contextSummary(history: ChatMessage[]) {
  if (!history.length)
    return undefined
  const bounded = history.slice(-16).map(message => ({
    ...message,
    content: String(message.content ?? '').slice(0, 1500),
  }))
  const reduced = value(await ai.compress.tryCompress(bounded, {
    strategy: 'sliding-window',
    maxTokens: 1600,
    preserveLastN: 1,
  }))
  const summary = reduced.messages
    .map(item => `${item.role}: ${typeof item.content === 'string'
      ? item.content
      : ''}`)
    .join('\n')
  const budget = Buffer.from(summary)
  return budget.length > 8000
    ? budget.subarray(budget.length - 8000).toString().replace(/^\uFFFD/u, '')
    : summary
}

async function send(scope: RunnerScope, input: SendTurn) {
  const user = owner(scope)
  const pendingTask = await findTask(user, input.task)
  const earlier = await activeTurn(user, pendingTask.id)
  if (earlier && earlier.id !== input.turn)
    await checkTurn(scope, earlier)
  const { task, turn } = await reserveTurn(user, input)
  if (turn.receipt || turn.status !== 'submitting')
    return turn
  const session = acp(scope)
  try {
    const prefs = await getPrefs(user)
    const settings = planInput(task.settings)
    const memoryEnabled = input.memory ?? prefs.memoryRead
    const context: NonNullable<ACPPlatformRequest['context']> = {
      knowledgeBaseIds: input.knowledge,
      fileIds: input.files,
      skillIds: input.skills,
      memory: memoryEnabled
        ? { scope: 'user', write: prefs.memoryWrite }
        : { scope: 'none', write: 'none' },
    }
    const effective = value(await session.plan({ ...settings, context }))
    const history = await toMessages(user, task.id, turn.id)
    const model = aiConfig().llm.models?.find(model => model.id === effective.modelId)
    const size = model?.capabilities?.contextWindow
    const used = ai.token.estimateText(input.text) + history.reduce((sum, message) => sum + ai.token.estimateText(String(message.content ?? '')), 0)
    if (size && ai.token.estimateText(input.text) > Math.floor(size * 0.75))
      throw new WorkspaceError(422, 'context-budget')
    const compress = !!size && used >= Math.floor(size * 0.8) && !!task.acpId
    const existing = task.acpId
      ? await session.sessions.get(task.acpId)
      : undefined
    const prior = existing?.success ? existing.data : undefined
    const state = prior
      ? await prior.status()
      : undefined
    const live = state?.success && state.data === 'active'
    const renew = !!task.acpId && (!live || compress || task.acpMode !== effective.resolvedMode)
    let native = live && !renew
      ? prior
      : undefined
    if (!native) {
      if (live && prior)
        value(await prior.close())
      const historySummary = (task.carry || renew) && effective.resolvedMode !== 'shared'
        ? await contextSummary(history)
        : undefined
      native = value(await session.sessions.create(
        {
          ...settings,
          execution: { ...settings.execution, mode: effective.resolvedMode },
        },
        { idempotencyKey: `${task.id}:${task.generation}${renew
          ? `:${turn.id}`
          : ''}`, historySummary },
      ))
      await writeTask(user, { ...task, acpId: native.id, acpMode: effective.resolvedMode })
    }
    const prompt = effective.resolvedMode !== 'shared' && prefs.preference
      ? `${value(await ai.persona.compose('personal', { objectId: user }))}\n\nCurrent request:\n${input.text}`
      : input.text
    const receipt = value(await native.submit({ prompt, idempotencyKey: turn.id, context }))
    const submitted = {
      ...turn,
      status: liveStates.has(receipt.status)
        ? receipt.status
        : 'queued',
      receipt: receipt.taskId,
      plan: { resolvedMode: effective.resolvedMode, reason: effective.reason, modelId: effective.modelId },
      estimate: { used, size },
      compressed: compress,
    }
    await writeTurn(user, submitted)
    return submitted
  }
  catch (error) {
    await writeTurn(user, { ...turn, status: 'failed' })
    throw error
  }
}

export async function action(scope: RunnerScope, input: z.output<typeof actionSchema>) {
  const user = owner(scope)
  const session = acp(scope)
  switch (input.type) {
    case 'new': {
      const prefs = await getPrefs(user)
      return cleanTask(await insertTask(user, input.id, defaultSettings(prefs.agentId, prefs.mode)))
    }
    case 'send': return send(scope, input)
    case 'plan': {
      await findTask(user, input.id)
      const plan = value(await session.plan(planInput(input.settings)))
      return {
        mode: plan.resolvedMode,
        reason: plan.reason,
        model: plan.modelId,
        environment: plan.environmentId,
      }
    }
    case 'rename':
    case 'archive':
    case 'settings': {
      const active = await activeTurn(user, input.id)
      if (active)
        await checkTurn(scope, active)
      const changed = await withTask(user, input.id, async (task, sql) => {
        if (await activeTurn(user, input.id, sql))
          throw new WorkspaceError(409, 'busy')
        if (input.type === 'rename') {
          task.title = input.title
        }
        else if (input.type === 'archive') {
          task.archived = input.archived
        }
        else {
          value(await session.plan(planInput(input.settings)))
          task.settings = input.settings
          task.carry = input.carry
        }
        const close = input.type === 'settings' || (input.type === 'archive' && input.archived)
        const previous = close ? task.acpId : undefined
        if (close) {
          task.acpId = undefined
          task.generation++
        }
        await writeTask(user, task, sql)
        return { task, previous }
      })
      if (changed.previous) {
        const prior = await session.sessions.get(changed.previous)
        if (prior.success) {
          const state = await prior.data.status()
          if (state.success && state.data === 'active')
            value(await prior.data.close())
        }
      }
      return cleanTask(changed.task)
    }
    case 'cancel': {
      const turn = await turnById(user, input.id)
      if (!turn.receipt)
        throw new WorkspaceError(409, 'busy')
      return value(await session.tasks.cancel(turn.receipt)).status
    }
    case 'approval': return value(await session.approvals.respond(input.id, input.decision))
    case 'revoke': return value(await session.approvals.revoke(input.id))
    case 'personal':
      if (input.preferences.preference) {
        value(await ai.persona.save({
          id: 'personal',
          objectId: user,
          systemPrompt: `User response preference (style only): ${input.preferences.preference}`,
        }))
      }
      await writePrefs(user, input.preferences)
      return input.preferences
    case 'memory-add': return value(await memory(scope).add({ type: 'fact', content: input.text }))
    case 'memory-edit': return value(await memory(scope).update(input.id, { content: input.text }))
    case 'memory-remove': return value(await memory(scope).remove(input.id))
    case 'memory-confirm': {
      const proposal = await resource(user, input.id, 'memory-proposal')
      if (input.save)
        value(await memory(scope).add({ type: 'fact', content: proposal.title }))
      await removeResource(user, proposal.id)
      return undefined
    }
    case 'knowledge-add':
      await addResource(user, { kind: 'knowledge', id: input.id, title: input.title })
      return value(await ai.knowledge.setup({
        collection: collection(input.id),
      }))
    case 'knowledge-index': {
      await resource(user, input.id, 'knowledge')
      const content = input.file
        ? (await readText(user, input.file, 400_000)).text
        : input.text
      if (!content?.trim())
        throw new WorkspaceError(422, 'file-type')
      value(await ai.knowledge.setup({
        collection: collection(input.id),
      }))
      return value(await ai.knowledge.ingest({
        collection: collection(input.id),
        documentId: input.document,
        title: input.title,
        content,
        enableEntityExtraction: false,
      }))
    }
    case 'knowledge-remove':
      await resource(user, input.id, 'knowledge')
      return value(await ai.knowledge.removeDocument(input.document, {
        collection: collection(input.id),
      }))
    case 'knowledge-delete':
      await resource(user, input.id, 'knowledge')
      value(await ai.knowledge.deleteCollection(collection(input.id)))
      await removeResource(user, input.id)
      return undefined
    case 'publish': {
      const { ref, bytes } = await readFile(user, input.id)
      if (!ref.project || !ref.revision || ref.kind !== 'artifact')
        return missing()
      const project = (await projects(scope, true)).find(item => item.id === ref.project)
      if (!project?.remote)
        return missing()
      const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
      return value(await ai.acp.workspaces.publishSnapshot({
        directory: project.directory,
        remote: project.remote,
        revision: ref.revision,
        patch: bytes.toString(),
        branch: `agent/${input.id}-${digest}`,
        date: new Date(ref.createdAt ?? 0).toISOString(),
        author: { name: 'Hai Agent', email: 'agent@example.invalid' },
      }))
    }
  }
}
