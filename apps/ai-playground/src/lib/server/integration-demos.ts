import type { ACPRunRequest, MCPJobFiles } from '@h-ai/ai'
import type { HaiResult } from '@h-ai/core'
import type { IntegrationDemoId } from '#lib/demo-input.js'
import { randomUUID } from 'node:crypto'
import { AgentEvent, ai, HaiAIError, Message } from '@h-ai/ai'
import { err, ok } from '@h-ai/core'
import { runner } from '@h-ai/runner'
import { z } from 'zod'

const manualService = 'playground-manuals'
const manualTool = 'search_manual'
const agentId = 'playground-acp'
const localTool = 'playground_echo'
const resourceUri = 'playground://handbook'
const promptName = 'playground_explain'
const documentService = 'playground-documents'
const documentTool = 'documents.extract'
const sampleFile = 'playground-handbook.txt'

/** 这个演示只允许读取内置夹具，无需接入用户上传目录或产物存储。 */
export const playgroundJobFiles: MCPJobFiles = {
  async read({ principal, fileId, signal }) {
    if (principal.tenantId !== 'ai-playground' || fileId !== sampleFile || signal.aborted)
      return err(HaiAIError.MCP_TOOL_FORBIDDEN, 'Playground document is unavailable')
    return ok({ name: sampleFile, base64: 'SGFpIFBsYXlncm91bmQgaGFuZGJvb2sK' })
  },
  async publish() {
    return err(HaiAIError.MCP_TOOL_FORBIDDEN, 'Playground document extraction does not publish artifacts')
  },
}

/** 在 AI 初始化后注册固定的本地示例；用户输入不会改变工具清单。 */
export function registerPlaygroundIntegrations(): HaiResult<void> {
  const tool = ai.mcp.registerTool({
    name: localTool,
    description: 'Echo the validated text',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', maxLength: 4000 },
      },
      required: ['text'],
      additionalProperties: false,
    },
  }, (input: { text: string }) => ({ text: input.text }))
  if (!tool.success)
    return tool
  const resource = ai.mcp.registerResource({ uri: resourceUri, name: 'Playground handbook', mimeType: 'text/plain' }, async () => ({
    uri: resourceUri,
    mimeType: 'text/plain',
    text: 'The Playground groups models, knowledge, tools, agents and media.',
  }))
  if (!resource.success)
    return resource
  const prompt = ai.mcp.registerPrompt({
    name: promptName,
    arguments: [
      { name: 'topic', required: true },
    ],
  }, async ({ topic }) => [
    {
      role: 'user',
      content: { type: 'text', text: topic },
    },
  ])
  if (!prompt.success || !ai.a2a.getAgentCard().success)
    return prompt

  return ai.a2a.registerExecutor({
    async execute(context, bus) {
      const parts = context.userMessage.parts.flatMap(part => part.content?.$case === 'text'
        ? [
            { text: part.content.value },
          ]
        : [])
      bus.publish(AgentEvent.message(Message.fromJSON({
        role: 'ROLE_AGENT',
        messageId: randomUUID(),
        parts,
      })))
      bus.finished()
    },
    async cancelTask() {},
  })
}

async function configuredRemote() {
  const service = await ai.mcp.servers.get(manualService)
  return service.success && service.data.source === 'config' && service.data.value.transport === 'http'
    && service.data.value.allowedTools?.includes(manualTool)
}

async function configuredAgent() {
  const agent = await ai.acp.agents.get(agentId)
  if (!agent.success || agent.data.source !== 'config')
    return false
  const { enabled, mode, environmentIds } = agent.data.value
  return enabled && mode !== 'custom-service' && environmentIds.some(id => runner.environment(id).success)
}

async function configuredDocumentJob() {
  const service = await ai.mcp.servers.get(documentService)
  if (!service.success || service.data.source !== 'config')
    return false
  const { transport, environmentId, allowedTools } = service.data.value
  if (transport !== 'job' || !environmentId || !allowedTools?.includes(documentTool))
    return false
  const environment = runner.environment(environmentId)
  return environment.success && environment.data.networkPolicy === 'offline' && environment.data.capabilities.includes(documentTool)
}

export async function integrationDemoUnavailable(): Promise<Partial<Record<IntegrationDemoId, string>>> {
  const [remote, agent, document] = await Promise.all([
    configuredRemote(),
    configuredAgent(),
    configuredDocumentJob(),
  ])
  return {
    ...(!remote
      ? { 'mcp-remote': 'mcp-remote' }
      : {}),
    ...(!document
      ? { 'mcp-job': 'mcp-job' }
      : {}),
    ...(!ai.a2a.getAgentCard().success
      ? { a2a: 'a2a' }
      : {}),
    ...(!agent
      ? { acp: 'acp' }
      : {}),
  }
}

async function runTools(input: string, signal: AbortSignal) {
  const registry = ai.tools.createRegistry()
  const registered = registry.register(ai.tools.define({
    name: 'count_words',
    description: 'Count whitespace-delimited words',
    parameters: z.object({
      text: z.string().min(1).max(4000),
    }),
    handler: ({ text }) => ({ words: text.trim().split(/\s+/u).length }),
  }))
  if (!registered.success)
    return registered
  const executed = await registry.execute({
    id: 'playground-call',
    type: 'function',
    function: {
      name: 'count_words',
      arguments: JSON.stringify({ text: input }),
    },
  }, { signal })
  return executed.success
    ? ok({
        definitions: registry.getDefinitions(),
        toolResult: executed.data,
      })
    : executed
}

async function runMcp(input: string) {
  const [tool, resource, prompt] = await Promise.all([
    ai.mcp.callTool(localTool, { text: input }),
    ai.mcp.readResource(resourceUri),
    ai.mcp.getPrompt(promptName, { topic: input }),
  ])
  if (!tool.success)
    return tool
  if (!resource.success)
    return resource
  if (!prompt.success)
    return prompt
  return ok({ tool: tool.data, resource: resource.data, prompt: prompt.data })
}

async function runA2A(input: string, userId: string) {
  const card = ai.a2a.getAgentCard()
  if (!card.success)
    return card
  const id = randomUUID()
  const response = await ai.a2a.handleRequest({
    jsonrpc: '2.0',
    id,
    method: 'SendMessage',
    params: {
      message: {
        role: 'ROLE_USER',
        messageId: id,
        parts: [
          { text: input },
        ],
      },
    },
  }, { agentId: userId })
  if (response.streaming || !response.body || typeof response.body !== 'object' || !('result' in response.body))
    return err(HaiAIError.A2A_HANDLE_FAILED, 'A2A example failed')
  return ok({
    card: { name: card.data.name, capabilities: card.data.capabilities },
    response: response.body,
  })
}

async function runAcp(prompt: string, signal: AbortSignal, userId: string) {
  if (!await configuredAgent())
    return err(HaiAIError.ACP_UNSUPPORTED, 'Playground ACP agent is unavailable')
  const scoped = ai.acp.scoped({ tenantId: 'ai-playground', userId })
  const request = {
    agentId,
    execution: { mode: 'task' },
    permissions: { profile: 'read-only', approval: 'never' },
    limits: { queueTimeoutMs: 15_000, runTimeoutMs: 45_000, maxOutputBytes: 12 * 1024 },
    tools: { allow: [] },
    context: {
      fileIds: [],
      skillIds: [],
      knowledgeBaseIds: [],
      memory: { scope: 'none', write: 'none' },
    },
  } satisfies Omit<ACPRunRequest, 'prompt'>
  const plan = await scoped.plan(request)
  if (!plan.success)
    return plan
  const result = await scoped.run({ ...request, prompt }, { signal })
  return result.success
    ? ok({ plan: plan.data, taskId: result.data.taskId, output: result.data.output })
    : result
}

function audioCapabilities() {
  const asr = ai.audio.getCapabilities({ operation: 'transcribe' })
  if (!asr.success)
    return asr
  const tts = ai.audio.getCapabilities({ operation: 'synthesize' })
  return tts.success
    ? ok({ transcription: asr.data, synthesis: tts.data })
    : tts
}

async function streamSynthesis(input: string, signal: AbortSignal) {
  const events = ai.audio.synthesizeStream({
    text: { id: 'playground', text: input },
    format: 'wav',
    signal,
  })
  let audioChunks = 0
  let bytes = 0
  let started: { format: string, sampleRate?: number, channels?: number } | undefined
  let completed = false
  for await (const event of events) {
    if (event.type === 'audio') {
      audioChunks++
      bytes += event.data.byteLength
    }
    else if (event.type === 'segment_started') {
      started = { format: event.format, sampleRate: event.sampleRate, channels: event.channels }
    }
    else {
      completed = true
    }
  }
  return ok({
    started,
    audioChunks,
    bytes,
    completed,
  })
}

export async function runIntegrationDemo(id: IntegrationDemoId, input: string, signal: AbortSignal, browserId: string): Promise<HaiResult<unknown>> {
  switch (id) {
    case 'audio-capabilities': return audioCapabilities()
    case 'tts-stream': return streamSynthesis(input, signal)
    case 'tools': return runTools(input, signal)
    case 'mcp': return runMcp(input)
    case 'a2a': return runA2A(input, browserId)
    case 'acp': return runAcp(input, signal, browserId)
    case 'mcp-job':
      if (input !== sampleFile || !await configuredDocumentJob())
        return err(HaiAIError.MCP_TOOL_FORBIDDEN, 'Playground document job is unavailable')
      return ai.mcp.services.invoke({
        serviceId: documentService,
        tool: documentTool,
        arguments: { fileId: sampleFile },
      }, {
        principal: { tenantId: 'ai-playground', userId: browserId },
        signal,
        authorize: request => request.serviceId === documentService && request.tool === documentTool && request.arguments?.fileId === sampleFile,
      })
    case 'mcp-remote':
      if (!await configuredRemote())
        return err(HaiAIError.MCP_TOOL_FORBIDDEN, 'Playground MCP service is unavailable')
      return ai.mcp.services.invoke({
        serviceId: manualService,
        tool: manualTool,
        arguments: { query: input },
      }, {
        principal: { tenantId: 'ai-playground', userId: browserId },
        signal,
        authorize: request => request.serviceId === manualService && request.tool === manualTool && request.arguments?.query === input,
      })
  }
}
