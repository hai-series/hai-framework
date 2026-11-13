import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const agents = ['codex-acp', 'deepseek-harness', 'goose']
const documentPackages = [
  'python3',
  'python3-docx',
  'python3-openpyxl',
  'poppler-utils',
]
const variants = {
  minimal: [],
  documents: documentPackages,
  office: [
    ...documentPackages,
    'libreoffice-writer',
    'libreoffice-calc',
    'libreoffice-impress',
    'fonts-liberation',
    'fonts-noto-cjk',
  ],
  browser: ['chromium', 'fonts-liberation', 'fonts-noto-cjk'],
  developer: [
    'build-essential',
    'python3',
    'python3-pip',
    'python3-venv',
  ],
}
const languages = {
  java: ['default-jdk-headless'],
  rust: ['rustc', 'cargo'],
  go: ['golang'],
}

async function execute(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['inherit', process.stderr, process.stderr],
    })
    child.on('error', reject)
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`Container command failed: ${command} ${args[0]}`)))
  })
}

/**
 * 构建指定 Agent 的本地变体，并以实际 OCI 配置 ID 命名产物。
 * @param {string[]} argv - Agent 名称及构建选项。
 * @param {typeof execute} run - 容器引擎执行函数。
 * @returns 本地镜像标签、变体、镜像 ID 和实际使用的引擎。
 */
export async function runAgentBuild(argv, run = execute) {
  const [name, ...args] = argv
  if (!agents.includes(name))
    throw new Error(`Select agent: ${agents.join(', ')}`)
  const { values, positionals } = parseBuildArgs(args)
  if (positionals.length)
    throw new Error('Unexpected positional build arguments')
  const { engine: selected, variant } = values
  if (!['auto', 'podman', 'docker'].includes(selected))
    throw new Error('Invalid container engine')
  if (!Object.hasOwn(variants, variant))
    throw new Error(`Unknown variant: ${variant}`)
  const selectedLanguages = Object.keys(languages).filter(language => values[language])
  if (variant !== 'developer' && selectedLanguages.length)
    throw new Error('Java, Rust and Go require --variant=developer')
  const packages = [
    ...variants[variant],
    ...selectedLanguages.flatMap(language => languages[language]),
  ]
  const directory = fileURLToPath(new URL(`./${name}/`, import.meta.url))
  const manifest = JSON.parse(await readFile(join(directory, 'agent.json'), 'utf8'))
  let engine
  for (const candidate of selected === 'auto'
    ? ['podman', 'docker']
    : [selected]) {
    try {
      await run(candidate, ['info'])
      engine = candidate
      break
    }
    catch {
      /* 明确选择的引擎不会降级。 */
    }
  }
  if (!engine) {
    throw new Error(selected === 'auto'
      ? 'No ready Podman/Docker engine'
      : `No ready ${selected} engine`)
  }

  const state = await mkdtemp(join(tmpdir(), 'hai-agent-image-'))
  try {
    const iidfile = join(state, 'image-id')
    await run(engine, [
      'build',
      '--iidfile',
      iidfile,
      '--build-arg',
      `HAI_AGENT_PACKAGES=${packages.join(' ')}`,
      '--label',
      `org.hai.agent.variant=${variant}`,
      '--label',
      `org.hai.agent.languages=${selectedLanguages.join(',')}`,
      directory,
    ])
    const digest = /^(?:sha256:)?([a-f\d]{64})$/u.exec((await readFile(iidfile, 'utf8')).trim())?.[1]
    if (!digest)
      throw new Error('Container engine returned an invalid image ID')
    const imageId = `sha256:${digest}`
    const image = `${manifest.image}:${[
      manifest.version,
      variant,
      ...selectedLanguages,
      digest,
    ].join('-')}`
    await run(engine, ['tag', imageId, image])
    return { engine, variant, image, imageId }
  }
  finally {
    await rm(state, { recursive: true, force: true })
  }
}

function parseBuildArgs(args) {
  const values = {
    engine: 'auto',
    variant: 'minimal',
    java: false,
    rust: false,
    go: false,
  }
  const seen = new Set()
  const positionals = []
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }
    const separator = arg.indexOf('=')
    const key = separator < 0
      ? arg.slice(2)
      : arg.slice(2, separator)
    const value = separator < 0
      ? undefined
      : arg.slice(separator + 1)
    if (!Object.hasOwn(values, key) || seen.has(key))
      throw new Error(`Unknown or repeated build option: ${key}`)
    seen.add(key)
    if (key === 'engine' || key === 'variant') {
      if (!value)
        throw new Error(`Missing value for --${key}`)
      values[key] = value
    }
    else {
      if (value !== undefined)
        throw new Error(`--${key} does not accept a value`)
      values[key] = true
    }
  }
  return { values, positionals }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAgentBuild(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
