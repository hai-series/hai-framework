import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')

async function readMessages(locale: 'zh-CN' | 'en-US' | 'ja-JP') {
  const raw = await readFile(resolve(appRoot, 'messages', `${locale}.json`), 'utf8')
  return JSON.parse(raw) as Record<string, string>
}

describe('mobile app messages', () => {
  it('keeps zh-CN, en-US and ja-JP keys in sync', async () => {
    const [zh, en, ja] = await Promise.all([
      readMessages('zh-CN'),
      readMessages('en-US'),
      readMessages('ja-JP'),
    ])

    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort())
  })
})
