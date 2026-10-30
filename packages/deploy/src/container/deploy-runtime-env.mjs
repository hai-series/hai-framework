/** Node 后端默认启动预加载：每次启动读取发布环境，再加载服务器托管连接配置。 */
import { Buffer } from 'node:buffer'
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import process from 'node:process'
import { parseEnv } from 'node:util'

const maximumBytes = 1024 * 1024

/** 复用 Node dotenv 解析；拒绝特殊文件、链接、超限与不可读文件，不输出秘密。 */
function readEnvironment(name) {
  let descriptor
  try {
    descriptor = openSync(new URL(name, import.meta.url), constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0))
  }
  catch {
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
    try {
      const text = buffer.subarray(0, length).toString('utf8')
      const values = parseEnv(text)
      // 交付序列化对同时含单/双引号的字符串使用 JSON 转义；避免 Node 截断转义引号。
      for (const match of text.matchAll(/^(?:export\s+)?([A-Za-z_]\w*)\s*=\s*("(?:[^"\\\r\n]|\\.)*")\s*(?:#[^\r\n]*)?$/gm)) {
        try {
          values[match[1]] = JSON.parse(match[2])
        }
        catch { /* 普通 dotenv 双引号仍按 Node 原生规则解析。 */ }
      }
      return values
    }
    catch {
      throw new Error('Runtime environment file could not be parsed')
    }
  }
  finally {
    closeSync(descriptor)
  }
}

// 托管连接优先级沿用原 env_file 顺序；删除应用字段不会从旧容器环境复活。
const values = { ...readEnvironment('./.env.runtime'), ...readEnvironment('./middleware.env') }
// 启动参数与私有代理身份属于部署装配，不由可编辑的业务环境覆盖。
delete values.NODE_OPTIONS
delete values.HAI_DEPLOY_PRIVATE_PROXY
Object.assign(process.env, values)
