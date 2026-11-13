import { Buffer } from 'node:buffer'
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const answer = 'hai-managed-native-ok'
const prompt = 'Return hai-managed-native-ok without tools.'
const resultPath = '/workspace/managed-upstream.json'
let recorded = false

createServer(async (request, response) => {
  if (request.url === '/ready') {
    response.end('ready')
    return
  }
  const chunks = []
  for await (const chunk of request)
    chunks.push(chunk)
  const body = Buffer.concat(chunks).toString('utf8')
  const input = JSON.parse(body || '{}')
  if (request.method !== 'POST' || !['/v1/responses', '/v1/chat/completions'].includes(request.url) || request.headers.authorization !== 'Bearer managed-fixture-key') {
    response.writeHead(404).end()
    return
  }
  if (!recorded && body.includes(prompt)) {
    writeFileSync(resultPath, JSON.stringify({ path: request.url, model: input.model }))
    recorded = true
  }
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  const send = value => response.write(`data: ${JSON.stringify(value)}\n\n`)
  if (request.url === '/v1/chat/completions') {
    const base = {
      id: 'chatcmpl-managed-fixture',
      object: 'chat.completion.chunk',
      created: 1,
      model: input.model,
    }
    const approval = body.includes('native-approval-fixture')
    if (approval && !input.messages?.some(message => message.role === 'tool')) {
      const command = body.includes('wrong-target')
        ? 'cat /input/wrong.txt'
        : 'cat /input/approved.txt'
      send({
        ...base,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: 'call-managed-fixture',
                  type: 'function',
                  function: {
                    name: 'bash',
                    arguments: JSON.stringify({
                      command,
                      description: 'Read the isolated approval fixture',
                      sandbox_permissions: 'danger-full-access',
                      justification: 'Read the pre-authorized fixture only',
                    }),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      })
      send({
        ...base,
        choices: [
          { index: 0, delta: {}, finish_reason: 'tool_calls' },
        ],
      })
      response.end('data: [DONE]\n\n')
      return
    }
    const text = approval
      ? JSON.stringify(input.messages?.filter(message => message.role === 'tool').map(message => message.content))
      : answer
    send({
      ...base,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: text },
          finish_reason: null,
        },
      ],
    })
    send({
      ...base,
      choices: [
        { index: 0, delta: {}, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
    })
    response.end('data: [DONE]\n\n')
    return
  }
  const item = {
    id: 'msg_managed_fixture',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [
      { type: 'output_text', text: answer, annotations: [] },
    ],
  }
  const result = {
    id: 'resp_managed_fixture',
    object: 'response',
    created_at: 1,
    model: input.model,
    status: 'completed',
    output: [item],
    usage: {
      input_tokens: 4,
      output_tokens: 3,
      total_tokens: 7,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  }
  send({
    type: 'response.created',
    sequence_number: 0,
    response: { ...result, status: 'in_progress', output: [] },
  })
  send({
    type: 'response.output_item.added',
    sequence_number: 1,
    output_index: 0,
    item: { ...item, status: 'in_progress', content: [] },
  })
  send({
    type: 'response.content_part.added',
    sequence_number: 2,
    output_index: 0,
    item_id: item.id,
    content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] },
  })
  send({
    type: 'response.output_text.delta',
    sequence_number: 3,
    output_index: 0,
    item_id: item.id,
    content_index: 0,
    delta: answer,
  })
  send({
    type: 'response.output_text.done',
    sequence_number: 4,
    output_index: 0,
    item_id: item.id,
    content_index: 0,
    text: answer,
  })
  send({
    type: 'response.content_part.done',
    sequence_number: 5,
    output_index: 0,
    item_id: item.id,
    content_index: 0,
    part: item.content[0],
  })
  send({
    type: 'response.output_item.done',
    sequence_number: 6,
    output_index: 0,
    item,
  })
  send({ type: 'response.completed', sequence_number: 7, response: result })
  response.end()
}).listen(19877, '0.0.0.0')
