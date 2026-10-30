/** 配置加载回归夹具；供 runtime-env.test 使用，不作为部署入口或使用手册示例。 */
import { Buffer } from 'node:buffer'
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import process from 'node:process'
import { parseEnv } from 'node:util'

const maximumBytes = 1024 * 1024
let descriptor
try {
  descriptor = openSync(new URL('./.env.runtime', import.meta.url), constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0))
}
catch {
  // 读取错误不输出环境文件正文、变量值或底层异常中的原始配置。
  throw new Error('Runtime environment file is missing or not readable')
}

try {
  const stat = fstatSync(descriptor)
  if (!stat.isFile() || stat.size > maximumBytes)
    throw new Error('Runtime environment file must be a regular file no larger than 1 MiB')
  const buffer = Buffer.alloc(maximumBytes + 1)
  let length = 0
  while (length < buffer.length) {
    const count = readSync(descriptor, buffer, length, buffer.length - length, null)
    if (!count)
      break
    length += count
  }
  if (length > maximumBytes)
    throw new Error('Runtime environment file exceeds 1 MiB')
  let values
  try {
    // 原生 dotenv 字面解析；不执行 shell，不展开变量，不应用 Compose 插值。
    values = parseEnv(buffer.subarray(0, length).toString('utf8'))
  }
  catch {
    throw new Error('Runtime environment file could not be parsed')
  }
  // 本模式显式选择外部文件优先；旧 env_file 注入必须在 Compose override 中移除。
  Object.assign(process.env, values)
}
finally {
  closeSync(descriptor)
}
