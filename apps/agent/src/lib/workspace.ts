import { z } from 'zod'

export const id = z.uuid()
export const mode = z.enum(['auto', 'shared', 'user', 'task'])
export const profile = z.enum(['read-only', 'workspace', 'full-access'])
export const decision = z.enum([
  'allow-once',
  'allow-session',
  'always-allow',
  'deny',
])
const agentId = z.string().regex(/^[\w.-]{1,100}$/u)

export const settingsSchema = z.object({
  agentId: z.union([
    agentId,
    z.literal(''),
  ]).default(''),
  modelId: agentId.optional(),
  mode: mode.default('auto'),
  profile: profile.default('workspace'),
  project: agentId.optional(),
  tools: z.array(agentId).max(12).default([]),
  rules: z.array(agentId).max(32).default([]),
  output: z.enum(['text', 'json']).default('text'),
  approval: z.enum(['on-request', 'never']).default('on-request'),
  runTimeoutMs: z.number().int().min(1000).max(600_000).optional(),
  reasoningEffort: agentId.optional(),
})

export const prefsSchema = z.object({
  agentId: z.union([
    agentId,
    z.literal(''),
  ]).default(''),
  mode: mode.default('auto'),
  voice: z.string().trim().max(100).default(''),
  preference: z.string().trim().max(3000).default(''),
  memoryRead: z.boolean().default(false),
  memoryWrite: z.enum(['none', 'confirm', 'on-success']).default('confirm'),
})

export const sendSchema = z.object({
  type: z.literal('send'),
  task: id,
  turn: id,
  text: z.string().trim().min(1).max(24_000),
  knowledge: z.array(id).max(6).default([]),
  files: z.array(id).max(8).default([]),
  skills: z.array(agentId).max(8).default([]),
  memory: z.boolean().optional(),
})

export const actionSchema = z.discriminatedUnion('type', [
  sendSchema,
  z.object({
    type: z.literal('new'),
    id,
  }),
  z.object({
    type: z.literal('rename'),
    id,
    title: z.string().trim().min(1).max(120),
  }),
  z.object({
    type: z.literal('archive'),
    id,
    archived: z.boolean(),
  }),
  z.object({
    type: z.literal('settings'),
    id,
    settings: settingsSchema,
    carry: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('plan'),
    id,
    settings: settingsSchema,
  }),
  z.object({
    type: z.literal('cancel'),
    id,
  }),
  z.object({
    type: z.literal('approval'),
    id,
    decision,
  }),
  z.object({
    type: z.literal('revoke'),
    id: agentId,
  }),
  z.object({
    type: z.literal('personal'),
    preferences: prefsSchema,
  }),
  z.object({
    type: z.literal('memory-add'),
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal('memory-edit'),
    id: z.string().min(1).max(200),
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal('memory-remove'),
    id: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal('memory-confirm'),
    id,
    save: z.boolean(),
  }),
  z.object({
    type: z.literal('knowledge-add'),
    id,
    title: z.string().trim().min(1).max(120),
  }),
  z.object({
    type: z.literal('knowledge-index'),
    id,
    document: id,
    title: z.string().trim().min(1).max(160),
    text: z.string().trim().max(400_000).optional(),
    file: id.optional(),
  }),
  z.object({
    type: z.literal('knowledge-remove'),
    id,
    document: id,
  }),
  z.object({
    type: z.literal('knowledge-delete'),
    id,
  }),
  z.object({
    type: z.literal('publish'),
    id,
  }),
  z.object({
    type: z.literal('artifact-create'),
    id: id.optional(),
    title: z.string().trim().min(1).max(160),
    kind: z.enum(['markdown', 'html', 'table', 'chart']),
    content: z.string().max(1024 * 1024),
  }),
  z.object({
    type: z.literal('artifact-save'),
    id,
    baseVersion: z.number().int().positive().max(999_999),
    content: z.string().max(1024 * 1024),
  }),
  z.object({
    type: z.literal('artifact-rewrite'),
    id,
    baseVersion: z.number().int().positive().max(999_999),
    content: z.string().max(1024 * 1024),
    selectedText: z.string().min(1).max(64_000),
    instruction: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal('tool-run'),
    name: z.string().regex(/^[a-z][\w-]{0,63}$/i),
    input: z.record(z.string(), z.unknown()),
    idempotencyKey: z.string().min(1).max(128),
    task: id.optional(),
  }),
  z.object({
    type: z.literal('tool-cancel'),
    id: z.string().min(1).max(512),
  }),
])

export type AgentSettings = z.infer<typeof settingsSchema>
export type AgentPreferences = z.infer<typeof prefsSchema>
export type SendTurn = z.infer<typeof sendSchema>
export type WorkspaceAction = z.input<typeof actionSchema>

export interface AgentTask {
  id: string
  title: string
  archived: boolean
  settings: AgentSettings
  acpId?: string
  acpMode?: string
  generation: number
  carry: boolean
  startedAt: number
}

/** 工作台列表按服务端排序返回，存在下一页时携带续页游标。 */
export interface WorkspacePage<T> {
  items: T[]
  nextCursor?: string
}

export interface AgentTurn {
  id: string
  task: string
  text: string
  receipt?: string
  status: string
  output?: { text?: string, json?: unknown, stopReason?: string, error?: string }
  eventSummary?: WorkspaceEntry[]
  plan?: { resolvedMode: string, reason: string, modelId?: string }
  estimate?: { used: number, size?: number }
  compressed?: boolean
  startedAt: number
}

export interface WorkspaceEntry {
  type: string
  id?: string
  text?: string
  title?: string
  name?: string
  status?: string
  input?: string
  kind?: string
  result?: string
  excerpt?: string
  approvalId?: string
  summary?: string
  deadline?: number
  used?: number
  size?: number
  createdAt?: number
}

export interface AgentResource {
  id: string
  kind: 'file' | 'knowledge' | 'artifact' | 'memory-proposal'
  title: string
  detail?: string
  project?: string
  revision?: string
  files?: string[]
  size?: number
  createdAt?: number
  artifactKind?: 'markdown' | 'html' | 'table' | 'chart' | 'image' | 'audio' | 'video' | 'file'
  version?: number
  mediaType?: string
  updatedAt?: number
}
