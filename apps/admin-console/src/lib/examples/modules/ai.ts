import type { AIConfigInput } from '@h-ai/ai'
import { ai } from '@h-ai/ai'

// config 从服务端配置读取；llm.api 选择协议，密钥不传给浏览器。
export async function chatExample(config: AIConfigInput, question: string) {
  const initialized = await ai.init(config)
  if (!initialized.success)
    return initialized
  try {
    return await ai.llm.chat({ messages: [{ role: 'user', content: question }] })
    // 流式入口为 chatStream；迭代可能抛错，调用方需 catch 并在取消时停止消费。
    // 嵌入入口为 embedText(text) / embedBatch(texts)，不要传 { input: text }。
  }
  finally {
    await ai.close()
  }
}
