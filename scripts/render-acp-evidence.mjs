/**
 * 将 ACP 真实运行记录渲染为可审阅 HTML 与 Chrome 截图。
 * 只消费白名单字段；不展示原生配置、请求头或凭据。
 * @example
 * node scripts/render-acp-evidence.mjs --input=packages/ai/test-results/acp-openrouter
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(path.join(repository, 'apps/admin-console/package.json'))
const options = process.argv.slice(2)
if (options.some(option => !option.startsWith('--input=') && option !== '--require-records'))
  throw new Error('Usage: node scripts/render-acp-evidence.mjs [--input=directory] [--require-records]')
const input = path.resolve(repository, options.find(option => option.startsWith('--input='))?.slice(8) ?? 'packages/ai/test-results/acp-openrouter')
const secretValues = Object.entries(process.env)
  .filter(([key, value]) => /(?:KEY|TOKEN|SECRET|PASSWORD)$/i.test(key) && value && value.length >= 8)
  .map(([, value]) => value)

/** 仅处理允许展示的纯文本；防止模型意外回显已注入凭据。 */
function plain(value, maxLength = 12000) {
  let output = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
  for (const secret of secretValues)
    output = output.replaceAll(secret, '[REDACTED]')
  return output.replace(/\bsk-[\w-]{16,}\b/g, '[REDACTED]').replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]').slice(0, maxLength)
}

/** HTML 文本统一编码，运行记录不能成为可执行脚本。 */
function html(value, maxLength) {
  return plain(value, maxLength).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[character])
}

/** 从开放 JSON 中只读取对象；不序列化未知结构。 */
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/** 统一渲染结束状态；未知或缺失状态不会显示为成功。 */
function state(value) {
  return ['passed', 'success', 'completed', 'ok'].includes(plain(value).toLowerCase()) ? 'passed' : ['failed', 'error'].includes(plain(value).toLowerCase()) ? 'failed' : 'unknown'
}

/** 概览只从已记录的轮次断言、传输和时间取值，不推断缺失证据。 */
function summary(record) {
  const rounds = Array.isArray(record.rounds) ? record.rounds.map(object) : []
  const transport = plain(record.transport, 20) || (['embedded', 'builtin-service'].includes(record.mode) ? 'stdio' : '未记录')
  const passedRounds = rounds.filter(round => typeof round.expectedToken === 'string' && round.expectedToken.length > 0
    && round.stopReason === 'end_turn' && typeof round.fileContent === 'string' && round.fileContent.trim() === round.expectedToken
    && typeof round.reply === 'string' && round.reply.includes(round.expectedToken)
    && typeof round.toolCalls === 'number' && round.toolCalls > 0 && typeof round.nativeId === 'string' && round.nativeId.length > 0).length
  return {
    title: `${plain(record.agent, 100) || 'ACP Agent'} · ${plain(record.mode, 100) || '未知模式'} · ${transport.toUpperCase()}`,
    transport: transport.toUpperCase(),
    model: plain(record.model, 180) || '未记录',
    status: state(record.status),
    passedRounds,
    rounds: rounds.length,
    toolCalls: rounds.reduce((total, round) => total + (typeof round.toolCalls === 'number' && Number.isFinite(round.toolCalls) ? Math.max(0, round.toolCalls) : 0), 0),
    duration: typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) ? `${(record.durationMs / 1000).toFixed(1)} s` : '未记录',
    startedAt: plain(record.startedAt, 100) || '未记录',
    finishedAt: plain(record.finishedAt, 100) || '未记录',
  }
}

const css = `
*{box-sizing:border-box}body{margin:0;background:#edf2f7;color:#172b43;font-family:Arial,"Microsoft YaHei",sans-serif;line-height:1.55}
main{max-width:1480px;margin:0 auto;padding:36px 40px 48px}.eyebrow{font-size:13px;letter-spacing:2px;color:#39718d;font-weight:700}h1{font-size:32px;line-height:1.25;margin:10px 0 12px}h2{font-size:18px;margin:0 0 15px}.intro{color:#536a80;margin:0 0 24px}.badge{display:inline-block;border-radius:99px;padding:5px 14px;font-size:13px;font-weight:700;background:#e4eaf0;color:#56687a}.passed{background:#d4f0e2;color:#166141}.failed{background:#ffe0df;color:#963c35}.unknown{background:#fff0cf;color:#765724}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.metric,.panel{background:#fff;border:1px solid #dce4ed;border-radius:12px;padding:20px}.metric small{display:block;color:#65798e;font-size:12px;text-transform:uppercase;margin-bottom:6px}.metric strong{font-size:17px;overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,1fr);gap:18px}.panel{margin-bottom:18px}p{margin:0 0 10px}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:"Cascadia Code",Consolas,"Microsoft YaHei",monospace;font-size:13px;line-height:1.65}.task{background:#f5f9fc;border-left:3px solid #4587a7;padding:14px;border-radius:5px}.rows{width:100%;border-collapse:collapse;font-size:13px}.rows th{text-align:left;color:#647990;font-size:11px;letter-spacing:.5px}.rows td,.rows th{padding:10px 8px;border-bottom:1px solid #edf1f5;vertical-align:top;overflow-wrap:anywhere}.rows td:first-child{width:155px}.muted{color:#667e94;font-size:13px}.event{padding:10px 0;border-bottom:1px solid #edf1f5}.event b{font-size:12px;color:#36708d}.event p{font-size:13px;margin:4px 0 0}.foot{font-size:12px;color:#718395;margin-top:18px}.cleanup{margin-top:10px}a{color:#326b93}.links{display:flex;gap:12px}.reply{font-size:14px}.title-row{display:flex;align-items:center;justify-content:space-between;gap:16px}.empty{padding:16px;border:1px dashed #cedae4;border-radius:6px;color:#718395;font-size:13px}
.overview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.overview-grid .panel{margin:0}.overview-grid h2{margin:0;font-size:17px}.overview-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:12px 0;margin:12px 0;border-top:1px solid #edf1f5;border-bottom:1px solid #edf1f5}.overview-meta small{display:block;font-size:12px;color:#647990}.overview-meta strong{font-size:19px}.model-line{font-size:13px;margin-top:10px;overflow-wrap:anywhere}.overview-grid .badge{white-space:nowrap}.times{font-size:12px;color:#647990;line-height:1.7;margin:0 0 12px}
`

/** 无外部资源、无可执行脚本的独立验收页面。 */
function document(title, body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${html(title)}</title><style>${css}</style></head><body><main>${body}</main></body></html>`
}

/** 渲染单次真实运行；不将缺失证据猜成成功。 */
function render(record) {
  const data = object(record)
  const events = Array.isArray(data.events) ? data.events.map(object) : []
  const files = Array.isArray(data.files) ? data.files.map(object) : []
  const rounds = Array.isArray(data.rounds) ? data.rounds.map(object) : []
  const cleanup = object(data.cleanup)
  const result = state(data.status)
  const cleanupState = state(cleanup.status)
  const overview = summary(data)
  const title = overview.title
  return document(title, `
    <div class="eyebrow">HAI FRAMEWORK / ACP E2E EVIDENCE</div>
    <div class="title-row"><h1>${html(title)}</h1><span class="badge ${result}">${result === 'passed' ? '测试通过' : result === 'failed' ? '测试失败' : '结果未完成'}</span></div>
    <p class="intro">真实智能体运行记录 · 此页面由测试证据生成，用于验收；不代表业务产品界面。</p>
    <div class="meta">
      <div class="metric"><small>Agent / 运行模式 / 传输</small><strong>${html(data.agent, 100)} / ${html(data.mode, 100)} / ${html(overview.transport)}</strong></div>
      <div class="metric"><small>实际模型</small><strong>${html(data.model, 180) || '未记录'}</strong></div>
      <div class="metric"><small>运行耗时</small><strong>${html(overview.duration)}</strong></div>
      <div class="metric"><small>原生事件 / 文件校验</small><strong>${events.length} events / ${files.length} files</strong></div>
    </div>
    <div class="grid"><div>
      <section class="panel"><h2>执行任务</h2><pre class="task">${html(data.task, 6000) || '未记录任务'}</pre></section>
      <section class="panel"><h2>原生事件与工具摘要</h2>${events.length ? events.slice(0, 60).map(event => `<div class="event"><b>${html(event.type, 120) || 'event'}</b><p>${html(event.summary, 1200) || '收到原生事件'}</p></div>`).join('') : '<div class="empty">没有记录原生事件</div>'}${events.length > 60 ? `<p class="muted">页面显示前 60 条摘要；完整白名单记录见对应 JSON。</p>` : ''}</section>
    </div><div>
      <section class="panel"><h2>文件与行为验证</h2>${files.length ? `<table class="rows"><thead><tr><th>实际文件</th><th>验证结果</th></tr></thead><tbody>${files.map(file => `<tr><td>${html(file.path, 300)}</td><td><span class="badge ${file.passed === true ? 'passed' : file.passed === false ? 'failed' : 'unknown'}">${file.passed === true ? '通过' : file.passed === false ? '失败' : '未确认'}</span><p>${html(file.summary, 1800)}</p></td></tr>`).join('')}</tbody></table>` : '<div class="empty">没有记录文件校验</div>'}</section>
      <section class="panel"><h2>执行与清理</h2><table class="rows"><tbody><tr><td>开始时间</td><td>${html(data.startedAt, 100) || '未记录'}</td></tr><tr><td>结束时间</td><td>${html(data.finishedAt, 100) || '未记录'}</td></tr><tr><td>测试结果</td><td>${html(data.status, 100) || '未记录'}</td></tr></tbody></table><div class="cleanup"><span class="badge ${cleanupState}">清理 ${cleanupState === 'passed' ? '完成' : cleanupState === 'failed' ? '失败' : '未确认'}</span><p class="muted">${html(cleanup.summary, 2400) || '未记录清理结果'}</p></div>${data.error ? `<p class="muted">失败摘要：${html(data.error, 2000)}</p>` : ''}</section>
    </div></div>
    ${rounds.map(round => `<section class="panel"><div class="title-row"><h2>${round.phase === 'resumed' ? '恢复后的第二轮' : '初始轮次'}</h2><span class="badge ${round.stopReason === 'end_turn' ? 'passed' : 'unknown'}">${html(round.stopReason, 100) || '停止原因未记录'}</span></div><p class="muted">工具调用：${html(round.toolCalls, 100) || '0'} · 期望标记：${html(round.expectedToken, 200) || '未记录'}</p><pre class="task">实际文件内容：${html(round.fileContent, 4000) || '未记录'}</pre><pre class="reply">${html(round.reply, 12000) || '未收到回复'}</pre></section>`).join('')}
    <section class="panel"><h2>智能体最终回复</h2><pre class="reply">${html(data.reply, 20000) || '未收到最终回复'}</pre></section>
    <p class="foot">证据只包含测试写入的模式、模型、任务、原生事件摘要和验证结果。凭据、原生配置与请求头不会进入此页面。</p>
  `)
}

/** 逐条保留结果，某条损坏也继续渲染其它已产生的记录。 */
async function main() {
  const entries = await readdir(input, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT')
      return []
    throw error
  })
  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name).sort()
  if (!files.length) {
    process.stdout.write('No ACP evidence records found.\n')
    if (options.includes('--require-records'))
      process.exitCode = 1
    return
  }
  await mkdir(input, { recursive: true })
  let browser
  let failed = false
  const rendered = []
  try {
    const pages = []
    for (const [index, file] of files.entries()) {
      const slug = `${String(index + 1).padStart(2, '0')}-${path.basename(file, '.json').replace(/[^\w-]/g, '-').slice(0, 100)}`
      try {
        const record = object(JSON.parse(await readFile(path.join(input, file), 'utf8')))
        const content = render(record)
        await writeFile(path.join(input, `${slug}.html`), content)
        pages.push({ slug, content })
        rendered.push({ slug, ...summary(record) })
      }
      catch {
        failed = true
        process.stderr.write(`Could not render ACP evidence record ${index + 1}.\n`)
      }
    }
    const overview = document('ACP 真实接入验收', `<div class="eyebrow">HAI FRAMEWORK / ACP E2E EVIDENCE</div><h1>ACP 真实接入验收</h1><p class="intro">以下页面来自实际运行记录；失败记录也会保留。此页面不是业务产品界面。</p><div class="overview-grid">${rendered.map(item => `<section class="panel"><div class="title-row"><h2>${html(item.title)}</h2><span class="badge ${item.status}">${item.status === 'passed' ? '测试通过' : item.status === 'failed' ? '测试失败' : '未完成'}</span></div><p class="model-line">实际模型：<strong>${html(item.model)}</strong></p><div class="overview-meta"><div><small>轮次通过</small><strong>${item.passedRounds} / ${item.rounds}</strong></div><div><small>原生工具调用</small><strong>${item.toolCalls}</strong></div><div><small>运行耗时</small><strong>${html(item.duration)}</strong></div></div><p class="times">开始：${html(item.startedAt)}<br>结束：${html(item.finishedAt)}</p><div class="links"><a href="${item.slug}.html">运行记录</a><a href="${item.slug}.png">Chrome 截图</a></div></section>`).join('')}</div>`)
    await writeFile(path.join(input, 'index.html'), overview)
    // 先写完 HTML；即使 CI 缺少 Chrome，仍保留可审阅记录和真实失败状态。
    const { chromium } = require('@playwright/test')
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 })
    await page.route('**/*', route => route.abort())
    for (const item of [...pages, { slug: 'index', content: overview }]) {
      try {
        await page.setContent(item.content, { waitUntil: 'load' })
        await page.screenshot({ path: path.join(input, `${item.slug}.png`), fullPage: true, animations: 'disabled' })
        process.stdout.write(`Rendered ACP evidence: ${item.slug}\n`)
      }
      catch {
        failed = true
        process.stderr.write('Could not capture one ACP evidence page; its HTML remains available.\n')
      }
    }
  }
  finally {
    await browser?.close()
  }
  if (failed)
    process.exitCode = 1
}

main().catch(() => {
  process.stderr.write('ACP evidence rendering failed; existing JSON and HTML remain available.\n')
  process.exitCode = 1
})
