import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { runHyperframes } from '../hyperframes-runtime.mjs'

const navigationFailures = []

function hasPhase(stderr, phase, status) {
  return typeof stderr === 'string' && stderr.split('\n').some((line) => {
    if (!line.startsWith('HYPERFRAMES_CAPTURE_PHASE '))
      return false
    try {
      const entry = JSON.parse(line.slice('HYPERFRAMES_CAPTURE_PHASE '.length))
      return entry.phase === phase && entry.status === status
    }
    catch { return false }
  })
}

function transientNavigation(cause, url) {
  try {
    const result = JSON.parse(cause.stdout)
    return result.ok === false && result.error?.code === 'runtime_error'
      && result.error.message === `net::ERR_NETWORK_CHANGED at ${url}`
      && hasPhase(cause.stderr, 'browser', 'completed') && hasPhase(cause.stderr, 'navigation', 'started')
  }
  catch { return false }
}

async function capture() {
  const [proxy, url, output, maximum] = process.argv.slice(2)
  // Python 外层为 180 秒，所有尝试、退避和发布共用更早的内部截止时间。
  const deadline = performance.now() + 170_000
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = Math.floor(deadline - performance.now())
    if (remaining <= 0)
      throw Object.assign(new Error('Capture deadline exceeded'), { code: 'CAPTURE_TIMEOUT' })
    const temporary = await mkdtemp(join(dirname(output), '.capture-attempt-'))
    const destination = join(temporary, 'capture')
    try {
      const { stdout } = await runHyperframes([
        'capture',
        url,
        '--output',
        destination,
        '--max-screenshots',
        maximum,
        '--timeout',
        String(Math.min(45_000, remaining)),
        '--capture-budget',
        String(Math.min(60_000, remaining)),
        '--skip-vision',
        '--json',
      ], dirname(output), {
        HYPERFRAMES_CAPTURE_PROXY: proxy,
        HYPERFRAMES_CHROME_SANDBOX: '1',
        HYPERFRAMES_CAPTURE_DEADLINE_MS: String(Math.min(120_000, remaining)),
      }, remaining)
      if (performance.now() >= deadline)
        throw Object.assign(new Error('Capture deadline exceeded'), { code: 'CAPTURE_TIMEOUT' })
      const result = JSON.parse(stdout)
      if (result.ok !== true || !(result.httpStatus >= 200 && result.httpStatus < 300) || !(result.screenshots > 0))
        throw new Error('Capture did not complete successfully')
      // 仅记录固定错误阶段和重试次数，不保留用户 URL、正文或敏感 stderr。
      await writeFile(join(destination, 'capture-status.json'), JSON.stringify({
        httpStatus: result.httpStatus,
        dropped: result.dropped ?? {},
        warnings: result.warnings ?? [],
        retries: navigationFailures,
      }), 'utf8')
      await rename(destination, output)
      await rm(join(dirname(output), 'capture-error.json'), { force: true })
      return
    }
    catch (cause) {
      if (performance.now() >= deadline || cause?.code === 'CAPTURE_TIMEOUT')
        throw Object.assign(new Error('Capture deadline exceeded'), { code: 'CAPTURE_TIMEOUT' })
      if (attempt !== 0 || !transientNavigation(cause, url))
        throw cause
      navigationFailures.push({ phase: 'navigation', code: 'ERR_NETWORK_CHANGED', attempt: 1 })
      await writeFile(join(dirname(output), 'capture-error.json'), JSON.stringify({ code: 'TRANSIENT_NAVIGATION', firstFailure: navigationFailures[0] }))
      await delay(Math.min(250, Math.max(0, deadline - performance.now())))
    }
    finally {
      // 每次尝试各有目录；成功仅原子发布完整目录，失败的 BLOCKED.md 不进入产物。
      await rm(temporary, { recursive: true, force: true })
    }
  }
}

capture().catch(async (cause) => {
  const diagnostics = [
    cause instanceof Error
      ? cause.message
      : '',
    typeof cause?.stdout === 'string'
      ? cause.stdout
      : '',
    typeof cause?.stderr === 'string'
      ? cause.stderr
      : '',
  ].join('\n')
  const browserLaunchCompleted = hasPhase(cause?.stderr, 'browser', 'completed')
  let code
  if (!browserLaunchCompleted && /No usable sandbox|Running as root without --no-sandbox|Failed to move to new namespace|SUID sandbox|sys_chroot\(|Zygote process exited prematurely|sandbox.*(?:not permitted|unavailable)/i.test(diagnostics))
    code = 'SANDBOX_UNAVAILABLE'
  else if (cause?.code === 'CAPTURE_TIMEOUT')
    code = 'TIMEOUT'
  else if (navigationFailures.length)
    code = 'NAVIGATION_RETRY_FAILED'
  if (code) {
    await writeFile(join(dirname(process.argv[4]), 'capture-error.json'), JSON.stringify({
      code,
      ...(navigationFailures.length
        ? { firstFailure: navigationFailures[0] }
        : {}),
    })).catch(() => {})
  }
  process.stderr.write('HyperFrames web.capture failed\n')
  process.exitCode = 1
})
