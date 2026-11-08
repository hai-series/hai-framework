import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

// 仅模拟模型 HTTP 返回；测试运行的 Codex/dsh 与 ACP 传输均为真实程序。
createServer(async (request, response) => {
  if (request.url === '/ready') {
    response.end('ready')
    return
  }
  let body = ''
  for await (const chunk of request) body += chunk
  const input = JSON.parse(body || '{}')
  writeFileSync('/workspace/upstream.json', JSON.stringify({
    url: request.url,
    model: input.model,
    authorization: request.headers.authorization,
    repoInstructions: body.includes('hai-repo-instructions-v2'),
    repoSkill: body.includes('hai-repo-skill-v2'),
  }))
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  const send = event => response.write(`data: ${JSON.stringify(event)}\n\n`)
  if (request.url.includes('/responses')) {
    const item = {
      id: 'msg_fixture',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        { type: 'output_text', text: 'native-agent-ok', annotations: [] },
      ],
    }
    const result = {
      id: 'resp_fixture',
      object: 'response',
      created_at: 1,
      model: input.model,
      status: 'completed',
      output: [item],
      usage: {
        input_tokens: 5,
        output_tokens: 3,
        total_tokens: 8,
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
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    })
    send({
      type: 'response.output_text.delta',
      sequence_number: 3,
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta: 'native-agent-ok',
    })
    send({
      type: 'response.output_text.done',
      sequence_number: 4,
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      text: 'native-agent-ok',
    })
    send({
      type: 'response.content_part.done',
      sequence_number: 5,
      item_id: item.id,
      output_index: 0,
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
  }
  else {
    const base = {
      id: 'chatcmpl_fixture',
      object: 'chat.completion.chunk',
      created: 1,
      model: input.model,
    }
    send({
      ...base,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: 'native-agent-ok' },
          finish_reason: null,
        },
      ],
    })
    send({
      ...base,
      choices: [
        { index: 0, delta: {}, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    })
    response.write('data: [DONE]\n\n')
  }
  response.end()
}).listen(19876, '127.0.0.1')
