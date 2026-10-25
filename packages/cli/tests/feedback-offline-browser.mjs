/** 真实 dist 离线查看器验收；先构建 CLI/feedback，再显式运行本脚本，不自动重建共享产物。 */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repository = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const requireBrowser = createRequire(path.join(repository, 'apps/admin-console/package.json'))
const requireFeedback = createRequire(path.join(repository, 'packages/feedback/package.json'))
const { chromium, expect } = requireBrowser('@playwright/test')
const { build } = requireFeedback('esbuild')
const { createFeedbackBundle, readFeedbackBundle } = await import('../../feedback/dist/bundle/index.js')
const evidenceParent = path.join(repository, 'tmp/validation/feedback-offline-browser')
await mkdir(evidenceParent, { recursive: true })
const evidenceDirectory = await mkdtemp(path.join(evidenceParent, 'run-'))
let cliProcess
let browser
let cliOutput = ''
let viewerUrl = ''
const observedRequests = []
const externalNetworkRequests = []
const pageErrors = []

try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const recording = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await recording.route('https://feedback-assets.invalid/**', route => route.abort())
  await recording.setContent('<!doctype html><html><head><style>body{font:20px sans-serif;background:#eef2ff}button{padding:20px}</style></head><body><h1>Recorded feedback page</h1><p id="state">Before interaction</p><button id="change">Change state</button><input value="private-input"><img src="https://feedback-assets.invalid/unavailable.png" alt="Unavailable external asset"><script>window.__ORIGINAL_APP_SCRIPT__=true;document.querySelector("#change").onclick=()=>{document.querySelector("#state").textContent="After interaction";setTimeout(()=>document.querySelector("#state").textContent="Final interaction",1200);};</script></body></html>')
  const recorder = await build({
    stdin: {
      contents: 'import { record } from "@rrweb/record"; globalThis.__FEEDBACK_EVENTS__=[]; globalThis.__STOP_FEEDBACK_RECORD__=record({ maskAllInputs:true, inlineStylesheet:true, emit:event=>globalThis.__FEEDBACK_EVENTS__.push(event) });',
      resolveDir: path.join(repository, 'packages/feedback'),
      sourcefile: 'offline-viewer-recorder.js',
    },
    write: false,
    bundle: true,
    platform: 'browser',
    format: 'iife',
  })
  assert(recorder.outputFiles[0], 'Recorder build must produce browser code')
  await recording.addScriptTag({ content: recorder.outputFiles[0].text })
  await recording.waitForFunction(() => globalThis.__FEEDBACK_EVENTS__.some(event => event.type === 2))
  await recording.locator('#change').click()
  await recording.waitForFunction(() => JSON.stringify(globalThis.__FEEDBACK_EVENTS__).includes('Final interaction'))
  const events = await recording.evaluate(() => {
    globalThis.__STOP_FEEDBACK_RECORD__?.()
    return globalThis.__FEEDBACK_EVENTS__
  })
  await recording.close()
  const videoPage = await browser.newPage()
  const videoBytes = await videoPage.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    document.body.append(canvas)
    const context = canvas.getContext('2d')
    context.fillStyle = '#2563eb'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const stream = canvas.captureStream(10)
    const chunks = []
    let frame = 0
    const draw = () => {
      context.fillStyle = frame++ % 2 ? '#2563eb' : '#16a34a'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#ffffff'
      context.fillText(`Frame ${frame}`, 20, 80)
      stream.getVideoTracks()[0].requestFrame?.()
    }
    const timer = setInterval(draw, 50)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 200_000 })
    try {
      const stopped = new Promise(resolve => recorder.onstop = resolve)
      recorder.ondataavailable = event => chunks.push(event.data)
      recorder.start(100)
      draw()
      await new Promise(resolve => setTimeout(resolve, 1200))
      recorder.stop()
      await stopped
      return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()))
    }
    finally {
      clearInterval(timer)
      canvas.remove()
      if (recorder.state !== 'inactive')
        recorder.stop()
      stream.getTracks().forEach(track => track.stop())
    }
  })
  assert(videoBytes.length > 500, 'The recording fixture must contain encoded video frames')
  await videoPage.close()
  assert(events.length >= 2, 'A real browser recording must include snapshot and events')
  const screenshot = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSxkAAAAASUVORK5CYII=', 'base64')
  const description = '<img src=x onerror="globalThis.__USER_SCRIPT__=true"> user-provided text'
  const created = await createFeedbackBundle({
    report: { id: 'offline-browser', number: 'FB-OFFLINE-BROWSER', description, evidenceRevision: 7 },
    evidence: [
      ...events.map((event, index) => ({ id: `replay-${index}`, source: 'browser', kind: 'replay', sequence: index + 1, timestamp: event.timestamp, data: { event } })),
      ...Array.from({ length: 25 }, (_, index) => ({ source: 'server', kind: 'log', timestamp: index, requestId: `req-${index}`, data: { index } })),
    ],
    attachments: [{ id: 'screenshot', name: 'screenshot.png', contentType: 'image/png', bytes: screenshot }, { id: 'recording', name: 'recording.webm', contentType: 'video/webm', bytes: new Uint8Array(videoBytes) }],
    missing: ['External application assets are not retained in this offline fixture'],
  })
  assert(created.success, 'Built feedback package must generate a bundle')
  const read = await readFeedbackBundle(created.data)
  assert(read.success, 'Built feedback package must validate its bundle')
  assert(read.data.files['viewer/replay.js'].byteLength > 10000, 'Built viewer must embed its replay engine')
  const archive = path.join(evidenceDirectory, 'feedback.zip')
  await writeFile(archive, created.data)
  const environment = Object.fromEntries(['PATH', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
  cliProcess = spawn(process.execPath, [path.join(repository, 'packages/cli/dist/index.js'), 'feedback', 'view', archive], {
    cwd: evidenceDirectory,
    env: { ...environment, HAI_CORE_DEFAULTLOCALE: 'en-US' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const urlReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CLI viewer did not start')), 15000)
    const append = (chunk) => {
      cliOutput += chunk.toString()
      const match = cliOutput.match(/http:\/\/127\.0\.0\.1:\d+\/\w+\/viewer\/index\.html/)
      if (match) {
        clearTimeout(timer)
        resolve(match[0])
      }
    }
    cliProcess.stdout.on('data', append)
    cliProcess.stderr.on('data', append)
    cliProcess.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    cliProcess.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`CLI viewer exited before readiness: ${code}\n${cliOutput}`))
    })
  })
  viewerUrl = await urlReady
  const servedReplay = await fetch(new URL('replay.js', viewerUrl)).then(response => response.text())
  assert(servedReplay.includes('__HAI_FEEDBACK_REPLAY__'), 'Published CLI must provide its built replay engine')
  assert(servedReplay.includes('.replayer-wrapper'), 'Published CLI must include its built replay CSS')
  const viewerOrigin = new URL(viewerUrl).origin
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1200, height: 900 } })
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== viewerOrigin) {
      externalNetworkRequests.push(route.request().url())
      await route.abort()
      return
    }
    await route.continue()
  })
  page.on('request', request => observedRequests.push(request.url()))
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(viewerUrl)
  await expect(page.getByRole('heading', { name: 'Feedback report FB-OFFLINE-BROWSER' })).toBeVisible()
  await expect(page.getByText(description, { exact: true })).toBeVisible()
  await expect(page.locator('figure img')).toHaveJSProperty('naturalWidth', 1)
  const videoFile = read.data.manifest.files.find(file => file.contentType === 'video/webm')
  assert(videoFile, 'Video must be present in the offline ZIP')
  const videoResponse = await fetch(new URL(`../${videoFile.path}`, viewerUrl))
  assert.equal(videoResponse.headers.get('content-type'), 'video/webm')
  await expect.poll(() => page.locator('video').evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate(element => element.play())
  await expect.poll(() => page.locator('video').evaluate(element => element.currentTime)).toBeGreaterThan(0)
  const replay = page.frameLocator('iframe')
  await expect(replay.getByRole('heading', { name: 'Recorded feedback page' })).toBeVisible()
  await expect(replay.locator('img')).toHaveAttribute('src', 'https://feedback-assets.invalid/unavailable.png')
  const slider = page.getByRole('slider', { name: 'Page replay' })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(replay.locator('#state')).toHaveText('After interaction')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const paused = Number(await slider.inputValue())
  assert(paused > 0, 'Paused position must be retained')
  const duration = Number(await slider.getAttribute('max'))
  // 故意跨越整个录制时长，验证暂停确实停止状态和进度推进。
  await page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), duration + 100)
  await expect(replay.locator('#state')).toHaveText('After interaction')
  assert.equal(Number(await slider.inputValue()), paused, 'Paused slider must stop')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  assert(Number(await slider.inputValue()) >= paused, 'Resume must retain position')
  await expect(replay.locator('#state')).toHaveText('Final interaction')
  await expect(slider).toHaveValue(String(duration))
  await slider.fill('0')
  await slider.dispatchEvent('input')
  await expect(replay.locator('#state')).toHaveText('Before interaction')
  await expect(slider).toHaveValue('0')
  await slider.fill(String(duration))
  await slider.dispatchEvent('input')
  await expect(replay.locator('#state')).toHaveText('Final interaction')
  const mutation = events.find(event => event.type === 3 && JSON.stringify(event.data).includes('After interaction'))
  assert(mutation, 'Recorded first text mutation must exist')
  await slider.fill(String(mutation.timestamp - events[0].timestamp))
  await slider.dispatchEvent('input')
  await expect(replay.locator('#state')).toHaveText('After interaction')
  await slider.fill('0')
  await slider.dispatchEvent('input')
  await expect(replay.locator('#state')).toHaveText('Before interaction')
  await expect(slider).toHaveValue('0')
  const replayFrame = page.frames().find(frame => frame !== page.mainFrame())
  assert(replayFrame, 'Replay must use an isolated iframe')
  assert.equal(await replayFrame.evaluate(() => globalThis.__ORIGINAL_APP_SCRIPT__), undefined)
  assert.equal(await page.evaluate(() => globalThis.__USER_SCRIPT__), undefined)
  await page.getByRole('textbox', { name: 'requestId', exact: true }).fill('req-23')
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'Evidence', exact: true }) }).locator('pre')).toContainText('req-23')
  assert.deepEqual(externalNetworkRequests, [], 'CSP must block external resources before network dispatch')
  assert.deepEqual(pageErrors, [])
  await page.screenshot({ path: path.join(evidenceDirectory, 'viewer.png'), fullPage: true })
  await writeFile(path.join(evidenceDirectory, 'result.json'), JSON.stringify({ success: true, revision: read.data.manifest.evidenceRevision, recordedEvents: events.length, replayEngineBytes: read.data.files['viewer/replay.js'].byteLength, requests: observedRequests.length, externalNetworkRequests: externalNetworkRequests.length, unavailableExternalAssetPreserved: true, applicationScriptsExecuted: false }, null, 2))
  process.stdout.write(`Feedback offline browser acceptance passed: ${evidenceDirectory}\n`)
}
finally {
  await writeFile(path.join(evidenceDirectory, 'cli.log'), cliOutput)
  await browser?.close()
  if (cliProcess && cliProcess.exitCode === null) {
    const child = cliProcess
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CLI viewer did not close')), 15000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }
}
