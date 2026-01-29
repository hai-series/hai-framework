/**
 * =============================================================================
 * @hai/ai - 工具调用测试
 * =============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import {
    defineTool,
    createToolRegistry,
    ToolRegistry,
} from '../src/tools.js'
import type { ToolCall } from '../src/types.js'

describe('defineTool', () => {
    it('应该创建工具实例', () => {
        const tool = defineTool({
            name: 'test_tool',
            description: 'A test tool',
            parameters: z.object({
                input: z.string(),
            }),
            handler: ({ input }) => `Processed: ${input}`,
        })

        expect(tool.name).toBe('test_tool')
        expect(tool.description).toBe('A test tool')
    })

    describe('execute', () => {
        it('应该执行工具并返回结果', async () => {
            const tool = defineTool({
                name: 'echo',
                description: 'Echo input',
                parameters: z.object({
                    message: z.string(),
                }),
                handler: ({ message }) => message,
            })

            const result = await tool.execute({ message: 'Hello' })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe('Hello')
            }
        })

        it('应该验证输入参数', async () => {
            const tool = defineTool({
                name: 'add',
                description: 'Add two numbers',
                parameters: z.object({
                    a: z.number(),
                    b: z.number(),
                }),
                handler: ({ a, b }) => a + b,
            })

            const result = await tool.execute({ a: 'not a number', b: 2 } as any)

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('VALIDATION_FAILED')
            }
        })

        it('应该处理异步处理器', async () => {
            const tool = defineTool({
                name: 'async_tool',
                description: 'Async tool',
                parameters: z.object({}),
                handler: async () => {
                    await new Promise(resolve => setTimeout(resolve, 10))
                    return 'done'
                },
            })

            const result = await tool.execute({})

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe('done')
            }
        })

        it('应该捕获执行错误', async () => {
            const tool = defineTool({
                name: 'error_tool',
                description: 'Tool that throws',
                parameters: z.object({}),
                handler: () => {
                    throw new Error('Test error')
                },
            })

            const result = await tool.execute({})

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('EXECUTION_FAILED')
                expect(result.error.message).toContain('Test error')
            }
        })
    })

    describe('toDefinition', () => {
        it('应该生成 OpenAI 工具定义', () => {
            const tool = defineTool({
                name: 'get_weather',
                description: 'Get the weather for a location',
                parameters: z.object({
                    location: z.string(),
                    unit: z.enum(['celsius', 'fahrenheit']).optional(),
                }),
                handler: () => ({}),
            })

            const definition = tool.toDefinition()

            expect(definition.type).toBe('function')
            expect(definition.function.name).toBe('get_weather')
            expect(definition.function.description).toBe('Get the weather for a location')
            expect(definition.function.parameters).toEqual({
                type: 'object',
                properties: {
                    location: { type: 'string' },
                    unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
                },
                required: ['location'],
            })
        })

        it('应该处理复杂 schema', () => {
            const tool = defineTool({
                name: 'complex_tool',
                description: 'Complex tool',
                parameters: z.object({
                    name: z.string().min(1).max(100),
                    age: z.number().int().min(0),
                    tags: z.array(z.string()),
                    nested: z.object({
                        value: z.boolean(),
                    }),
                }),
                handler: () => ({}),
            })

            const definition = tool.toDefinition()
            const params = definition.function.parameters as any

            expect(params.properties.name.minLength).toBe(1)
            expect(params.properties.name.maxLength).toBe(100)
            expect(params.properties.age.type).toBe('integer')
            expect(params.properties.age.minimum).toBe(0)
            expect(params.properties.tags.type).toBe('array')
            expect(params.properties.nested.type).toBe('object')
        })
    })
})

describe('ToolRegistry', () => {
    let registry: ToolRegistry

    const echoTool = defineTool({
        name: 'echo',
        description: 'Echo input',
        parameters: z.object({
            message: z.string(),
        }),
        handler: ({ message }) => message,
    })

    const addTool = defineTool({
        name: 'add',
        description: 'Add numbers',
        parameters: z.object({
            a: z.number(),
            b: z.number(),
        }),
        handler: ({ a, b }) => a + b,
    })

    beforeEach(() => {
        registry = createToolRegistry()
    })

    describe('register', () => {
        it('应该注册工具', () => {
            registry.register(echoTool)

            expect(registry.has('echo')).toBe(true)
            expect(registry.size).toBe(1)
        })

        it('应该支持链式注册', () => {
            registry
                .register(echoTool)
                .register(addTool)

            expect(registry.size).toBe(2)
        })
    })

    describe('registerMany', () => {
        it('应该批量注册工具', () => {
            registry.registerMany([echoTool, addTool])

            expect(registry.size).toBe(2)
        })
    })

    describe('unregister', () => {
        it('应该注销工具', () => {
            registry.register(echoTool)
            const deleted = registry.unregister('echo')

            expect(deleted).toBe(true)
            expect(registry.has('echo')).toBe(false)
        })

        it('应该返回 false 如果工具不存在', () => {
            const deleted = registry.unregister('nonexistent')

            expect(deleted).toBe(false)
        })
    })

    describe('get', () => {
        it('应该获取工具', () => {
            registry.register(echoTool)

            const tool = registry.get('echo')

            expect(tool).toBeDefined()
            expect(tool?.name).toBe('echo')
        })

        it('应该返回 undefined 如果工具不存在', () => {
            const tool = registry.get('nonexistent')

            expect(tool).toBeUndefined()
        })
    })

    describe('getNames', () => {
        it('应该返回所有工具名称', () => {
            registry.registerMany([echoTool, addTool])

            const names = registry.getNames()

            expect(names).toContain('echo')
            expect(names).toContain('add')
        })
    })

    describe('getDefinitions', () => {
        it('应该返回所有工具定义', () => {
            registry.registerMany([echoTool, addTool])

            const definitions = registry.getDefinitions()

            expect(definitions.length).toBe(2)
            expect(definitions.map(d => d.function.name)).toContain('echo')
            expect(definitions.map(d => d.function.name)).toContain('add')
        })
    })

    describe('execute', () => {
        beforeEach(() => {
            registry.registerMany([echoTool, addTool])
        })

        it('应该执行工具调用', async () => {
            const toolCall: ToolCall = {
                id: 'call_1',
                type: 'function',
                function: {
                    name: 'echo',
                    arguments: '{"message": "Hello"}',
                },
            }

            const result = await registry.execute(toolCall)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.role).toBe('tool')
                expect(result.value.content).toBe('Hello')
                expect(result.value.tool_call_id).toBe('call_1')
            }
        })

        it('应该返回错误如果工具不存在', async () => {
            const toolCall: ToolCall = {
                id: 'call_1',
                type: 'function',
                function: {
                    name: 'nonexistent',
                    arguments: '{}',
                },
            }

            const result = await registry.execute(toolCall)

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('TOOL_NOT_FOUND')
            }
        })

        it('应该返回错误如果参数无效', async () => {
            const toolCall: ToolCall = {
                id: 'call_1',
                type: 'function',
                function: {
                    name: 'echo',
                    arguments: 'invalid json',
                },
            }

            const result = await registry.execute(toolCall)

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('VALIDATION_FAILED')
            }
        })

        it('应该序列化对象结果', async () => {
            const objectTool = defineTool({
                name: 'object_tool',
                description: 'Returns object',
                parameters: z.object({}),
                handler: () => ({ key: 'value' }),
            })

            registry.register(objectTool)

            const toolCall: ToolCall = {
                id: 'call_1',
                type: 'function',
                function: {
                    name: 'object_tool',
                    arguments: '{}',
                },
            }

            const result = await registry.execute(toolCall)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.content).toBe('{"key":"value"}')
            }
        })
    })

    describe('executeAll', () => {
        beforeEach(() => {
            registry.registerMany([echoTool, addTool])
        })

        it('应该并行执行多个工具调用', async () => {
            const toolCalls: ToolCall[] = [
                {
                    id: 'call_1',
                    type: 'function',
                    function: {
                        name: 'echo',
                        arguments: '{"message": "Hello"}',
                    },
                },
                {
                    id: 'call_2',
                    type: 'function',
                    function: {
                        name: 'add',
                        arguments: '{"a": 1, "b": 2}',
                    },
                },
            ]

            const result = await registry.executeAll(toolCalls)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.length).toBe(2)
                expect(result.value[0].content).toBe('Hello')
                expect(result.value[1].content).toBe('3')
            }
        })

        it('应该顺序执行当 parallel=false', async () => {
            const order: string[] = []

            const tool1 = defineTool({
                name: 'tool1',
                description: 'Tool 1',
                parameters: z.object({}),
                handler: async () => {
                    order.push('tool1')
                    return 'result1'
                },
            })

            const tool2 = defineTool({
                name: 'tool2',
                description: 'Tool 2',
                parameters: z.object({}),
                handler: async () => {
                    order.push('tool2')
                    return 'result2'
                },
            })

            registry.register(tool1).register(tool2)

            const toolCalls: ToolCall[] = [
                {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'tool1', arguments: '{}' },
                },
                {
                    id: 'call_2',
                    type: 'function',
                    function: { name: 'tool2', arguments: '{}' },
                },
            ]

            await registry.executeAll(toolCalls, { parallel: false })

            expect(order).toEqual(['tool1', 'tool2'])
        })

        it('应该在遇到错误时返回', async () => {
            const toolCalls: ToolCall[] = [
                {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'nonexistent', arguments: '{}' },
                },
                {
                    id: 'call_2',
                    type: 'function',
                    function: { name: 'echo', arguments: '{"message": "test"}' },
                },
            ]

            const result = await registry.executeAll(toolCalls)

            expect(result.ok).toBe(false)
        })
    })

    describe('clear', () => {
        it('应该清空所有工具', () => {
            registry.registerMany([echoTool, addTool])
            registry.clear()

            expect(registry.size).toBe(0)
        })
    })
})
