import { dirname } from 'node:path'
import process from 'node:process'
import { probeVideo, runHyperframes } from '../hyperframes-runtime.mjs'

async function render() {
  const [project, output, fps, duration, width, height] = process.argv.slice(2)
  await runHyperframes([
    'render',
    project,
    '--output',
    output,
    '--fps',
    fps,
    '--format',
    'mp4',
    '--quality',
    'standard',
    '--workers',
    '1',
    '--video-bitrate',
    '8M',
    '--no-browser-gpu',
    '--strict',
  ], dirname(project))
  await probeVideo(output, dirname(project), {
    fps: Number(fps),
    duration: Number(duration),
    width: Number(width),
    height: Number(height),
  })
}

render().catch(() => {
  process.stderr.write('HyperFrames video.render failed\n')
  process.exitCode = 1
})
