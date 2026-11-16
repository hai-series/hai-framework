import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { runHyperframes } from '../hyperframes-runtime.mjs'

async function capture() {
  const [proxy, url, output, maximum] = process.argv.slice(2)
  const { stdout } = await runHyperframes([
    'capture',
    url,
    '--output',
    output,
    '--max-screenshots',
    maximum,
    '--timeout',
    '45000',
    '--capture-budget',
    '60000',
    '--skip-vision',
    '--json',
  ], dirname(output), { HYPERFRAMES_CAPTURE_PROXY: proxy })
  const result = JSON.parse(stdout)
  if (result.ok !== true || !(result.httpStatus >= 200 && result.httpStatus < 300)
    || !(result.screenshots > 0)) {
    throw new Error('Capture did not complete successfully')
  }
  // 保留真实 HTTP 结果和素材缺失原因，调用方可分辨完整与部分素材。
  await writeFile(join(output, 'capture-status.json'), JSON.stringify({
    httpStatus: result.httpStatus,
    dropped: result.dropped ?? {},
    warnings: result.warnings ?? [],
  }), 'utf8')
}

capture().catch(() => {
  process.stderr.write('HyperFrames web.capture failed\n')
  process.exitCode = 1
})
