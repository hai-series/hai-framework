import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

function messageFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', '.svelte-kit', '.turbo'].includes(entry.name))
      return []
    const filename = path.join(directory, entry.name)
    return entry.isDirectory() ? messageFiles(filename) : /^en-US\.json(?:\.hbs)?$/.test(entry.name) ? [filename] : []
  })
}

function readMessages(filename) {
  const text = readFileSync(filename, 'utf8')
  // Handlebars 条件块在 JSON 对象外，文案对象仍须为有效 JSON。
  return JSON.parse(text.slice(text.indexOf('{\n'), text.lastIndexOf('\n}') + 2))
}

describe.each(['packages', 'apps'])('%s 的三语消息契约', (directory) => {
  it.each(messageFiles(path.join(root, directory)))('%s 的键与插值保持一致', (filename) => {
    const source = readMessages(filename)
    for (const locale of ['zh-CN', 'ja-JP']) {
      const translated = readMessages(filename.replace('en-US.json', `${locale}.json`))
      expect(Object.keys(translated).sort()).toEqual(Object.keys(source).sort())
      for (const [key, message] of Object.entries(source)) {
        expect(typeof translated[key]).toBe('string')
        expect(translated[key].trim()).not.toBe('')
        expect([...translated[key].matchAll(/\{\w+\}/g)].map(match => match[0]).sort())
          .toEqual([...message.matchAll(/\{\w+\}/g)].map(match => match[0]).sort())
      }
    }
  })
})
