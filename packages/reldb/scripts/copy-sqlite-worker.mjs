/**
 * 构建后复制 SQLite worker 脚本到 dist。
 *
 * worker 为纯 JS（供 worker_threads 直接加载），不参与 tsup 打包；
 * 打包后需与 dist 布局对齐，供运行时按 dist/providers/sqlite/ 路径解析。
 */

import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = join(scriptDir, '..')

const src = join(packageDir, 'src/providers/sqlite/reldb-sqlite-worker.mjs')
const dest = join(packageDir, 'dist/providers/sqlite/reldb-sqlite-worker.mjs')

await mkdir(dirname(dest), { recursive: true })
await copyFile(src, dest)

console.log(`[reldb] copied sqlite worker → ${dest}`)
