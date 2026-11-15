import process from 'node:process'
import { core } from '@h-ai/core'
import { z } from 'zod'

const slug = z.string().regex(/^[\w.-]{1,100}$/u)
const tools = z.object({
  id: slug,
  serviceId: slug,
  tool: z.string().min(1).max(128),
  description: z.string().max(500),
  inputSchema: z.record(z.string(), z.unknown()),
  fileArguments: z.array(z.string()).max(8).default([]),
})
export const agentConfigSchema = z.strictObject({
  tenant: slug.default('agent'),
  toolUrl: z.url().optional(),
  toolPort: z.number().int().min(1024).max(65535).optional(),
  tools: z.array(tools).max(32).default([]),
  skills: z.array(z.object({
    id: slug,
    title: z.string(),
    content: z.string().max(8000),
  })).max(24).default([]),
  projects: z.array(z.object({
    id: slug,
    title: z.string(),
    directory: z.string(),
    revision: z.string().default('refs/heads/main'),
    remote: z.string().optional(),
    readers: z.array(z.string()).nonempty(),
    publishers: z.array(z.string()).default([]),
  })).max(30).default([]),
})
export function config() {
  return agentConfigSchema.parse(core.config.get('agent') ?? {})
}

export function production() {
  return process.env.NODE_ENV === 'production' && process.env.HAI_E2E !== '1'
}
