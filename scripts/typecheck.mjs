/** 原生 TypeScript 7 类型检查；嵌入编译 API 的工具继续使用 TypeScript 6。 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const manifestPath = fileURLToPath(import.meta.resolve('@typescript/native/package.json'))
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const executable = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.tsc
if (typeof executable !== 'string')
  throw new Error('The native TypeScript package does not provide a tsc executable')

const result = spawnSync(process.execPath, [path.resolve(path.dirname(manifestPath), executable), ...process.argv.slice(2)], { stdio: 'inherit' })
if (result.error)
  throw result.error
process.exit(result.status ?? 1)
