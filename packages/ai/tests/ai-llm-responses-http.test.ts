/** 验证通过 OpenAI SDK 实际发送到 Responses 端点的请求格式。 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ChatCompletionRequest } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const jsonAnswer = '{"answer":"visible"}'
const model = 'responses-test'
const providerResponse = {
  id: 'response-test',
  object: 'response',
  created_at: 1700000000,
  model,
  status: 'completed',
  output: [
    {
      id: 'message-test',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        { type: 'output_text', text: jsonAnswer, annotations: [] },
      ],
    },
  ],
}

interface ReceivedRequest {
  method?: string
  path?: string
  body: unknown
}

async function respond(request: IncomingMessage, response: ServerResponse, received: ReceivedRequest[]): Promise<void> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request)
    chunks.push(Buffer.from(chunk))
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  received.push({ method: request.method, path: request.url, body })

  if (typeof body === 'object' && body !== null && 'stream' in body && body.stream === true) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const events = [
      { type: 'response.output_text.delta', item_id: 'message-test', delta: jsonAnswer },
      { type: 'response.completed', response: providerResponse },
    ]
    response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(providerResponse))
}

async function withResponsesProvider(run: (received: ReceivedRequest[]) => Promise<void>): Promise<void> {
  const received: ReceivedRequest[] = []
  const failures: unknown[] = []
  const server = createServer((request, response) => {
    void respond(request, response, received).catch((error: unknown) => {
      failures.push(error)
      response.destroy()
    })
  })

  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing Responses HTTP fixture address')

    const result = await ai.init({
      llm: {
        protocol: 'responses',
        model,
        apiKey: 'test-only-key',
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        timeout: 3000,
      },
    })
    expect(result.success).toBe(true)
    if (!result.success)
      throw new Error(result.error.message)

    await run(received)
    expect(failures).toHaveLength(0)
  }
  finally {
    try {
      await ai.close()
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error
        ? reject(error)
        : resolve()))
    }
  }
}

it('将交错的文本与图片、JSON 对象格式发送给 Responses 供应商', async () => {
  const imageUrl = 'https://images.example.com/diagram.png'
  const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1eUAAAAASUVORK5CYII='

  await withResponsesProvider(async (received) => {
    const result = await ai.llm.chat({
      messages: [
        { role: 'system', content: 'Return a JSON object.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this diagram.' },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' },
            },
            { type: 'text', text: 'Then inspect this pixel.' },
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.choices[0]?.message.content).toBe(jsonAnswer)

    expect(received).toEqual([
      {
        method: 'POST',
        path: '/v1/responses',
        body: {
          model,
          input: [
            { role: 'system', content: 'Return a JSON object.' },
            {
              role: 'user',
              content: [
                { type: 'input_text', text: 'Describe this diagram.' },
                { type: 'input_image', image_url: imageUrl, detail: 'low' },
                { type: 'input_text', text: 'Then inspect this pixel.' },
                { type: 'input_image', image_url: imageDataUrl, detail: 'auto' },
              ],
            },
          ],
          text: {
            format: { type: 'json_object' },
          },
          stream: false,
        },
      },
    ])
  })
})

it('向流式 Responses 供应商发送图片和完整 JSON Schema，并消费 SSE', async () => {
  const imageUrl = 'https://images.example.com/diagram.png'
  const jsonSchema = {
    name: 'answer',
    description: 'An answer describing the diagram.',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
      required: ['answer'],
      additionalProperties: false,
    },
  }

  await withResponsesProvider(async (received) => {
    const text: string[] = []
    const finishReasons: string[] = []
    for await (const chunk of ai.llm.chatStream({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'original' },
            },
          ],
        },
      ],
      response_format: { type: 'json_schema', json_schema: jsonSchema },
    })) {
      for (const choice of chunk.choices) {
        if (choice.delta.content)
          text.push(choice.delta.content)
        if (choice.finish_reason)
          finishReasons.push(choice.finish_reason)
      }
    }
    expect(text.join('')).toBe(jsonAnswer)
    expect(finishReasons).toEqual(['stop'])
    expect(received).toEqual([
      {
        method: 'POST',
        path: '/v1/responses',
        body: {
          model,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_image', image_url: imageUrl, detail: 'original' },
              ],
            },
          ],
          text: {
            format: { type: 'json_schema', ...jsonSchema },
          },
          stream: true,
        },
      },
    ])
  })
})

it('未指定输出格式时沿用供应商默认格式', async () => {
  const messages = [
    { role: 'user' as const, content: 'Describe the diagram.' },
  ]
  await withResponsesProvider(async (received) => {
    const result = await ai.llm.chat({ messages })
    expect(result.success).toBe(true)
    expect(received).toEqual([
      {
        method: 'POST',
        path: '/v1/responses',
        body: { model, input: messages, stream: false },
      },
    ])
  })
})

it('指定 JSON Schema 输出却未提供 Schema 时在调用供应商前报错', async () => {
  await withResponsesProvider(async (received) => {
    const request: ChatCompletionRequest = {
      messages: [
        { role: 'user', content: 'Describe the diagram.' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'answer' },
      },
    }
    const result = await ai.llm.chat(request)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.INVALID_REQUEST.code)
    await expect(ai.llm.chatStream(request)[Symbol.asyncIterator]().next()).rejects.toThrow('json_schema')
    expect(received).toHaveLength(0)
  })
})
