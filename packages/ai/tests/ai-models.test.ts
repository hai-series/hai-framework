/**
 * models/build.mjs 模型清单测试
 *
 * 验证模型服务基础设施的清单扫描与校验：首批模型齐备、Schema 校验、provides 单/多能力、字段约束。
 * 仅覆盖 Node 侧构建工具的可测试部分（不涉及 Docker / 权重下载）。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CONTAINER_ENGINES,
  containerProxyConfig,
  listImageNames,
  listImages,
  parseContainerEngine,
  parseProxyConfig,
  validateManifest,
} from '../models/build.mjs'

/** 读取模型镜像定义文件，验证构建契约而不启动 Docker。 */
function readModelFile(model: string, file: string): string {
  return readFileSync(fileURLToPath(new URL(`../models/images/${model}/${file}`, import.meta.url)), 'utf8')
}

/** 合法清单基线（供逐项改写测试字段约束） */
function baseManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    name: 'sample',
    version: '1',
    image: 'hai-ai/sample',
    provides: ['audio.transcribe'],
    protocol: 'whisper',
    devices: ['cpu'],
    port: 8000,
    health: '/health',
    ...overrides,
  }
}

describe('models build.mjs 清单', () => {
  it('列出首批三个模型', () => {
    const names = listImageNames()
    expect(names).toContain('faster-whisper-large-v3')
    expect(names).toContain('indextts-2.5')
    expect(names).toContain('qwen3-4b')
  })

  it('全部清单通过 Schema 校验且字段完整', () => {
    const images = listImages()
    expect(images.length).toBeGreaterThanOrEqual(3)
    for (const manifest of images) {
      expect(manifest.provides.length).toBeGreaterThanOrEqual(1)
      expect(manifest.protocol).toBeTruthy()
      expect(manifest.devices.length).toBeGreaterThanOrEqual(1)
      expect(manifest.health.startsWith('/')).toBe(true)
      expect(manifest.port).toBeGreaterThan(0)
      expect(manifest.startupTimeout).toBeGreaterThanOrEqual(1_200_000)
      expect(manifest.model?.revision).toMatch(/^[a-f0-9]{40}$/)
      expect(manifest.model?.modelscope?.id).toBeTruthy()
      expect(manifest.model?.modelscope?.revision).toMatch(/^[a-f0-9]{40}$/)
    }
  })

  it('whisper 清单声明 audio.transcribe / whisper', () => {
    const whisper = listImages().find(m => m.name === 'faster-whisper-large-v3')
    expect(whisper?.provides).toEqual(['audio.transcribe'])
    expect(whisper?.protocol).toBe('whisper')
    expect(whisper?.devices).toEqual(['cpu', 'gpu'])
  })

  it('indextts 清单声明 audio.synthesize / indextts', () => {
    const indextts = listImages().find(m => m.name === 'indextts-2.5')
    expect(indextts?.provides).toEqual(['audio.synthesize'])
    expect(indextts?.protocol).toBe('indextts')
  })

  it('qwen 清单声明 llm.chat / openai', () => {
    const qwen = listImages().find(m => m.name === 'qwen3-4b')
    expect(qwen?.provides).toEqual(['llm.chat'])
    expect(qwen?.protocol).toBe('openai')
  })

  it('非法清单（缺字段）校验失败', () => {
    const result = validateManifest({ schemaVersion: 1, name: 'x' })
    expect(result.success).toBe(false)
  })

  it('provides 支持一个或多个能力', () => {
    expect(validateManifest(baseManifest({ provides: ['audio.transcribe'] })).success).toBe(true)
    expect(validateManifest(baseManifest({ provides: ['audio.transcribe', 'audio.synthesize'] })).success).toBe(true)
  })

  it('空 provides 校验失败', () => {
    expect(validateManifest(baseManifest({ provides: [] })).success).toBe(false)
  })

  it('health 必须以 / 开头', () => {
    expect(validateManifest(baseManifest({ health: 'health' })).success).toBe(false)
  })

  it('devices 仅接受 cpu / gpu', () => {
    expect(validateManifest(baseManifest({ devices: ['tpu'] })).success).toBe(false)
  })

  it('根目录暴露约定的 pnpm model 命令', () => {
    const rootPackage = JSON.parse(readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(rootPackage.scripts?.model).toBe('node packages/ai/models/build.mjs build')
    expect(rootPackage.scripts?.['model:run']).toBe('node packages/ai/models/build.mjs run')
  })

  it('auto 优先 Podman，且显式引擎参数通过校验', () => {
    expect(CONTAINER_ENGINES).toEqual(['podman', 'docker'])
    expect(parseContainerEngine(['--engine', 'podman'])).toBe('podman')
    expect(() => parseContainerEngine(['--engine', 'invalid'])).toThrow(/Invalid --engine/)
  })

  it('podman 不向 VM 注入宿主机回环代理', () => {
    const proxy = parseProxyConfig([
      '--http-proxy',
      'http://127.0.0.1:10808',
      '--https-proxy',
      'http://127.0.0.1:10808',
    ])
    const containerProxy = containerProxyConfig([], proxy, 'podman')
    expect(containerProxy.http).toBeUndefined()
    expect(containerProxy.https).toBeUndefined()
  })

  it('podman 构建和运行均关闭自动代理注入', () => {
    const buildScript = readFileSync(fileURLToPath(new URL('../models/build.mjs', import.meta.url)), 'utf8')
    expect(buildScript.match(/--http-proxy=false/g)).toHaveLength(2)
  })

  it('run 保留启动容器以便失败时读取日志，并监测容器是否提前退出', () => {
    const buildScript = readFileSync(fileURLToPath(new URL('../models/build.mjs', import.meta.url)), 'utf8')
    expect(buildScript).not.toContain('\'--rm\',')
    expect(buildScript).toContain('\'{{.State.Running}} {{.State.ExitCode}}\'')
    expect(buildScript).toContain('Container exited before becoming healthy')
    expect(buildScript).toContain('\'rm\',\n        \'--force\',')
  })

  it('显式容器代理不做宿主机地址改写', () => {
    const proxy = parseProxyConfig([])
    const containerProxy = containerProxyConfig(
      ['--container-proxy', 'http://192.168.1.2:10808'],
      proxy,
      'podman',
    )
    expect(containerProxy.http).toBe('http://192.168.1.2:10808')
    expect(containerProxy.https).toBe('http://192.168.1.2:10808')
  })

  it('qwen CPU 阶段使用官方 CPU vLLM 镜像', () => {
    const dockerfile = readModelFile('qwen3-4b', 'Dockerfile')
    const server = readModelFile('qwen3-4b', 'server.py')
    expect(dockerfile).toMatch(/FROM vllm\/vllm-openai-cpu:\$\{VLLM_VERSION\}-x86_64 AS cpu/)
    expect(dockerfile).toContain('VLLM_USE_MODELSCOPE=true')
    expect(dockerfile).toContain('"modelscope==1.38.1"')
    expect(server).toContain('os.environ.get("HAI_MODELSCOPE_REVISION")')
    expect(server).toContain('snapshot_download(')
    expect(server).toContain('if MODEL_REVISION and not USE_MODELSCOPE:')
    expect(dockerfile).not.toMatch(/FROM gpu-base AS cpu/)
  })

  it('whisper 空卷通过 ModelScope 准备权重', () => {
    const dockerfile = readModelFile('faster-whisper-large-v3', 'Dockerfile')
    const server = readModelFile('faster-whisper-large-v3', 'server.py')
    expect(dockerfile).toContain('"modelscope==1.38.1"')
    expect(server).toContain('revision=MODELSCOPE_REVISION')
  })

  it('indexTTS 镜像安装官方源码并调用 2.5 推理入口', () => {
    const manifest = listImages().find(m => m.name === 'indextts-2.5')
    const dockerfile = readModelFile('indextts-2.5', 'Dockerfile')
    const server = readModelFile('indextts-2.5', 'server.py')
    expect(manifest?.source).toEqual({
      repository: 'index-tts/index-tts',
      revision: 'ee40fa7d6c6b8a2c7f06105f9f1e65775b74868c',
      tree: '7b2fb0ecc8a02538c79a218cccf1791228cb947f',
    })
    expect(dockerfile).toContain('COPY --from=hai_source . /opt/indextts')
    expect(dockerfile).toContain('https://mirrors.aliyun.com/pytorch-wheels/cpu/')
    expect(dockerfile).toContain('USE_MODELSCOPE=true')
    expect(dockerfile).toContain('"torch==2.8.*" "torchaudio==2.8.*"')
    expect(dockerfile).toContain('uv pip install --python .venv/bin/python --torch-backend cu128 --editable .')
    expect(dockerfile).toContain('"modelscope==1.38.1"')
    expect(dockerfile).not.toContain('uv sync --frozen --no-dev --torch-backend')
    expect(server).toContain('from modelscope.hub.snapshot_download import snapshot_download as modelscope_download')
    expect(server).toContain('from indextts.infer_v2_5 import IndexTTS2')
    expect(server).toMatch(/get_engine\(\)\r?\n\s+uvicorn\.run/)
    expect(server).toContain('lang=resolve_language(language, text)')
  })
})
