import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createFeedbackBundle, readFeedbackBundle } from '@h-ai/feedback/bundle'
import { describe, expect, it, vi } from 'vitest'
import { feedbackCommand, startFeedbackViewer } from '../src/commands/cli-feedback.js'

describe('feedback 离线 CLI', () => {
  it('仅用本地 ZIP 输出摘要与按请求分页证据', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hai-feedback-cli-'))
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
      const created = await createFeedbackBundle({ report: { id: 'fb-cli', description: '用户描述' }, evidence: [{ source: 'server', kind: 'log', timestamp: 1, requestId: 'req-1', data: {} }] })
      expect(created.success).toBe(true)
      if (!created.success)
        return
      await writeFile(path.join(directory, 'feedback.zip'), created.data)
      await feedbackCommand('summary', 'feedback.zip', { cwd: directory })
      expect(output.mock.calls.flat().join('')).toContain('用户描述')
      output.mockClear()
      await feedbackCommand('evidence', 'feedback.zip', { cwd: directory, requestId: 'req-1', pageSize: 1 })
      const page = JSON.parse(String(output.mock.calls.at(-1)?.[0]))
      expect(page.total).toBe(1)
      expect(page.items[0].requestId).toBe('req-1')
    }
    finally {
      output.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('本机查看器隔离路径，不执行包内替换脚本，也不对外监听', async () => {
    const created = await createFeedbackBundle({ report: { id: 'fb-view' }, evidence: [] })
    expect(created.success).toBe(true)
    if (!created.success)
      return
    const read = await readFeedbackBundle(created.data)
    expect(read.success).toBe(true)
    if (!read.success)
      return
    const bundle = read.data
    const viewer = await startFeedbackViewer({ ...bundle, files: { ...bundle.files, 'viewer/app.js': new TextEncoder().encode('untrusted-script') } })
    try {
      const url = new URL(viewer.url)
      expect(url.hostname).toBe('127.0.0.1')
      const html = await fetch(viewer.url)
      expect(html.status).toBe(200)
      expect(html.headers.get('content-security-policy')).toContain('default-src \'none\'')
      const script = await fetch(new URL('app.js', viewer.url)).then(response => response.text())
      expect(script).not.toContain('untrusted-script')
      expect((await fetch(`${url.origin}/report.json`)).status).toBe(404)
      expect((await fetch(new URL('../report.json', viewer.url))).status).toBe(200)
      expect((await fetch(`${url.origin}/`)).status).toBe(404)
    }
    finally {
      await viewer.close()
    }
  })
})
