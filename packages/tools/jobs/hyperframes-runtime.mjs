import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const require = createRequire(import.meta.url)

export async function runHyperframes(args, directory, extra = {}, timeout = 280_000) {
  // 从镜像自身解析 CLI，不执行输入项目中的命令或依赖。
  const metadataPath = require.resolve('hyperframes/package.json')
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  if (metadata.version !== '0.9.56')
    throw new Error('The pinned HyperFrames version is unavailable')
  const environment = {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: directory,
    TMPDIR: directory,
    LANG: 'C.UTF-8',
    HYPERFRAMES_BROWSER_PATH: process.env.HAI_TOOL_BROWSER_PATH ?? '/usr/bin/chromium',
    HYPERFRAMES_FFMPEG_PATH: process.env.HAI_TOOL_FFMPEG_PATH ?? '/usr/bin/ffmpeg',
    HYPERFRAMES_FFPROBE_PATH: process.env.HAI_TOOL_FFPROBE_PATH ?? '/usr/bin/ffprobe',
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_NO_OPTIONAL_INSTALL: '1',
    HYPERFRAMES_NO_CAPTURE_DOTENV: '1',
    HYPERFRAMES_NO_ORPHAN_CLEANUP: '1',
    HYPERFRAMES_RENDER_DETACHED: '0',
    HYPERFRAMES_CAPTURE_DEADLINE_MS: '120000',
    HYPERFRAMES_MAX_DOWNLOAD_BYTES: String(20 * 1024 * 1024),
    PRODUCER_RESTRICT_PAGE_NETWORK: '1',
    DO_NOT_TRACK: '1',
    ...extra,
  }
  return execute(process.execPath, [
    join(dirname(metadataPath), 'bin/hyperframes.mjs'),
    ...args,
  ], {
    cwd: directory,
    env: environment,
    timeout,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  })
}

export async function probeVideo(file, directory, expected) {
  const { stdout } = await execute(process.env.HAI_TOOL_FFPROBE_PATH ?? '/usr/bin/ffprobe', [
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-of',
    'json',
    file,
  ], {
    cwd: directory,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8' },
    timeout: 15_000,
    maxBuffer: 256 * 1024,
  })
  const result = JSON.parse(stdout)
  const video = result.streams?.find(stream => stream.codec_type === 'video')
  const duration = Number(result.format?.duration)
  if (!video || video.codec_name !== 'h264' || !(duration > 0 && duration <= 30.25)
    || !(video.width > 0 && video.height > 0 && video.width * video.height <= 1920 * 1080)
    || video.width !== expected.width || video.height !== expected.height
    || Math.abs(duration - expected.duration) > 1 / expected.fps + 0.05) {
    throw new Error('Rendered video failed media validation')
  }
  return { duration, width: video.width, height: video.height }
}
