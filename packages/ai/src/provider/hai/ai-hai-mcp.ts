/**
 * =============================================================================
 * @hai/ai - HAI Provider: MCP
 * =============================================================================
 * HAI 默认 MCP 提供者实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
import type {
    AIConfig,
    AIError,
    MCPContext,
    MCPPrompt,
    MCPPromptMessage,
    MCPProvider,
    MCPResource,
    MCPResourceContent,
    MCPToolDefinition,
    MCPToolHandler,
} from '../../ai-types.js'

interface ToolRegistration {
    definition: MCPToolDefinition
    handler: MCPToolHandler
}

interface ResourceRegistration {
    resource: MCPResource
    handler: () => Promise<MCPResourceContent>
}

interface PromptRegistration {
    prompt: MCPPrompt
    handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>
}

class HaiMCPProvider implements MCPProvider {
    private tools: Map<string, ToolRegistration> = new Map()
    private resources: Map<string, ResourceRegistration> = new Map()
    private prompts: Map<string, PromptRegistration> = new Map()

    constructor(_config: AIConfig) {
        // Config reserved for future use
    }

    registerTool<TInput, TOutput>(
        definition: MCPToolDefinition,
        handler: MCPToolHandler<TInput, TOutput>,
    ): void {
        this.tools.set(definition.name, {
            definition,
            handler: handler as MCPToolHandler,
        })
    }

    registerResource(
        resource: MCPResource,
        handler: () => Promise<MCPResourceContent>,
    ): void {
        this.resources.set(resource.uri, { resource, handler })
    }

    registerPrompt(
        prompt: MCPPrompt,
        handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
    ): void {
        this.prompts.set(prompt.name, { prompt, handler })
    }

    async callTool(
        name: string,
        args: unknown,
        context?: MCPContext,
    ): Promise<Result<unknown, AIError>> {
        try {
            const registration = this.tools.get(name)
            if (!registration) {
                return err({ type: 'MCP_TOOL_ERROR', message: `Tool '${name}' not found` })
            }

            const ctx: MCPContext = context || { requestId: crypto.randomUUID() }
            const result = await registration.handler(args, ctx)
            return ok(result)
        }
        catch (error) {
            return err({
                type: 'MCP_TOOL_ERROR',
                message: `Tool '${name}' execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                cause: error,
            })
        }
    }

    async readResource(uri: string): Promise<Result<MCPResourceContent, AIError>> {
        try {
            const registration = this.resources.get(uri)
            if (!registration) {
                return err({ type: 'MCP_RESOURCE_ERROR', message: `Resource '${uri}' not found` })
            }

            const content = await registration.handler()
            return ok(content)
        }
        catch (error) {
            return err({
                type: 'MCP_RESOURCE_ERROR',
                message: `Resource '${uri}' read failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                cause: error,
            })
        }
    }

    async getPrompt(
        name: string,
        args: Record<string, string>,
    ): Promise<Result<MCPPromptMessage[], AIError>> {
        try {
            const registration = this.prompts.get(name)
            if (!registration) {
                return err({ type: 'MCP_PROTOCOL_ERROR', message: `Prompt '${name}' not found` })
            }

            for (const arg of registration.prompt.arguments || []) {
                if (arg.required && !(arg.name in args)) {
                    return err({
                        type: 'MCP_PROTOCOL_ERROR',
                        message: `Missing required argument '${arg.name}' for prompt '${name}'`,
                    })
                }
            }

            const messages = await registration.handler(args)
            return ok(messages)
        }
        catch (error) {
            return err({
                type: 'MCP_PROTOCOL_ERROR',
                message: `Prompt '${name}' execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                cause: error,
            })
        }
    }

    getTools(): MCPToolDefinition[] {
        return Array.from(this.tools.values()).map(r => r.definition)
    }

    getResources(): MCPResource[] {
        return Array.from(this.resources.values()).map(r => r.resource)
    }

    getPrompts(): MCPPrompt[] {
        return Array.from(this.prompts.values()).map(r => r.prompt)
    }

    unregisterTool(name: string): boolean {
        return this.tools.delete(name)
    }

    unregisterResource(uri: string): boolean {
        return this.resources.delete(uri)
    }

    unregisterPrompt(name: string): boolean {
        return this.prompts.delete(name)
    }
}

export function createHaiMCPProvider(config: AIConfig): MCPProvider {
    return new HaiMCPProvider(config)
}
