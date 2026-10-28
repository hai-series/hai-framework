import { crypto } from '@h-ai/crypto'

export async function encryptExample(plainText: string) {
  const initialized = await crypto.init()
  if (!initialized.success)
    return initialized
  try {
    // 每次示例生成临时密钥；持久数据必须使用受管理且可恢复的密钥。
    const key = crypto.symmetric.generateKey()
    const encrypted = crypto.symmetric.encrypt(plainText, key)
    if (!encrypted.success)
      return encrypted
    return crypto.symmetric.decrypt(encrypted.data, key)
  }
  finally {
    crypto.close()
  }
}
