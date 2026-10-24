import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createFeedbackBundle, getFeedbackBundleViewerFiles, queryFeedbackBundle, readFeedbackBundle, summarizeFeedbackBundle } from '../src/bundle/index.js'

describe('feedback 离线问题包', () => {
  it('无生产连接也能归档并读取现场与截图', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const created = await createFeedbackBundle({
      report: { id: 'fb-test', number: 'FB-1', description: '按钮没有反应', evidenceRevision: 2 },
      evidence: [{ source: 'browser', kind: 'error', timestamp: 20, requestId: 'req-1', data: { message: 'failed' } }],
      attachments: [{ id: 'screen-1', name: '页面.png', contentType: 'image/png', bytes }],
    })
    expect(created.success).toBe(true)
    if (!created.success)
      return
    const read = await readFeedbackBundle(created.data)
    expect(read.success).toBe(true)
    if (!read.success)
      return
    expect(read.data.report.id).toBe('fb-test')
    expect(read.data.manifest.evidenceRevision).toBe(2)
    expect(read.data.evidence[0]?.requestId).toBe('req-1')
    const screenshot = read.data.manifest.files.find(file => file.attachmentId === 'screen-1')
    expect(screenshot).toBeDefined()
    if (screenshot)
      expect(read.data.files[screenshot.path]).toEqual(bytes)
    expect(read.data.files['viewer/index.html']).toBeDefined()
  })

  it('材料篡改或附加未声明文件时拒绝读取', async () => {
    const created = await createFeedbackBundle({ report: { id: 'fb-test' }, evidence: [] })
    expect(created.success).toBe(true)
    if (!created.success)
      return
    const files = unzipSync(created.data)
    files['report.json'] = strToU8('{"id":"changed"}')
    expect((await readFeedbackBundle(zipSync(files))).success).toBe(false)
    files['hidden.html'] = strToU8('<script>throw Error()</script>')
    expect((await readFeedbackBundle(zipSync(files))).success).toBe(false)
  })

  it('拒绝路径逃逸、大小写路径碰撞以及解压超限', async () => {
    expect((await readFeedbackBundle(zipSync({ '../escape': strToU8('x') }))).success).toBe(false)
    expect((await readFeedbackBundle(zipSync({ 'file.json': strToU8('x'), 'FILE.json': strToU8('y') }))).success).toBe(false)
    expect((await readFeedbackBundle(zipSync({ 'oversized.json': strToU8('x'.repeat(2000)) }), { maxFileBytes: 100 })).success).toBe(false)
  })

  it('附件 checksum 不符或名称被用于逃逸时不会生成问题包', async () => {
    const attachment = { id: 'screen-1', name: '../somewhere.png', contentType: 'image/png', bytes: new Uint8Array([1, 2]) }
    expect((await createFeedbackBundle({ report: { id: 'fb-test' }, evidence: [], attachments: [{ ...attachment, checksum: '0'.repeat(64) }] })).success).toBe(false)
    const created = await createFeedbackBundle({ report: { id: 'fb-test' }, evidence: [], attachments: [attachment] })
    expect(created.success).toBe(true)
    if (!created.success)
      return
    const read = await readFeedbackBundle(created.data)
    expect(read.success).toBe(true)
    if (read.success) {
      const screenshot = read.data.manifest.files.find(file => file.attachmentId === 'screen-1')
      expect(screenshot).toBeDefined()
      if (screenshot) {
        expect(screenshot.name).toBe('../somewhere.png')
        expect(read.data.files[screenshot.path]).toEqual(attachment.bytes)
      }
    }
  })

  it('不透明附件标识往返且大小写、Unicode和代理项保持独立，显示名不参与路径', async () => {
    const ids = ['screen:1', 'space id', 'A', 'a', '页面截图', '../escape', 'emoji-😀', 'é', 'e\u0301', '\uD800', '\uD801']
    const attachments = ids.map((id, index) => ({ id, name: `页面:截图 / 原始文件${index}.txt`, contentType: 'text/plain', bytes: strToU8(`material ${index}`) }))
    const created = await createFeedbackBundle({ report: { id: 'fb-opaque' }, evidence: [], attachments })
    expect(created.success).toBe(true)
    if (!created.success)
      return
    const read = await readFeedbackBundle(created.data)
    expect(read.success).toBe(true)
    if (!read.success)
      return
    const entries = read.data.manifest.files.filter(file => file.kind === 'attachment')
    expect(entries).toHaveLength(attachments.length)
    expect(new Set(entries.map(file => file.path.toLowerCase())).size).toBe(attachments.length)
    for (const attachment of attachments) {
      const entry = entries.find(file => file.attachmentId === attachment.id)
      expect(entry).toBeDefined()
      if (!entry)
        continue
      expect(entry.name).toBe(attachment.name)
      expect(read.data.files[entry.path]).toEqual(attachment.bytes)
    }
  })

  it('大小写不同的两个附件能同时归档并独立读取', async () => {
    const attachments = ['A', 'a'].map(id => ({ id, name: `${id}.txt`, contentType: 'text/plain', bytes: strToU8(`material ${id}`) }))
    const created = await createFeedbackBundle({ report: { id: 'fb-case' }, evidence: [], attachments })
    expect(created.success).toBe(true)
    if (!created.success)
      return
    const read = await readFeedbackBundle(created.data)
    expect(read.success).toBe(true)
    if (!read.success)
      return
    for (const attachment of attachments) {
      const entry = read.data.manifest.files.find(file => file.attachmentId === attachment.id)
      expect(entry).toBeDefined()
      if (entry)
        expect(read.data.files[entry.path]).toEqual(attachment.bytes)
    }
  })

  it('同一附件标识重复声明时拒绝生成', async () => {
    const attachment = { id: 'screen-1', name: 'note.txt', contentType: 'text/plain', bytes: strToU8('material') }
    const created = await createFeedbackBundle({ report: { id: 'fb-duplicate' }, evidence: [], attachments: [attachment, attachment] })
    expect(created.success).toBe(false)
    if (!created.success)
      expect(created.error.code).toBe('hai:common:200')
  })

  it('按请求和时间分页读取且摘要区分用户描述与事实', async () => {
    const created = await createFeedbackBundle({
      report: { id: 'fb-query', description: '用户的解释', appVersion: '1.2.3' },
      evidence: Array.from({ length: 30 }, (_, index) => ({ source: 'server', kind: 'log', timestamp: index, requestId: index % 2 ? 'req-a' : 'req-b', data: { index } })),
      missing: ['Screenshot unavailable'],
    })
    expect(created.success).toBe(true)
    if (!created.success)
      return
    const read = await readFeedbackBundle(created.data)
    expect(read.success).toBe(true)
    if (!read.success)
      return
    const page = queryFeedbackBundle(read.data, { requestId: 'req-a', from: 10, page: 2, pageSize: 3 })
    expect(page.total).toBe(10)
    expect(page.items.map(item => item.timestamp)).toEqual([17, 19, 21])
    expect(summarizeFeedbackBundle(read.data)).toContain('用户的解释')
    expect(summarizeFeedbackBundle(read.data)).toContain('Screenshot unavailable')
  })

  it('查看器代码内置且无外链、用户内容只用 textContent 显示', () => {
    const files = getFeedbackBundleViewerFiles()
    const script = new TextDecoder().decode(files['viewer/app.js'])
    const html = new TextDecoder().decode(files['viewer/index.html'])
    expect(script).not.toContain('innerHTML')
    expect(html).toContain('default-src \'none\'')
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('重叠错误按各自锚点来源、请求和序号取得前后窗口，不依赖日志首次归属的 errorId', async () => {
    const events = Array.from({ length: 260 }, (_, sequence) => ({
      source: 'server-a',
      requestId: 'req-a',
      sequence,
      timestamp: sequence,
      kind: sequence === 100 || sequence === 150 ? 'error' : 'log',
      errorId: sequence === 150 || sequence > 200 ? 'error-second' : 'error-first',
      data: { sequence },
    }))
    const created = await createFeedbackBundle({
      report: { id: 'fb-overlap' },
      evidence: [...events, { source: 'server-b', requestId: 'req-a', sequence: 151, timestamp: 151, kind: 'log', errorId: 'error-second', data: {} }, { source: 'server-a', requestId: 'req-b', sequence: 151, timestamp: 151, kind: 'log', errorId: 'error-second', data: {} }],
    })
    expect(created.success).toBe(true)
    if (!created.success)
      return
    const read = await readFeedbackBundle(created.data)
    expect(read.success).toBe(true)
    if (!read.success)
      return
    const first = queryFeedbackBundle(read.data, { errorId: 'error-first', pageSize: 100 })
    const second = queryFeedbackBundle(read.data, { errorId: 'error-second', pageSize: 100 })
    const lastPage = queryFeedbackBundle(read.data, { errorId: 'error-second', pageSize: 100, page: 3 })
    expect(first.total).toBe(201)
    expect(second.total).toBe(201)
    expect(second.items[0].sequence).toBe(50)
    expect(second.items.every(event => event.source === 'server-a' && event.requestId === 'req-a')).toBe(true)
    expect(lastPage.items.map(event => event.sequence)).toEqual([250])
    expect(queryFeedbackBundle(read.data, { errorId: 'error-second', kind: 'log' }).total).toBe(199)
    expect(queryFeedbackBundle(read.data, { errorId: 'unrecorded' }).total).toBe(0)
  })
})
